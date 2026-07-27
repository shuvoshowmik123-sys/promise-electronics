/**
 * SYSTEM-OBSERVABILITY-01B — durable Super Admin incident register.
 * Allowlisted component+code only. Never stores free text or error objects.
 */
import { randomUUID } from "crypto";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { isDbReady } from "./db-readiness.js";

const SAFE_CODE_RE = /^[A-Z][A-Z0-9_]{2,64}$/;
const MAX_ROWS = 5000;
const RETENTION_DAYS = 30;
const COUNT_CAP = 1_000_000;

type Severity = "info" | "warning" | "critical";
type IncidentStatus = "open" | "acknowledged" | "resolved";

/** Scope string from logBackgroundFailure → allowlisted component id */
const SCOPE_TO_COMPONENT: Record<string, string> = {
  "Backup Scheduler": "BackupScheduler",
  Reminders: "Reminders",
  Abandonment: "Abandonment",
  "Drawer Day-Close": "DrawerDayClose",
  NightlyJobs: "NightlyJobs",
  SLA: "SLA",
  "Phase I": "PhaseI",
  SystemIntegrity: "SystemIntegrity",
  IncidentRetention: "IncidentRetention",
};

const COMPONENT_CODES: Record<string, ReadonlySet<string>> = {
  BackupScheduler: new Set(["STALE_CLAIM_COMPLETION", "PROVIDER_TIMEOUT", "TICK_FAILED"]),
  Reminders: new Set([
    "INITIAL_RUN_FAILED",
    "SCHEDULED_RUN_FAILED",
    "STALE_CLAIM_COMPLETION",
    "PROVIDER_TIMEOUT",
    "TICK_FAILED",
  ]),
  Abandonment: new Set([
    "INITIAL_RUN_FAILED",
    "SCHEDULED_RUN_FAILED",
    "OUTBOX_TICK_FAILED",
    "OUTBOX_INITIAL_FAILED",
    "PROVIDER_TIMEOUT",
    "STALE_CLAIM_COMPLETION",
  ]),
  DrawerDayClose: new Set([
    "STALE_CLAIM_COMPLETION",
    "ADMIN_NOTIFY_FAILED",
    "AUDIT_FAILED",
    "SSE_FAILED",
    "PIPELINE_FAILED",
    "TICK_FAILED",
  ]),
  NightlyJobs: new Set(["PRUNE_AUDIT_FAILED", "PRUNE_SESSIONS_FAILED"]),
  SLA: new Set(["SWEEP_FAILED"]),
  PhaseI: new Set(["RATIO_UPDATE_FAILED"]),
  SystemIntegrity: new Set(["DAILY_ATTENTION"]),
  IncidentRetention: new Set(["PRUNE_FAILED"]),
};

const TITLE_CATALOG: Record<string, string> = {
  STALE_CLAIM_COMPLETION: "A background claim finished late",
  PROVIDER_TIMEOUT: "A background provider timed out",
  TICK_FAILED: "A scheduled tick failed",
  INITIAL_RUN_FAILED: "A background job failed on startup",
  SCHEDULED_RUN_FAILED: "A scheduled background run failed",
  OUTBOX_TICK_FAILED: "Message outbox tick failed",
  OUTBOX_INITIAL_FAILED: "Message outbox initial run failed",
  ADMIN_NOTIFY_FAILED: "Day-end admin notify failed",
  AUDIT_FAILED: "Day-end audit write failed",
  SSE_FAILED: "Day-end live update failed",
  PIPELINE_FAILED: "Day-end pipeline failed",
  PRUNE_AUDIT_FAILED: "Audit log cleanup failed",
  PRUNE_SESSIONS_FAILED: "Session cleanup failed",
  SWEEP_FAILED: "SLA sweep failed",
  RATIO_UPDATE_FAILED: "Staff acceptance ratio update failed",
  DAILY_ATTENTION: "System integrity needs attention",
  PRUNE_FAILED: "Incident retention cleanup failed",
  UNKNOWN: "System background issue",
};

