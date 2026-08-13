/**
 * Letting a customer unlock the account the shop made for them.
 *
 * When a repair is booked at the counter, intake creates a customer record with
 * customerAccountState 'unclaimed' and a placeholder where a password would be.
 * That record is correct — the shop needs somewhere to hang the repair — but it
 * locks every door the customer will later try:
 *
 *   register  "This phone is already linked to a repair record."
 *   log in    "Invalid phone number or password."   (there is no password)
 *   reset     files a support ticket a human must notice and act on
 *
 * So a customer whose television the shop is already holding cannot get in, and
 * the only message they see blames their password. Every one of those doors is
 * telling the truth about a different thing and none of them helps.
 *
 * This opens one door: a staff member issues a setup code from the admin panel
 * and gives it to the customer they are already speaking to, and the customer
 * spends it in the portal to choose a password.
 *
 * The code never leaves this system. No SMS, no email, no outside service —
 * admin panel to customer portal, the same rule the custody handover code
 * already follows in this codebase ("the code never travels by SMS"). Adding a
 * second, looser convention beside that one would have been the mistake.
 *
 * Because the shop issues it rather than the customer requesting it, there is
 * no endpoint here that answers "does this number have an account". That whole
 * class of question simply does not arise.
 *
 * The trade-off, stated once: a staff member can issue a code for any customer
 * record and use it themselves. They already have full access to those records,
 * so this grants nothing new — but every issuance is written down with a name
 * against it, because "nothing new" is not the same as "unwatched".
 */
import crypto from "crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import bcrypt from "bcryptjs";

import { db } from "../db.js";
import { otpCodes, users } from "../../shared/schema.js";
import { normalizePhone } from "../utils/phone.js";
import * as userRepo from "../repositories/user.repository.js";
import { isPlaceholderPassword } from "./customer-password.js";

/** Distinct from the intake verification codes, so one cannot be spent on the other. */
export const ACTIVATION_PURPOSE = "account_setup";

/**
 * Proving to an account that already exists that you are its owner.
 *
 * Different from the setup code above, and deliberately not the same value.
 * ACTIVATION_PURPOSE opens an account that was never opened and therefore has
 * nothing to steal. This one attaches a new way of signing in to a LIVE
 * account, which is the same power as a password reset — so it is issued under
 * the same restriction, and a code minted for one purpose can never be spent
 * on the other.
 */
export const LINK_PURPOSE = "account_link";

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 3;

/** Same hash the existing OTP routes use, so one reader can check either. */
function hashCode(code: string): string {
    return crypto.createHash("sha256").update(code).digest("hex");
}

/** Six digits, from crypto randomness — a guessable code is not a check. */
function generateCode(): string {
    return String(crypto.randomInt(100_000, 1_000_000));
}

/**
 * An account still waiting to be opened, or null.
 *
 * The single definition of "claimable", used when a code is issued and again
 * when it is spent. Two copies of this rule would eventually disagree, and the
 * disagreement would be a way into somebody's account.
 */
async function findUnclaimed(phone: string) {
    const user = await userRepo.getUserByPhoneNormalized(phone);
    if (!user || user.role !== "Customer") return null;
    const claimable = user.customerAccountState === "unclaimed"
        || !user.password
        || isPlaceholderPassword(user.password);
    return claimable ? user : null;
}

/**
 * Mint a code for one customer record, and hand back the plaintext once.
 *
 * Returned to the issuing staff member and never stored in the clear, so the
 * only way to know it is to have been the person who created it — or the
 * customer they read it to.
 */
export type IssuedCode = { code: string; expiresAt: Date };

export async function issueSetupCode(
    userId: string,
    issuedBy: { id: string; name: string },
): Promise<IssuedCode | null> {
    const user = await userRepo.getUser(userId);
    if (!user || user.role !== "Customer" || !user.phone) return null;

    // Only an unopened account. An account with a real password is somebody's,
    // and handing staff a way to take it over is a different decision.
    const claimable = user.customerAccountState === "unclaimed"
        || !user.password
        || isPlaceholderPassword(user.password);
    if (!claimable) return null;

    const normalized = normalizePhone(user.phone);
    if (!normalized) return null;

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000);

    // Any code already outstanding for this number is spent, so an old one read
    // out earlier cannot still open the account.
    await db.update(otpCodes)
        .set({ verifiedAt: new Date() })
        .where(and(
            eq(otpCodes.phone, normalized),
            eq(otpCodes.purpose, ACTIVATION_PURPOSE),
            isNull(otpCodes.verifiedAt),
        ));

    await db.insert(otpCodes).values({
        id: crypto.randomUUID(),
        phone: normalized,
        codeHash: hashCode(code),
        purpose: ACTIVATION_PURPOSE,
        maxAttempts: MAX_ATTEMPTS,
        expiresAt,
        ipAddress: `issued_by:${issuedBy.id}`,
    });

    return { code, expiresAt };
}

/**
 * Mint a code for an account that already exists, so its owner can attach a
 * new sign-in method to it.
 *
 * The case this exists for: a customer with a phone account taps "Continue
 * with Google", lands in a fresh empty account because nothing matched, and
 * then cannot give it their phone number because their real account already
 * holds it. They are stranded in a duplicate. This code is how the shop says
 * "yes, that is the same person", and spending it folds the duplicate away.
 *
 * Unlike the setup code, the target here may be a working account with a real
 * password, which is why the route that calls this asks for more authority.
 */
