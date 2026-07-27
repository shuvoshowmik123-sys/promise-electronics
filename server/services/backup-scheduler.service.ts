/**
 * Backup Scheduler — durable Asia/Dhaka day claim (01C-B2-B2A).
 * One run row per local day; 60-minute claim token; timeout ≠ success.
 */
import { backupService } from "./backup.service.js";
import { sendPushToAllAdmins } from "./fcm.service.js";
import { isDbReady } from "./db-readiness.js";
import { logBackgroundFailure } from "../utils/safe-error.js";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const SYSTEM_USER_ID = "system";
const SYSTEM_USER_NAME = "Scheduled Backup";
const TARGET_HOUR = 2; // Asia/Dhaka
const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const LEASE_MS = 60 * 60 * 1000;
const RETRY_MS = 60 * 60 * 1000;
const PROVIDER_TIMEOUT_MS = 55 * 60 * 1000; // 5m margin inside 60m lease
const DHAKA_TZ = "Asia/Dhaka";
const INSTANCE_OWNER = () =>
  process.env.HOSTNAME || process.env.RENDER_INSTANCE_ID || "local";

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
/** Intra-process only — correctness comes from DB claim. */
let processClaimInFlight = false;

type BackupSchedulerTestHooks = {
  now?: () => Date;
  createBackup?: (
    password: string,
    userId: string,
    userName: string,
    backupType: "manual" | "scheduled",
    description?: string
  ) => Promise<{ id: string }>;
  providerTimeoutMs?: number;
  hangBackup?: boolean;
};

let testHooks: BackupSchedulerTestHooks | null = null;

export function setBackupSchedulerTestHooks(hooks: BackupSchedulerTestHooks | null): void {
  if (process.env.NODE_ENV !== "test") return;
  testHooks = hooks;
}

function nowUtc(): Date {
  if (process.env.NODE_ENV === "test" && testHooks?.now) return testHooks.now();
  return new Date();
}

function providerTimeoutMs(): number {
  if (process.env.NODE_ENV === "test" && typeof testHooks?.providerTimeoutMs === "number") {
    return testHooks.providerTimeoutMs;
  }
  return PROVIDER_TIMEOUT_MS;
}

