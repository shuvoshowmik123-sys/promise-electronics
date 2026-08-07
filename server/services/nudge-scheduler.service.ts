/**
 * Nudge scheduler — the system speaking first.
 *
 * NOT to be confused with reminder.service.ts, which delivers reminders a
 * PERSON created ("remind me about this job at 3pm") and owns the retry and
 * backoff machinery for them. Nothing here is user-created: these are nudges
 * the system decides to send because a condition holds — no attendance
 * recorded, parts unlisted, a job that has not moved. Kept separate so system
 * nudges never appear in someone's personal reminder list.
 *
 * Everything here exists because the app only ever answered questions. It never
 * asked one. Attendance went unrecorded until someone remembered; parts went
 * unlogged until stock drifted; a job could sit untouched for a week and say
 * nothing. Staff had to think of the system before the system thought of them,
 * which is backwards.
 *
 * WHY EVERY REMINDER STOPS
 *
 * The hard part is not sending — it is not sending. A reminder people mute is
 * worse than none, because the parts declarations this is meant to protect stop
 * arriving with it. So:
 *
 *   - nothing is sent on a day with nothing to do (no "all clear" pings)
 *   - attendance nudges twice, then escalates to a manager rather than buzzing
 *     the same person a third time. Past ~11:00 it is no longer forgetfulness;
 *     it is a day off, illness, or a pickup, and none of those are fixed by
 *     another notification
 *   - a stalled job nudges its technician, then the manager. If it is still
 *     stuck on day four the technician is not the blocker — parts, a customer
 *     decision, or a manager is
 *
 * WHY THE COPY READS THE WAY IT DOES
 *
 * Chrome runs an on-device classifier over notifications and buries anything
 * shaped like marketing. This shop already had notifications flagged once. So
 * no exclamation marks, no "don't forget", no countdowns, no tap-bait. Warmth
 * comes from specificity instead: "3 repairs today need their parts listed"
 * reads like a colleague because it knows what you did today, and passes the
 * filter precisely because it is a plain statement of fact. The conversational
 * voice belongs on the screen the notification opens, where nothing is being
 * classified.
 *
 * IDEMPOTENCY
 *
 * This polls, so every send must be safe to attempt repeatedly. A dispatch is
 * an INSERT ... ON CONFLICT DO NOTHING against reminder_dispatches, and the
 * push only follows when a row was actually created. One atomic statement, so
 * it holds across restarts and across two instances — unlike an in-memory set,
 * which loses on both.
 */
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../db.js";
import * as schema from "../../shared/schema.js";
import { isDbReady } from "./db-readiness.js";
import { notifyStaffAssignment } from "./staff-assignment-notify.service.js";
import { logBackgroundFailure } from "../utils/safe-error.js";

const DHAKA_TZ = "Asia/Dhaka";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Roles expected to record attendance. Office-only roles are not chased. */
const ATTENDANCE_ROLES = ["Technician", "Driver", "Cashier"] as const;
const MANAGER_ROLES = ["Super Admin", "Manager"] as const;

/** Minutes past midnight, Asia/Dhaka. */
const ATTENDANCE_FIRST_MIN = 10 * 60 + 30;  // 10:30
const ATTENDANCE_SECOND_MIN = 11 * 60;      // 11:00
const MANAGER_DIGEST_MIN = 11 * 60 + 30;    // 11:30
const EVENING_MIN = 20 * 60;                // 20:00

/** A job untouched this long is nudged; twice as long and a manager hears. */
const STALE_JOB_DAYS = 2;
const STALE_JOB_ESCALATE_DAYS = 4;

/** Dispatch rows are an audit trail, not history worth keeping forever. */
const DISPATCH_RETENTION_DAYS = 90;
/** Read notifications older than this are swept so the bell stays fast. */
const NOTIFICATION_RETENTION_DAYS = 60;

const OPEN_JOB_STATUSES = [
    "Pending", "Diagnosing", "In Progress", "On Workbench",
    "Pending Parts", "Waiting on Parts", "Testing",
] as const;

export type ReminderKind =
    | "attendance_first"
    | "attendance_second"
    | "attendance_manager_digest"
    | "attendance_evening"
    | "parts_declaration"
    | "stale_job"
    | "stale_job_escalation";

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let sweepInFlight = false;

type NudgeTestHooks = { now?: () => Date };
let testHooks: NudgeTestHooks | null = null;

