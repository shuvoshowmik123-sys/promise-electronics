import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import {
  getCanonicalRegistryIdentity,
  type LedgerVerification,
  verifyMainSchemaLedger,
} from "./main-schema-migrate.service.js";

/**
 * Trusted forward baseline ledger (Git-versioned). Used only for audit classification.
 * Never used to rewrite live ledger rows or silently adopt checksums.
 */
export const TRUSTED_BASELINE_RELATIVE_PATH =
  "db-baselines/main-schema/v2026_07_20_corporate_declaration/manifest.json";

export type LedgerAuditClassification =
  | "healthy"
  | "pending_only"
  | "checksum_mismatch"
  | "unexpected_extra"
  | "incomplete_or_unavailable"
  | "baseline_live_checksum_drift";

export type LedgerAuditAvailability =
  | "ledger_readable"
  | "ledger_missing"
  | "authentication_rejected"
  | "tls_unavailable"
  | "connection_unavailable"
  | "audit_unavailable";

/** Redacted, browser-safe-enough for server logs / operator CLI only. Never includes SQL/URLs/checksums. */
export type RedactedLedgerReconciliationAudit = {
  auditVersion: "2";
  classification: LedgerAuditClassification;
  availability: LedgerAuditAvailability;
  blocked: boolean;
  counts: {
    registryCount: number;
    liveAppliedCount: number;
    missingCount: number;
    mismatchCount: number;
    extraCount: number;
    baselineEntryCount: number;
    baselineMissingFromLiveCount: number;
    baselineChecksumDisagreeCount: number;
    registryBeyondBaselineCount: number;
  };
  versions: {
    currentLiveVersion: string | null;
    registryHeadVersion: string | null;
    requiredVersion: string;
    baselineVersion: string;
    baselineRegistryHead: string | null;
  };
  /** Deterministic sha256 over the redacted classification payload (no secrets). */
  evidenceFingerprint: string;
  adoptionDecision: "not_performed";
  historicalLedgerMutation: "none";
};

function classifyLedgerAvailability(verification: LedgerVerification): LedgerAuditAvailability {
  const error = (verification.error || "").toLowerCase();
  if (!error || error.startsWith("missing migrations:") || error.startsWith("checksum mismatch:") || error.startsWith("unexpected ledger entries:")) {
    return "ledger_readable";
  }
  if (error.includes("ledger table does not exist")) return "ledger_missing";
  if (/password authentication|authentication failed|no pg_hba|role .* does not exist|scram/.test(error)) {
    return "authentication_rejected";
  }
  if (/certificate|tls|ssl/.test(error)) return "tls_unavailable";
  if (/connect|econnrefused|enotfound|timeout|econnreset|connection terminated|unavailable/.test(error)) {
    return "connection_unavailable";
  }
  return "audit_unavailable";
}

export type TrustedBaselineLedger = {
  baselineVersion: string;
  registryHead: string | null;
  migrations: Array<{ id: string; checksum: string }>;
};

type BaselineManifestShape = {
  baselineVersion?: string;
  registryHead?: string;
  migrations?: Array<{ id?: string; checksum?: string }>;
};

export function resolveTrustedBaselinePath(cwd: string = process.cwd()): string {
  return path.resolve(cwd, TRUSTED_BASELINE_RELATIVE_PATH);
}

export async function loadTrustedBaselineLedger(
  cwd: string = process.cwd()
): Promise<TrustedBaselineLedger> {
  const filePath = resolveTrustedBaselinePath(cwd);
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as BaselineManifestShape;
  const migrations = (parsed.migrations || [])
    .filter((m): m is { id: string; checksum: string } => Boolean(m?.id && m?.checksum))
    .map((m) => ({ id: m.id, checksum: m.checksum }));
  return {
    baselineVersion: parsed.baselineVersion || "unknown",
    registryHead: parsed.registryHead || null,
    migrations,
  };
}

/**
 * Pure classification from registry verify result + baseline vs live checksum identity.
 * Never mutates inputs. Never includes raw checksum strings in output.
 */