/** Calendar date YYYY-MM-DD in Asia/Dhaka for an instant. */
export function dhakaRunDay(d: Date = nowUtc()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

export function dhakaHour(d: Date = nowUtc()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DHAKA_TZ,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  return parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
}

function idempotencyKeyForDay(runDay: string): string {
  return `scheduled_backup:${runDay}`;
}

export function startBackupScheduler(): void {
  const password = process.env.BACKUP_ENCRYPTION_PASSWORD;
  if (!password) {
    console.log("[Backup Scheduler] BACKUP_ENCRYPTION_PASSWORD not set — scheduled backups disabled");
    return;
  }
  if (password.length < 16) {
    console.warn("[Backup Scheduler] BACKUP_ENCRYPTION_PASSWORD too short (min 16 chars) — disabled");
    return;
  }
  if (schedulerTimer) return;

  console.log("[Backup Scheduler] Started — will run at 02:00 Asia/Dhaka daily");
  schedulerTimer = setInterval(() => {
    void runIfDue(password);
  }, CHECK_INTERVAL_MS);
  void runIfDue(password);
}

export function stopBackupScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
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

/** Ensure day row exists (pending). Unique on run_day. */
export async function ensureBackupRunDay(runDay: string): Promise<void> {
  const id = randomUUID();
  const key = idempotencyKeyForDay(runDay);
  await db.execute(sql`
    INSERT INTO scheduled_backup_runs (id, run_day, idempotency_key, status, attempt_count, created_at, updated_at)
    VALUES (${id}, ${runDay}::date, ${key}, 'pending', 0, NOW(), NOW())
    ON CONFLICT DO NOTHING
  `);
}

export type ClaimedBackupRun = {
  id: string;
  runDay: string;
  claimToken: string;
  attemptCount: number;
};

/** Atomic claim for due Dhaka day (pending/failed/expired running). */
export async function claimScheduledBackupRun(runDay: string): Promise<ClaimedBackupRun | null> {
  const owner = INSTANCE_OWNER();
  const token = randomUUID();
  const leaseSecs = Math.floor(LEASE_MS / 1000);
  const result = await db.execute(sql`
    UPDATE scheduled_backup_runs r
    SET
      claim_owner = ${owner},
      claim_token = ${token},
      claim_until = NOW() + (${leaseSecs} * INTERVAL '1 second'),
      status = 'running',
      attempt_count = COALESCE(r.attempt_count, 0) + 1,
      last_attempt_at = NOW(),
      last_failure_code = NULL,
      updated_at = NOW()
    WHERE r.run_day = ${runDay}::date
      AND (
        r.status IN ('pending', 'failed')
        OR (r.status = 'running' AND r.claim_until IS NOT NULL AND r.claim_until < NOW())
      )
      AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= NOW())
      AND r.status <> 'succeeded'
    RETURNING
      r.id,
      r.run_day::text AS "runDay",
      r.claim_token AS "claimToken",
      r.attempt_count AS "attemptCount"
  `);
  if ((result.rowCount ?? 0) === 0) return null;
  const row = result.rows[0] as any;
  return {
    id: row.id,
    runDay: String(row.runDay).slice(0, 10),
    claimToken: row.claimToken,
    attemptCount: Number(row.attemptCount),
  };
}

export async function completeBackupSucceeded(
  runId: string,
  claimToken: string,
  metadataId: string
): Promise<boolean> {
  const u = await db.execute(sql`
    UPDATE scheduled_backup_runs
    SET
      status = 'succeeded',
      backup_metadata_id = ${metadataId},
      claim_owner = NULL,
      claim_token = NULL,
      claim_until = NULL,
      next_attempt_at = NULL,
      last_failure_code = NULL,
      updated_at = NOW()
    WHERE id = ${runId}
      AND claim_token = ${claimToken}
      AND status = 'running'
    RETURNING id
  `);
  if ((u.rowCount ?? 0) === 0) {
    logBackgroundFailure("Backup Scheduler", "STALE_CLAIM_COMPLETION");
    return false;
  }
  return true;
}

export async function completeBackupFailed(
  runId: string,
  claimToken: string,
  code: string
): Promise<boolean> {
  const retrySecs = Math.floor(RETRY_MS / 1000);
  const u = await db.execute(sql`
    UPDATE scheduled_backup_runs
    SET
      status = 'failed',
      claim_owner = NULL,
      claim_token = NULL,
      claim_until = NULL,
      next_attempt_at = NOW() + (${retrySecs} * INTERVAL '1 second'),
      last_failure_code = ${code},
      updated_at = NOW()
    WHERE id = ${runId}
      AND claim_token = ${claimToken}
      AND status = 'running'
    RETURNING id
  `);
  if ((u.rowCount ?? 0) === 0) {
    logBackgroundFailure("Backup Scheduler", "STALE_CLAIM_COMPLETION");
    return false;
  }
  return true;
}

async function runCreateBackup(
  password: string,
  runDay: string
): Promise<{ id: string }> {
  if (testHooks?.hangBackup) {
    return new Promise(() => {});
  }
  if (testHooks?.createBackup) {
    return testHooks.createBackup(
      password,
      SYSTEM_USER_ID,
      SYSTEM_USER_NAME,
      "scheduled",
      `Daily automated backup — ${runDay}`
    );
  }
  const meta = await backupService.createBackup(
    password,
    SYSTEM_USER_ID,
    SYSTEM_USER_NAME,
    "scheduled",
    `Daily automated backup — ${runDay}`
  );
  return { id: (meta as { id: string }).id };
}

/** Exported for proofs: process a claimed run through provider + completion. */
export async function processClaimedBackupRun(
  claim: ClaimedBackupRun,
  password: string
): Promise<"succeeded" | "failed" | "timeout" | "stale"> {
  const timeoutMs = providerTimeoutMs();
  let successId: string | null = null;
  let failed = false;

  const backupPromise: Promise<string | null> = runCreateBackup(password, claim.runDay).then(
    (meta) => {
      successId = meta.id;
      return meta.id;
    },
    () => {
      failed = true;
      return null;
    }
  );

  const raced = await withTimeout(backupPromise, timeoutMs);
  if (raced.timedOut) {
    logBackgroundFailure("Backup Scheduler", "PROVIDER_TIMEOUT");
    void backupPromise.then(async (id) => {
      if (id) {
        await completeBackupSucceeded(claim.id, claim.claimToken, id);
      }
    });
    return "timeout";
  }

  if (successId) {
    const ok = await completeBackupSucceeded(claim.id, claim.claimToken, successId);
    return ok ? "succeeded" : "stale";
  }

  const ok = await completeBackupFailed(claim.id, claim.claimToken, "BACKUP_PROVIDER_FAILED");
  if (ok) {
    sendPushToAllAdmins({
      title: "Daily Backup Failed",
      body: "Automated daily backup failed. Check Super Admin system status.",
      data: { type: "backup_failure", date: claim.runDay },
    }).catch(() => {});
  }
  return ok ? "failed" : "stale";
}

/**
 * Scheduler tick. Password required in production path.
 * When password is omitted and NODE_ENV=test with createBackup hook, allows dry claim proofs.
 */
export async function runIfDue(password?: string): Promise<{
  action: "skipped_before_hour" | "skipped_not_ready" | "skipped_in_process" | "no_claim" | "succeeded" | "failed" | "timeout" | "stale" | "skipped_no_password";
  runDay?: string;
}> {
  if (!isDbReady()) {
    console.log("[Backup Scheduler] Skipping — DB not ready");
    return { action: "skipped_not_ready" };
  }
  if (processClaimInFlight) {
    return { action: "skipped_in_process" };
  }

  const instant = nowUtc();
  const hour = dhakaHour(instant);
  if (hour < TARGET_HOUR) {
    return { action: "skipped_before_hour" };
  }

  const runDay = dhakaRunDay(instant);
  const pwd = password || process.env.BACKUP_ENCRYPTION_PASSWORD;
  if (!pwd || pwd.length < 16) {
    if (!(process.env.NODE_ENV === "test" && testHooks?.createBackup)) {
      return { action: "skipped_no_password" };
    }
  }

  processClaimInFlight = true;
  try {
    await ensureBackupRunDay(runDay);
    const claim = await claimScheduledBackupRun(runDay);
    if (!claim) {
      return { action: "no_claim", runDay };
    }

    console.log(`[Backup Scheduler] Claimed run for ${runDay}`);
    const effectivePwd = pwd && pwd.length >= 16 ? pwd : "test-password-not-used-by-hook";
    const result = await processClaimedBackupRun(claim, effectivePwd);
    if (result === "succeeded") {
      console.log(`[Backup Scheduler] Daily backup completed for ${runDay}`);
    }
    return { action: result, runDay };
  } catch {
    logBackgroundFailure("Backup Scheduler", "TICK_FAILED");
    return { action: "failed", runDay };
  } finally {
    processClaimInFlight = false;
  }
}