export async function issueLinkCode(
    userId: string,
    issuedBy: { id: string; name: string },
): Promise<IssuedCode | null> {
    const user = await userRepo.getUser(userId);
    if (!user || user.role !== "Customer" || !user.phone) return null;
    // A merged row is a tombstone: it owns nothing and can never be signed
    // into, so a code for it would attach a Google account to nothing.
    if ((user as any).customerAccountState === "merged") return null;

    const normalized = normalizePhone(user.phone);
    if (!normalized) return null;

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60_000);

    await db.update(otpCodes)
        .set({ verifiedAt: new Date() })
        .where(and(
            eq(otpCodes.phone, normalized),
            eq(otpCodes.purpose, LINK_PURPOSE),
            isNull(otpCodes.verifiedAt),
        ));

    await db.insert(otpCodes).values({
        id: crypto.randomUUID(),
        phone: normalized,
        codeHash: hashCode(code),
        purpose: LINK_PURPOSE,
        maxAttempts: MAX_ATTEMPTS,
        expiresAt,
        ipAddress: `issued_by:${issuedBy.id}`,
    });

    return { code, expiresAt };
}

export type SpendResult =
    | { ok: true; phone: string }
    | { ok: false; reason: "invalid_code" | "expired" | "too_many_attempts" };

/**
 * Check a code and spend it, or say why not.
 *
 * One implementation for both purposes. Two copies of this would eventually
 * disagree about attempt counting or about what "expired" means, and the
 * disagreement would be the way in.
 *
 * The update that marks it verified also requires it to be unverified, so two
 * requests racing on one code cannot both win — the second updates no rows.
 */
async function spendCode(phone: string, code: string, purpose: string): Promise<SpendResult> {
    const normalized = normalizePhone(phone);
    if (!normalized) return { ok: false, reason: "expired" };

    const [record] = await db
        .select()
        .from(otpCodes)
        .where(and(
            eq(otpCodes.phone, normalized),
            eq(otpCodes.purpose, purpose),
            gt(otpCodes.expiresAt, new Date()),
        ))
        .orderBy(desc(otpCodes.createdAt))
        .limit(1);

    if (!record) return { ok: false, reason: "expired" };
    if (record.verifiedAt) return { ok: false, reason: "expired" };
    if (record.attempts >= record.maxAttempts) return { ok: false, reason: "too_many_attempts" };

    if (hashCode(String(code).trim()) !== record.codeHash) {
        await db.update(otpCodes)
            .set({ attempts: record.attempts + 1 })
            .where(eq(otpCodes.id, record.id));
        return { ok: false, reason: "invalid_code" };
    }

    const spent = await db.update(otpCodes)
        .set({ verifiedAt: new Date() })
        .where(and(eq(otpCodes.id, record.id), isNull(otpCodes.verifiedAt)))
        .returning();
    if (spent.length === 0) return { ok: false, reason: "expired" };

    return { ok: true, phone: normalized };
}

export type LinkResult =
    | { ok: true; targetUserId: string; movedRows: number }
    | { ok: false; reason: "invalid_code" | "expired" | "too_many_attempts" | "no_such_account" | "not_mergeable" };

/**
 * Spend a link code and fold the duplicate into the real account.
 *
 * The caller is signed in as the duplicate — that is the whole situation — so
 * the account being merged away is proved by the session, and the account being
 * merged into is proved by the code. Neither alone is enough.
 */
export async function completeAccountLink(input: {
    sessionUserId: string;
    phone: string;
    code: string;
}): Promise<LinkResult> {
    const spent = await spendCode(input.phone, input.code, LINK_PURPOSE);
    if (!spent.ok) return { ok: false, reason: spent.reason };

    const target = await userRepo.getUserByPhoneNormalized(spent.phone);
    if (!target || target.role !== "Customer") return { ok: false, reason: "no_such_account" };
    if (target.id === input.sessionUserId) return { ok: false, reason: "not_mergeable" };

    const { mergeCustomerAccounts } = await import("./account-merge.service.js");
    const merged = await mergeCustomerAccounts({
        sourceId: input.sessionUserId,
        targetId: target.id,
        // The customer did this, holding a code the shop read to them. Recorded
        // against the account they proved, not against a staff member who was
        // not present when the button was pressed.
        actorId: target.id,
        reason: "Customer linked a Google sign-in to their existing account with a staff-issued code.",
    });

    if (!("ok" in merged) || merged.ok !== true) {
        return { ok: false, reason: "not_mergeable" };
    }

    return { ok: true, targetUserId: target.id, movedRows: merged.plan.totalRows };
}

export type ActivationResult =
    | { ok: true; userId: string }
    | { ok: false; reason: "invalid_code" | "expired" | "too_many_attempts" | "not_claimable" };

/**
 * Spend a code and set the password.
 *
 * The code is marked verified inside the same statement that checks it, so two
 * requests racing on one code cannot both succeed — the second finds it spent.
 */
export async function completeActivation(input: {
    phone: string;
    code: string;
    password: string;
    name?: string | null;
}): Promise<ActivationResult> {
    const spent = await spendCode(input.phone, input.code, ACTIVATION_PURPOSE);
    if (!spent.ok) return { ok: false, reason: spent.reason };

    const user = await findUnclaimed(input.phone);
    // Re-checked after the code is spent: the account may have been activated
    // by another route between the code being issued and being used.
    if (!user) return { ok: false, reason: "not_claimable" };

    const hashed = await bcrypt.hash(input.password, 12);
    await db.update(users)
        .set({
            password: hashed,
            customerAccountState: "active",
            ...(input.name?.trim() ? { name: input.name.trim() } : {}),
            // Backfilled so the indexed lookup finds this row from now on
            // rather than the slower legacy scan.
            phoneNormalized: spent.phone,
        } as any)
        .where(eq(users.id, user.id));
    return { ok: true, userId: user.id };
}
