/**
 * A way back in for a staff member who has forgotten their password.
 *
 * Customers and corporate users have had reset links for a long time. Staff
 * never did — so one Super Admin forgetting a password locked the shop out of
 * its own system, and any staff member who forgot theirs had a dead account
 * nobody could revive.
 *
 * A Super Admin issues a link. The plaintext token is returned ONCE, in that
 * response, and never stored: only its sha256 lives in the database, so a
 * leaked backup does not hand over working links. It expires in thirty minutes,
 * burns on first use, and issuing a new one kills any earlier link for that
 * person.
 *
 * There is no email or SMS on the staff side. The link is handed over in
 * person, or through whatever channel the shop already trusts. That is exactly
 * why it lives for thirty minutes and not a day.
 */
import { Router, type Request, type Response } from "express";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage.js";
import { requireAdminAuth, requireSuperAdmin } from "./middleware/auth.js";
import { resetLinkLimiter } from "./middleware/rate-limit.js";
import { auditLogger } from "../utils/auditLogger.js";
import { logRouteError } from "../utils/route-error.js";
import { siteOrigin } from "../lib/siteOrigin.js";

const router = Router();

/** Thirty minutes. Long enough to walk across a shop, short enough to matter. */
const LINK_MINUTES = 30;

/** The database stores this, never the token itself. */
function hashResetToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

/**
 * Issue a link for one staff member.
 *
 * Super Admin only. A password reset is the one action that can hand somebody
 * else's account away, so it is deliberately not delegated to a permission that
 * a manager might hold for other reasons.
 */
router.post(
    "/api/admin/users/:id/reset-link",
    requireAdminAuth,
    requireSuperAdmin,
    async (req: Request, res: Response) => {
        try {
            const target = await storage.getUser(req.params.id);
            if (!target) return res.status(404).json({ error: "User not found" });

            const actor = (req as any).user;

            const token = randomBytes(32).toString("base64url");
            const expiresAt = new Date(Date.now() + LINK_MINUTES * 60 * 1000);

            await db.transaction(async (tx) => {
                /**
                 * Kill any earlier live link for this person first.
                 *
                 * Two working links is two chances for the wrong one to be
                 * used, and no way afterwards to say which was. Issuing a new
                 * link is a statement that the old one should not work.
                 */
                await tx.execute(sql`
                    UPDATE staff_reset_links
                    SET invalidated_at = NOW(), invalidated_reason = 'superseded'
                    WHERE user_id = ${target.id}
                      AND consumed_at IS NULL
                      AND invalidated_at IS NULL
                `);

                await tx.execute(sql`
                    INSERT INTO staff_reset_links
                        (id, user_id, token_hash, expires_at, created_by, created_by_name)
                    VALUES (${nanoid(16)}, ${target.id}, ${hashResetToken(token)},
                            ${expiresAt.toISOString()}, ${actor?.id ?? "unknown"},
                            ${actor?.name ?? actor?.username ?? null})
                `);
            });

            /**
             * Logged before the link is handed over, and without the token.
             *
             * Who reset whose password, and when, has to be answerable months
             * later. The token itself must never reach a log — a log is read by
             * more people than a database.
             */
            await auditLogger.log({
                userId: actor?.id || "system",
                action: "STAFF_PASSWORD_RESET_LINK_ISSUED",
                entity: "User",
                entityId: target.id,
                details: `${actor?.name || actor?.username || "A Super Admin"} issued a ${LINK_MINUTES}-minute password reset link for ${target.username}`,
                severity: "critical",
                req,
            }).catch(() => {});

            res.status(201).json({
                // Shown once. It is not stored and cannot be retrieved again.
                url: `${siteOrigin()}/admin/reset-password?token=${token}`,
                expiresAt: expiresAt.toISOString(),
                expiresInMinutes: LINK_MINUTES,
                username: target.username,
                name: target.name,
            });
        } catch (error) {
            logRouteError("staff-reset-link-issue", req, error);
            res.status(500).json({ error: "Could not create the reset link" });
        }
    },
);

