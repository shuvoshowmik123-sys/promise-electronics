/**
 * Abandonment Scheduler (Phase 2.5)
 *
 * Rules:
 * - Job older than 90 days with non-terminal status → "Abandoned" + SMS customer
 * - Job in "Abandoned" for 14+ more days with no response → "Forfeited"
 *
 * Follows the same pattern as drawer-day-close.service.ts
 */
import { db } from "../db.js";
import { eq, and, lt, isNull, inArray } from "drizzle-orm";
import { jobTickets } from "../../shared/schema.js";
import { smsService } from "./sms.service.js";
import { isDbReady } from "./db-readiness.js";

const SCHEDULER_INTERVAL_MS = 60 * 60 * 1000; // run every hour
const ABANDON_AFTER_DAYS = 90;
const FORFEIT_AFTER_ABANDON_DAYS = 14;

// Statuses that are NOT terminal (eligible for abandonment check)
const TERMINAL_STATUSES = new Set([
    "Delivered", "Cancelled", "Abandoned", "Forfeited", "Not OK"
]);

// Non-terminal statuses that can be auto-abandoned
const ABANDONABLE_STATUSES = [
    "Pending", "Diagnosing", "Pending Parts", "In Progress", "On Workbench", "Ready"
];

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let abandonmentCheckInProgress = false;

export function startAbandonmentScheduler(): void {
    if (schedulerTimer) return;
    console.log("[Abandonment] Scheduler started");
    // Run immediately on start, then every hour
    runAbandonmentCheck().catch(e => console.error("[Abandonment] Initial run error:", e));
    schedulerTimer = setInterval(() => {
        runAbandonmentCheck().catch(e => console.error("[Abandonment] Scheduled run error:", e));
    }, SCHEDULER_INTERVAL_MS);
}

export function stopAbandonmentScheduler(): void {
    if (schedulerTimer) {
        clearInterval(schedulerTimer);
        schedulerTimer = null;
    }
}

export async function runAbandonmentCheck(): Promise<{ abandoned: number; forfeited: number }> {
    if (!isDbReady()) {
        console.log('[Abandonment] Skipping tick — DB not ready');
        return { abandoned: 0, forfeited: 0 };
    }
    if (abandonmentCheckInProgress) return { abandoned: 0, forfeited: 0 };
    abandonmentCheckInProgress = true;
    try {
    const now = new Date();
    let abandoned = 0;
    let forfeited = 0;

    // --- Step 1: Mark Abandoned (90+ days old, still in active status) ---
    const abandonThreshold = new Date(now.getTime() - ABANDON_AFTER_DAYS * 24 * 60 * 60 * 1000);

    const toAbandon = await db
        .select({ id: jobTickets.id, customer: jobTickets.customer, customerPhone: jobTickets.customerPhone })
        .from(jobTickets)
        .where(
            and(
                inArray(jobTickets.status, ABANDONABLE_STATUSES),
                lt(jobTickets.createdAt, abandonThreshold)
            )
        );

    for (const job of toAbandon) {
        await db
            .update(jobTickets)
            .set({
                status: "Abandoned",
                abandonedAt: now,
                lastSmsSentAt: now,
            })
            .where(eq(jobTickets.id, job.id));

        // Send final SMS
        if (job.customerPhone) {
            const message = `Dear ${job.customer || "Customer"}, your repair job at Promise Electronics has been marked as Abandoned after 90 days. Please collect your device or contact us within 14 days, or ownership may be transferred. Call: 01XXXXXXXXX`;
            smsService.sendSms({ to: job.customerPhone, message }).catch(() => {});
        }

        abandoned++;
    }

    // --- Step 2: Mark Forfeited (Abandoned for 14+ more days) ---
    const forfeitThreshold = new Date(now.getTime() - FORFEIT_AFTER_ABANDON_DAYS * 24 * 60 * 60 * 1000);

    const toForfeit = await db
        .select({ id: jobTickets.id })
        .from(jobTickets)
        .where(
            and(
                eq(jobTickets.status, "Abandoned"),
                lt(jobTickets.abandonedAt, forfeitThreshold)
            )
        );

    for (const job of toForfeit) {
        await db
            .update(jobTickets)
            .set({
                status: "Forfeited",
                forfeitedAt: now,
            })
            .where(eq(jobTickets.id, job.id));

        forfeited++;
    }

    if (abandoned > 0 || forfeited > 0) {
        console.log(`[Abandonment] Run complete — abandoned: ${abandoned}, forfeited: ${forfeited}`);
    }

    return { abandoned, forfeited };
    } finally {
        abandonmentCheckInProgress = false;
    }
}
