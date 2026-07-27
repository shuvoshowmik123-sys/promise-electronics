/**
 * Drawer Day-Close — durable business-local day claim (01C-B2-B2B).
 * One run row per configured local day; 15-minute claim token;
 * conditional drawer mutation; stale claimants cannot close twice.
 */
import { notificationRepo, posRepo, settingsRepo, userRepo } from "../repositories/index.js";
import { auditLogger } from "../utils/auditLogger.js";
import { broadcastAdminEvent } from "../routes/middleware/sse-broker.js";
import { isDbReady } from "./db-readiness.js";
import { logBackgroundFailure } from "../utils/safe-error.js";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const DAY_CLOSE_ENABLED_KEY = "drawer_day_close_enabled";
const DAY_CLOSE_TIME_KEY = "drawer_day_close_time";
const DAY_CLOSE_TIMEZONE_KEY = "drawer_day_close_timezone";
/** Legacy display/history only — never used as mutation ownership. */
const DAY_CLOSE_LAST_RUN_DATE_KEY = "drawer_day_close_last_run_date";

const DEFAULT_DAY_CLOSE_TIME = "23:59";
const DEFAULT_DAY_CLOSE_TIMEZONE = "Asia/Dhaka";
const SCHEDULER_INTERVAL_MS = 60_000;
const LEASE_MS = 15 * 60 * 1000;
const RETRY_MS = 15 * 60 * 1000;
const INSTANCE_OWNER = () =>
  process.env.HOSTNAME || process.env.RENDER_INSTANCE_ID || "local";

type DayCloseTrigger = "scheduler" | "manual";

export type DrawerDayCloseRunResult = {
  executed: boolean;
  reason?: string;
  action?:
    | "skipped_disabled"
    | "skipped_before_cutoff"
    | "skipped_not_ready"
    | "skipped_in_process"
    | "no_claim"
    | "no_active_session"
    | "succeeded"
    | "failed"
    | "stale"
    | "unsupported_status";
  sessionId?: string;
  updatedStatus?: string;
  closedAt?: string;
  outcome?: string;
  notes?: string;
  runDay?: string;
};

type DrawerDayCloseConfig = {
  enabled: boolean;
  cutoffTime: string;
  timezone: string;
};

export type ClaimedDayCloseRun = {
  id: string;
  runDay: string;
  claimToken: string;
  attemptCount: number;
};

type DrawerDayCloseTestHooks = {
  now?: () => Date;
  /** Hold after claim / before drawer mutation (two-process P3). */
  preMutationHold?: () => Promise<void>;
  /** Known pre-mutation failure for retry proofs. */
  injectPreMutationFailure?: boolean | (() => boolean);
  onSideEffect?: (kind: "notify" | "audit" | "sse") => void;
};

let schedulerHandle: NodeJS.Timeout | null = null;
let schedulerTickInProgress = false;
/** Intra-process only — correctness comes from DB claim. */
let processClaimInFlight = false;
let testHooks: DrawerDayCloseTestHooks | null = null;

export function setDrawerDayCloseTestHooks(hooks: DrawerDayCloseTestHooks | null): void {
  if (process.env.NODE_ENV !== "test") return;
  testHooks = hooks;
}

function nowUtc(): Date {
  if (process.env.NODE_ENV === "test" && testHooks?.now) return testHooks.now();
  return new Date();
}

function parseBooleanValue(value: unknown, fallback: boolean = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
}

function normalizeCutoffTime(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_DAY_CLOSE_TIME;
  const trimmed = value.trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmed) ? trimmed : DEFAULT_DAY_CLOSE_TIME;
}

function normalizeTimezone(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_DAY_CLOSE_TIMEZONE;
  const candidate = value.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_DAY_CLOSE_TIMEZONE;
  }
}

export function formatLocalDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

export function formatLocalHm(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";

  return `${hour}:${minute}`;
}

function appendAutoCloseNotes(existing: string | null | undefined, message: string): string {
  const base = (existing ?? "").trim();
  return base ? `${base}\n${message}` : message;
}

function normalizeRole(role: unknown): string {
  if (typeof role !== "string") return "";
  return role.trim().toLowerCase().replace(/\s+/g, "_");
}

