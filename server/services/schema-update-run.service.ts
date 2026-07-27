import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { auditLogger } from "../utils/auditLogger.js";
import { AUDIT_ACTIONS } from "../../shared/constants.js";
import {
  MAIN_SCHEMA_MIGRATIONS,
  REQUIRED_MAIN_SCHEMA_VERSION,
  runMainSchemaMigrations,
  verifyMainSchemaLedger,
  type LedgerVerification,
  type MainSchemaResult,
} from "./main-schema-migrate.service.js";

export const SCHEMA_UPDATE_RUNS_TABLE = "schema_update_runs";

export type SchemaUpdateRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "blocked"
  | "timed_out"
  | "cancelled";

export type SchemaUpdateRun = {
  id: string;
  status: SchemaUpdateRunStatus;
  requestedBy: string;
  requestedAt: Date;
  confirmedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  requestSource: string;
  releaseVersion: string | null;
  targetPendingCount: number | null;
  appliedCount: number | null;
  errorCategory: string | null;
  errorMessage: string | null;
  resultSummary: Record<string, unknown> | null;
};

export type RedactedSchemaUpdateRun = {
  id: string;
  status: SchemaUpdateRunStatus;
  requestedAt: string;
  confirmedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  releaseVersion: string | null;
  targetPendingCount: number | null;
  appliedCount: number | null;
  errorCategory: string | null;
  errorMessage: string | null;
  isActive: boolean;
};

/** Browser-safe ledger projection from canonical promise_schema_migrations verification. */
export type BrowserLedgerProjection = {
  state: "ok" | "pending" | "blocked" | "empty" | "unknown";
  appliedCount: number;
  pendingCount: number;
  mismatchCount: number;
  extraCount: number;
  ledgerHealthy: boolean;
  mainSchemaVersion: string | null;
  registryCount: number;
  registryHeadVersion: string | null;
  requiredVersion: string;
};

export type SchemaUpdateStatusResponse = {
  controlPlane: "available" | "bootstrap_required" | "unavailable";
  runnerEligible: boolean;
  runnerMode: "disabled" | "development" | "production_explicit";
  productionExecutionEnabled: boolean;
  releaseVersion: string;
  ledger: BrowserLedgerProjection;
  activeRun: RedactedSchemaUpdateRun | null;
  lastRun: RedactedSchemaUpdateRun | null;
  safeMessage: string | null;
};

export type ProtectedRunnerGate = {
  allowed: boolean;
  reason: string | null;
  mode: "disabled" | "development" | "production_explicit";
};

const ACTIVE_STATUSES: SchemaUpdateRunStatus[] = ["pending", "running"];
const SAFE_INTEGRITY_MESSAGE =
  "Schema integrity check failed. No migrations were applied. Ledger reconciliation is required before schema updates can continue.";
const SAFE_VERIFICATION_UNAVAILABLE_MESSAGE =
  "Schema ledger verification is unavailable. No migrations were applied. Re-verify the ledger before retry.";

