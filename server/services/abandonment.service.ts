/**
 * Abandonment Scheduler — job lifecycle CAS + SMS outbox (01C-B2-B1).
 * D1-A: Abandoned even if SMS pending; last_sms_sent_at only after SMS ack.
 */
import { db } from "../db.js";
import { eq, and, lt, inArray, sql } from "drizzle-orm";
import { jobTickets } from "../../shared/schema.js";
import { smsService } from "./sms.service.js";
import { isDbReady } from "./db-readiness.js";
import { logBackgroundFailure } from "../utils/safe-error.js";
import { randomUUID } from "crypto";

const SCHEDULER_INTERVAL_MS = 60 * 60 * 1000;
const OUTBOX_INTERVAL_MS = 60 * 1000;
const ABANDON_AFTER_DAYS = 90;
const FORFEIT_AFTER_ABANDON_DAYS = 14;
const SMS_MAX_ATTEMPTS = 3;
const SMS_LEASE_MS = 5 * 60 * 1000;
const SMS_TIMEOUT_MS = 15_000;
/** Backoff after attempt n: 5, 30, 120 minutes */
const SMS_BACKOFF_MINUTES = [5, 30, 120] as const;
const OUTBOX_KIND = "abandonment_sms";
const INSTANCE_OWNER = () =>
  process.env.HOSTNAME || process.env.RENDER_INSTANCE_ID || "local";

const ABANDONABLE_STATUSES = [
  "Pending",
  "Diagnosing",
  "Pending Parts",
  "In Progress",
  "On Workbench",
  "Ready",
];

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let outboxTimer: ReturnType<typeof setInterval> | null = null;
let abandonmentCheckInProgress = false;
let outboxInProgress = false;

type SmsTestHooks = {
  sendSms?: (to: string, message: string) => Promise<{ success: boolean; error?: string }>;
  hang?: boolean;
};

let smsTestHooks: SmsTestHooks | null = null;

export function setAbandonmentSmsTestHooks(hooks: SmsTestHooks | null): void {
  if (process.env.NODE_ENV !== "test") return;
  smsTestHooks = hooks;
}

export function startAbandonmentScheduler(): void {
  if (schedulerTimer) return;
  console.log("[Abandonment] Scheduler started");
  runAbandonmentCheck().catch(() => logBackgroundFailure("Abandonment", "INITIAL_RUN_FAILED"));
  schedulerTimer = setInterval(() => {
    runAbandonmentCheck().catch(() => logBackgroundFailure("Abandonment", "SCHEDULED_RUN_FAILED"));
  }, SCHEDULER_INTERVAL_MS);
  if (!outboxTimer) {
    outboxTimer = setInterval(() => {
      processAbandonmentSmsOutbox().catch(() =>
        logBackgroundFailure("Abandonment", "OUTBOX_TICK_FAILED")
      );
    }, OUTBOX_INTERVAL_MS);
    processAbandonmentSmsOutbox().catch(() =>
      logBackgroundFailure("Abandonment", "OUTBOX_INITIAL_FAILED")
    );
  }
}

export function stopAbandonmentScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  if (outboxTimer) {
    clearInterval(outboxTimer);
    outboxTimer = null;
  }
}

function smsNextAttemptAt(attemptCount: number): Date | null {
  if (attemptCount >= SMS_MAX_ATTEMPTS) return null;
  const mins = SMS_BACKOFF_MINUTES[Math.min(attemptCount - 1, SMS_BACKOFF_MINUTES.length - 1)] ?? 120;
  return new Date(Date.now() + mins * 60_000);
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number
): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then((value) => ({ timedOut: false as const, value })),
      new Promise<{ timedOut: true }>((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true }), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildAbandonMessage(customer: string | null): string {
  return `Dear ${customer || "Customer"}, your repair job at Promise Electronics has been marked as Abandoned after 90 days. Please collect your device or contact us within 14 days, or ownership may be transferred. Call: 01XXXXXXXXX`;
}

function isPermanentSmsError(error?: string): boolean {
  if (!error) return false;
  const e = error.toLowerCase();
  return (
    e.includes("invalid phone") ||
    e.includes("invalid recipient") ||
    e.includes("invalid number")
  );
}