function idempotencyKeyForDay(runDay: string): string {
  return `drawer_day_close:${runDay}`;
}

async function getDayCloseConfig(): Promise<DrawerDayCloseConfig> {
  const [enabledSetting, timeSetting, timezoneSetting] = await Promise.all([
    settingsRepo.getSetting(DAY_CLOSE_ENABLED_KEY),
    settingsRepo.getSetting(DAY_CLOSE_TIME_KEY),
    settingsRepo.getSetting(DAY_CLOSE_TIMEZONE_KEY),
  ]);

  return {
    enabled: parseBooleanValue(enabledSetting?.value, true),
    cutoffTime: normalizeCutoffTime(timeSetting?.value),
    timezone: normalizeTimezone(timezoneSetting?.value),
  };
}

/** Ensure day row exists (pending). Unique on run_day. */
export async function ensureDayCloseRunDay(runDay: string): Promise<void> {
  const id = randomUUID();
  const key = idempotencyKeyForDay(runDay);
  await db.execute(sql`
    INSERT INTO drawer_day_close_runs (id, run_day, idempotency_key, status, attempt_count, created_at, updated_at)
    VALUES (${id}, ${runDay}::date, ${key}, 'pending', 0, NOW(), NOW())
    ON CONFLICT DO NOTHING
  `);
}

/** Atomic claim for due local day (pending/failed/expired running). */
export async function claimDayCloseRun(runDay: string): Promise<ClaimedDayCloseRun | null> {
  const owner = INSTANCE_OWNER();
  const token = randomUUID();
  const leaseSecs = Math.floor(LEASE_MS / 1000);
  const result = await db.execute(sql`
    UPDATE drawer_day_close_runs r
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
        (
          r.status IN ('pending', 'failed')
          AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= NOW())
        )
        OR (
          r.status = 'running'
          AND r.claim_until IS NOT NULL
          AND r.claim_until < NOW()
        )
      )
    RETURNING
      r.id,
      r.run_day::text AS "runDay",
      r.claim_token AS "claimToken",
      r.attempt_count AS "attemptCount"
  `);
  if ((result.rowCount ?? 0) === 0) return null;
  const row = result.rows[0] as {
    id: string;
    runDay: string;
    claimToken: string;
    attemptCount: number;
  };
  return {
    id: row.id,
    runDay: String(row.runDay).slice(0, 10),
    claimToken: row.claimToken,
    attemptCount: Number(row.attemptCount),
  };
}

export async function verifyDayCloseClaim(
  runId: string,
  claimToken: string
): Promise<boolean> {
  const r = await db.execute(sql`
    SELECT id FROM drawer_day_close_runs
    WHERE id = ${runId}
      AND claim_token = ${claimToken}
      AND status = 'running'
  `);
  return (r.rowCount ?? 0) > 0;
}

export async function completeDayCloseSucceeded(
  runId: string,
  claimToken: string,
  drawerSessionId: string
): Promise<boolean> {
  const u = await db.execute(sql`
    UPDATE drawer_day_close_runs
    SET
      status = 'succeeded',
      drawer_session_id = ${drawerSessionId},
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
    logBackgroundFailure("Drawer Day-Close", "STALE_CLAIM_COMPLETION");
    return false;
  }
  return true;
}

export async function completeDayCloseFailed(
  runId: string,
  claimToken: string,
  code: string
): Promise<boolean> {
  const retrySecs = Math.floor(RETRY_MS / 1000);
  const u = await db.execute(sql`
    UPDATE drawer_day_close_runs
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
    logBackgroundFailure("Drawer Day-Close", "STALE_CLAIM_COMPLETION");
    return false;
  }
  return true;
}