export function setNudgeSchedulerTestHooks(hooks: NudgeTestHooks | null): void {
    if (process.env.NODE_ENV !== "test") return;
    testHooks = hooks;
}

function nowUtc(): Date {
    if (process.env.NODE_ENV === "test" && testHooks?.now) return testHooks.now();
    return new Date();
}

/** Calendar date YYYY-MM-DD in Asia/Dhaka. The shop's day, not UTC's. */
export function dhakaRunDay(d: Date = nowUtc()): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: DHAKA_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value ?? "1970";
    const m = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    return `${y}-${m}-${day}`;
}

/** Minutes past local midnight in Asia/Dhaka. */
export function dhakaMinutes(d: Date = nowUtc()): number {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: DHAKA_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const min = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    return h * 60 + min;
}

/**
 * Claim the right to send one reminder, exactly once.
 *
 * Returns true only when this call created the row. Two instances polling at
 * the same instant both run this; exactly one gets true, so the other sends
 * nothing. The uniqueness lives in the index, not in application logic that
 * could race between a SELECT and an INSERT.
 */
export async function claimDispatch(
    runDay: string, kind: ReminderKind, userId: string, targetRef = "",
): Promise<boolean> {
    const result = await db.execute(sql`
        INSERT INTO reminder_dispatches (id, run_day, reminder_kind, user_id, target_ref, created_at)
        VALUES (${randomUUID()}, ${runDay}, ${kind}, ${userId}, ${targetRef}, NOW())
        ON CONFLICT (run_day, reminder_kind, user_id, target_ref) DO NOTHING
    `);
    return (result.rowCount ?? 0) > 0;
}

/** Send one reminder if it has not already gone out today. */
async function sendOnce(
    runDay: string, kind: ReminderKind, userId: string,
    payload: { title: string; message: string; link: string; jobId?: string | null },
    targetRef = "",
): Promise<boolean> {
    if (!(await claimDispatch(runDay, kind, userId, targetRef))) return false;
    await notifyStaffAssignment({
        userId,
        title: payload.title,
        message: payload.message,
        link: payload.link,
        type: "reminder",
        jobId: payload.jobId ?? null,
    });
    return true;
}

async function staffWithoutAttendance(runDay: string): Promise<Array<{ id: string; name: string }>> {
    /**
     * Anyone active in an attendance-keeping role with no check-in row for the
     * Dhaka day. The date comparison is done in Dhaka rather than on the raw
     * timestamp, or a 9am check-in would look like "yesterday" to a UTC server.
     */
    const rows = await db.execute(sql`
        SELECT u.id, u.name
        FROM users u
        WHERE u.status = 'Active'
          AND u.role IN (${sql.join(ATTENDANCE_ROLES.map((r) => sql`${r}`), sql`, `)})
          AND NOT EXISTS (
              SELECT 1 FROM attendance_records a
              WHERE a.user_id = u.id
                AND (a.check_in_time AT TIME ZONE 'UTC' AT TIME ZONE ${DHAKA_TZ})::date = ${runDay}::date
          )
    `);
    return ((rows as any).rows ?? rows) as Array<{ id: string; name: string }>;
}

async function managerIds(): Promise<string[]> {
    const rows = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(
            eq(schema.users.status, "Active"),
            inArray(schema.users.role, [...MANAGER_ROLES]),
        ));
    return rows.map((r) => r.id);
}

/**
 * Attendance: two nudges to the person, then it becomes a manager's problem.
 *
 * The third buzz was deliberately not built. By late morning a missing check-in
 * is rarely forgetfulness, and pinging someone who is ill or out on a pickup
 * trains them to swipe everything away.
 */
