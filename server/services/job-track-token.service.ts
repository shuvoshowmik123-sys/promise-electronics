import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import * as schema from "../../shared/schema.js";

/**
 * The customer's tracking link.
 *
 * The public tracking endpoint used to take the job id, and job ids are
 * sequential — JOB-2026-0001, 0002, 0003. Anyone could count through them and
 * read every set in the shop with no login. This replaces that with 32 random
 * bytes, following the same pattern the technician QR tokens already use:
 * only the hash is stored, so a copy of the database is not a set of working
 * links.
 *
 * Minted on demand. A token created for a job nobody ever asks about is a
 * credential issued for no reason, and every credential that exists is one that
 * can leak.
 */

/**
 * How long a link keeps working after the set goes back.
 *
 * Not the moment the job closes. Somebody who collects their television at six
 * and opens the link that evening should see "thank you, your repair is
 * complete", not a page saying the link is dead — the last thing the shop says
 * to a customer should not be an error. A week is long enough for that and
 * short enough that links do not accumulate forever.
 */
export const TRACK_LINK_GRACE_DAYS = 7;

/** Statuses after which the link starts its grace period. */
const CLOSED_STATUSES = new Set(["Delivered", "Cancelled", "Written Off"]);

export function hashTrackToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
}

const RAW_TOKEN_RE = /^[a-f0-9]{64}$/;

export function isWellFormedTrackToken(raw: unknown): raw is string {
    return typeof raw === "string" && RAW_TOKEN_RE.test(raw);
}

/**
 * Get the link for a job, creating the token the first time it is asked for.
 *
 * Returns the raw token, which is the only moment it exists in readable form.
 * Calling again for a job that already has one re-mints: the previous link
 * stops working. That is deliberate — a shop that reprints a ticket usually
 * does so because the first one went astray, and a link nobody can account for
 * should not keep working.
 */
export async function issueTrackToken(jobId: string): Promise<string> {
    const raw = randomBytes(32).toString("hex");
    await db
        .update(schema.jobTickets)
        .set({ trackTokenHash: hashTrackToken(raw) } as any)
        .where(eq(schema.jobTickets.id, jobId));
    return raw;
}

/**
 * Whether a closed job's link has run out its grace period.
 *
 * Measured from completion rather than from the status change, because the
 * status is what we have: a job marked Delivered carries completedAt, and a
 * job that was cancelled may carry nothing, in which case the link closes
 * immediately. Erring towards closing early is the right way round for
 * something whose whole purpose is to stop being readable.
 */
export function trackLinkExpired(job: {
    status?: string | null;
    completedAt?: Date | string | null;
}): boolean {
    if (!CLOSED_STATUSES.has(String(job.status ?? ""))) return false;
    if (!job.completedAt) return true;
    const closedAt = new Date(job.completedAt as any).getTime();
    if (Number.isNaN(closedAt)) return true;
    return Date.now() - closedAt > TRACK_LINK_GRACE_DAYS * 86400000;
}