export function classifyLedgerReconciliation(input: {
  verification: LedgerVerification;
  baseline: TrustedBaselineLedger;
  liveChecksumById: Record<string, string>;
  registry?: ReturnType<typeof getCanonicalRegistryIdentity>;
}): RedactedLedgerReconciliationAudit {
  const registry = input.registry ?? getCanonicalRegistryIdentity();
  const verification = input.verification;
  const baseline = input.baseline;
  const live = input.liveChecksumById;

  const baselineIds = baseline.migrations.map((m) => m.id);
  const baselineChecksumById = new Map(baseline.migrations.map((m) => [m.id, m.checksum]));
  const baselineMissingFromLiveCount = baselineIds.filter((id) => live[id] === undefined).length;
  let baselineChecksumDisagreeCount = 0;
  for (const id of baselineIds) {
    const liveChecksum = live[id];
    const baselineChecksum = baselineChecksumById.get(id);
    if (liveChecksum !== undefined && baselineChecksum !== undefined && liveChecksum !== baselineChecksum) {
      baselineChecksumDisagreeCount += 1;
    }
  }

  const baselineHeadIndex = baseline.registryHead
    ? registry.ids.indexOf(baseline.registryHead)
    : -1;
  const registryBeyondBaselineCount =
    baselineHeadIndex >= 0 ? Math.max(0, registry.ids.length - baselineHeadIndex - 1) : 0;

  const mismatchCount = verification.mismatched.length;
  const extraCount = verification.extra.length;
  const missingCount = verification.missing.length;
  const availability = classifyLedgerAvailability(verification);

  const errLower = (verification.error || "").toLowerCase();
  const infraUnavailable =
    errLower.includes("ledger table does not exist") ||
    errLower.includes("database_url") ||
    errLower.includes("is not set") ||
    errLower.includes("connect") ||
    errLower.includes("econnrefused") ||
    errLower.includes("enotfound") ||
    errLower.includes("timeout") ||
    errLower.includes("unavailable") ||
    errLower.includes("econnreset") ||
    errLower.includes("connection terminated");

  let classification: LedgerAuditClassification = "incomplete_or_unavailable";
  if (infraUnavailable && mismatchCount === 0 && extraCount === 0) {
    classification = "incomplete_or_unavailable";
  } else if (mismatchCount > 0) {
    classification = "checksum_mismatch";
  } else if (extraCount > 0) {
    classification = "unexpected_extra";
  } else if (baselineChecksumDisagreeCount > 0) {
    // Live matches registry code but disagrees with trusted baseline snapshot (evidence only).
    classification = "baseline_live_checksum_drift";
  } else if (verification.ok) {
    classification = "healthy";
  } else if (
    missingCount > 0 &&
    mismatchCount === 0 &&
    extraCount === 0 &&
    verification.appliedIds.length > 0
  ) {
    // Pending-only only when a readable existing ledger has applied rows.
    classification = "pending_only";
  } else {
    classification = "incomplete_or_unavailable";
  }

  // Healthy is the only non-blocked classification. pending_only / mismatch / extra /
  // unavailable / baseline drift all remain blocked for auto-adoption (no silent override).
  // Protected runner uses isVerificationSafeToMigrate independently for pending-only DDL.
  const blocked = classification !== "healthy";

  const audit: Omit<RedactedLedgerReconciliationAudit, "evidenceFingerprint"> = {
    auditVersion: "2",
    classification,
    availability,
    blocked,
    counts: {
      registryCount: registry.ids.length,
      liveAppliedCount: verification.appliedIds.length,
      missingCount,
      mismatchCount,
      extraCount,
      baselineEntryCount: baseline.migrations.length,
      baselineMissingFromLiveCount,
      baselineChecksumDisagreeCount,
      registryBeyondBaselineCount,
    },
    versions: {
      currentLiveVersion: verification.currentVersion,
      registryHeadVersion: registry.headVersion,
      requiredVersion: registry.requiredVersion,
      baselineVersion: baseline.baselineVersion,
      baselineRegistryHead: baseline.registryHead,
    },
    adoptionDecision: "not_performed",
    historicalLedgerMutation: "none",
  };

  const evidenceFingerprint = computeEvidenceFingerprint(audit);
  return { ...audit, evidenceFingerprint };
}

