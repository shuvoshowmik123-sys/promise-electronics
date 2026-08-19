/**
 * Long-lived per-device tokens, so the native app signs in once and stays in.
 *
 * The app must not store the user's password. A stored password opens the web
 * panel as well as the app, survives a Revoke — the app simply signs in again —
 * and cannot be withdrawn from one handset without changing it for every place
 * that person signs in. A per-device secret has none of those properties: it
 * works only in the app, dies the moment it is revoked, and can be killed for
 * one phone without touching the others.
 *
 * The token is returned in plaintext exactly once, at issue and at renewal, and
 * stored only as a SHA-256 hash — the same handling [staffResetLinks] and
 * trustedCorporateDevices already use, so a leaked database yields nothing that
 * can be replayed.
 */
import { createHash, randomBytes } from "crypto";
import { nanoid } from "nanoid";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage.js";

/**
 * 60 days, renewed on every use.
 *
 * Long because the whole point is that staff stop typing passwords; bounded
 * because an uninstall is invisible to the server. A lost phone, a resignation
 * and a handset sold second-hand all look identical from here — silence — so a
 * token that ended only at uninstall would never end. Anybody still working
 * renews long before reaching this.
 */
export const DEVICE_TOKEN_TTL_DAYS = 60;

/** Never log or return this; only its hash is stored. */
function hashDeviceToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

/** password_changed_at as a number, with "never changed" as a real value. */
function passwordStampOf(user: unknown): number {
    const raw = (user as { passwordChangedAt?: Date | string | null })?.passwordChangedAt;
    return raw ? new Date(raw).getTime() : 0;
}

export interface IssuedDeviceToken {
    token: string;
    deviceId: string;
    expiresAt: Date;
}

/**
 * Issues a token for one install after the password has already been checked.
 *
 * Deliberately does not verify the password itself — the caller does that
 * through the same authService.authenticateAdmin the web login uses, so there
 * is one place where a staff password is checked and no second implementation
 * to drift away from it (or to miss the inactive-account rule).
 */
