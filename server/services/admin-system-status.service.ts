/**
 * Super Admin system status — read-only safe aggregates for GET /api/admin/readiness.
 * RELEASE-OPERATIONS-01B-A-HOTFIX-1: ledgerHealthy includes extraCount; ledger+lineage ≤60s TTL.
 * SYSTEM-FOUNDATION-01C-B2-C-A: scheduler integrity aggregates (reminders/outbox/backup/day-close).
 */
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import {
  MAIN_SCHEMA_MIGRATIONS,
  verifyMainSchemaLedger,
  getMainSchemaState,
  type LedgerVerification,
} from "./main-schema-migrate.service.js";
import { getReadinessState } from "./db-readiness.js";

const STATUS_TTL_MS = 60_000;
const DEFAULT_DAY_CLOSE_TZ = "Asia/Dhaka";
const BACKUP_TZ = "Asia/Dhaka";

/** Calendar YYYY-MM-DD in a validated IANA timezone (reuses product timezone rules). */
function localRunDay(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export type JourneyLineageStatus = "healthy" | "unhealthy" | "unavailable";

export interface JourneyLineageSummary {
  status: JourneyLineageStatus;
  totalJourneys: number | null;
  coalesceMissingParentCount: number | null;
  brokenCustomerParentCount: number | null;
  checkedAt: string | null;
}

export interface LedgerStatusSummary {
  ledgerHealthy: boolean;
  appliedCount: number;
  missingCount: number;
  mismatchCount: number;
  extraCount: number;
  mainSchemaVersion: string | null;
}

/** Safe integer buckets only — never IDs, tokens, notes, or error codes. */
export interface SchedulerQueueCounts {
  pending: number | null;
  active: number | null;
  retrying: number | null;
  failed: number | null;
  expiredLease: number | null;
}

export type SchedulerIntegrityStatus = "healthy" | "attention" | "unavailable";

export interface SchedulerIntegritySummary {
  status: SchedulerIntegrityStatus;
  checkedAt: string | null;
  reminders: SchedulerQueueCounts;
  smsOutbox: SchedulerQueueCounts;
  scheduledBackups: SchedulerQueueCounts;
  drawerDayClose: SchedulerQueueCounts;
}

export interface AdminSystemStatusDto {
  state: string;
  dbConnected: boolean;
  mainSchemaComplete: boolean;
  mainSchemaFailed: boolean;
  mainSchemaVersion: string | null;
  registryHeadVersion: string | null;
  appliedCount: number;
  registryCount: number;
  missingCount: number;
  mismatchCount: number;
  extraCount: number;
  ledgerHealthy: boolean;
  optionalJobsComplete: boolean;
  optionalJobs: Array<{ name: string; status: string }>;
  journeyLineage: JourneyLineageSummary;
  schedulerIntegrity: SchedulerIntegritySummary;
  ts: string;
}

type SchedulerIntegrityTestHooks = {
  /** Deterministic clock only — no failure injection. */
  now?: () => Date;
};

const REQUIRED_SCHEDULER_TABLES = [
  "reminders",
  "scheduler_delivery_outbox",
  "scheduled_backup_runs",
  "drawer_day_close_runs",
] as const;

let lineageCache: { storedAt: number; value: JourneyLineageSummary } | null = null;
let ledgerCache: { storedAt: number; value: LedgerStatusSummary } | null = null;
let schedulerCache: { storedAt: number; value: SchedulerIntegritySummary } | null = null;
/** Increments only when lineage aggregate SQL runs (not cache hit). */
let lineageAggregateQueryCount = 0;
/** Increments only when verifyMainSchemaLedger runs (not cache hit). */
let ledgerVerifyQueryCount = 0;
/** Increments only when scheduler integrity aggregate SQL runs (not cache hit). */
let schedulerIntegrityQueryCount = 0;
let schedulerTestHooks: SchedulerIntegrityTestHooks | null = null;

export function getLineageAggregateQueryCount(): number {
  return lineageAggregateQueryCount;
}

export function getLedgerVerifyQueryCount(): number {
  return ledgerVerifyQueryCount;
}

export function getSchedulerIntegrityQueryCount(): number {
  return schedulerIntegrityQueryCount;
}

/** Test-only: clear TTL caches between proofs. */
export function resetJourneyLineageCacheForTests(): void {
  lineageCache = null;
}

export function resetLedgerStatusCacheForTests(): void {
  ledgerCache = null;
}

export function resetSchedulerIntegrityCacheForTests(): void {
  schedulerCache = null;
}

export function resetAdminSystemStatusCachesForTests(): void {
  lineageCache = null;
  ledgerCache = null;
  schedulerCache = null;
}

/** Test-only: inject clock. Not HTTP-reachable. No failure injection. */
export function setSchedulerIntegrityTestHooks(hooks: SchedulerIntegrityTestHooks | null): void {
  if (process.env.NODE_ENV !== "test") return;
  schedulerTestHooks = hooks;
}

export function getRegistryHeadVersion(): string | null {
  if (MAIN_SCHEMA_MIGRATIONS.length === 0) return null;
  return MAIN_SCHEMA_MIGRATIONS[MAIN_SCHEMA_MIGRATIONS.length - 1]!.id;
}

export function getRegistryCount(): number {
  return MAIN_SCHEMA_MIGRATIONS.length;
}

/**
 * Pure mapping: verification object → safe status counts.
 * Unexpected ledger ids (extra) force ledgerHealthy=false. No IDs/checksums returned.
 */
export function mapLedgerVerificationToStatus(verification: {
  missing: string[];
  mismatched: unknown[];
  extra: string[];
  appliedIds: string[];
  currentVersion: string | null;
}): LedgerStatusSummary {
  const missingCount = verification.missing.length;
  const mismatchCount = verification.mismatched.length;
  const extraCount = verification.extra.length;
  const ledgerHealthy = missingCount === 0 && mismatchCount === 0 && extraCount === 0;
  return {
    ledgerHealthy,
    appliedCount: verification.appliedIds.length,
    missingCount,
    mismatchCount,
    extraCount,
    mainSchemaVersion: verification.currentVersion,
  };
}

/**
 * Bounded read-only aggregate. Cached ≤60s after Super Admin request.
 * Never throws — returns status unavailable on failure.
 */
export async function getJourneyLineageSummary(options?: {
  forceRefresh?: boolean;
}): Promise<JourneyLineageSummary> {
  const now = Date.now();
  if (
    !options?.forceRefresh &&
    lineageCache &&
    now - lineageCache.storedAt < STATUS_TTL_MS
  ) {
    return lineageCache.value;
  }

  try {
    lineageAggregateQueryCount += 1;
    const result = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM customer_repair_journeys) AS total_journeys,
        (
          SELECT COUNT(*)::int FROM customer_repair_journeys j
          WHERE COALESCE(j.service_request_id, j.quote_request_id) IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM service_requests s
              WHERE s.id = COALESCE(j.service_request_id, j.quote_request_id)
            )
        ) AS coalesce_missing_parent,
        (
          SELECT COUNT(*)::int FROM customer_repair_journeys j
          WHERE j.customer_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = j.customer_id)
        ) AS broken_customer_parent
    `);
    const raw = result as { rows?: Record<string, unknown>[] } | Record<string, unknown>[];
    const row = (Array.isArray(raw) ? raw[0] : raw.rows?.[0] ?? {}) as {
      total_journeys?: number | string;
      coalesce_missing_parent?: number | string;
      broken_customer_parent?: number | string;
    };
    const totalJourneys = Number(row.total_journeys ?? 0);
    const coalesceMissingParentCount = Number(row.coalesce_missing_parent ?? 0);
    const brokenCustomerParentCount = Number(row.broken_customer_parent ?? 0);
    const checkedAt = new Date().toISOString();
    const healthy =
      coalesceMissingParentCount === 0 && brokenCustomerParentCount === 0;
    const value: JourneyLineageSummary = {
      status: healthy ? "healthy" : "unhealthy",
      totalJourneys,
      coalesceMissingParentCount,
      brokenCustomerParentCount,
      checkedAt,
    };
    lineageCache = { storedAt: now, value };
    return value;
  } catch {
    const value: JourneyLineageSummary = {
      status: "unavailable",
      totalJourneys: null,
      coalesceMissingParentCount: null,
      brokenCustomerParentCount: null,
      checkedAt: new Date().toISOString(),
    };
    lineageCache = { storedAt: now, value };
    return value;
  }
}

export async function getLedgerStatusSummary(options?: {
  forceRefresh?: boolean;
}): Promise<LedgerStatusSummary> {
  const now = Date.now();
  if (
    !options?.forceRefresh &&
    ledgerCache &&
    now - ledgerCache.storedAt < STATUS_TTL_MS
  ) {
    return ledgerCache.value;
  }

  const mainMem = getMainSchemaState();
  try {
    ledgerVerifyQueryCount += 1;
    const verification: LedgerVerification = await verifyMainSchemaLedger();
    const mapped = mapLedgerVerificationToStatus(verification);
    ledgerCache = { storedAt: now, value: mapped };
    return mapped;
  } catch {
    const fallback: LedgerStatusSummary = {
      ledgerHealthy: false,
      appliedCount: mainMem.appliedIds?.length ?? 0,
      missingCount: 0,
      mismatchCount: 0,
      extraCount: 0,
      mainSchemaVersion: mainMem.currentVersion,
    };
    ledgerCache = { storedAt: now, value: fallback };
    return fallback;
  }
}

function emptyQueueCounts(nullish: boolean): SchedulerQueueCounts {
  if (nullish) {
    return {
      pending: null,
      active: null,
      retrying: null,
      failed: null,
      expiredLease: null,
    };
  }
  return {
    pending: 0,
    active: 0,
    retrying: 0,
    failed: 0,
    expiredLease: 0,
  };
}

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function normalizeTimezone(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_DAY_CLOSE_TZ;
  const candidate = value.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_DAY_CLOSE_TZ;
  }
}

function deriveSchedulerStatus(sources: SchedulerQueueCounts[]): SchedulerIntegrityStatus {
  for (const s of sources) {
    if ((s.failed ?? 0) > 0 || (s.expiredLease ?? 0) > 0 || (s.retrying ?? 0) > 0) {
      return "attention";
    }
  }
  return "healthy";
}

function unavailableSchedulerSummary(): SchedulerIntegritySummary {
  return {
    status: "unavailable",
    checkedAt: new Date().toISOString(),
    reminders: emptyQueueCounts(true),
    smsOutbox: emptyQueueCounts(true),
    scheduledBackups: emptyQueueCounts(true),
    drawerDayClose: emptyQueueCounts(true),
  };
}

/**
 * Bounded read-only scheduler integrity aggregates.
 * Current-day only for backup/day-close; non-terminal actionable only for reminders/outbox.
 * Cached ≤60s after Super Admin request. Never throws.
 */
export async function getSchedulerIntegritySummary(options?: {
  forceRefresh?: boolean;
}): Promise<SchedulerIntegritySummary> {
  const nowMs = Date.now();
  if (
    !options?.forceRefresh &&
    schedulerCache &&
    nowMs - schedulerCache.storedAt < STATUS_TTL_MS
  ) {
    return schedulerCache.value;
  }

  try {
    schedulerIntegrityQueryCount += 1;

    // Missing any required durable source table → whole summary unavailable (not zeros).
    await assertRequiredSchedulerTablesPresent();

    const instant =
      process.env.NODE_ENV === "test" && schedulerTestHooks?.now
        ? schedulerTestHooks.now()
        : new Date();

    let dayCloseTz = DEFAULT_DAY_CLOSE_TZ;
    try {
      const tzRow = await db.execute(sql`
        SELECT value FROM settings WHERE key = 'drawer_day_close_timezone' LIMIT 1
      `);
      const raw = tzRow as { rows?: Array<{ value?: string }> } | Array<{ value?: string }>;
      const row = Array.isArray(raw) ? raw[0] : raw.rows?.[0];
      dayCloseTz = normalizeTimezone(row?.value);
    } catch {
      dayCloseTz = DEFAULT_DAY_CLOSE_TZ;
    }

    const backupDay = localRunDay(instant, BACKUP_TZ);
    const dayCloseDay = localRunDay(instant, dayCloseTz);

    const reminders = await countReminderQueues();
    const smsOutbox = await countOutboxQueues();
    const scheduledBackups = await countDayRunQueues("scheduled_backup_runs", backupDay);
    const drawerDayClose = await countDayRunQueues("drawer_day_close_runs", dayCloseDay);

    const value: SchedulerIntegritySummary = {
      status: deriveSchedulerStatus([reminders, smsOutbox, scheduledBackups, drawerDayClose]),
      checkedAt: new Date().toISOString(),
      reminders,
      smsOutbox,
      scheduledBackups,
      drawerDayClose,
    };
    schedulerCache = { storedAt: nowMs, value };
    return value;
  } catch {
    const value = unavailableSchedulerSummary();
    schedulerCache = { storedAt: nowMs, value };
    return value;
  }
}

/** Throws if a required source relation is missing — caller maps to unavailable nulls. */
async function assertRequiredSchedulerTablesPresent(): Promise<void> {
  for (const table of REQUIRED_SCHEDULER_TABLES) {
    const reg = await db.execute(sql`
      SELECT to_regclass(${"public." + table}) AS reg
    `);
    const rawReg = reg as { rows?: Array<{ reg?: string | null }> } | Array<{ reg?: string | null }>;
    const regRow = Array.isArray(rawReg) ? rawReg[0] : rawReg.rows?.[0];
    if (!regRow?.reg) {
      throw new Error("SCHEDULER_SOURCE_UNAVAILABLE");
    }
  }
}

async function countReminderQueues(): Promise<SchedulerQueueCounts> {
  const result = await db.execute(sql`
    SELECT
      (
        SELECT COUNT(*)::int FROM reminders
        WHERE is_dismissed = false
          AND is_sent = false
          AND COALESCE(delivery_status, 'pending') = 'pending'
      ) AS pending,
      (
        SELECT COUNT(*)::int FROM reminders
        WHERE is_dismissed = false
          AND is_sent = false
          AND delivery_status = 'in_flight'
          AND claim_until IS NOT NULL
          AND claim_until >= NOW()
      ) AS active,
      (
        SELECT COUNT(*)::int FROM reminders
        WHERE is_dismissed = false
          AND is_sent = false
          AND delivery_status = 'failed'
          AND next_attempt_at IS NOT NULL
          AND next_attempt_at > NOW()
      ) AS retrying,
      (
        SELECT COUNT(*)::int FROM reminders
        WHERE is_dismissed = false
          AND is_sent = false
          AND delivery_status = 'failed'
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
      ) AS failed,
      (
        SELECT COUNT(*)::int FROM reminders
        WHERE is_dismissed = false
          AND is_sent = false
          AND delivery_status = 'in_flight'
          AND (claim_until IS NULL OR claim_until < NOW())
      ) AS expired_lease
  `);
  return mapQueueRow(result);
}

async function countOutboxQueues(): Promise<SchedulerQueueCounts> {
  const result = await db.execute(sql`
    SELECT
      (
        SELECT COUNT(*)::int FROM scheduler_delivery_outbox
        WHERE delivery_status = 'pending'
      ) AS pending,
      (
        SELECT COUNT(*)::int FROM scheduler_delivery_outbox
        WHERE delivery_status = 'in_flight'
          AND claim_until IS NOT NULL
          AND claim_until >= NOW()
      ) AS active,
      (
        SELECT COUNT(*)::int FROM scheduler_delivery_outbox
        WHERE delivery_status = 'failed'
          AND next_attempt_at IS NOT NULL
          AND next_attempt_at > NOW()
      ) AS retrying,
      (
        SELECT COUNT(*)::int FROM scheduler_delivery_outbox
        WHERE delivery_status = 'failed'
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
      ) AS failed,
      (
        SELECT COUNT(*)::int FROM scheduler_delivery_outbox
        WHERE delivery_status = 'in_flight'
          AND (claim_until IS NULL OR claim_until < NOW())
      ) AS expired_lease
  `);
  return mapQueueRow(result);
}

/**
 * Day-scoped run tables (backup / day-close). Identifier is fixed allowlist only.
 * Caller must assert tables exist first; query errors surface as unavailable.
 */
async function countDayRunQueues(
  table: "scheduled_backup_runs" | "drawer_day_close_runs",
  runDay: string
): Promise<SchedulerQueueCounts> {
  // Fixed identifiers only — never interpolate user input.
  if (table === "scheduled_backup_runs") {
    const result = await db.execute(sql`
      SELECT
        (
          SELECT COUNT(*)::int FROM scheduled_backup_runs
          WHERE run_day = ${runDay}::date AND status = 'pending'
        ) AS pending,
        (
          SELECT COUNT(*)::int FROM scheduled_backup_runs
          WHERE run_day = ${runDay}::date
            AND status = 'running'
            AND claim_until IS NOT NULL
            AND claim_until >= NOW()
        ) AS active,
        (
          SELECT COUNT(*)::int FROM scheduled_backup_runs
          WHERE run_day = ${runDay}::date
            AND status = 'failed'
            AND next_attempt_at IS NOT NULL
            AND next_attempt_at > NOW()
        ) AS retrying,
        (
          SELECT COUNT(*)::int FROM scheduled_backup_runs
          WHERE run_day = ${runDay}::date
            AND status = 'failed'
            AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
        ) AS failed,
        (
          SELECT COUNT(*)::int FROM scheduled_backup_runs
          WHERE run_day = ${runDay}::date
            AND status = 'running'
            AND (claim_until IS NULL OR claim_until < NOW())
        ) AS expired_lease
    `);
    return mapQueueRow(result);
  }

  const result = await db.execute(sql`
    SELECT
      (
        SELECT COUNT(*)::int FROM drawer_day_close_runs
        WHERE run_day = ${runDay}::date AND status = 'pending'
      ) AS pending,
      (
        SELECT COUNT(*)::int FROM drawer_day_close_runs
        WHERE run_day = ${runDay}::date
          AND status = 'running'
          AND claim_until IS NOT NULL
          AND claim_until >= NOW()
      ) AS active,
      (
        SELECT COUNT(*)::int FROM drawer_day_close_runs
        WHERE run_day = ${runDay}::date
          AND status = 'failed'
          AND next_attempt_at IS NOT NULL
          AND next_attempt_at > NOW()
      ) AS retrying,
      (
        SELECT COUNT(*)::int FROM drawer_day_close_runs
        WHERE run_day = ${runDay}::date
          AND status = 'failed'
          AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
      ) AS failed,
      (
        SELECT COUNT(*)::int FROM drawer_day_close_runs
        WHERE run_day = ${runDay}::date
          AND status = 'running'
          AND (claim_until IS NULL OR claim_until < NOW())
      ) AS expired_lease
  `);
  return mapQueueRow(result);
}

function mapQueueRow(
  result: { rows?: Record<string, unknown>[] } | Record<string, unknown>[]
): SchedulerQueueCounts {
  const raw = result as { rows?: Record<string, unknown>[] } | Record<string, unknown>[];
  const row = (Array.isArray(raw) ? raw[0] : raw.rows?.[0] ?? {}) as Record<string, unknown>;
  return {
    pending: n(row.pending),
    active: n(row.active),
    retrying: n(row.retrying),
    failed: n(row.failed),
    expiredLease: n(row.expired_lease),
  };
}

/** Build Super Admin readiness JSON. Safe fields only. */
export async function buildAdminSystemStatus(): Promise<AdminSystemStatusDto> {
  const readiness = getReadinessState();
  const registryHeadVersion = getRegistryHeadVersion();
  const registryCount = getRegistryCount();

  const ledger = await getLedgerStatusSummary();
  const journeyLineage = await getJourneyLineageSummary();
  const schedulerIntegrity = await getSchedulerIntegritySummary();

  return {
    state: readiness.state,
    dbConnected: readiness.dbConnected,
    mainSchemaComplete: readiness.mainSchemaComplete,
    mainSchemaFailed: readiness.mainSchemaFailed,
    mainSchemaVersion: ledger.mainSchemaVersion ?? readiness.mainSchemaVersion,
    registryHeadVersion,
    appliedCount: ledger.appliedCount,
    registryCount,
    missingCount: ledger.missingCount,
    mismatchCount: ledger.mismatchCount,
    extraCount: ledger.extraCount,
    ledgerHealthy: ledger.ledgerHealthy,
    optionalJobsComplete: readiness.optionalJobsComplete,
    optionalJobs: (readiness.optionalJobs || []).map((j) => ({
      name: j.name,
      status: j.status,
    })),
    journeyLineage,
    schedulerIntegrity,
    ts: new Date().toISOString(),
  };
}