/** Status CAS + outbox insert in one transaction. */
export async function abandonJobWithOutbox(jobId: string): Promise<{
  abandoned: boolean;
  outboxId: string | null;
}> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.execute(sql`
      UPDATE job_tickets
      SET
        status = 'Abandoned',
        abandoned_at = ${now}
      WHERE id = ${jobId}
        AND status IN ('Pending', 'Diagnosing', 'Pending Parts', 'In Progress', 'On Workbench', 'Ready')
      RETURNING id, abandoned_at AS "abandonedAt"
    `);
    if ((updated.rowCount ?? 0) === 0) {
      return { abandoned: false, outboxId: null };
    }
    const abandonedAt = (updated.rows[0] as any).abandonedAt || now;
    const iso =
      abandonedAt instanceof Date ? abandonedAt.toISOString() : new Date(abandonedAt).toISOString();
    const idempotencyKey = `abandon_sms:${jobId}:${iso}`;
    const outboxId = randomUUID();
    await tx.execute(sql`
      INSERT INTO scheduler_delivery_outbox (
        id, kind, entity_type, entity_id, idempotency_key,
        delivery_status, attempt_count, created_at
      ) VALUES (
        ${outboxId}, ${OUTBOX_KIND}, 'job_ticket', ${jobId}, ${idempotencyKey},
        'pending', 0, NOW()
      )
      ON CONFLICT (idempotency_key) DO NOTHING
    `);
    const existing = await tx.execute(sql`
      SELECT id FROM scheduler_delivery_outbox WHERE idempotency_key = ${idempotencyKey} LIMIT 1
    `);
    const oid = (existing.rows[0] as any)?.id ?? null;
    return { abandoned: true, outboxId: oid };
  });
}

export async function runAbandonmentCheck(): Promise<{ abandoned: number; forfeited: number }> {
  if (!isDbReady()) {
    console.log("[Abandonment] Skipping tick — DB not ready");
    return { abandoned: 0, forfeited: 0 };
  }
  if (abandonmentCheckInProgress) return { abandoned: 0, forfeited: 0 };
  abandonmentCheckInProgress = true;
  try {
    const now = new Date();
    let abandoned = 0;
    let forfeited = 0;

    const abandonThreshold = new Date(now.getTime() - ABANDON_AFTER_DAYS * 24 * 60 * 60 * 1000);
    const toAbandon = await db
      .select({ id: jobTickets.id })
      .from(jobTickets)
      .where(
        and(inArray(jobTickets.status, ABANDONABLE_STATUSES), lt(jobTickets.createdAt, abandonThreshold))
      );

    for (const job of toAbandon) {
      const res = await abandonJobWithOutbox(job.id);
      if (res.abandoned) {
        abandoned += 1;
        try {
          const { projectJobStatusAfterExternalWrite } = await import("./job-status-transition.service.js");
          await projectJobStatusAfterExternalWrite(job.id, "Abandonment Scheduler", {
            suppressReadyNotify: true,
          });
        } catch (err) {
          console.error("[Abandonment] Projection failed:", (err as Error).message);
        }
      }
    }

    const forfeitThreshold = new Date(
      now.getTime() - FORFEIT_AFTER_ABANDON_DAYS * 24 * 60 * 60 * 1000
    );
    const toForfeit = await db
      .select({ id: jobTickets.id })
      .from(jobTickets)
      .where(and(eq(jobTickets.status, "Abandoned"), lt(jobTickets.abandonedAt, forfeitThreshold)));

    for (const job of toForfeit) {
      const u = await db.execute(sql`
        UPDATE job_tickets
        SET status = 'Forfeited', forfeited_at = ${now}
        WHERE id = ${job.id} AND status = 'Abandoned'
        RETURNING id
      `);
      if ((u.rowCount ?? 0) > 0) {
        forfeited += 1;
        try {
          const { projectJobStatusAfterExternalWrite } = await import("./job-status-transition.service.js");
          await projectJobStatusAfterExternalWrite(job.id, "Abandonment Scheduler", {
            suppressReadyNotify: true,
          });
        } catch (err) {
          console.error("[Abandonment] Forfeit projection failed:", (err as Error).message);
        }
      }
    }

    if (abandoned > 0 || forfeited > 0) {
      console.log(`[Abandonment] Run complete — abandoned: ${abandoned}, forfeited: ${forfeited}`);
    }
    return { abandoned, forfeited };
  } finally {
    abandonmentCheckInProgress = false;
  }
}

export async function claimDueAbandonmentSms(limit = 10): Promise<
  Array<{ id: string; entityId: string; claimToken: string; attemptCount: number }>
> {
  const owner = INSTANCE_OWNER();
  const claimed: Array<{ id: string; entityId: string; claimToken: string; attemptCount: number }> = [];
  for (let i = 0; i < limit; i++) {
    const token = randomUUID();
    const result = await db.execute(sql`
      UPDATE scheduler_delivery_outbox o
      SET
        claim_owner = ${owner},
        claim_token = ${token},
        claim_until = NOW() + (${Math.floor(SMS_LEASE_MS / 1000)} * INTERVAL '1 second'),
        delivery_status = 'in_flight',
        attempt_count = COALESCE(o.attempt_count, 0) + 1,
        last_attempt_at = NOW(),
        last_failure_code = NULL
      WHERE o.id = (
        SELECT id
        FROM scheduler_delivery_outbox
        WHERE kind = ${OUTBOX_KIND}
          AND COALESCE(attempt_count, 0) < ${SMS_MAX_ATTEMPTS}
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
          AND (
            delivery_status IN ('pending', 'failed')
            OR (delivery_status = 'in_flight' AND claim_until IS NOT NULL AND claim_until < NOW())
          )
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        o.id,
        o.entity_id AS "entityId",
        o.claim_token AS "claimToken",
        o.attempt_count AS "attemptCount"
    `);
    if ((result.rowCount ?? 0) === 0) break;
    const row = result.rows[0] as any;
    claimed.push({
      id: row.id,
      entityId: row.entityId,
      claimToken: row.claimToken,
      attemptCount: Number(row.attemptCount),
    });
  }
  return claimed;
}