export function isActiveRunStatus(status: SchemaUpdateRunStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function getSafeReleaseVersion(env: NodeJS.ProcessEnv = process.env): string {
  return env.npm_package_version || env.APP_VERSION || "unknown";
}

/** Checksum mismatch or unexpected ledger extras — hard integrity failure. */
export function isIntegrityBlocked(verification: LedgerVerification): boolean {
  return verification.mismatched.length > 0 || verification.extra.length > 0;
}

function isVerificationInfrastructureFailure(verification: LedgerVerification): boolean {
  const err = (verification.error || "").toLowerCase();
  if (!err) return false;
  return (
    err.includes("ledger table does not exist") ||
    err.includes("database_url") ||
    err.includes("is not set") ||
    err.includes("connect") ||
    err.includes("econnrefused") ||
    err.includes("enotfound") ||
    err.includes("timeout") ||
    err.includes("unavailable") ||
    err.includes("econnreset") ||
    err.includes("connection terminated")
  );
}

/**
 * Affirmative gate for invoking the canonical MAIN migrate function from the protected runner.
 * Safe only when:
 * 1) verification.ok (healthy complete ledger), or
 * 2) readable existing ledger with verified applied rows and pending-only missing (no mismatch/extra).
 * Anything unavailable/unknown/error/absent-ledger/integrity is NOT safe (fail-closed).
 */
export function isVerificationSafeToMigrate(verification: LedgerVerification): boolean {
  if (isIntegrityBlocked(verification)) {
    return false;
  }
  if (isVerificationInfrastructureFailure(verification)) {
    return false;
  }

  // Healthy complete ledger — migrate path is a safe no-op for the executor
  if (verification.ok === true) {
    return true;
  }

  // Canonical pending-only from an existing readable ledger (at least one verified applied id)
  if (
    verification.appliedIds.length > 0 &&
    verification.currentVersion != null &&
    verification.missing.length > 0 &&
    verification.mismatched.length === 0 &&
    verification.extra.length === 0
  ) {
    return true;
  }

  return false;
}

/** Fail-closed inverse of isVerificationSafeToMigrate — block run with zero DDL. */
export function mustBlockRunWithoutDdl(verification: LedgerVerification): boolean {
  return !isVerificationSafeToMigrate(verification);
}

export function safeBlockMessageForVerification(verification: LedgerVerification): string {
  if (isIntegrityBlocked(verification)) {
    return SAFE_INTEGRITY_MESSAGE;
  }
  return SAFE_VERIFICATION_UNAVAILABLE_MESSAGE;
}

/**
 * Project canonical verifyMainSchemaLedger result for browser/status APIs.
 * Never includes checksums, SQL, connection strings, or raw error text.
 */
export function projectCanonicalLedgerForBrowser(
  verification: LedgerVerification
): BrowserLedgerProjection {
  const registryCount = MAIN_SCHEMA_MIGRATIONS.length;
  const registryHeadVersion =
    registryCount > 0 ? MAIN_SCHEMA_MIGRATIONS[registryCount - 1]!.id : null;
  const mismatchCount = verification.mismatched.length;
  const extraCount = verification.extra.length;
  const pendingCount = verification.missing.length;
  const appliedCount = verification.appliedIds.length;
  const blocked = mismatchCount > 0 || extraCount > 0;
  const infraUnavailable =
    isVerificationInfrastructureFailure(verification) ||
    (!verification.ok &&
      appliedCount === 0 &&
      pendingCount === 0 &&
      mismatchCount === 0 &&
      extraCount === 0 &&
      Boolean(verification.error));

  let state: BrowserLedgerProjection["state"] = "unknown";
  if (infraUnavailable) {
    // Absent ledger, connection/verify errors — never present as actionable empty/pending
    state = "unknown";
  } else if (blocked) {
    state = "blocked";
  } else if (appliedCount === 0 && pendingCount > 0) {
    state = "empty";
  } else if (pendingCount > 0) {
    state = "pending";
  } else if (verification.ok) {
    state = "ok";
  }

  return {
    state,
    appliedCount,
    pendingCount,
    mismatchCount,
    extraCount,
    ledgerHealthy: verification.ok === true && !blocked && !infraUnavailable,
    mainSchemaVersion: verification.currentVersion,
    registryCount,
    registryHeadVersion,
    requiredVersion: REQUIRED_MAIN_SCHEMA_VERSION,
  };
}

export function classifyDatabaseTarget(rawUrl: string | undefined): {
  isLocal: boolean;
  isAivenOrNeon: boolean;
  valid: boolean;
} {
  if (!rawUrl) return { isLocal: false, isAivenOrNeon: false, valid: false };
  try {
    const url = new URL(rawUrl);
    const host = (url.hostname || "").toLowerCase();
    if (!host) return { isLocal: false, isAivenOrNeon: false, valid: false };
    const protocol = (url.protocol || "").replace(/:$/, "").toLowerCase();
    if (protocol !== "postgres" && protocol !== "postgresql") {
      return { isLocal: false, isAivenOrNeon: false, valid: false };
    }
    const isLocal = host === "localhost" || host === "127.0.0.1";
    const isAivenOrNeon =
      host.includes("aivencloud.com") ||
      host.includes("aiven.io") ||
      host.includes("neon.tech");
    return { isLocal, isAivenOrNeon, valid: true };
  } catch {
    return { isLocal: false, isAivenOrNeon: false, valid: false };
  }
}

/**
 * Development-safe protected runner gate. Production/Aiven stays disabled unless
 * ALLOW_PROD_DB_MIGRATE_MAIN=true is set explicitly (never default).
 */
export function evaluateProtectedRunnerGate(
  env: NodeJS.ProcessEnv = process.env
): ProtectedRunnerGate {
  if (env.SCHEMA_PROTECTED_RUNNER_ENABLED !== "true") {
    return {
      allowed: false,
      reason:
        "Protected schema runner is disabled. Set SCHEMA_PROTECTED_RUNNER_ENABLED=true for development-only runner processes.",
      mode: "disabled",
    };
  }

  const target = classifyDatabaseTarget(env.DATABASE_URL);
  if (!target.valid) {
    return {
      allowed: false,
      reason: "Invalid or missing DATABASE_URL for protected runner.",
      mode: "disabled",
    };
  }

  const allowProd = env.ALLOW_PROD_DB_MIGRATE_MAIN === "true";
  const productionLike =
    env.NODE_ENV === "production" || target.isAivenOrNeon || !target.isLocal;

  if (productionLike && !allowProd) {
    return {
      allowed: false,
      reason:
        "Production/remote database schema execution is disabled. ALLOW_PROD_DB_MIGRATE_MAIN is not enabled.",
      mode: "disabled",
    };
  }

  return {
    allowed: true,
    reason: null,
    mode: productionLike ? "production_explicit" : "development",
  };
}

export function redactRun(run: SchemaUpdateRun): RedactedSchemaUpdateRun {
  return {
    id: run.id,
    status: run.status,
    requestedAt: run.requestedAt.toISOString(),
    confirmedAt: run.confirmedAt ? run.confirmedAt.toISOString() : null,
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    releaseVersion: run.releaseVersion,
    targetPendingCount: run.targetPendingCount,
    appliedCount: run.appliedCount,
    errorCategory: run.errorCategory,
    errorMessage: sanitizeErrorMessage(run.errorMessage, run.errorCategory),
    isActive: isActiveRunStatus(run.status),
  };
}

export function sanitizeErrorMessage(
  message: string | null | undefined,
  category: string | null | undefined
): string | null {
  if (!message) {
    if (category === "integrity") return SAFE_INTEGRITY_MESSAGE;
    return null;
  }
  const lower = message.toLowerCase();
  if (
    lower.includes("postgres://") ||
    lower.includes("postgresql://") ||
    lower.includes("password") ||
    lower.includes("database_url") ||
    lower.includes("stack") ||
    lower.includes(" at ") ||
    /checksum[=:\s][a-f0-9]{8,}/i.test(message) ||
    lower.includes("select ") ||
    lower.includes("create table") ||
    lower.includes("alter table") ||
    lower.includes("insert into")
  ) {
    return category
      ? `Operation could not complete (${category}).`
      : "Operation could not complete.";
  }
  return message.length > 180 ? `${message.slice(0, 177)}...` : message;
}

export function redactAnyBrowserPayload<T extends object>(payload: T): T {
  const forbidden = [
    "password",
    "database_url",
    "connectionstring",
    "connection_string",
    "sql",
    "stack",
    "checksum",
    "hash",
    "secret",
    "token",
    "release_mode",
    "allow_prod",
  ];
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const key = k.toLowerCase();
        if (forbidden.some((f) => key.includes(f))) {
          out[k] = "[REDACTED]";
          continue;
        }
        if (typeof v === "string" && /postgres(ql)?:\/\//i.test(v)) {
          out[k] = "[REDACTED]";
          continue;
        }
        out[k] = walk(v);
      }
      return out;
    }
    return value;
  };
  return walk(payload) as T;
}