const NEXT_STEP_CATALOG: Record<string, string> = {
  STALE_CLAIM_COMPLETION: "Review scheduled work status under System Integrity.",
  PROVIDER_TIMEOUT: "Check scheduled work and provider configuration with a trusted operator.",
  TICK_FAILED: "Review scheduled work status under System Integrity.",
  INITIAL_RUN_FAILED: "Review scheduled work after the next restart window.",
  SCHEDULED_RUN_FAILED: "Review scheduled work status under System Integrity.",
  OUTBOX_TICK_FAILED: "Review customer message queue under Scheduled work.",
  OUTBOX_INITIAL_FAILED: "Review customer message queue under Scheduled work.",
  ADMIN_NOTIFY_FAILED: "Review day-end close status under Scheduled work.",
  AUDIT_FAILED: "Review day-end close status under Scheduled work.",
  SSE_FAILED: "Review day-end close status under Scheduled work.",
  PIPELINE_FAILED: "Review day-end close immediately under Scheduled work.",
  PRUNE_AUDIT_FAILED: "Retry is automatic; review audit storage if this repeats.",
  PRUNE_SESSIONS_FAILED: "Retry is automatic; review session store if this repeats.",
  SWEEP_FAILED: "Review SLA tooling after database connectivity recovers.",
  RATIO_UPDATE_FAILED: "Review staff presence data if assignment quality drops.",
  DAILY_ATTENTION: "Open Schema ledger, Journey links, and Scheduled work above.",
  PRUNE_FAILED: "Retry is automatic; contact a trusted operator if this repeats.",
  UNKNOWN: "Review System Integrity status.",
};

export type SafeIncidentDto = {
  id: string;
  component: string;
  code: string;
  category: string;
  severity: Severity;
  status: IncidentStatus;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  safeTitle: string;
  safeNextStep: string;
  areaLabel: string;
};

const AREA_LABEL: Record<string, string> = {
  BackupScheduler: "Daily backup",
  Reminders: "Reminders",
  Abandonment: "Abandonment",
  DrawerDayClose: "Day-end close",
  NightlyJobs: "Nightly maintenance",
  SLA: "SLA sweep",
  PhaseI: "Staff assignment",
  SystemIntegrity: "System integrity",
  IncidentRetention: "Incident retention",
};

function severityForCode(code: string): Severity {
  if (code === "PIPELINE_FAILED") return "critical";
  if (code === "STALE_CLAIM_COMPLETION") return "info";
  if (code === "DAILY_ATTENTION") return "warning";
  if (code.endsWith("TICK_FAILED") || code === "PROVIDER_TIMEOUT") return "warning";
  if (code.includes("FAILED") || code.includes("TIMEOUT")) return "warning";
  return "info";
}

function titleKey(code: string): string {
  return TITLE_CATALOG[code] ? code : "UNKNOWN";
}

function nextStepKey(code: string): string {
  return NEXT_STEP_CATALOG[code] ? code : "UNKNOWN";
}

function buildSignature(component: string, code: string, category: string, summaryDay?: string | null): string {
  if (summaryDay) return `${component}|${code}|${category}|day:${summaryDay}`;
  return `${component}|${code}|${category}`;
}

function dhakaDay(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

function dhakaHour(d = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    hour12: false,
  }).format(d);
  return parseInt(h, 10);
}

function mapRow(row: any): SafeIncidentDto {
  const code = String(row.code || "");
  const component = String(row.component || "");
  const tk = String(row.safe_title_key || titleKey(code));
  const nk = String(row.safe_next_step_key || nextStepKey(code));
  return {
    id: row.id,
    component,
    code,
    category: String(row.category || ""),
    severity: row.severity as Severity,
    status: row.status as IncidentStatus,
    count: Number(row.count || 1),
    firstSeenAt: new Date(row.first_seen_at).toISOString(),
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
    acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at).toISOString() : null,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
    safeTitle: TITLE_CATALOG[tk] || TITLE_CATALOG.UNKNOWN,
    safeNextStep: NEXT_STEP_CATALOG[nk] || NEXT_STEP_CATALOG.UNKNOWN,
    areaLabel: AREA_LABEL[component] || component,
  };
}

/**
 * Upsert allowlisted incident. Rejects unknown component/code. Never accepts free text.
 * Cap: at most MAX_ROWS under concurrency (advisory lock). Reclaims resolved only;
 * if full of open/ack, rejects with CAP_FULL (no open/ack deletion).
 * On resolved/acknowledged signature: reopen, clear resolution, increment count
 * (existing row — does not grow table).
 * Daily summary (summaryDay set): insert-once; ON CONFLICT DO NOTHING (no count bump).
 */