async function sendSmsSafe(to: string, message: string): Promise<{ success: boolean; error?: string }> {
  if (smsTestHooks?.hang) {
    return new Promise(() => {});
  }
  if (smsTestHooks?.sendSms) {
    return smsTestHooks.sendSms(to, message);
  }
  return smsService.sendSms({ to, message });
}

/** Process one claimed outbox row. */
export async function processClaimedAbandonmentSms(row: {
  id: string;
  entityId: string;
  claimToken: string;
  attemptCount: number;
}): Promise<"sent" | "failed" | "timeout" | "stale" | "permanent"> {
  const jobRes = await db.execute(sql`
    SELECT id, customer, customer_phone AS "customerPhone"
    FROM job_tickets WHERE id = ${row.entityId} LIMIT 1
  `);
  const job = jobRes.rows[0] as { id: string; customer: string | null; customerPhone: string | null } | undefined;
  if (!job?.customerPhone) {
    await failOutbox(row.id, row.claimToken, row.attemptCount, "NO_PHONE", true);
    return "permanent";
  }
  if (!smsService.isValidBangladeshPhone(job.customerPhone)) {
    await failOutbox(row.id, row.claimToken, row.attemptCount, "INVALID_RECIPIENT", true);
    return "permanent";
  }

  const message = buildAbandonMessage(job.customer);
  const raced = await withTimeout(sendSmsSafe(job.customerPhone, message), SMS_TIMEOUT_MS);
  if (raced.timedOut) {
    logBackgroundFailure("Abandonment", "PROVIDER_TIMEOUT");
    return "timeout";
  }

  if (raced.value.success) {
    const ok = await completeSmsSent(row.id, row.claimToken, row.entityId);
    return ok ? "sent" : "stale";
  }

  const permanent =
    isPermanentSmsError(raced.value.error) || row.attemptCount >= SMS_MAX_ATTEMPTS;
  await failOutbox(
    row.id,
    row.claimToken,
    row.attemptCount,
    permanent && isPermanentSmsError(raced.value.error) ? "INVALID_RECIPIENT" : "SMS_FAILED",
    permanent
  );
  return permanent ? "permanent" : "failed";
}

async function completeSmsSent(outboxId: string, claimToken: string, jobId: string): Promise<boolean> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const u = await tx.execute(sql`
      UPDATE scheduler_delivery_outbox
      SET
        delivery_status = 'sent',
        sent_at = ${now},
        claim_owner = NULL,
        claim_token = NULL,
        claim_until = NULL,
        next_attempt_at = NULL,
        last_failure_code = NULL
      WHERE id = ${outboxId}
        AND claim_token = ${claimToken}
        AND delivery_status = 'in_flight'
      RETURNING id
    `);
    if ((u.rowCount ?? 0) === 0) {
      logBackgroundFailure("Abandonment", "STALE_CLAIM_COMPLETION");
      return false;
    }
    await tx.execute(sql`
      UPDATE job_tickets
      SET last_sms_sent_at = ${now}
      WHERE id = ${jobId}
        AND last_sms_sent_at IS NULL
    `);
    return true;
  });
}

async function failOutbox(
  outboxId: string,
  claimToken: string,
  attemptCount: number,
  code: string,
  permanent: boolean
): Promise<void> {
  const status = permanent || attemptCount >= SMS_MAX_ATTEMPTS ? "failed_permanent" : "failed";
  const nextAt =
    status === "failed_permanent" ? null : smsNextAttemptAt(attemptCount);
  const u = await db.execute(sql`
    UPDATE scheduler_delivery_outbox
    SET
      delivery_status = ${status},
      claim_owner = NULL,
      claim_token = NULL,
      claim_until = NULL,
      next_attempt_at = ${nextAt},
      last_failure_code = ${code}
    WHERE id = ${outboxId}
      AND claim_token = ${claimToken}
      AND delivery_status = 'in_flight'
    RETURNING id
  `);
  if ((u.rowCount ?? 0) === 0) {
    logBackgroundFailure("Abandonment", "STALE_CLAIM_COMPLETION");
  }
}

export async function processAbandonmentSmsOutbox(): Promise<number> {
  if (!isDbReady()) return 0;
  if (outboxInProgress) return 0;
  outboxInProgress = true;
  try {
    const claimed = await claimDueAbandonmentSms();
    let sent = 0;
    for (const row of claimed) {
      const r = await processClaimedAbandonmentSms(row);
      if (r === "sent") sent += 1;
    }
    return sent;
  } finally {
    outboxInProgress = false;
  }
}
