import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  activateAdoptionExpectedChecksumSession,
  clearAdoptionExpectedChecksumSession,
  getAdoptionExpectedChecksumSession,
} from "./adoption-expected-checksum-session.js";
import {
  loadTrustedBaselineLedger,
  resolveTrustedBaselinePath,
  TRUSTED_BASELINE_RELATIVE_PATH,
  type TrustedBaselineLedger,
} from "./ledger-reconciliation-audit.service.js";
import {
  getCanonicalRegistryIdentity,
  MAIN_SCHEMA_MIGRATIONS,
  computeMigrationChecksum,
} from "./main-schema-migrate.service.js";

/**
 * Explicit local-disposable-only historical baseline adoption (two-identity model).
 *
 * Identity A — baseline ledger checksums from trusted baseline manifest (historic expected ledger values).
 * Identity B — Git-versioned frozen *current source identity* manifest (id → sourceChecksum).
 *
 * Verification order (fail-closed):
 * 1. MAIN_SCHEMA_TRUST_BASELINE_ADOPTION=true
 * 2. Local host + database name prefix qa_schema_update_ (reject Neon/Aiven/prod/ordinary dev)
 * 3. Baseline SQL artifact hashes match Git manifest
 * 4. Current computeMigrationChecksum matches B for every adopted historic id (NOT compared to A)
 * 5. Only then accept A as expected ledger checksums for those ids (session activation for canonical verify/migrate)
 *
 * Never rewrites historic ledger rows/ids/bodies/checksums.
 * Never auto-generates B at acceptance time.
 * Never invoked from normal server startup.
 */

export const MAIN_SCHEMA_TRUST_BASELINE_ADOPTION_ENV =
  "MAIN_SCHEMA_TRUST_BASELINE_ADOPTION";
export const DISPOSABLE_ADOPTION_DB_PREFIX = "qa_schema_update_";
export const TRUSTED_BASELINE_DIR_RELATIVE =
  "db-baselines/main-schema/v2026_07_20_corporate_declaration";
export const FROZEN_SOURCE_IDENTITY_RELATIVE =
  "db-baselines/main-schema/v2026_07_20_corporate_declaration/frozen-source-identity.json";

export type AdoptionTargetClass =
  | "local_disposable"
  | "local_non_disposable"
  | "remote"
  | "cloud_managed"
  | "production_like"
  | "invalid";

export type BaselineAdoptionGate = {
  allowed: boolean;
  reason: string | null;
  optIn: boolean;
  targetClass: AdoptionTargetClass;
  databaseNamePrefixOk: boolean;
  isLocal: boolean;
};

export type ManifestIntegrityResult = {
  ok: boolean;
  schemaSqlOk: boolean;
  ledgerSqlOk: boolean;
  reason: string | null;
};

export type FrozenSourceIdentityResult = {
  ok: boolean;
  adoptedCount: number;
  identityMismatchCount: number;
  missingFromRegistryCount: number;
  missingFromFrozenCount: number;
  reason: string | null;
};

/** Redacted adoption decision — no checksums, SQL, URLs, or secrets. */
export type BaselineAdoptionVerification = {
  auditVersion: "2";
  ok: boolean;
  adoptionDecision: "accepted" | "rejected" | "not_eligible";
  historicalLedgerMutation: "none";
  expectedHistoricChecksumsAccepted: boolean;
  /** True when A (baseline ledger) was allowed as expected ledger checksums after B verified. */
  baselineLedgerIdentityAccepted: boolean;
  gate: BaselineAdoptionGate;
  manifestIntegrity: ManifestIntegrityResult;
  frozenSourceIdentity: FrozenSourceIdentityResult;
  versions: {
    baselineVersion: string;
    baselineRegistryHead: string | null;
    registryHeadVersion: string | null;
    requiredVersion: string;
    adoptedHistoricCount: number;
    frozenSourceIdentityVersion: string | null;
  };
  evidenceFingerprint: string;
  reasons: string[];
};

export type FrozenSourceIdentityManifest = {
  schemaVersion: number;
  baselineVersion: string;
  registryHead: string | null;
  identityKind: string;
  /** id → frozen current source checksum (identity B). */
  migrations: Array<{ id: string; sourceChecksum: string }>;
};