export async function recordAllowlistedIncident(input: {
  component: string;
  code: string;
  category: string;
  summaryDay?: string | null;
}): Promise<{ ok: true; id: string; alreadyPresent?: boolean } | { ok: false; reason: string }> {
  const component = String(input.component || "").trim();
  const code = String(input.code || "").trim();
  const category = String(input.category || "").trim();
  if (!component || !code || !category) return { ok: false, reason: "MISSING" };
  if (!SAFE_CODE_RE.test(code)) return { ok: false, reason: "INVALID_CODE" };
  const allowed = COMPONENT_CODES[component];
  if (!allowed || !allowed.has(code)) return { ok: false, reason: "NOT_ALLOWLISTED" };

  const severity = severityForCode(code);
  const tk = titleKey(code);
  const nk = nextStepKey(code);
  const isDaily = Boolean(input.summaryDay);
  const signature = buildSignature(component, code, category, input.summaryDay);
  const id = randomUUID();

  try {
    return await db.transaction(async (tx) => {
      // Serialize cap + insert across processes/connections.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('promise_system_incidents_cap'))`);

      const existingRes = await tx.execute(
        sql`SELECT id FROM system_incidents WHERE signature = ${signature} LIMIT 1`,
      );
      const existing = ((existingRes as any).rows?.[0] ?? (existingRes as any)[0]) as
        | { id: string }
        | undefined;

      // Daily attention: durable once-per-signature-day. No count/metadata mutation if present.
      if (isDaily) {
        if (existing) {
          return { ok: true as const, id: String(existing.id), alreadyPresent: true };
        }
        const cntRes = await tx.execute(sql`SELECT count(*)::int AS n FROM system_incidents`);
        let n = Number(((cntRes as any).rows?.[0] ?? (cntRes as any)[0])?.n ?? 0);
        while (n >= MAX_ROWS) {
          const del = await tx.execute(sql`
            DELETE FROM system_incidents
            WHERE id = (
              SELECT id FROM system_incidents
              WHERE status = 'resolved'
              ORDER BY resolved_at ASC NULLS FIRST, last_seen_at ASC
              LIMIT 1
            )
            RETURNING id
          `);
          const deleted = (del as any).rows?.[0] ?? (del as any)[0];
          if (!deleted) {
            console.error("[SystemIncidents] CAP_FULL");
            return { ok: false as const, reason: "CAP_FULL" };
          }
          n -= 1;
        }
        await tx.execute(sql`
          INSERT INTO system_incidents (
            id, signature, component, code, category, severity, status, count,
            first_seen_at, last_seen_at, safe_title_key, safe_next_step_key, summary_day
          ) VALUES (
            ${id}, ${signature}, ${component}, ${code}, ${category}, ${severity}, 'open', 1,
            NOW(), NOW(), ${tk}, ${nk}, ${input.summaryDay ?? null}
          )
          ON CONFLICT (signature) DO NOTHING
        `);
        const after = await tx.execute(
          sql`SELECT id FROM system_incidents WHERE signature = ${signature} LIMIT 1`,
        );
        const row = (after as any).rows?.[0] ?? (after as any)[0];
        if (!row) {
          // Race: peer inserted first — treat as already present (no increment).
          const peer = await tx.execute(
            sql`SELECT id FROM system_incidents WHERE signature = ${signature} LIMIT 1`,
          );
          const peerRow = (peer as any).rows?.[0] ?? (peer as any)[0];
          if (peerRow) return { ok: true as const, id: String(peerRow.id), alreadyPresent: true };
          console.error("[SystemIncidents] WRITE_FAILED");
          return { ok: false as const, reason: "WRITE_FAILED" };
        }
        return { ok: true as const, id: String(row.id), alreadyPresent: false };
      }

      // Existing signature: reopen / count++ does not grow row count — always allowed.
      if (existing) {
        const upd = await tx.execute(sql`
          UPDATE system_incidents SET
            last_seen_at = NOW(),
            count = CASE
              WHEN count >= ${COUNT_CAP} THEN ${COUNT_CAP}
              ELSE count + 1
            END,
            status = 'open',
            acknowledged_at = NULL,
            acknowledged_by = NULL,
            resolved_at = NULL,
            resolved_by = NULL,
            severity = ${severity},
            safe_title_key = ${tk},
            safe_next_step_key = ${nk}
          WHERE signature = ${signature}
          RETURNING id
        `);
        const row = (upd as any).rows?.[0] ?? (upd as any)[0];
        return { ok: true as const, id: String(row?.id || existing.id) };
      }

      // New signature: reclaim resolved only until room; never delete open/ack.
      const cntRes = await tx.execute(sql`SELECT count(*)::int AS n FROM system_incidents`);
      let n = Number(((cntRes as any).rows?.[0] ?? (cntRes as any)[0])?.n ?? 0);
      while (n >= MAX_ROWS) {
        const del = await tx.execute(sql`
          DELETE FROM system_incidents
          WHERE id = (
            SELECT id FROM system_incidents
            WHERE status = 'resolved'
            ORDER BY resolved_at ASC NULLS FIRST, last_seen_at ASC
            LIMIT 1
          )
          RETURNING id
        `);
        const deleted = (del as any).rows?.[0] ?? (del as any)[0];
        if (!deleted) {
          console.error("[SystemIncidents] CAP_FULL");
          return { ok: false as const, reason: "CAP_FULL" };
        }
        n -= 1;
      }

      await tx.execute(sql`
        INSERT INTO system_incidents (
          id, signature, component, code, category, severity, status, count,
          first_seen_at, last_seen_at, safe_title_key, safe_next_step_key, summary_day
        ) VALUES (
          ${id}, ${signature}, ${component}, ${code}, ${category}, ${severity}, 'open', 1,
          NOW(), NOW(), ${tk}, ${nk}, ${input.summaryDay ?? null}
        )
      `);
      return { ok: true as const, id };
    });
  } catch {
    console.error("[SystemIncidents] WRITE_FAILED");
    return { ok: false, reason: "WRITE_FAILED" };
  }
}