async function sweepAttendance(runDay: string, minutes: number): Promise<void> {
    if (minutes < ATTENDANCE_FIRST_MIN) return;

    const missing = await staffWithoutAttendance(runDay);
    if (missing.length === 0) return; // Silence is the point.

    if (minutes >= ATTENDANCE_FIRST_MIN && minutes < ATTENDANCE_SECOND_MIN) {
        for (const user of missing) {
            await sendOnce(runDay, "attendance_first", user.id, {
                title: "Attendance not recorded yet",
                message: "Your check-in for today has not come through. You can record it from Attendance.",
                link: "/admin#attendance",
            });
        }
        return;
    }

    if (minutes >= ATTENDANCE_SECOND_MIN && minutes < MANAGER_DIGEST_MIN) {
        for (const user of missing) {
            await sendOnce(runDay, "attendance_second", user.id, {
                title: "Still no check-in recorded",
                message: "Attendance for today is still open. Recording it now keeps your hours accurate.",
                link: "/admin#attendance",
            });
        }
        return;
    }

    if (minutes >= MANAGER_DIGEST_MIN && minutes < EVENING_MIN) {
        // One digest naming everyone, not one notification per absent person.
        const names = missing.map((u) => u.name).filter(Boolean);
        const summary = names.slice(0, 3).join(", ");
        const extra = names.length > 3 ? ` and ${names.length - 3} more` : "";
        for (const managerId of await managerIds()) {
            await sendOnce(runDay, "attendance_manager_digest", managerId, {
                title: `${names.length} staff without attendance today`,
                message: `${summary}${extra} have no check-in recorded.`,
                link: "/admin#attendance",
            });
        }
        return;
    }

    /**
     * Evening: the day cannot be checked into any more, so this offers the
     * correction flow instead of repeating the nag. attendance_correction_requests
     * already exists; this is the moment it is useful.
     */
    for (const user of missing) {
        await sendOnce(runDay, "attendance_evening", user.id, {
            title: "No attendance recorded for today",
            message: "If you worked today, submit a correction so your hours are counted.",
            link: "/admin#attendance",
        });
    }
}

/**
 * Parts declaration: the end-of-day sweep that keeps stock honest.
 *
 * Only technicians who actually touched a job today, and only when at least one
 * of those jobs has no parts recorded. A technician whose jobs are all
 * accounted for hears nothing.
 */
async function sweepPartsDeclaration(runDay: string, minutes: number): Promise<void> {
    if (minutes < EVENING_MIN) return;

    /**
     * "Touched today" comes from audit_logs, not the job row: job_tickets has
     * no updated_at, and created_at would ask the wrong question entirely —
     * a job opened last week and worked on this morning is exactly the one
     * that needs its parts listed tonight.
     */
    const rows = await db.execute(sql`
        SELECT j.assigned_technician_id AS "technicianId",
               COUNT(*)                 AS "jobCount",
               MIN(j.device)            AS "sampleDevice"
        FROM job_tickets j
        WHERE j.assigned_technician_id IS NOT NULL
          AND (j.product_lines IS NULL OR j.product_lines = '' OR j.product_lines = '[]')
          AND EXISTS (
              SELECT 1 FROM audit_logs a
              WHERE a.entity = 'JobTicket'
                AND a.entity_id = j.id
                AND (a.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${DHAKA_TZ})::date = ${runDay}::date
          )
        GROUP BY j.assigned_technician_id
    `);

    for (const row of ((rows as any).rows ?? rows) as any[]) {
        const count = Number(row.jobCount);
        if (!row.technicianId || count < 1) continue;
        await sendOnce(runDay, "parts_declaration", String(row.technicianId), {
            title: count === 1 ? "1 repair needs its parts listed" : `${count} repairs need their parts listed`,
            message: count === 1
                ? `${row.sampleDevice ?? "A repair"} has no parts recorded yet.`
                : `Starting with ${row.sampleDevice ?? "today's repairs"}. Listing them keeps stock accurate.`,
            link: "/admin#jobs",
        });
    }
}

/**
 * Stalled work: the technician on day two, a manager on day four.
 *
 * Escalating sideways rather than repeating is the whole design. A job still
 * stuck after four days is usually blocked on parts, a customer decision, or a
 * manager — none of which the assigned technician can clear by being reminded
 * again.
 */