export async function issueDeviceToken(opts: {
    userId: string;
    passwordStamp: number;
    deviceLabel?: string | null;
    platform?: string | null;
    appVersion?: string | null;
}): Promise<IssuedDeviceToken> {
    const token = randomBytes(32).toString("base64url");
    const deviceId = nanoid(16);
    const expiresAt = new Date(Date.now() + DEVICE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await db.execute(sql`
        INSERT INTO staff_devices
            (id, user_id, token_hash, device_label, platform, app_version,
             password_stamp, expires_at)
        VALUES (
            ${deviceId}, ${opts.userId}, ${hashDeviceToken(token)},
            ${opts.deviceLabel ?? null}, ${opts.platform ?? "android"},
            ${opts.appVersion ?? null}, ${opts.passwordStamp}, ${expiresAt}
        )
    `);

    return { token, deviceId, expiresAt };
}

export type DeviceAuthFailure =
    | "NOT_FOUND"
    | "REVOKED"
    | "EXPIRED"
    | "PASSWORD_CHANGED"
    | "USER_GONE"
    | "USER_INACTIVE";

export interface DeviceAuthSuccess {
    ok: true;
    deviceId: string;
    user: NonNullable<Awaited<ReturnType<typeof storage.getUser>>>;
    passwordStamp: number;
}

export type DeviceAuthResult = DeviceAuthSuccess | { ok: false; reason: DeviceAuthFailure };

/**
 * Resolves a token to the person holding it, or says precisely why it will not.
 *
 * Every refusal is a distinct reason rather than one flat "invalid", because
 * the app has to behave differently for each: an expired token should prompt a
 * quiet sign-in, a revoked one should say the device was removed, and a
 * password change should say so plainly so the person is not left guessing why
 * a working phone stopped working.
 */
export async function authenticateDeviceToken(token: string): Promise<DeviceAuthResult> {
    const rows = await db.execute(sql`
        SELECT id, user_id, password_stamp, expires_at, revoked_at
        FROM staff_devices
        WHERE token_hash = ${hashDeviceToken(token)}
        LIMIT 1
    `);

    const row = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows?.[0];
    if (!row) return { ok: false, reason: "NOT_FOUND" };

    if (row.revoked_at) return { ok: false, reason: "REVOKED" };
    if (new Date(row.expires_at as string).getTime() <= Date.now()) {
        return { ok: false, reason: "EXPIRED" };
    }

    const user = await storage.getUser(row.user_id as string);
    if (!user) return { ok: false, reason: "USER_GONE" };
    if ((user as { status?: string }).status !== "Active") {
        return { ok: false, reason: "USER_INACTIVE" };
    }

    /**
     * The reset check. Comparing against the stamp recorded at issue means a
     * password change ends every install on the account at its next request,
     * without anybody having to find the phones — the same mechanism the admin
     * session check uses, so the two cannot disagree about whether a session is
     * still good.
     */
    const liveStamp = passwordStampOf(user);
    if (Number(row.password_stamp) !== liveStamp) {
        await revokeDevice(row.id as string, "password_changed");
        return { ok: false, reason: "PASSWORD_CHANGED" };
    }

    return { ok: true, deviceId: row.id as string, user, passwordStamp: liveStamp };
}

/**
 * Records use and extends the expiry.
 *
 * Fire-and-forget from the request path on purpose: this is bookkeeping, and a
 * failed write here must never turn a valid request into a refused one. The
 * pool is capped at DB_POOL_MAX=5, so it also must not make every authenticated
 * request wait on a write it does not need.
 */
export function touchDevice(deviceId: string, ip?: string | null): void {
    const expiresAt = new Date(Date.now() + DEVICE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    void db.execute(sql`
        UPDATE staff_devices
        SET last_used_at = now(), last_used_ip = ${ip ?? null}, expires_at = ${expiresAt}
        WHERE id = ${deviceId}
    `).catch((error) => {
        console.error("[staff-device] could not record use of", deviceId, error);
    });
}

export async function revokeDevice(
    deviceId: string,
    reason: string,
    revokedBy?: string,
): Promise<void> {
    // Only the first revocation is recorded: re-revoking would overwrite the
    // original reason, and "why did this phone stop working" is the question
    // the column exists to answer.
    await db.execute(sql`
        UPDATE staff_devices
        SET revoked_at = now(), revoked_reason = ${reason}, revoked_by = ${revokedBy ?? null}
        WHERE id = ${deviceId} AND revoked_at IS NULL
    `);
}

/** Used when somebody leaves, or a person's phone is lost and they carry two. */
export async function revokeAllDevicesForUser(
    userId: string,
    reason: string,
    revokedBy?: string,
): Promise<void> {
    await db.execute(sql`
        UPDATE staff_devices
        SET revoked_at = now(), revoked_reason = ${reason}, revoked_by = ${revokedBy ?? null}
        WHERE user_id = ${userId} AND revoked_at IS NULL
    `);
}

export interface DeviceListRow {
    id: string;
    deviceLabel: string | null;
    platform: string;
    appVersion: string | null;
    createdAt: Date;
    lastUsedAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
    revokedReason: string | null;
}

/**
 * The list a Super Admin reads to revoke a lost phone.
 *
 * Returns revoked rows too, most recently used first: after a handset goes
 * missing the useful question is what happened to it, and a row that vanishes
 * on revocation cannot answer that. No token or hash is selected — nothing here
 * should be capable of reaching a screen.
 */
export async function listDevicesForUser(userId: string): Promise<DeviceListRow[]> {
    const rows = await db.execute(sql`
        SELECT id, device_label, platform, app_version,
               created_at, last_used_at, expires_at, revoked_at, revoked_reason
        FROM staff_devices
        WHERE user_id = ${userId}
        ORDER BY last_used_at DESC
    `);

    return ((rows as unknown as { rows: Array<Record<string, unknown>> }).rows ?? []).map((r) => ({
        id: r.id as string,
        deviceLabel: (r.device_label as string) ?? null,
        platform: r.platform as string,
        appVersion: (r.app_version as string) ?? null,
        createdAt: new Date(r.created_at as string),
        lastUsedAt: new Date(r.last_used_at as string),
        expiresAt: new Date(r.expires_at as string),
        revokedAt: r.revoked_at ? new Date(r.revoked_at as string) : null,
        revokedReason: (r.revoked_reason as string) ?? null,
    }));
}