/**
 * Is this link still usable?
 *
 * Says yes or no and nothing else. It never consumes the link and never reveals
 * whose account it belongs to — a leaked link must not become a way of asking
 * the system who somebody is.
 */
router.post("/api/admin/reset-link/verify", resetLinkLimiter, async (req: Request, res: Response) => {
    try {
        const token = String((req.body ?? {}).token ?? "");
        if (!token) return res.json({ valid: false });

        const rows = await db.execute(sql`
            SELECT id FROM staff_reset_links
            WHERE token_hash = ${hashResetToken(token)}
              AND consumed_at IS NULL
              AND invalidated_at IS NULL
              AND expires_at > NOW()
            LIMIT 1
        `);
        const found = ((rows as any).rows ?? rows) as Array<{ id: string }>;
        res.json({ valid: Array.isArray(found) && found.length > 0 });
    } catch (error) {
        logRouteError("staff-reset-link-verify", req, error);
        res.status(500).json({ error: "Something went wrong. Please try again." });
    }
});

/**
 * Spend the link and set the new password.
 *
 * The check and the consume happen inside ONE transaction with SELECT ... FOR
 * UPDATE, so two submissions racing each other cannot both succeed and leave
 * the account with whichever password arrived second.
 */
router.post("/api/admin/reset-link/complete", resetLinkLimiter, async (req: Request, res: Response) => {
    // One message for every failure. Separate ones would tell an attacker
    // whether a token exists, which is the only thing they do not have.
    const genericFail = { error: "This reset link is no longer valid. Ask for a new one." };
    try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const token = String(body.token ?? "");
        const password = String(body.password ?? "");
        const confirmPassword = String(body.confirmPassword ?? "");

        if (!token) return res.status(400).json(genericFail);
        if (password !== confirmPassword) {
            return res.status(400).json({ error: "The two passwords do not match." });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: "Use at least 8 characters." });
        }

        const hash = await bcrypt.hash(password, 12);

        const outcome = await db.transaction(async (tx) => {
            const linkRows = await tx.execute(sql`
                SELECT id, user_id FROM staff_reset_links
                WHERE token_hash = ${hashResetToken(token)}
                  AND consumed_at IS NULL
                  AND invalidated_at IS NULL
                  AND expires_at > NOW()
                FOR UPDATE
            `);
            const link = (((linkRows as any).rows ?? linkRows) as Array<{ id: string; user_id: string }>)[0];
            if (!link) return { ok: false as const };

            /**
             * password_changed_at is not bookkeeping.
             *
             * middleware/auth.ts snapshots it at login and compares it on every
             * request, so setting it signs out every existing session for this
             * account. Without it a reset would change the password and leave
             * whoever was already signed in exactly where they were — which is
             * the opposite of what somebody asking for a reset wants.
             */
            await tx.execute(sql`
                UPDATE users
                SET password = ${hash}, password_changed_at = NOW()
                WHERE id = ${link.user_id}
            `);
            await tx.execute(sql`
                UPDATE staff_reset_links SET consumed_at = NOW() WHERE id = ${link.id}
            `);
            return { ok: true as const, userId: link.user_id };
        });

        if (!outcome.ok) return res.status(400).json(genericFail);

        /**
         * Critical severity on purpose. A password changing is the single event
         * somebody investigating a compromised account looks for first, and it
         * should not be filed beside a settings tweak.
         */
        await auditLogger.log({
            userId: outcome.userId,
            action: "PASSWORD_CHANGED",
            entity: "User",
            entityId: outcome.userId,
            details: "Password changed using a reset link issued by a Super Admin",
            severity: "critical",
            req,
        }).catch(() => {});

        res.json({ ok: true, message: "Your password has been changed. You can sign in now." });
    } catch (error) {
        logRouteError("staff-reset-link-complete", req, error);
        res.status(500).json({ error: "Something went wrong. Please try again." });
    }
});

export default router;
