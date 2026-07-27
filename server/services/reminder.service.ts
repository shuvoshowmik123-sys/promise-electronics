/**
 * Reminder Scheduler — claim/token delivery integrity (01C-B2-B1).
 * is_sent only after ≥1 FCM success within timeout; stale completions no-op.
 */
import { db } from "../db.js";
import { eq, and, lte, sql } from "drizzle-orm";
import { reminders } from "../../shared/schema.js";
import { sendPushToDevice } from "./fcm.service.js";
import { EventEmitter } from "events";
import { isDbReady } from "./db-readiness.js";
import { logBackgroundFailure } from "../utils/safe-error.js";
import { randomUUID } from "crypto";

const SCHEDULER_INTERVAL_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const LEASE_MS = 5 * 60 * 1000;
const PROVIDER_TIMEOUT_MS = 15_000;
/** Backoff minutes after attempt n (1-based) fails: 1,5,15,60,180 */
const BACKOFF_MINUTES = [1, 5, 15, 60, 180] as const;
const CLAIM_BATCH = 20;
const INSTANCE_OWNER = () =>
  process.env.HOSTNAME || process.env.RENDER_INSTANCE_ID || "local";

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let reminderCheckInProgress = false;
const reminderEvents = new EventEmitter();

export type ReminderChangedEvent = {
  type: "created" | "dismissed" | "deleted" | "sent";
  userId: string;
  reminderId?: string;
};

/** Test-only hooks (NODE_ENV=test). */
type ReminderTestHooks = {
  listDeviceTokens?: (userId: string) => Promise<string[]>;
  sendPush?: (token: string) => Promise<boolean>;
  hangPush?: boolean;
  /** Short provider timeout for fast proofs only. */
  providerTimeoutMs?: number;
};

let testHooks: ReminderTestHooks | null = null;

export function setReminderTestHooks(hooks: ReminderTestHooks | null): void {
  if (process.env.NODE_ENV !== "test") return;
  testHooks = hooks;
}

function providerTimeoutMs(): number {
  if (process.env.NODE_ENV === "test" && typeof testHooks?.providerTimeoutMs === "number") {
    return testHooks.providerTimeoutMs;
  }
  return PROVIDER_TIMEOUT_MS;
}

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
  runReminderCheck().catch(() => logBackgroundFailure("Reminders", "INITIAL_RUN_FAILED"));
  schedulerTimer = setInterval(() => {
    runReminderCheck().catch(() => logBackgroundFailure("Reminders", "SCHEDULED_RUN_FAILED"));
  }, SCHEDULER_INTERVAL_MS);
}

export function stopReminderScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

function nextAttemptAt(attemptCount: number): Date | null {
  if (attemptCount >= MAX_ATTEMPTS) return null;
  const mins = BACKOFF_MINUTES[Math.min(attemptCount - 1, BACKOFF_MINUTES.length - 1)] ?? 180;
  return new Date(Date.now() + mins * 60_000);
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number
): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raced = await Promise.race([
      promise.then((value) => ({ timedOut: false as const, value })),
      new Promise<{ timedOut: true }>((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true }), ms);
      }),
    ]);
    return raced;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function listActiveTokens(userId: string): Promise<string[]> {
  if (testHooks?.listDeviceTokens) {
    return testHooks.listDeviceTokens(userId);
  }
  const rows = await db.execute(
    sql`SELECT token FROM device_tokens WHERE user_id = ${userId} AND is_active = true`
  );
  return (rows.rows as { token: string }[]).map((r) => r.token);
}

async function pushOne(token: string, title: string, body: string, data: Record<string, string>): Promise<boolean> {
  if (testHooks?.hangPush) {
    return new Promise(() => {});
  }
  if (testHooks?.sendPush) {
    return testHooks.sendPush(token);
  }
  return sendPushToDevice(token, { title, body, data });
}

type ClaimedReminder = {
  id: string;
  userId: string;
  title: string;
  body: string | null;
  remindAt: Date;
  repeat: string | null;
  jobId: string | null;
  createdBy: string;
  claimToken: string;
  attemptCount: number;
};