export async function completeDayCloseNoActiveSession(
  runId: string,
  claimToken: string
): Promise<boolean> {
  const u = await db.execute(sql`
    UPDATE drawer_day_close_runs
    SET
      status = 'no_active_session',
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
    logBackgroundFailure("Drawer Day-Close", "STALE_CLAIM_COMPLETION");
    return false;
  }
  return true;
}

async function notifyAdmins(title: string, message: string, type: "info" | "alert"): Promise<void> {
  const usersResult = await userRepo.getAllUsers(1, 500);
  const adminUsers = usersResult.items.filter((user: { role?: string }) => {
    const role = normalizeRole(user?.role);
    return role === "super_admin" || role === "admin";
  });

  for (const admin of adminUsers) {
    await notificationRepo.createNotification({
      userId: admin.id,
      title,
      message,
      type,
    });
  }
}

async function emitPostCloseSideEffects(params: {
  trigger: DayCloseTrigger;
  triggeredBy?: { id: string; name: string };
  sessionId: string;
  openedBy: string;
  openedByName: string;
  status: string;
  closedAt: Date | string | null;
  autoCloseNote: string;
}): Promise<void> {
  const actorName = params.triggeredBy?.name || "System";
  const triggerLabel = params.trigger === "manual" ? "manual run-now trigger" : "scheduled cutoff";
  const notifyTitle = "Drawer auto-closed at day-end";
  const notifyMessage = `Session ${params.sessionId} opened by ${params.openedByName} was closed by ${triggerLabel}. Review required before reconciliation.`;

  try {
    await notifyAdmins(notifyTitle, notifyMessage, "alert");
    testHooks?.onSideEffect?.("notify");
  } catch {
    logBackgroundFailure("Drawer Day-Close", "ADMIN_NOTIFY_FAILED");
  }

  try {
    await auditLogger.log({
      userId: params.triggeredBy?.id || params.openedBy,
      action: "AUTO_DAY_CLOSE",
      entity: "DrawerSession",
      entityId: params.sessionId,
      details: `${actorName} executed ${triggerLabel}. ${params.autoCloseNote}`,
      newValue: {
        status: params.status,
        closedAt: params.closedAt,
        trigger: params.trigger,
      },
      severity: "warning",
    });
    testHooks?.onSideEffect?.("audit");
  } catch {
    logBackgroundFailure("Drawer Day-Close", "AUDIT_FAILED");
  }

  try {
    broadcastAdminEvent({
      topic: "pos",
      action: "status_changed",
      invalidate: ["dashboardStats", "cashDrawer", "pos"],
      payload: {
        sessionId: params.sessionId,
        status: params.status,
        trigger: params.trigger,
      },
      toast: {
        level: "info",
        title: "Drawer session auto-closed",
        message: "A drawer session was automatically closed by the background scheduler.",
        sound: true,
      },
    });
    testHooks?.onSideEffect?.("sse");
  } catch {
    logBackgroundFailure("Drawer Day-Close", "SSE_FAILED");
  }
}

/** Legacy display write only — not ownership. */
async function writeLegacyLastRunDate(runDay: string): Promise<void> {
  try {
    await settingsRepo.upsertSetting({
      key: DAY_CLOSE_LAST_RUN_DATE_KEY,
      value: runDay,
    });
  } catch {
    // best-effort legacy display
  }
}

/**
 * After a live claim: token-check, optional hold, conditional drawer mutation, terminal claim update.
 * Side effects only after a successful conditional mutation.
 */
export async function processClaimedDayClose(
  claim: ClaimedDayCloseRun,
  trigger: DayCloseTrigger,
  triggeredBy?: { id: string; name: string }
): Promise<DrawerDayCloseRunResult> {
  const stillOwned = await verifyDayCloseClaim(claim.id, claim.claimToken);
  if (!stillOwned) {
    return {
      executed: false,
      reason: "stale_claim",
      action: "stale",
      runDay: claim.runDay,
    };
  }

  const injectFail =
    process.env.NODE_ENV === "test" &&
    testHooks?.injectPreMutationFailure &&
    (typeof testHooks.injectPreMutationFailure === "function"
      ? testHooks.injectPreMutationFailure()
      : testHooks.injectPreMutationFailure);
  if (injectFail) {
    const ok = await completeDayCloseFailed(claim.id, claim.claimToken, "PRE_MUTATION_FAILED");
    return {
      executed: false,
      reason: "pre_mutation_failed",
      action: ok ? "failed" : "stale",
      runDay: claim.runDay,
    };
  }

  // Snapshot unresolved session before hold so competing state changes still hit the conditional CAS.
  const activeSession = await posRepo.getCurrentDrawerSession();
  if (!activeSession) {
    const ok = await completeDayCloseNoActiveSession(claim.id, claim.claimToken);
    if (ok) await writeLegacyLastRunDate(claim.runDay);
    return {
      executed: false,
      reason: "no_active_session",
      action: ok ? "no_active_session" : "stale",
      runDay: claim.runDay,
    };
  }

  if (activeSession.status !== "open" && activeSession.status !== "counting") {
    const ok = await completeDayCloseFailed(claim.id, claim.claimToken, "UNSUPPORTED_STATUS");
    return {
      executed: false,
      reason: "unsupported_status",
      action: ok ? "unsupported_status" : "stale",
      sessionId: activeSession.id,
      updatedStatus: activeSession.status,
      runDay: claim.runDay,
    };
  }

  if (process.env.NODE_ENV === "test" && testHooks?.preMutationHold) {
    await testHooks.preMutationHold();
  }

  const stillOwnedAfterHold = await verifyDayCloseClaim(claim.id, claim.claimToken);
  if (!stillOwnedAfterHold) {
    return {
      executed: false,
      reason: "stale_claim",
      action: "stale",
      sessionId: activeSession.id,
      runDay: claim.runDay,
    };
  }

  const now = nowUtc();
  const closedAtLabel = now.toISOString();
  let nextStatus: string;
  let autoCloseNote: string;
  let outcome: string;

  if (activeSession.status === "open") {
    nextStatus = "counting";
    autoCloseNote = `[AUTO DAY-CLOSE ${closedAtLabel}] Register auto-closed at cutoff; blind drop missing; review required.`;
    outcome = "auto_closed_open_session";
  } else {
    nextStatus = "counting";
    autoCloseNote = `[AUTO DAY-CLOSE ${closedAtLabel}] Register auto-closed pending Super Admin reconciliation.`;
    outcome = "auto_closed_counting_session";
  }

  const finalOwned = await verifyDayCloseClaim(claim.id, claim.claimToken);
  if (!finalOwned) {
    return {
      executed: false,
      reason: "stale_claim",
      action: "stale",
      sessionId: activeSession.id,
      runDay: claim.runDay,
    };
  }

  const mergedNotes = appendAutoCloseNotes(activeSession.notes, autoCloseNote);
  const updated = await posRepo.updateDrawerSessionForDayClose({
    id: activeSession.id,
    expectedStatus: activeSession.status,
    status: nextStatus,
    closedAt: now,
    notes: mergedNotes,
  });

  if (!updated) {
    const ok = await completeDayCloseFailed(claim.id, claim.claimToken, "SESSION_MUTATION_CONFLICT");
    return {
      executed: false,
      reason: "session_update_conflict",
      action: ok ? "failed" : "stale",
      sessionId: activeSession.id,
      runDay: claim.runDay,
    };
  }

  const completed = await completeDayCloseSucceeded(claim.id, claim.claimToken, updated.id);
  if (!completed) {
    return {
      executed: false,
      reason: "stale_claim_after_mutation",
      action: "stale",
      sessionId: updated.id,
      updatedStatus: updated.status,
      runDay: claim.runDay,
    };
  }

  await writeLegacyLastRunDate(claim.runDay);

  await emitPostCloseSideEffects({
    trigger,
    triggeredBy,
    sessionId: updated.id,
    openedBy: updated.openedBy,
    openedByName: updated.openedByName,
    status: updated.status,
    closedAt: updated.closedAt,
    autoCloseNote,
  });

  return {
    executed: true,
    action: "succeeded",
    sessionId: updated.id,
    updatedStatus: updated.status,
    closedAt: updated.closedAt ? new Date(updated.closedAt).toISOString() : now.toISOString(),
    outcome,
    notes: autoCloseNote,
    runDay: claim.runDay,
  };
}

async function claimAndProcess(
  trigger: DayCloseTrigger,
  runDay: string,
  triggeredBy?: { id: string; name: string }
): Promise<DrawerDayCloseRunResult> {
  // Intra-process guard covers only ensure+claim. Mutation ownership is the DB token.
  if (processClaimInFlight) {
    return {
      executed: false,
      reason: "day_close_in_progress",
      action: "skipped_in_process",
      runDay,
    };
  }

  let claim: ClaimedDayCloseRun | null = null;
  processClaimInFlight = true;
  try {
    await ensureDayCloseRunDay(runDay);
    claim = await claimDayCloseRun(runDay);
  } catch {
    logBackgroundFailure("Drawer Day-Close", "PIPELINE_FAILED");
    return {
      executed: false,
      reason: "pipeline_failed",
      action: "failed",
      runDay,
    };
  } finally {
    processClaimInFlight = false;
  }

  if (!claim) {
    return {
      executed: false,
      reason: "no_claim",
      action: "no_claim",
      runDay,
    };
  }

  console.log(`[Drawer Day-Close] Claimed run for ${runDay}`);
  try {
    return await processClaimedDayClose(claim, trigger, triggeredBy);
  } catch {
    logBackgroundFailure("Drawer Day-Close", "PIPELINE_FAILED");
    return {
      executed: false,
      reason: "pipeline_failed",
      action: "failed",
      runDay,
    };
  }
}

export async function runDrawerDayCloseNow(
  triggeredBy?: { id: string; name: string }
): Promise<DrawerDayCloseRunResult> {
  if (!isDbReady()) {
    return { executed: false, reason: "db_not_ready", action: "skipped_not_ready" };
  }
  const config = await getDayCloseConfig();
  const runDay = formatLocalDate(nowUtc(), config.timezone);
  return claimAndProcess("manual", runDay, triggeredBy);
}

export async function runScheduledDrawerDayCloseTick(): Promise<DrawerDayCloseRunResult | null> {
  if (!isDbReady()) {
    return { executed: false, reason: "db_not_ready", action: "skipped_not_ready" };
  }

  const config = await getDayCloseConfig();
  if (!config.enabled) {
    return { executed: false, reason: "disabled", action: "skipped_disabled" };
  }

  const now = nowUtc();
  const todayLocal = formatLocalDate(now, config.timezone);
  const currentHm = formatLocalHm(now, config.timezone);
  const activeSession = await posRepo.getCurrentDrawerSession();

  let hasStaleUnresolvedSession = false;
  if (activeSession?.openedAt) {
    const openedAt = new Date(activeSession.openedAt);
    if (!Number.isNaN(openedAt.getTime())) {
      const openedLocalDate = formatLocalDate(openedAt, config.timezone);
      hasStaleUnresolvedSession = openedLocalDate < todayLocal;
    }
  }

  if (currentHm < config.cutoffTime && !hasStaleUnresolvedSession) {
    return {
      executed: false,
      reason: "before_cutoff",
      action: "skipped_before_cutoff",
      runDay: todayLocal,
    };
  }

  return claimAndProcess("scheduler", todayLocal);
}

async function schedulerTick(): Promise<void> {
  if (schedulerTickInProgress) return;
  if (!isDbReady()) {
    console.log("[Drawer Day-Close] Skipping tick — DB not ready");
    return;
  }
  schedulerTickInProgress = true;
  try {
    const result = await runScheduledDrawerDayCloseTick();
    if (result?.executed) {
      console.log(`[Drawer Day-Close] Auto-closed session ${result.sessionId} (${result.updatedStatus}).`);
    } else if (result?.action === "no_claim") {
      console.log("[Drawer Day-Close] Skip: no claim for day.");
    } else if (result?.action === "no_active_session") {
      console.log("[Drawer Day-Close] Terminal: no active session for day.");
    }
  } catch {
    logBackgroundFailure("Drawer Day-Close", "TICK_FAILED");
  } finally {
    schedulerTickInProgress = false;
  }
}

export function startDrawerDayCloseScheduler(): void {
  if (schedulerHandle) return;

  schedulerHandle = setInterval(() => {
    void schedulerTick();
  }, SCHEDULER_INTERVAL_MS);
  schedulerHandle.unref?.();

  void schedulerTick();
  console.log("[Drawer Day-Close] Scheduler started (1-minute cadence).");
}

export function stopDrawerDayCloseScheduler(): void {
  if (!schedulerHandle) return;
  clearInterval(schedulerHandle);
  schedulerHandle = null;
  console.log("[Drawer Day-Close] Scheduler stopped.");
}