function mapRow(row: Record<string, unknown>): SchemaUpdateRun {
  return {
    id: String(row.id),
    status: row.status as SchemaUpdateRunStatus,
    requestedBy: String(row.requested_by),
    requestedAt: new Date(String(row.requested_at)),
    confirmedAt: row.confirmed_at ? new Date(String(row.confirmed_at)) : null,
    startedAt: row.started_at ? new Date(String(row.started_at)) : null,
    finishedAt: row.finished_at ? new Date(String(row.finished_at)) : null,
    requestSource: String(row.request_source || "super_admin_settings"),
    releaseVersion: (row.release_version as string | null) ?? null,
    targetPendingCount:
      row.target_pending_count === null || row.target_pending_count === undefined
        ? null
        : Number(row.target_pending_count),
    appliedCount:
      row.applied_count === null || row.applied_count === undefined
        ? null
        : Number(row.applied_count),
    errorCategory: (row.error_category as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    resultSummary: (row.result_summary as Record<string, unknown> | null) ?? null,
  };
}

function resultRows(result: unknown): Record<string, unknown>[] {
  if (!result) return [];
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return e?.code === "23505" || /unique|uidx_schema_update_runs_one_active/i.test(e?.message || "");
}

export async function isControlPlaneTableReady(): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT to_regclass('public.schema_update_runs') AS reg
    `);
    const rows = resultRows(result);
    return Boolean(rows[0]?.reg);
  } catch {
    return false;
  }
}

export async function getActiveRun(): Promise<SchemaUpdateRun | null> {
  const result = await db.execute(sql`
    SELECT * FROM schema_update_runs
    WHERE status IN ('pending', 'running')
    ORDER BY requested_at ASC
    LIMIT 1
  `);
  const row = resultRows(result)[0];
  return row ? mapRow(row) : null;
}

export async function getRunById(id: string): Promise<SchemaUpdateRun | null> {
  const result = await db.execute(sql`
    SELECT * FROM schema_update_runs WHERE id = ${id} LIMIT 1
  `);
  const row = resultRows(result)[0];
  return row ? mapRow(row) : null;
}

export async function getLatestRun(): Promise<SchemaUpdateRun | null> {
  const result = await db.execute(sql`
    SELECT * FROM schema_update_runs
    ORDER BY requested_at DESC
    LIMIT 1
  `);
  const row = resultRows(result)[0];
  return row ? mapRow(row) : null;
}

export type CreateRequestInput = {
  userId: string;
  password: string;
  passwordHash: string;
  confirm: boolean;
  req?: unknown;
};

export type CreateRequestResult =
  | { ok: true; run: SchemaUpdateRun; duplicate: boolean }
  | { ok: false; status: number; error: string; code?: string };

/**
 * Super Admin creates an authorized, explicitly confirmed update request.
 * Does NOT run DDL. Concurrent inserts are rejected by partial unique index;
 * race losers re-read the active run (one-active-run DB invariant).
 */
export async function createSchemaUpdateRequest(
  input: CreateRequestInput
): Promise<CreateRequestResult> {
  if (!input.confirm) {
    return {
      ok: false,
      status: 400,
      error: "Explicit confirmation is required.",
      code: "CONFIRMATION_REQUIRED",
    };
  }
  if (!input.password || typeof input.password !== "string") {
    return {
      ok: false,
      status: 400,
      error: "Password re-authentication is required.",
      code: "REAUTH_REQUIRED",
    };
  }

  const passwordOk = await bcrypt.compare(input.password, input.passwordHash);
  if (!passwordOk) {
    await auditLogger.log({
      userId: input.userId,
      action: AUDIT_ACTIONS.SCHEMA_UPDATE_REAUTH_FAILED,
      entity: "schema_update_run",
      entityId: "n/a",
      details: "Schema update re-authentication failed",
      severity: "warning",
      req: input.req,
    });
    return {
      ok: false,
      status: 401,
      error: "Re-authentication failed.",
      code: "REAUTH_FAILED",
    };
  }

  const ready = await isControlPlaneTableReady();
  if (!ready) {
    return {
      ok: false,
      status: 503,
      error:
        "Schema update control plane is not bootstrapped yet. Apply the control-plane MAIN migration via the trusted release command first.",
      code: "BOOTSTRAP_REQUIRED",
    };
  }

  const existing = await getActiveRun();
  if (existing) {
    await auditLogger.log({
      userId: input.userId,
      action: AUDIT_ACTIONS.SCHEMA_UPDATE_REQUEST_DEDUPED,
      entity: "schema_update_run",
      entityId: existing.id,
      details: "Duplicate schema update request returned existing active run",
      severity: "info",
      req: input.req,
    });
    return { ok: true, run: existing, duplicate: true };
  }

  const id = randomUUID();
  const now = new Date();
  const releaseVersion = getSafeReleaseVersion();

  try {
    await db.execute(sql`
      INSERT INTO schema_update_runs (
        id, status, requested_by, requested_at, confirmed_at,
        request_source, release_version, target_pending_count, applied_count
      ) VALUES (
        ${id},
        'pending',
        ${input.userId},
        ${now.toISOString()},
        ${now.toISOString()},
        'super_admin_settings',
        ${releaseVersion},
        NULL,
        NULL
      )
    `);
  } catch (err) {
    if (isUniqueViolation(err)) {
      const active = await getActiveRun();
      if (active) {
        await auditLogger.log({
          userId: input.userId,
          action: AUDIT_ACTIONS.SCHEMA_UPDATE_REQUEST_DEDUPED,
          entity: "schema_update_run",
          entityId: active.id,
          details: "Concurrent schema update request lost race; returned active run",
          severity: "info",
          req: input.req,
        });
        return { ok: true, run: active, duplicate: true };
      }
    }
    throw err;
  }

  await auditLogger.log({
    userId: input.userId,
    action: AUDIT_ACTIONS.SCHEMA_UPDATE_REQUESTED,
    entity: "schema_update_run",
    entityId: id,
    details: "Super Admin requested protected schema update",
    severity: "critical",
    req: input.req,
  });

  const run = await getRunById(id);
  if (!run) {
    return {
      ok: false,
      status: 500,
      error: "Failed to create schema update request.",
      code: "CREATE_FAILED",
    };
  }
  return { ok: true, run, duplicate: false };
}

export async function getSchemaUpdateStatus(): Promise<SchemaUpdateStatusResponse> {
  const gate = evaluateProtectedRunnerGate();
  const releaseVersion = getSafeReleaseVersion();
  const ready = await isControlPlaneTableReady();

  let ledgerProjection: BrowserLedgerProjection;
  try {
    const verification = await verifyMainSchemaLedger();
    ledgerProjection = projectCanonicalLedgerForBrowser(verification);
  } catch {
    ledgerProjection = {
      state: "unknown",
      appliedCount: 0,
      pendingCount: 0,
      mismatchCount: 0,
      extraCount: 0,
      ledgerHealthy: false,
      mainSchemaVersion: null,
      registryCount: MAIN_SCHEMA_MIGRATIONS.length,
      registryHeadVersion:
        MAIN_SCHEMA_MIGRATIONS.length > 0
          ? MAIN_SCHEMA_MIGRATIONS[MAIN_SCHEMA_MIGRATIONS.length - 1]!.id
          : null,
      requiredVersion: REQUIRED_MAIN_SCHEMA_VERSION,
    };
  }

  if (!ready) {
    const status: SchemaUpdateStatusResponse = {
      controlPlane: "bootstrap_required",
      runnerEligible: false,
      runnerMode: gate.mode,
      productionExecutionEnabled: process.env.ALLOW_PROD_DB_MIGRATE_MAIN === "true",
      releaseVersion,
      ledger: ledgerProjection,
      activeRun: null,
      lastRun: null,
      safeMessage:
        "Bootstrap required: apply the schema-update control-plane MAIN migration with the trusted release command (MAIN_MIGRATION_RELEASE_MODE=true npm run db:migrate:main) before using this control.",
    };
    return redactAnyBrowserPayload(status);
  }

  const [active, latest] = await Promise.all([getActiveRun(), getLatestRun()]);

  let safeMessage: string | null = null;
  if (ledgerProjection.state === "blocked") {
    safeMessage = SAFE_INTEGRITY_MESSAGE;
  } else if (ledgerProjection.state === "unknown") {
    safeMessage = SAFE_VERIFICATION_UNAVAILABLE_MESSAGE;
  } else if (!gate.allowed) {
    safeMessage =
      "Protected runner is not enabled in this environment. Requests are recorded for a separate development runner process.";
  }

  const status: SchemaUpdateStatusResponse = {
    controlPlane: "available",
    runnerEligible: gate.allowed && gate.mode === "development",
    runnerMode: gate.mode,
    productionExecutionEnabled: process.env.ALLOW_PROD_DB_MIGRATE_MAIN === "true",
    releaseVersion,
    ledger: ledgerProjection,
    activeRun: active ? redactRun(active) : null,
    lastRun: latest ? redactRun(latest) : active ? redactRun(active) : null,
    safeMessage,
  };
  return redactAnyBrowserPayload(status);
}

/**
 * Claim exactly one pending run. Uses conditional UPDATE so concurrent claimers
 * cannot both process the same row. Partial unique index also prevents two actives.
 */
export async function claimNextPendingRun(runnerId: string): Promise<SchemaUpdateRun | null> {
  const now = new Date().toISOString();
  const summary = JSON.stringify({ claimedBy: runnerId });

  const claimed = await db.execute(sql`
    UPDATE schema_update_runs
    SET status = 'running',
        started_at = ${now},
        result_summary = ${summary}::jsonb
    WHERE id = (
      SELECT id FROM schema_update_runs
      WHERE status = 'pending'
        AND NOT EXISTS (
          SELECT 1 FROM schema_update_runs r2 WHERE r2.status = 'running'
        )
      ORDER BY requested_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    AND status = 'pending'
    RETURNING *
  `);
  const claimedRow = resultRows(claimed)[0];
  return claimedRow ? mapRow(claimedRow) : null;
}

export function mapCanonicalMigrationResultToRunStatus(
  result: MainSchemaResult
): {
  status: SchemaUpdateRunStatus;
  errorCategory: string | null;
  safeMessage: string | null;
} {
  if (result.status === "complete" || result.status === "skipped") {
    return { status: "succeeded", errorCategory: null, safeMessage: null };
  }
  if (result.status === "lock_timeout") {
    return {
      status: "timed_out",
      errorCategory: "lock_timeout",
      safeMessage:
        "Another migration process holds the advisory lock. Re-verify ledger before retry.",
    };
  }
  const err = (result.error || "").toLowerCase();
  if (err.includes("checksum mismatch") || err.includes("failing closed")) {
    return {
      status: "blocked",
      errorCategory: "integrity",
      safeMessage: SAFE_INTEGRITY_MESSAGE,
    };
  }
  return {
    status: "failed",
    errorCategory: "migration",
    safeMessage: sanitizeErrorMessage(result.error, "migration"),
  };
}

export async function finalizeRunFromCanonicalResult(
  runId: string,
  result: MainSchemaResult,
  pendingBefore: number
): Promise<SchemaUpdateRun | null> {
  const now = new Date().toISOString();
  const mapped = mapCanonicalMigrationResultToRunStatus(result);
  const summary = JSON.stringify({
    canonicalStatus: result.status,
    appliedIdsCount: result.appliedIds.length,
    pendingBeforeCount: pendingBefore,
    requiredVersion: result.requiredVersion,
    currentVersion: result.currentVersion,
  });
  const safeError =
    mapped.safeMessage ??
    sanitizeErrorMessage(result.error, mapped.errorCategory);

  await db.execute(sql`
    UPDATE schema_update_runs
    SET status = ${mapped.status},
        finished_at = ${now},
        applied_count = ${result.appliedIds.length},
        target_pending_count = ${pendingBefore},
        error_category = ${mapped.errorCategory},
        error_message = ${safeError},
        result_summary = ${summary}::jsonb
    WHERE id = ${runId}
  `);

  await auditLogger.log({
    userId: "protected-runner",
    action: AUDIT_ACTIONS.SCHEMA_UPDATE_RUN_FINISHED,
    entity: "schema_update_run",
    entityId: runId,
    details: `Protected runner finished with status=${mapped.status}`,
    severity: mapped.status === "succeeded" ? "info" : "warning",
  });

  return getRunById(runId);
}

export async function markRunBlockedIntegrity(
  runId: string,
  message?: string
): Promise<SchemaUpdateRun | null> {
  const now = new Date().toISOString();
  const safe = sanitizeErrorMessage(message ?? SAFE_INTEGRITY_MESSAGE, "integrity");
  await db.execute(sql`
    UPDATE schema_update_runs
    SET status = 'blocked',
        finished_at = ${now},
        applied_count = 0,
        error_category = 'integrity',
        error_message = ${safe}
    WHERE id = ${runId}
  `);
  return getRunById(runId);
}

export async function markRunFailed(
  runId: string,
  category: string,
  message: string
): Promise<SchemaUpdateRun | null> {
  const now = new Date().toISOString();
  const safe = sanitizeErrorMessage(message, category);
  await db.execute(sql`
    UPDATE schema_update_runs
    SET status = 'failed',
        finished_at = ${now},
        error_category = ${category},
        error_message = ${safe}
    WHERE id = ${runId} AND status IN ('pending', 'running')
  `);
  return getRunById(runId);
}

/**
 * Process one claimed run: verify canonical ledger first.
 * Invoke runMainSchemaMigrations only when verification is affirmatively safe
 * (healthy ledger OR pending-only from an existing readable ledger).
 * Any unavailable/unknown/error/absent-ledger/integrity result blocks with zero DDL.
 * Finalizers are injectable for unit tests (default = DB writers).
 */
export async function processClaimedSchemaUpdateRun(
  run: SchemaUpdateRun,
  options?: {
    verify?: typeof verifyMainSchemaLedger;
    migrate?: typeof runMainSchemaMigrations;
    onIntegrityBlock?: (
      runId: string,
      message?: string
    ) => Promise<SchemaUpdateRun | null>;
    onMigrateComplete?: (
      runId: string,
      result: MainSchemaResult,
      pendingBefore: number
    ) => Promise<SchemaUpdateRun | null>;
  }
): Promise<{
  run: SchemaUpdateRun | null;
  ddlInvoked: boolean;
  result: MainSchemaResult | null;
}> {
  const verify = options?.verify ?? verifyMainSchemaLedger;
  const migrate = options?.migrate ?? runMainSchemaMigrations;
  const onIntegrityBlock = options?.onIntegrityBlock ?? markRunBlockedIntegrity;
  const onMigrateComplete = options?.onMigrateComplete ?? finalizeRunFromCanonicalResult;

  const before = await verify();
  const pendingBefore = before.missing.length;

  if (mustBlockRunWithoutDdl(before)) {
    const finalized = await onIntegrityBlock(run.id, safeBlockMessageForVerification(before));
    return { run: finalized, ddlInvoked: false, result: null };
  }

  const result = await migrate();
  const finalized = await onMigrateComplete(run.id, result, pendingBefore);
  return { run: finalized, ddlInvoked: true, result };
}

/** Source-level bootstrap constraint documentation for tests and operators. */
export const CONTROL_PLANE_BOOTSTRAP_DOC = [
  "BOOTSTRAP CONSTRAINT",
  "schema_update_runs is created by MAIN migration 2026_07_22_schema_update_control_plane",
  "Initial apply uses trusted release command only:",
  "MAIN_MIGRATION_RELEASE_MODE=true npm run db:migrate:main",
  "Settings control plane cannot apply its own bootstrap migration",
  "Canonical ledger remains promise_schema_migrations via main-schema-migrate.service",
].join("\n");