/** Atomic claim of due reminders (one SKIP LOCKED claim per token). */
export async function claimDueReminders(limit = CLAIM_BATCH): Promise<ClaimedReminder[]> {
  const owner = INSTANCE_OWNER();
  const claimed: ClaimedReminder[] = [];
  for (let i = 0; i < limit; i++) {
    const token = randomUUID();
    const result = await db.execute(sql`
      UPDATE reminders r
      SET
        claim_owner = ${owner},
        claim_token = ${token},
        claim_until = NOW() + (${Math.floor(LEASE_MS / 1000)} * INTERVAL '1 second'),
        delivery_status = 'in_flight',
        attempt_count = COALESCE(r.attempt_count, 0) + 1,
        last_attempt_at = NOW(),
        last_failure_code = NULL
      WHERE r.id = (
        SELECT id
        FROM reminders
        WHERE is_dismissed = false
          AND is_sent = false
          AND remind_at <= NOW()
          AND COALESCE(attempt_count, 0) < ${MAX_ATTEMPTS}
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
          AND (
            COALESCE(delivery_status, 'pending') IN ('pending', 'failed')
            OR (delivery_status = 'in_flight' AND claim_until IS NOT NULL AND claim_until < NOW())
          )
        ORDER BY remind_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        r.id,
        r.user_id AS "userId",
        r.title,
        r.body,
        r.remind_at AS "remindAt",
        r.repeat,
        r.job_id AS "jobId",
        r.created_by AS "createdBy",
        r.claim_token AS "claimToken",
        r.attempt_count AS "attemptCount"
    `);
    if ((result.rowCount ?? 0) === 0) break;
    const row = result.rows[0] as any;
    claimed.push({
      id: row.id,
      userId: row.userId,
      title: row.title,
      body: row.body,
      remindAt: new Date(row.remindAt),
      repeat: row.repeat,
      jobId: row.jobId,
      createdBy: row.createdBy,
      claimToken: row.claimToken,
      attemptCount: Number(row.attemptCount),
    });
  }
  return claimed;
}

async function completeDelivered(id: string, claimToken: string, userId: string): Promise<boolean> {
  const now = new Date();
  const updated = await db.execute(sql`
    UPDATE reminders
    SET
      delivery_status = 'delivered',
      is_sent = true,
      sent_at = ${now},
      claim_owner = NULL,
      claim_token = NULL,
      claim_until = NULL,
      next_attempt_at = NULL,
      last_failure_code = NULL
    WHERE id = ${id}
      AND claim_token = ${claimToken}
      AND delivery_status = 'in_flight'
    RETURNING id
  `);
  if ((updated.rowCount ?? 0) === 0) {
    logBackgroundFailure("Reminders", "STALE_CLAIM_COMPLETION");
    return false;
  }
  emitReminderChanged({ type: "sent", userId, reminderId: id });
  return true;
}

async function completeSkippedNoTokens(id: string, claimToken: string): Promise<void> {
  const updated = await db.execute(sql`
    UPDATE reminders
    SET
      delivery_status = 'skipped_no_tokens',
      is_sent = false,
      claim_owner = NULL,
      claim_token = NULL,
      claim_until = NULL,
      next_attempt_at = NULL,
      last_failure_code = 'NO_ACTIVE_TOKENS'
    WHERE id = ${id}
      AND claim_token = ${claimToken}
      AND delivery_status = 'in_flight'
    RETURNING id
  `);
  if ((updated.rowCount ?? 0) === 0) {
    logBackgroundFailure("Reminders", "STALE_CLAIM_COMPLETION");
  }
}

async function completeFailed(id: string, claimToken: string, attemptCount: number, code: string): Promise<void> {
  const permanent = attemptCount >= MAX_ATTEMPTS;
  const nextAt = permanent ? null : nextAttemptAt(attemptCount);
  const status = permanent ? "failed_permanent" : "failed";
  const updated = await db.execute(sql`
    UPDATE reminders
    SET
      delivery_status = ${status},
      is_sent = false,
      claim_owner = NULL,
      claim_token = NULL,
      claim_until = NULL,
      next_attempt_at = ${nextAt},
      last_failure_code = ${code}
    WHERE id = ${id}
      AND claim_token = ${claimToken}
      AND delivery_status = 'in_flight'
    RETURNING id
  `);
  if ((updated.rowCount ?? 0) === 0) {
    logBackgroundFailure("Reminders", "STALE_CLAIM_COMPLETION");
  }
}