/** Fire-and-forget from logBackgroundFailure — never throws, never recurses into logBackgroundFailure. */
export function recordBackgroundIncidentSafe(scope: string, code: string): void {
  if (!isDbReady()) return;
  const component = SCOPE_TO_COMPONENT[scope];
  if (!component) return;
  if (!SAFE_CODE_RE.test(code) || code === "BACKGROUND_FAILURE") return;
  void recordAllowlistedIncident({
    component,
    code,
    category: "background",
  }).catch(() => {
    console.error("[SystemIncidents] WRITE_FAILED");
  });
}

export async function listIncidents(opts: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: SafeIncidentDto[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const offset = Math.max(opts.offset ?? 0, 0);
  const status = opts.status && ["open", "acknowledged", "resolved"].includes(opts.status) ? opts.status : null;

  const countRes = status
    ? await db.execute(sql`SELECT count(*)::int AS n FROM system_incidents WHERE status = ${status}`)
    : await db.execute(sql`SELECT count(*)::int AS n FROM system_incidents WHERE status IN ('open', 'acknowledged')`);
  const total = Number(((countRes as any).rows?.[0] ?? (countRes as any)[0])?.n ?? 0);

  const rowsRes = status
    ? await db.execute(sql`
        SELECT * FROM system_incidents WHERE status = ${status}
        ORDER BY last_seen_at DESC LIMIT ${limit} OFFSET ${offset}
      `)
    : await db.execute(sql`
        SELECT * FROM system_incidents WHERE status IN ('open', 'acknowledged')
        ORDER BY
          CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
          last_seen_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `);
  const rows = (rowsRes as any).rows ?? rowsRes;
  return { items: (rows as any[]).map(mapRow), total };
}

export async function getIncidentSummary(): Promise<{
  open: number;
  acknowledged: number;
  resolved: number;
  criticalOpen: number;
  warningOpen: number;
}> {
  const res = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status = 'open')::int AS open,
      count(*) FILTER (WHERE status = 'acknowledged')::int AS acknowledged,
      count(*) FILTER (WHERE status = 'resolved')::int AS resolved,
      count(*) FILTER (WHERE status = 'open' AND severity = 'critical')::int AS critical_open,
      count(*) FILTER (WHERE status = 'open' AND severity = 'warning')::int AS warning_open
    FROM system_incidents
  `);
  const r = (res as any).rows?.[0] ?? (res as any)[0] ?? {};
  return {
    open: Number(r.open || 0),
    acknowledged: Number(r.acknowledged || 0),
    resolved: Number(r.resolved || 0),
    criticalOpen: Number(r.critical_open || 0),
    warningOpen: Number(r.warning_open || 0),
  };
}

export async function acknowledgeIncident(
  id: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const res = await db.execute(sql`
    UPDATE system_incidents
    SET status = 'acknowledged',
        acknowledged_at = now(),
        acknowledged_by = ${actorId}
    WHERE id = ${id} AND status = 'open'
    RETURNING id
  `);
  const row = (res as any).rows?.[0] ?? (res as any)[0];
  if (!row) return { ok: false, reason: "NOT_FOUND_OR_STATE" };
  return { ok: true };
}

export async function resolveIncident(
  id: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const res = await db.execute(sql`
    UPDATE system_incidents
    SET status = 'resolved',
        resolved_at = now(),
        resolved_by = ${actorId}
    WHERE id = ${id} AND status IN ('open', 'acknowledged')
    RETURNING id
  `);
  const row = (res as any).rows?.[0] ?? (res as any)[0];
  if (!row) return { ok: false, reason: "NOT_FOUND_OR_STATE" };
  return { ok: true };
}

/** Delete resolved rows older than 30 days. Never deletes open/acknowledged. */
export async function pruneResolvedIncidents(): Promise<number> {
  try {
    const res = await db.execute(sql`
      DELETE FROM system_incidents
      WHERE status = 'resolved'
        AND resolved_at IS NOT NULL
        AND resolved_at < now() - interval '30 days'
    `);
    return Number((res as any).rowCount ?? 0);
  } catch {
    console.error("[SystemIncidents] WRITE_FAILED");
    return 0;
  }
}

type DailyAttentionResult =
  | "written"
  | "already_done"
  | "skipped_healthy"
  | "skipped_error"
  | "cap_full";

/**
 * NODE_ENV=test only hooks.
 * - forceNeedsAttention: when the key is present (true OR false), overrides real integrity.
 *   Explicit false must force the healthy no-write branch.
 * - now: optional clock for scheduler hour/day (Dhaka derived from this instant).
 * Never settable via HTTP, env, or client. Production ignores all hooks.
 */
type DailyAttentionTestHooks = {
  forceNeedsAttention?: boolean;
  now?: () => Date;
};

let dailyAttentionTestHooks: DailyAttentionTestHooks | null = null;

/** NODE_ENV=test only. Pass null to clear. */
export function setDailyAttentionTestHooks(hooks: DailyAttentionTestHooks | null): void {
  if (process.env.NODE_ENV !== "test") return;
  dailyAttentionTestHooks = hooks;
}

/** NODE_ENV=test only — clear process-local day markers so ticks can re-run. */
export function resetSchedulerDayMarkersForTests(): void {
  if (process.env.NODE_ENV !== "test") return;
  lastDailySuccessDay = null;
  lastPruneDay = null;
}

function clockNow(): Date {
  if (process.env.NODE_ENV === "test" && dailyAttentionTestHooks?.now) {
    return dailyAttentionTestHooks.now();
  }
  return new Date();
}

function hasForceNeedsAttentionKey(): boolean {
  return (
    process.env.NODE_ENV === "test" &&
    dailyAttentionTestHooks != null &&
    Object.prototype.hasOwnProperty.call(dailyAttentionTestHooks, "forceNeedsAttention")
  );
}

/**
 * Conditional daily attention: only when integrity aggregates need review.
 * Signature includes Dhaka day. Second concurrent process observes existing row
 * and does no count/metadata mutation (already_done).
 * Failed attempt does not set process success marker — same-day retry allowed.
 */
export async function runDailyIntegrityAttentionIfNeeded(): Promise<DailyAttentionResult> {
  try {
    let needsAttention = false;
    if (hasForceNeedsAttentionKey()) {
      // Explicit false → healthy branch; explicit true → attention branch.
      needsAttention = dailyAttentionTestHooks!.forceNeedsAttention === true;
    } else {
      const { getJourneyLineageSummary, mapLedgerVerificationToStatus, getSchedulerIntegritySummary } =
        await import("./admin-system-status.service.js");
      const { verifyMainSchemaLedger } = await import("./main-schema-migrate.service.js");

      const [lineage, scheduler, verification] = await Promise.all([
        getJourneyLineageSummary({ forceRefresh: true }),
        getSchedulerIntegritySummary({ forceRefresh: true }),
        verifyMainSchemaLedger(),
      ]);
      const ledger = mapLedgerVerificationToStatus(verification);

      needsAttention =
        !ledger.ledgerHealthy ||
        lineage.status === "unhealthy" ||
        lineage.status === "unavailable" ||
        scheduler.status === "attention" ||
        scheduler.status === "unavailable";
    }

    if (!needsAttention) return "skipped_healthy";

    const day = dhakaDay(clockNow());
    const result = await recordAllowlistedIncident({
      component: "SystemIntegrity",
      code: "DAILY_ATTENTION",
      category: "integrity",
      summaryDay: day,
    });
    if (!result.ok) {
      return result.reason === "CAP_FULL" ? "cap_full" : "skipped_error";
    }
    return result.alreadyPresent ? "already_done" : "written";
  } catch {
    console.error("[SystemIncidents] WRITE_FAILED");
    return "skipped_error";
  }
}

let integrityTimer: ReturnType<typeof setInterval> | null = null;
/** Process-local optimization only — DB signature is authority for once-per-day. */
let lastDailySuccessDay: string | null = null;
let lastPruneDay: string | null = null;

export type SchedulerTickResult = {
  hour: number;
  day: string;
  dailyAttempted: boolean;
  dailyResult: DailyAttentionResult | null;
  pruneAttempted: boolean;
};

/**
 * Single scheduler decision tick (same path the interval uses).
 * Daily work only when Asia/Dhaka hour === 6.
 */
export async function runSchedulerTickOnce(): Promise<SchedulerTickResult> {
  if (!isDbReady()) {
    const now = clockNow();
    return {
      hour: dhakaHour(now),
      day: dhakaDay(now),
      dailyAttempted: false,
      dailyResult: null,
      pruneAttempted: false,
    };
  }
  const now = clockNow();
  const day = dhakaDay(now);
  const hour = dhakaHour(now);
  let dailyAttempted = false;
  let dailyResult: DailyAttentionResult | null = null;
  let pruneAttempted = false;

  // 06:00 Asia/Dhaka window only. Process-local flag after success; DB is authority.
  if (hour === 6 && lastDailySuccessDay !== day) {
    dailyAttempted = true;
    dailyResult = await runDailyIntegrityAttentionIfNeeded();
    if (
      dailyResult === "written" ||
      dailyResult === "already_done" ||
      dailyResult === "skipped_healthy"
    ) {
      lastDailySuccessDay = day;
    }
  }

  if (hour >= 6 && lastPruneDay !== day) {
    pruneAttempted = true;
    lastPruneDay = day;
    void pruneResolvedIncidents().then((n) => {
      if (n > 0) console.log(`[SystemIncidents] pruned resolved=${n}`);
    });
  }

  return { hour, day, dailyAttempted, dailyResult, pruneAttempted };
}

/**
 * NODE_ENV=test only — invoke the real scheduler decision path (not a direct marker write).
 * Inert outside test (returns null).
 */
export async function testOnlyRunSchedulerTick(): Promise<SchedulerTickResult | null> {
  if (process.env.NODE_ENV !== "test") return null;
  return runSchedulerTickOnce();
}

export function startSystemIncidentSchedulers(): void {
  if (integrityTimer) return;
  integrityTimer = setInterval(() => {
    void runSchedulerTickOnce();
  }, 60_000);
  console.log("[SystemIncidents] Daily integrity (06:00 Asia/Dhaka) + retention scheduled");
}

export function stopSystemIncidentSchedulers(): void {
  if (integrityTimer) {
    clearInterval(integrityTimer);
    integrityTimer = null;
  }
}

/** NODE_ENV=test only — emit fixed allowlisted code through the same writer path. */
export async function testOnlyRecordFixedCode(code: string): Promise<{ ok: boolean; reason?: string }> {
  if (process.env.NODE_ENV !== "test") return { ok: false, reason: "NOT_TEST" };
  const result = await recordAllowlistedIncident({
    component: "Reminders",
    code,
    category: "background",
  });
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}