export function computeEvidenceFingerprint(
  audit: Omit<RedactedLedgerReconciliationAudit, "evidenceFingerprint">
): string {
  const canonical = JSON.stringify({
    auditVersion: audit.auditVersion,
    classification: audit.classification,
    availability: audit.availability,
    blocked: audit.blocked,
    counts: audit.counts,
    versions: audit.versions,
    adoptionDecision: audit.adoptionDecision,
    historicalLedgerMutation: audit.historicalLedgerMutation,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 32);
}

/**
 * Assert redacted audit never contains forbidden material (used by tests and CLI self-check).
 * Safe classification labels (e.g. checksum_mismatch) and count field names
 * (baselineChecksumDisagreeCount) are allowed. Raw checksum *values* and a
 * `"checksum"` JSON field are not.
 */
export function assertAuditRedacted(audit: RedactedLedgerReconciliationAudit): void {
  const text = JSON.stringify(audit);
  if (/postgres(ql)?:\/\//i.test(text)) {
    throw new Error("Audit redaction failure: connection string present");
  }
  if (/password|DATABASE_URL|CREATE TABLE|ALTER TABLE|INSERT INTO|stack/i.test(text)) {
    throw new Error("Audit redaction failure: forbidden token present");
  }
  // Explicit checksum value field — redacted shape must not expose one.
  if (/"checksum"\s*:/i.test(text)) {
    throw new Error("Audit redaction failure: checksum field present");
  }
  // Reject standalone 16-char hex string values (migration checksum width), but allow
  // longer fingerprints and classification tokens that merely contain the word "checksum".
  if (/":\s*"[a-f0-9]{16}"/i.test(text)) {
    throw new Error("Audit redaction failure: raw 16-char hex checksum value present");
  }
}

/**
 * Run full server-only reconciliation audit against live DB + trusted baseline + registry.
 * Read-only. Never edits ledger rows, IDs, bodies, or stored checksums.
 */
export async function runLedgerReconciliationAudit(options?: {
  cwd?: string;
  verify?: typeof verifyMainSchemaLedger;
  loadBaseline?: typeof loadTrustedBaselineLedger;
  liveChecksumById?: Record<string, string>;
}): Promise<RedactedLedgerReconciliationAudit> {
  const verify = options?.verify ?? verifyMainSchemaLedger;
  const loadBaseline = options?.loadBaseline ?? loadTrustedBaselineLedger;
  const verification = await verify();
  const baseline = await loadBaseline(options?.cwd);

  let liveChecksumById = options?.liveChecksumById;
  if (!liveChecksumById) {
    liveChecksumById = await readLiveLedgerChecksumMap();
  }

  const audit = classifyLedgerReconciliation({
    verification,
    baseline,
    liveChecksumById,
  });
  assertAuditRedacted(audit);
  return audit;
}

async function readLiveLedgerChecksumMap(): Promise<Record<string, string>> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return {};
  const client = new pg.Client({
    connectionString: dbUrl,
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    const tableExists = await client.query(
      `SELECT to_regclass('public.promise_schema_migrations') AS reg`
    );
    if (!tableExists.rows[0]?.reg) return {};
    const ledgerRows = await client.query(`SELECT id, checksum FROM public.promise_schema_migrations`);
    const map: Record<string, string> = {};
    for (const row of ledgerRows.rows as Array<{ id: string; checksum: string }>) {
      map[row.id] = row.checksum;
    }
    return map;
  } catch {
    return {};
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Log a single redacted audit line for startup / operator visibility.
 * Does not throw; never prints raw verification errors or checksums.
 */
export async function logRedactedLedgerReconciliationAudit(
  verification?: LedgerVerification
): Promise<RedactedLedgerReconciliationAudit | null> {
  try {
    const audit = verification
      ? classifyLedgerReconciliation({
          verification,
          baseline: await loadTrustedBaselineLedger(),
          liveChecksumById: await readLiveLedgerChecksumMap(),
        })
      : await runLedgerReconciliationAudit();
    assertAuditRedacted(audit);
    console.log(
      `[LedgerAudit] classification=${audit.classification} blocked=${audit.blocked} ` +
        `liveApplied=${audit.counts.liveAppliedCount}/${audit.counts.registryCount} ` +
        `missing=${audit.counts.missingCount} mismatch=${audit.counts.mismatchCount} extra=${audit.counts.extraCount} ` +
        `baselineDisagree=${audit.counts.baselineChecksumDisagreeCount} ` +
        `current=${audit.versions.currentLiveVersion ?? "none"} registry=${audit.versions.registryHeadVersion ?? "none"} ` +
        `baseline=${audit.versions.baselineVersion} fingerprint=${audit.evidenceFingerprint} ` +
        `adoption=${audit.adoptionDecision} mutation=${audit.historicalLedgerMutation}`
    );
    return audit;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error(
      `[LedgerAudit] reconciliation audit unavailable (read-only; no DDL). reason=${msg.slice(0, 120)}`
    );
    return null;
  }
}