type BaselineManifestFiles = {
  baselineVersion?: string;
  registryHead?: string;
  files?: {
    "schema.sql"?: { sha256?: string };
    "promise-schema-migrations.sql"?: { sha256?: string };
  };
  migrations?: Array<{ id?: string; checksum?: string }>;
};

export function parseDatabaseUrl(rawUrl: string | undefined): {
  valid: boolean;
  host: string | null;
  databaseName: string | null;
  isLocal: boolean;
  isAivenOrNeon: boolean;
  isCloudManaged: boolean;
} {
  if (!rawUrl) {
    return {
      valid: false,
      host: null,
      databaseName: null,
      isLocal: false,
      isAivenOrNeon: false,
      isCloudManaged: false,
    };
  }
  try {
    const url = new URL(rawUrl);
    const host = (url.hostname || "").toLowerCase();
    if (!host) {
      return {
        valid: false,
        host: null,
        databaseName: null,
        isLocal: false,
        isAivenOrNeon: false,
        isCloudManaged: false,
      };
    }
    const protocol = (url.protocol || "").replace(/:$/, "").toLowerCase();
    if (protocol !== "postgres" && protocol !== "postgresql") {
      return {
        valid: false,
        host,
        databaseName: null,
        isLocal: false,
        isAivenOrNeon: false,
        isCloudManaged: false,
      };
    }
    const databaseName = decodeURIComponent(
      (url.pathname || "").replace(/^\//, "").split("/")[0] || ""
    );
    const isLocal = host === "localhost" || host === "127.0.0.1";
    const isAivenOrNeon =
      host.includes("aivencloud.com") ||
      host.includes("aiven.io") ||
      host.includes("neon.tech");
    const isCloudManaged =
      isAivenOrNeon ||
      host.includes("render.com") ||
      host.includes("supabase.co") ||
      host.includes("amazonaws.com") ||
      host.includes("azure.com") ||
      host.includes("gcp.") ||
      host.endsWith(".rds.amazonaws.com");
    return {
      valid: true,
      host,
      databaseName: databaseName || null,
      isLocal,
      isAivenOrNeon,
      isCloudManaged,
    };
  } catch {
    return {
      valid: false,
      host: null,
      databaseName: null,
      isLocal: false,
      isAivenOrNeon: false,
      isCloudManaged: false,
    };
  }
}

export function isDisposableAdoptionDatabaseName(name: string | null | undefined): boolean {
  if (!name) return false;
  return name.startsWith(DISPOSABLE_ADOPTION_DB_PREFIX);
}

export function evaluateBaselineAdoptionGate(
  env: NodeJS.ProcessEnv = process.env,
  databaseUrl: string | undefined = env.DATABASE_URL
): BaselineAdoptionGate {
  const optIn = env[MAIN_SCHEMA_TRUST_BASELINE_ADOPTION_ENV] === "true";
  if (!optIn) {
    return {
      allowed: false,
      reason:
        "Baseline adoption requires MAIN_SCHEMA_TRUST_BASELINE_ADOPTION=true (explicit local disposable opt-in).",
      optIn: false,
      targetClass: "invalid",
      databaseNamePrefixOk: false,
      isLocal: false,
    };
  }

  if (env.NODE_ENV === "production") {
    return {
      allowed: false,
      reason: "Baseline adoption is forbidden when NODE_ENV=production.",
      optIn: true,
      targetClass: "production_like",
      databaseNamePrefixOk: false,
      isLocal: false,
    };
  }

  const parsed = parseDatabaseUrl(databaseUrl);
  if (!parsed.valid || !parsed.databaseName) {
    return {
      allowed: false,
      reason: "Baseline adoption requires a valid local PostgreSQL DATABASE_URL with a database name.",
      optIn: true,
      targetClass: "invalid",
      databaseNamePrefixOk: false,
      isLocal: false,
    };
  }

  if (parsed.isAivenOrNeon || parsed.isCloudManaged) {
    return {
      allowed: false,
      reason: "Baseline adoption rejects Neon, Aiven, and other cloud-managed database targets.",
      optIn: true,
      targetClass: "cloud_managed",
      databaseNamePrefixOk: false,
      isLocal: false,
    };
  }

  if (!parsed.isLocal) {
    return {
      allowed: false,
      reason: "Baseline adoption rejects non-local database hosts.",
      optIn: true,
      targetClass: "remote",
      databaseNamePrefixOk: false,
      isLocal: false,
    };
  }

  const databaseNamePrefixOk = isDisposableAdoptionDatabaseName(parsed.databaseName);
  if (!databaseNamePrefixOk) {
    return {
      allowed: false,
      reason: `Baseline adoption requires database name prefix ${DISPOSABLE_ADOPTION_DB_PREFIX} (ordinary development databases are not eligible).`,
      optIn: true,
      targetClass: "local_non_disposable",
      databaseNamePrefixOk: false,
      isLocal: true,
    };
  }

  return {
    allowed: true,
    reason: null,
    optIn: true,
    targetClass: "local_disposable",
    databaseNamePrefixOk: true,
    isLocal: true,
  };
}

function sha256Hex(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function resolveFrozenSourceIdentityPath(cwd: string = process.cwd()): string {
  return path.resolve(cwd, FROZEN_SOURCE_IDENTITY_RELATIVE);
}

export async function loadFrozenSourceIdentityManifest(
  cwd: string = process.cwd()
): Promise<FrozenSourceIdentityManifest> {
  const filePath = resolveFrozenSourceIdentityPath(cwd);
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as {
    schemaVersion?: number;
    baselineVersion?: string;
    registryHead?: string;
    identityKind?: string;
    migrations?: Array<{ id?: string; sourceChecksum?: string }>;
  };
  const migrations = (parsed.migrations || [])
    .filter((m): m is { id: string; sourceChecksum: string } =>
      Boolean(m?.id && m?.sourceChecksum)
    )
    .map((m) => ({ id: m.id, sourceChecksum: m.sourceChecksum }));
  return {
    schemaVersion: parsed.schemaVersion ?? 1,
    baselineVersion: parsed.baselineVersion || "unknown",
    registryHead: parsed.registryHead || null,
    identityKind: parsed.identityKind || "current_source_checksum_v1",
    migrations,
  };
}

export async function verifyBaselineManifestFileIntegrity(
  cwd: string = process.cwd()
): Promise<ManifestIntegrityResult> {
  try {
    const baselineDir = path.resolve(cwd, TRUSTED_BASELINE_DIR_RELATIVE);
    const manifestPath = resolveTrustedBaselinePath(cwd);
    const raw = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw) as BaselineManifestFiles;
    const expectedSchema = manifest.files?.["schema.sql"]?.sha256;
    const expectedLedger = manifest.files?.["promise-schema-migrations.sql"]?.sha256;
    if (!expectedSchema || !expectedLedger) {
      return {
        ok: false,
        schemaSqlOk: false,
        ledgerSqlOk: false,
        reason: "Baseline manifest is missing required file sha256 entries.",
      };
    }

    const schemaBuf = await readFile(path.join(baselineDir, "schema.sql"));
    const ledgerBuf = await readFile(path.join(baselineDir, "promise-schema-migrations.sql"));
    const schemaSqlOk = sha256Hex(schemaBuf) === expectedSchema;
    const ledgerSqlOk = sha256Hex(ledgerBuf) === expectedLedger;

    if (!schemaSqlOk || !ledgerSqlOk) {
      return {
        ok: false,
        schemaSqlOk,
        ledgerSqlOk,
        reason: "Baseline SQL file hash does not match Git-versioned manifest (integrity failure).",
      };
    }

    return { ok: true, schemaSqlOk: true, ledgerSqlOk: true, reason: null };
  } catch {
    return {
      ok: false,
      schemaSqlOk: false,
      ledgerSqlOk: false,
      reason: "Baseline manifest or SQL artifacts could not be read for integrity verification.",
    };
  }
}

/**
 * Identity B check: current source checksum must match frozen source identity (B).
 * Does NOT compare current source to baseline ledger checksums (A).
 * A and B are allowed (and expected) to differ for historical drift.
 */
export function verifyFrozenSourceIdentities(
  baseline: TrustedBaselineLedger,
  frozen: FrozenSourceIdentityManifest,
  registry: ReturnType<typeof getCanonicalRegistryIdentity> = getCanonicalRegistryIdentity()
): FrozenSourceIdentityResult {
  if (baseline.migrations.length === 0) {
    return {
      ok: false,
      adoptedCount: 0,
      identityMismatchCount: 0,
      missingFromRegistryCount: 0,
      missingFromFrozenCount: 0,
      reason: "Baseline contains no historic migrations to adopt.",
    };
  }

  if (frozen.migrations.length === 0) {
    return {
      ok: false,
      adoptedCount: 0,
      identityMismatchCount: 0,
      missingFromRegistryCount: 0,
      missingFromFrozenCount: baseline.migrations.length,
      reason:
        "Frozen source identity manifest is empty. Commit a reviewed frozen-source-identity.json (do not generate at acceptance time).",
    };
  }

  const frozenById = new Map(frozen.migrations.map((m) => [m.id, m.sourceChecksum]));
  let identityMismatchCount = 0;
  let missingFromRegistryCount = 0;
  let missingFromFrozenCount = 0;
  let adoptedCount = 0;

  for (const entry of baseline.migrations) {
    const current = registry.checksumById[entry.id];
    if (current === undefined) {
      missingFromRegistryCount += 1;
      continue;
    }
    const frozenChecksum = frozenById.get(entry.id);
    if (frozenChecksum === undefined) {
      missingFromFrozenCount += 1;
      continue;
    }
    adoptedCount += 1;
    // Compare current source to B only — never to A (entry.checksum).
    if (current !== frozenChecksum) {
      identityMismatchCount += 1;
    }
  }

  if (missingFromRegistryCount > 0) {
    return {
      ok: false,
      adoptedCount,
      identityMismatchCount,
      missingFromRegistryCount,
      missingFromFrozenCount,
      reason: "One or more baseline historic migrations are missing from the canonical MAIN registry.",
    };
  }

  if (missingFromFrozenCount > 0) {
    return {
      ok: false,
      adoptedCount,
      identityMismatchCount,
      missingFromRegistryCount: 0,
      missingFromFrozenCount,
      reason:
        "Frozen source identity manifest is missing one or more adopted historic migration ids.",
    };
  }

  if (identityMismatchCount > 0) {
    return {
      ok: false,
      adoptedCount,
      identityMismatchCount,
      missingFromRegistryCount: 0,
      missingFromFrozenCount: 0,
      reason:
        "Frozen source identity mismatch: an adopted historic migration body changed since the reviewed frozen source identity (B). Adoption blocked.",
    };
  }

  return {
    ok: true,
    adoptedCount,
    identityMismatchCount: 0,
    missingFromRegistryCount: 0,
    missingFromFrozenCount: 0,
    reason: null,
  };
}

/**
 * Pure helper for tests: prove that A may differ from current while B matches current.
 * Does not expose raw values in redacted adoption output.
 */
export function countBaselineLedgerVsCurrentDisagreements(
  baseline: TrustedBaselineLedger,
  registry: ReturnType<typeof getCanonicalRegistryIdentity> = getCanonicalRegistryIdentity()
): number {
  let n = 0;
  for (const entry of baseline.migrations) {
    const current = registry.checksumById[entry.id];
    if (current !== undefined && current !== entry.checksum) n += 1;
  }
  return n;
}

export function computeAdoptionEvidenceFingerprint(
  audit: Omit<BaselineAdoptionVerification, "evidenceFingerprint">
): string {
  const canonical = JSON.stringify({
    auditVersion: audit.auditVersion,
    ok: audit.ok,
    adoptionDecision: audit.adoptionDecision,
    historicalLedgerMutation: audit.historicalLedgerMutation,
    expectedHistoricChecksumsAccepted: audit.expectedHistoricChecksumsAccepted,
    baselineLedgerIdentityAccepted: audit.baselineLedgerIdentityAccepted,
    gate: {
      allowed: audit.gate.allowed,
      optIn: audit.gate.optIn,
      targetClass: audit.gate.targetClass,
      databaseNamePrefixOk: audit.gate.databaseNamePrefixOk,
      isLocal: audit.gate.isLocal,
    },
    manifestIntegrity: {
      ok: audit.manifestIntegrity.ok,
      schemaSqlOk: audit.manifestIntegrity.schemaSqlOk,
      ledgerSqlOk: audit.manifestIntegrity.ledgerSqlOk,
    },
    frozenSourceIdentity: {
      ok: audit.frozenSourceIdentity.ok,
      adoptedCount: audit.frozenSourceIdentity.adoptedCount,
      identityMismatchCount: audit.frozenSourceIdentity.identityMismatchCount,
      missingFromRegistryCount: audit.frozenSourceIdentity.missingFromRegistryCount,
      missingFromFrozenCount: audit.frozenSourceIdentity.missingFromFrozenCount,
    },
    versions: audit.versions,
    reasons: audit.reasons,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 32);
}

/**
 * Full disposable-only adoption verification (does not activate session).
 * When ok, identity A (baseline ledger checksums) may be accepted as expected ledger values.
 */
export async function verifyBaselineAdoption(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  databaseUrl?: string;
  loadBaseline?: typeof loadTrustedBaselineLedger;
  loadFrozen?: typeof loadFrozenSourceIdentityManifest;
  verifyManifest?: typeof verifyBaselineManifestFileIntegrity;
  registry?: ReturnType<typeof getCanonicalRegistryIdentity>;
}): Promise<BaselineAdoptionVerification> {
  const env = options?.env ?? process.env;
  const databaseUrl = options?.databaseUrl ?? env.DATABASE_URL;
  const cwd = options?.cwd ?? process.cwd();
  const loadBaseline = options?.loadBaseline ?? loadTrustedBaselineLedger;
  const loadFrozen = options?.loadFrozen ?? loadFrozenSourceIdentityManifest;
  const verifyManifest = options?.verifyManifest ?? verifyBaselineManifestFileIntegrity;
  const registry = options?.registry ?? getCanonicalRegistryIdentity();

  const gate = evaluateBaselineAdoptionGate(env, databaseUrl);
  const reasons: string[] = [];

  let baseline: TrustedBaselineLedger = {
    baselineVersion: "unknown",
    registryHead: null,
    migrations: [],
  };
  let frozenVersion: string | null = null;
  let manifestIntegrity: ManifestIntegrityResult = {
    ok: false,
    schemaSqlOk: false,
    ledgerSqlOk: false,
    reason: "Manifest integrity not evaluated.",
  };
  let frozenSourceIdentity: FrozenSourceIdentityResult = {
    ok: false,
    adoptedCount: 0,
    identityMismatchCount: 0,
    missingFromRegistryCount: 0,
    missingFromFrozenCount: 0,
    reason: "Frozen source identity not evaluated.",
  };

  if (!gate.allowed) {
    if (gate.reason) reasons.push(gate.reason);
  } else {
    manifestIntegrity = await verifyManifest(cwd);
    if (!manifestIntegrity.ok && manifestIntegrity.reason) {
      reasons.push(manifestIntegrity.reason);
    }

    try {
      baseline = await loadBaseline(cwd);
    } catch {
      reasons.push("Trusted baseline ledger could not be loaded.");
      baseline = { baselineVersion: "unknown", registryHead: null, migrations: [] };
    }

    let frozen: FrozenSourceIdentityManifest = {
      schemaVersion: 1,
      baselineVersion: "unknown",
      registryHead: null,
      identityKind: "current_source_checksum_v1",
      migrations: [],
    };
    try {
      frozen = await loadFrozen(cwd);
      frozenVersion = frozen.baselineVersion;
    } catch {
      reasons.push("Frozen source identity manifest could not be loaded.");
    }

    if (manifestIntegrity.ok) {
      frozenSourceIdentity = verifyFrozenSourceIdentities(baseline, frozen, registry);
      if (!frozenSourceIdentity.ok && frozenSourceIdentity.reason) {
        reasons.push(frozenSourceIdentity.reason);
      }
    } else {
      frozenSourceIdentity = {
        ok: false,
        adoptedCount: 0,
        identityMismatchCount: 0,
        missingFromRegistryCount: 0,
        missingFromFrozenCount: 0,
        reason: "Skipped frozen source identity because manifest integrity failed.",
      };
      reasons.push(frozenSourceIdentity.reason!);
    }
  }

  const baselineLedgerIdentityAccepted =
    gate.allowed &&
    manifestIntegrity.ok &&
    frozenSourceIdentity.ok &&
    baseline.migrations.length > 0;

  const expectedHistoricChecksumsAccepted = baselineLedgerIdentityAccepted;
  const ok = expectedHistoricChecksumsAccepted;
  const adoptionDecision: BaselineAdoptionVerification["adoptionDecision"] = ok
    ? "accepted"
    : gate.optIn
      ? "rejected"
      : "not_eligible";

  if (ok) {
    reasons.push(
      "Disposable baseline adoption accepted: baseline SQL integrity + frozen source identity (B) verified. Baseline ledger checksums (A) may be used as expected ledger values for adopted historic ids (no mutation)."
    );
  }

  const audit: Omit<BaselineAdoptionVerification, "evidenceFingerprint"> = {
    auditVersion: "2",
    ok,
    adoptionDecision,
    historicalLedgerMutation: "none",
    expectedHistoricChecksumsAccepted,
    baselineLedgerIdentityAccepted,
    gate: {
      allowed: gate.allowed,
      reason: gate.reason,
      optIn: gate.optIn,
      targetClass: gate.targetClass,
      databaseNamePrefixOk: gate.databaseNamePrefixOk,
      isLocal: gate.isLocal,
    },
    manifestIntegrity: {
      ok: manifestIntegrity.ok,
      schemaSqlOk: manifestIntegrity.schemaSqlOk,
      ledgerSqlOk: manifestIntegrity.ledgerSqlOk,
      reason: manifestIntegrity.reason,
    },
    frozenSourceIdentity: {
      ok: frozenSourceIdentity.ok,
      adoptedCount: frozenSourceIdentity.adoptedCount,
      identityMismatchCount: frozenSourceIdentity.identityMismatchCount,
      missingFromRegistryCount: frozenSourceIdentity.missingFromRegistryCount,
      missingFromFrozenCount: frozenSourceIdentity.missingFromFrozenCount,
      reason: frozenSourceIdentity.reason,
    },
    versions: {
      baselineVersion: baseline.baselineVersion,
      baselineRegistryHead: baseline.registryHead,
      registryHeadVersion: registry.headVersion,
      requiredVersion: registry.requiredVersion,
      adoptedHistoricCount: baseline.migrations.length,
      frozenSourceIdentityVersion: frozenVersion,
    },
    reasons,
  };

  return { ...audit, evidenceFingerprint: computeAdoptionEvidenceFingerprint(audit) };
}

/**
 * Verify adoption and activate process-local expected ledger checksum session (A).
 * Fail-closed: clears any prior session first; only activates on full success.
 */
export async function activateDisposableBaselineAdoption(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  databaseUrl?: string;
  loadBaseline?: typeof loadTrustedBaselineLedger;
  loadFrozen?: typeof loadFrozenSourceIdentityManifest;
  verifyManifest?: typeof verifyBaselineManifestFileIntegrity;
  registry?: ReturnType<typeof getCanonicalRegistryIdentity>;
}): Promise<{
  verification: BaselineAdoptionVerification;
  sessionActive: boolean;
  expectedById: Record<string, string> | null;
}> {
  clearAdoptionExpectedChecksumSession();
  const verification = await verifyBaselineAdoption(options);
  if (!verification.ok || !verification.expectedHistoricChecksumsAccepted) {
    return { verification, sessionActive: false, expectedById: null };
  }

  const loadBaseline = options?.loadBaseline ?? loadTrustedBaselineLedger;
  const baseline = await loadBaseline(options?.cwd);
  const expectedById: Record<string, string> = {};
  for (const m of baseline.migrations) {
    expectedById[m.id] = m.checksum;
  }
  activateAdoptionExpectedChecksumSession({
    expectedLedgerChecksumById: expectedById,
    baselineVersion: baseline.baselineVersion,
  });
  return {
    verification,
    sessionActive: true,
    expectedById,
  };
}