async function sweepStaleJobs(runDay: string, minutes: number): Promise<void> {
    if (minutes < EVENING_MIN) return;

    /**
     * Last activity is the newest audit entry for the job, falling back to when
     * it was created — a job nobody has ever touched is the most stalled kind
     * there is, and must not be excluded for lacking history.
     */
    const rows = await db.execute(sql`
        WITH activity AS (
            SELECT j.id,
                   j.assigned_technician_id AS technician_id,
                   j.device,
                   j.status,
                   COALESCE(
                       (SELECT MAX(a.created_at) FROM audit_logs a
                         WHERE a.entity = 'JobTicket' AND a.entity_id = j.id),
                       j.created_at
                   ) AS last_touched
            FROM job_tickets j
            WHERE j.assigned_technician_id IS NOT NULL
              AND j.status IN (${sql.join(OPEN_JOB_STATUSES.map((s) => sql`${s}`), sql`, `)})
        )
        SELECT id,
               technician_id AS "technicianId",
               device,
               status,
               FLOOR(EXTRACT(EPOCH FROM (NOW() - last_touched)) / 86400) AS "idleDays"
        FROM activity
        WHERE last_touched < NOW() - (${STALE_JOB_DAYS} * INTERVAL '1 day')
        ORDER BY last_touched ASC
        LIMIT 100
    `);

    const escalations: any[] = [];
    for (const job of ((rows as any).rows ?? rows) as any[]) {
        const idleDays = Number(job.idleDays);
        if (idleDays >= STALE_JOB_ESCALATE_DAYS) {
            escalations.push(job);
            continue;
        }
        await sendOnce(runDay, "stale_job", String(job.technicianId), {
            title: `${job.device ?? "A repair"} has not moved in ${idleDays} days`,
            message: `Still ${job.status}. Updating it keeps the customer's expectation accurate.`,
            link: "/admin#jobs",
            jobId: job.id,
        }, String(job.id));
    }

    if (escalations.length === 0) return;
    const managers = await managerIds();
    const first = escalations[0];
    const more = escalations.length > 1 ? ` and ${escalations.length - 1} more` : "";
    for (const managerId of managers) {
        await sendOnce(runDay, "stale_job_escalation", managerId, {
            title: `${escalations.length} repairs stalled over ${STALE_JOB_ESCALATE_DAYS} days`,
            message: `${first.device ?? "A repair"} is still ${first.status}${more}.`,
            link: "/admin#jobs",
        });
    }
}

/**
 * Keep both ledgers bounded.
 *
 * The bell reads notifications on every load, so an unbounded table gets slower
 * forever. Unread rows are kept regardless of age — those are still someone's
 * outstanding work.
 */
async function sweepRetention(): Promise<void> {
    await db.execute(sql`
        DELETE FROM notifications
        WHERE read = true
          AND created_at < NOW() - (${NOTIFICATION_RETENTION_DAYS} * INTERVAL '1 day')
    `);
    await db.execute(sql`
        DELETE FROM reminder_dispatches
        WHERE created_at < NOW() - (${DISPATCH_RETENTION_DAYS} * INTERVAL '1 day')
    `);
}

/** One pass. Each sweep is independent — one failing must not silence the rest. */
export async function runNudgeSweep(): Promise<void> {
    if (!isDbReady()) return;
    const now = nowUtc();
    const runDay = dhakaRunDay(now);
    const minutes = dhakaMinutes(now);

    for (const [code, sweep] of [
        ["ATTENDANCE_SWEEP_FAILED", () => sweepAttendance(runDay, minutes)],
        ["PARTS_SWEEP_FAILED", () => sweepPartsDeclaration(runDay, minutes)],
        ["STALE_JOB_SWEEP_FAILED", () => sweepStaleJobs(runDay, minutes)],
    ] as const) {
        try {
            await sweep();
        } catch {
            // Stable code only — logBackgroundFailure never takes error objects,
            // which is what keeps PII out of the incident register.
            logBackgroundFailure("Nudges", code);
        }
    }

    // Retention runs in the quiet hours; it is housekeeping, not a reminder.
    if (minutes < 60) {
        try {
            await sweepRetention();
        } catch {
            logBackgroundFailure("Nudges", "RETENTION_SWEEP_FAILED");
        }
    }
}

export function startNudgeScheduler(): void {
    if (schedulerTimer) return;
    console.log("[Nudges] Started — attendance 10:30/11:00, manager digest 11:30, evening 20:00 Asia/Dhaka");
    schedulerTimer = setInterval(() => {
        // A slow sweep must not overlap itself; correctness still comes from
        // the dispatch ledger, this only avoids pointless concurrent work.
        if (sweepInFlight) return;
        sweepInFlight = true;
        void runNudgeSweep().finally(() => { sweepInFlight = false; });
    }, CHECK_INTERVAL_MS);
}

export function stopNudgeScheduler(): void {
    if (schedulerTimer) {
        clearInterval(schedulerTimer);
        schedulerTimer = null;
    }
}
