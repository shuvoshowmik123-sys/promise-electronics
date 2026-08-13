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
    const normalized = normalizePhone(input.phone);
    if (!normalized) return { ok: false, reason: "not_claimable" };

    const [record] = await db
        .select()
        .from(otpCodes)
        .where(and(
            eq(otpCodes.phone, normalized),
            eq(otpCodes.purpose, ACTIVATION_PURPOSE),
            gt(otpCodes.expiresAt, new Date()),
        ))
        .orderBy(desc(otpCodes.createdAt))
        .limit(1);

    if (!record) return { ok: false, reason: "expired" };
    if (record.verifiedAt) return { ok: false, reason: "expired" };
    if (record.attempts >= record.maxAttempts) return { ok: false, reason: "too_many_attempts" };

    if (hashCode(String(input.code).trim()) !== record.codeHash) {
        await db.update(otpCodes)
            .set({ attempts: record.attempts + 1 })
            .where(eq(otpCodes.id, record.id));
        return { ok: false, reason: "invalid_code" };
    }

    // Claim the code first. A failure after this point costs the customer one
    // code, which is recoverable; letting a spent code stay live is not.
    const spent = await db.update(otpCodes)
        .set({ verifiedAt: new Date() })
        .where(and(eq(otpCodes.id, record.id), isNull(otpCodes.verifiedAt)))
        .returning();
    if (spent.length === 0) return { ok: false, reason: "expired" };

    const user = await findUnclaimed(input.phone);
    // Re-checked after the code is spent: the account may have been activated
    // by another route between sending and completing.
    if (!user) return { ok: false, reason: "not_claimable" };

    const hashed = await bcrypt.hash(input.password, 12);
    await db.update(users)
        .set({
            password: hashed,
            customerAccountState: "active",
            ...(input.name?.trim() ? { name: input.name.trim() } : {}),
            // Backfilled so the indexed lookup finds this row from now on
            // rather than the slower legacy scan.
            phoneNormalized: normalizePhone(input.phone) || undefined,
        } as any)
        .where(eq(users.id, user.id));

    return { ok: true, userId: user.id };
}