export function deactivateDisposableBaselineAdoption(): void {
  clearAdoptionExpectedChecksumSession();
}

export async function getAcceptedExpectedHistoricChecksums(options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  databaseUrl?: string;
}): Promise<{
  accepted: boolean;
  verification: BaselineAdoptionVerification;
  expectedById: Record<string, string> | null;
}> {
  const verification = await verifyBaselineAdoption(options);
  if (!verification.expectedHistoricChecksumsAccepted) {
    return { accepted: false, verification, expectedById: null };
  }
  const baseline = await loadTrustedBaselineLedger(options?.cwd);
  const expectedById: Record<string, string> = {};
  for (const m of baseline.migrations) {
    expectedById[m.id] = m.checksum;
  }
  return { accepted: true, verification, expectedById };
}

export function assertRestoredLedgerMatchesExpected(
  liveChecksumById: Record<string, string>,
  expectedById: Record<string, string>
): { ok: boolean; missingCount: number; disagreeCount: number; extraHistoricCount: number } {
  let missingCount = 0;
  let disagreeCount = 0;
  for (const [id, expected] of Object.entries(expectedById)) {
    const live = liveChecksumById[id];
    if (live === undefined) {
      missingCount += 1;
    } else if (live !== expected) {
      disagreeCount += 1;
    }
  }
  const expectedIds = new Set(Object.keys(expectedById));
  let extraHistoricCount = 0;
  for (const id of Object.keys(liveChecksumById)) {
    if (!expectedIds.has(id) && MAIN_SCHEMA_MIGRATIONS.some((m) => m.id === id) === false) {
      extraHistoricCount += 1;
    }
  }
  return {
    ok: missingCount === 0 && disagreeCount === 0,
    missingCount,
    disagreeCount,
    extraHistoricCount,
  };
}