async function maybeInsertRepeat(row: {
  id: string;
  userId: string;
  title: string;
  body: string | null;
  remindAt: Date;
  repeat: string | null;
  jobId: string | null;
  createdBy: string;
}): Promise<void> {
  if (!row.repeat) return;
  const next = new Date(row.remindAt);
  if (row.repeat === "daily") next.setDate(next.getDate() + 1);
  else if (row.repeat === "weekly") next.setDate(next.getDate() + 7);
  else return;
  const id = randomUUID();
  await db.execute(sql`
    INSERT INTO reminders (
      id, user_id, created_by, title, body, remind_at, repeat, job_id, created_at,
      is_sent, is_dismissed, delivery_status, attempt_count
    ) VALUES (
      ${id}, ${row.userId}, ${row.createdBy}, ${row.title}, ${row.body},
      ${next.toISOString()}, ${row.repeat}, ${row.jobId}, NOW(),
      false, false, 'pending', 0
    )
  `);
}

/** Process one claimed reminder (exported for proofs). D2-A: ≥1 FCM success → delivered. */
export async function processClaimedReminder(row: {
  id: string;
  userId: string;
  title: string;
  body: string | null;
  remindAt: Date;
  repeat: string | null;
  jobId: string | null;
  createdBy: string;
  claimToken: string;
  attemptCount: number;
}): Promise<"delivered" | "failed" | "skipped_no_tokens" | "timeout" | "stale"> {
  const tokens = await listActiveTokens(row.userId);
  if (tokens.length === 0) {
    await completeSkippedNoTokens(row.id, row.claimToken);
    return "skipped_no_tokens";
  }

  const data: Record<string, string> = {
    type: "reminder",
    reminderId: row.id,
    ...(row.jobId ? { jobId: row.jobId } : {}),
  };

  let anySuccess = false;
  let hasUnknownOutcome = false;
  let finalized = false;
  const timeoutMs = providerTimeoutMs();

  const tryLateDelivered = async (ok: boolean): Promise<void> => {
    if (!ok || finalized) return;
    const done = await completeDelivered(row.id, row.claimToken, row.userId);
    if (done) {
      finalized = true;
      await maybeInsertRepeat(row);
    }
  };

  for (const token of tokens) {
    const pushPromise = pushOne(token, row.title, row.body || "", data);
    const raced = await withTimeout(pushPromise, timeoutMs);
    if (raced.timedOut) {
      hasUnknownOutcome = true;
      logBackgroundFailure("Reminders", "PROVIDER_TIMEOUT");
      // Late ack may still fire; token-matched complete is no-op if reclaimed (T11).
      void pushPromise
        .then((ok) => tryLateDelivered(ok === true))
        .catch(() => {});
      continue;
    }
    if (raced.value === true) anySuccess = true;
  }

  if (anySuccess) {
    finalized = true;
    const ok = await completeDelivered(row.id, row.claimToken, row.userId);
    if (!ok) return "stale";
    await maybeInsertRepeat(row);
    return "delivered";
  }

  if (hasUnknownOutcome) {
    // Leave claim in_flight until lease expiry; do not schedule failed backoff yet.
    return "timeout";
  }

  await completeFailed(row.id, row.claimToken, row.attemptCount, "FCM_ALL_FAILED");
  return "failed";
}

export async function runReminderCheck(): Promise<number> {
  if (!isDbReady()) {
    console.log("[Reminders] Skipping tick — DB not ready");
    return 0;
  }
  if (reminderCheckInProgress) return 0;
  reminderCheckInProgress = true;
  try {
    const claimed = await claimDueReminders();
    let delivered = 0;
    for (const row of claimed) {
      const result = await processClaimedReminder({
        ...row,
        remindAt: new Date(row.remindAt),
      });
      if (result === "delivered") delivered += 1;
    }
    if (delivered > 0) {
      console.log(`[Reminders] Delivered ${delivered} reminder(s)`);
    }
    return delivered;
  } finally {
    reminderCheckInProgress = false;
  }
}
