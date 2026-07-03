/**
 * Reminder Scheduler (Phase 3)
 *
 * Checks every minute for due reminders, sends FCM push to the target user's
 * registered device tokens, then marks them as sent.
 */
import { db } from "../db.js";
import { eq, and, lte, isNull } from "drizzle-orm";
import { reminders } from "../../shared/schema.js";
import { sendPushToDevice } from "./fcm.service.js";
import { sql } from "drizzle-orm";
import { EventEmitter } from "events";
import { isDbReady } from "./db-readiness.js";

const SCHEDULER_INTERVAL_MS = 60 * 1000; // every minute

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let reminderCheckInProgress = false;
const reminderEvents = new EventEmitter();

export type ReminderChangedEvent = {
    type: "created" | "dismissed" | "deleted" | "sent";
    userId: string;
    reminderId?: string;
};

export function emitReminderChanged(event: ReminderChangedEvent): void {
    reminderEvents.emit("changed", event);
}

export function onReminderChanged(listener: (event: ReminderChangedEvent) => void): void {
    reminderEvents.on("changed", listener);
}

export function offReminderChanged(listener: (event: ReminderChangedEvent) => void): void {
    reminderEvents.off("changed", listener);
}

export function startReminderScheduler(): void {
    if (schedulerTimer) return;
    console.log("[Reminders] Scheduler started");
    runReminderCheck().catch(e => console.error("[Reminders] Initial run error:", e));
    schedulerTimer = setInterval(() => {
        runReminderCheck().catch(e => console.error("[Reminders] Scheduled run error:", e));
    }, SCHEDULER_INTERVAL_MS);
}

export function stopReminderScheduler(): void {
    if (schedulerTimer) {
        clearInterval(schedulerTimer);
        schedulerTimer = null;
    }
}

export async function runReminderCheck(): Promise<number> {
    if (!isDbReady()) {
        console.log('[Reminders] Skipping tick — DB not ready');
        return 0;
    }
    if (reminderCheckInProgress) return 0;
    reminderCheckInProgress = true;
    try {
        const now = new Date();

        // Fetch due, unsent, undismissed reminders
        const due = await db
            .select()
            .from(reminders)
            .where(
                and(
                    eq(reminders.isSent, false),
                    eq(reminders.isDismissed, false),
                    lte(reminders.remindAt, now)
                )
            );

        if (due.length === 0) return 0;

        let sent = 0;

        for (const reminder of due) {
            // Fetch active device tokens for this user from DB
            const rows = await db.execute(
                sql`SELECT token FROM device_tokens WHERE user_id = ${reminder.userId} AND is_active = true`
            );

            const tokens: string[] = (rows.rows as any[]).map((r: any) => r.token);

            for (const token of tokens) {
                await sendPushToDevice(token, {
                    title: reminder.title,
                    body: reminder.body || "",
                    data: {
                        type: "reminder",
                        reminderId: reminder.id,
                        ...(reminder.jobId ? { jobId: reminder.jobId } : {}),
                    },
                }).catch(() => {});
            }

            // Mark sent
            await db
                .update(reminders)
                .set({ isSent: true, sentAt: now })
                .where(eq(reminders.id, reminder.id));
            emitReminderChanged({ type: "sent", userId: reminder.userId, reminderId: reminder.id });

            // Handle repeat — schedule next occurrence
            if (reminder.repeat) {
                const next = new Date(reminder.remindAt);
                if (reminder.repeat === "daily") next.setDate(next.getDate() + 1);
                else if (reminder.repeat === "weekly") next.setDate(next.getDate() + 7);

                const { randomUUID } = await import("crypto");
                await db.execute(
                    sql`INSERT INTO reminders (id, user_id, created_by, title, body, remind_at, repeat, job_id, created_at)
                        VALUES (${randomUUID()}, ${reminder.userId}, ${reminder.createdBy}, ${reminder.title},
                                ${reminder.body}, ${next.toISOString()}, ${reminder.repeat},
                                ${reminder.jobId}, NOW())`
                );
            }

            sent++;
        }

        if (sent > 0) {
            console.log(`[Reminders] Sent ${sent} reminder(s)`);
        }

        return sent;
    } finally {
        reminderCheckInProgress = false;
    }
}