export function assertAdoptionVerificationRedacted(verification: BaselineAdoptionVerification): void {
  const text = JSON.stringify(verification);
  if (/postgres(ql)?:\/\//i.test(text)) {
    throw new Error("Adoption redaction failure: connection string present");
  }
  if (/password|DATABASE_URL|CREATE TABLE|ALTER TABLE|INSERT INTO/i.test(text)) {
    throw new Error("Adoption redaction failure: forbidden token present");
  }
  if (/"checksum"\s*:/i.test(text)) {
    throw new Error("Adoption redaction failure: checksum field present");
  }
  if (/"sourceChecksum"\s*:/i.test(text)) {
    throw new Error("Adoption redaction failure: sourceChecksum field present");
  }
  if (/":\s*"[a-f0-9]{16}"/i.test(text)) {
    throw new Error("Adoption redaction failure: raw 16-char hex checksum value present");
  }
}

export const BASELINE_ADOPTION_DOC = [
  "DISPOSABLE BASELINE ADOPTION (local test only) — two-identity model",
  `Requires ${MAIN_SCHEMA_TRUST_BASELINE_ADOPTION_ENV}=true`,
  `Database name must start with ${DISPOSABLE_ADOPTION_DB_PREFIX}`,
  "Local host only; reject Neon/Aiven/production/ordinary dev DB",
  `Trusted baseline (A ledger): ${TRUSTED_BASELINE_RELATIVE_PATH}`,
  `Frozen source identity (B): ${FROZEN_SOURCE_IDENTITY_RELATIVE}`,
  "Verify Git SQL hashes + current source against B (never B vs A)",
  "Only then accept A as expected ledger checksums for adopted historic ids",
  "Never rewrite historic ledger rows/ids/bodies/checksums",
  "Never generate B at acceptance time (Git-reviewed static file only)",
  "Normal startup remains read-only; adoption is never automatic",
  "Canonical executor remains runMainSchemaMigrations / promise_schema_migrations",
].join("\n");

export function computeCurrentSourceIdentity(migrationId: string): string | null {
  const migration = MAIN_SCHEMA_MIGRATIONS.find((m) => m.id === migrationId);
  if (!migration) return null;
  return computeMigrationChecksum(migration);
}

export { getAdoptionExpectedChecksumSession };
