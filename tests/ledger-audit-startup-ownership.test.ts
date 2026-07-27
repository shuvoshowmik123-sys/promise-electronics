import { describe, expect, it, vi } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import {
  assertAuditRedacted,
  classifyLedgerReconciliation,
  computeEvidenceFingerprint,
  loadTrustedBaselineLedger,
  runLedgerReconciliationAudit,
  TRUSTED_BASELINE_RELATIVE_PATH,
  type TrustedBaselineLedger,
} from "../server/services/ledger-reconciliation-audit.service.js";
import {
  getCanonicalRegistryIdentity,
  MAIN_SCHEMA_MIGRATIONS,
  REQUIRED_MAIN_SCHEMA_VERSION,
  type LedgerVerification,
} from "../server/services/main-schema-migrate.service.js";
import {
  isVerificationSafeToMigrate,
  mustBlockRunWithoutDdl,
  processClaimedSchemaUpdateRun,
  type SchemaUpdateRun,
} from "../server/services/schema-update-run.service.js";

function verification(overrides: Partial<LedgerVerification> = {}): LedgerVerification {
  return {
    ok: true,
    missing: [],
    mismatched: [],
    extra: [],
    appliedIds: ["0000_promise_schema_migrations_ledger"],
    currentVersion: "0000_promise_schema_migrations_ledger",
    error: null,
    ...overrides,
  };
}

function baseRun(overrides: Partial<SchemaUpdateRun> = {}): SchemaUpdateRun {
  return {
    id: "run-audit-1",
    status: "running",
    requestedBy: "sa-1",
    requestedAt: new Date("2026-07-22T10:00:00.000Z"),
    confirmedAt: new Date("2026-07-22T10:00:00.000Z"),
    startedAt: new Date("2026-07-22T10:00:01.000Z"),
    finishedAt: null,
    requestSource: "super_admin_settings",
    releaseVersion: "1.0.0",
    targetPendingCount: 1,
    appliedCount: null,
    errorCategory: null,
    errorMessage: null,
    resultSummary: null,
    ...overrides,
  };
}

function sampleBaseline(overrides: Partial<TrustedBaselineLedger> = {}): TrustedBaselineLedger {
  return {
    baselineVersion: "v2026_07_20_corporate_declaration",
    registryHead: "2026_07_20_corporate_declaration",
    migrations: [
      { id: "0000_promise_schema_migrations_ledger", checksum: "baseline0000aaaa" },
      { id: "2026_07_20_corporate_declaration", checksum: "baselineheadbbbb" },
    ],
    ...overrides,
  };
}

describe("Startup ownership — no MAIN DDL from normal server boot", () => {
  it("server/index.ts never calls runMainSchemaMigrations in startup path", async () => {
    const src = await readFile(path.resolve(process.cwd(), "server/index.ts"), "utf8");
    expect(src).not.toMatch(/runMainSchemaMigrations\s*\(/);
    expect(src).not.toMatch(/from \"\.\/services\/main-schema-migrate\.service\.js\".*runMainSchemaMigrations/);
    expect(src).toMatch(/verifyMainSchemaLedger/);
    expect(src).toMatch(/read-only MAIN schema ledger verification \(no DDL in any environment\)/);
    expect(src).toMatch(/logRedactedLedgerReconciliationAudit/);
    // Dev and production share verify-only path
    expect(src).toMatch(/verifyMainSchemaReadOnly/);
    expect(src).not.toMatch(/server may auto-apply migrations/);
  });

  it("ALLOW_SKIP_MIGRATIONS_AS_READY is test-only and cannot mark development ready", async () => {
    const src = await readFile(path.resolve(process.cwd(), "server/index.ts"), "utf8");
    // Skip-as-ready requires NODE_ENV === "test" (not merely non-production).
    expect(src).toMatch(
      /ALLOW_SKIP_MIGRATIONS_AS_READY\s*===\s*["']true["'][\s\S]{0,120}NODE_ENV\s*===\s*["']test["']/
    );
    expect(src).not.toMatch(
      /ALLOW_SKIP_MIGRATIONS_AS_READY\s*===\s*["']true["']\s*&&\s*!isProduction/
    );
    // Development / production SKIP path always verify-only (cannot short-circuit to ready).
    expect(src).toMatch(/verifyMainSchemaReadOnly\(["']SKIP_STARTUP_MIGRATIONS["']\)/);
    expect(src).toMatch(/NODE_ENV\s*===\s*["']test["']/);
    // Log line documents test harness only
    expect(src).toMatch(/test harness only/i);
  });

  it("db:migrate:main release CLI remains the MAIN DDL entry for trusted apply", async () => {
    const src = await readFile(path.resolve(process.cwd(), "server/db-migrate-main.ts"), "utf8");
    expect(src).toMatch(/runMainSchemaMigrations/);
    expect(src).toMatch(/MAIN_MIGRATION_RELEASE_MODE/);
  });

  it("protected runner remains the runtime executor after control-plane claim", async () => {
    const runnerSrc = await readFile(
      path.resolve(process.cwd(), "scripts/protected-schema-runner.ts"),
      "utf8"
    );
    expect(runnerSrc).toMatch(/processClaimedSchemaUpdateRun/);
    const svcSrc = await readFile(
      path.resolve(process.cwd(), "server/services/schema-update-run.service.ts"),
      "utf8"
    );
    expect(svcSrc).toMatch(/runMainSchemaMigrations/);
    expect(svcSrc).toMatch(/mustBlockRunWithoutDdl/);
  });
});

describe("Ledger reconciliation audit — classification and redaction", () => {
  it("loads trusted baseline from Git-versioned manifest", async () => {
    const baseline = await loadTrustedBaselineLedger();
    expect(baseline.baselineVersion).toBe("v2026_07_20_corporate_declaration");
    expect(baseline.registryHead).toBe("2026_07_20_corporate_declaration");
    expect(baseline.migrations.length).toBeGreaterThan(10);
    expect(baseline.migrations[0]?.id).toBe("0000_promise_schema_migrations_ledger");
    expect(TRUSTED_BASELINE_RELATIVE_PATH).toMatch(/db-baselines/);
  });

  it("classifies checksum mismatch as blocked without exposing hashes or SQL", () => {
    const registry = getCanonicalRegistryIdentity();
    const audit = classifyLedgerReconciliation({
      verification: verification({
        ok: false,
        mismatched: [{ id: "2026_07_17_b2b_rule_profile", ledger: "deadbeefdeadbeef", code: "cafecafecafecafe" }],
        appliedIds: ["0000_promise_schema_migrations_ledger"],
        currentVersion: "0000_promise_schema_migrations_ledger",
        error: "Checksum mismatch: 2026_07_17_b2b_rule_profile",
      }),
      baseline: sampleBaseline(),
      liveChecksumById: {
        "0000_promise_schema_migrations_ledger": "baseline0000aaaa",
        "2026_07_17_b2b_rule_profile": "deadbeefdeadbeef",
      },
      registry,
    });

    expect(audit.classification).toBe("checksum_mismatch");
    expect(audit.blocked).toBe(true);
    expect(audit.counts.mismatchCount).toBe(1);
    expect(audit.versions.registryHeadVersion).toBe(REQUIRED_MAIN_SCHEMA_VERSION);
    expect(audit.versions.currentLiveVersion).toBe("0000_promise_schema_migrations_ledger");
    expect(audit.adoptionDecision).toBe("not_performed");
    expect(audit.historicalLedgerMutation).toBe("none");
    expect(audit.evidenceFingerprint).toMatch(/^[a-f0-9]{32}$/);

    const text = JSON.stringify(audit);
    // Raw checksum *values* and secrets must not appear; classification labels may contain "checksum".
    expect(text).not.toMatch(/deadbeefdeadbeef|cafecafecafecafe/i);
    expect(text).not.toMatch(/postgres:\/\/|DATABASE_URL|CREATE TABLE/i);
    expect(text).not.toMatch(/"checksum"\s*:/i);
    expect(text).not.toMatch(/":\s*"[a-f0-9]{16}"/i);
    expect(audit.classification).toBe("checksum_mismatch");
    expect(text).toMatch(/checksum_mismatch/);
    expect(text).toMatch(/baselineChecksumDisagreeCount/);
    assertAuditRedacted(audit);
  });

  it("classifies pending-only as incomplete relative to registry (blocked for adoption)", () => {
    const registry = getCanonicalRegistryIdentity();
    const audit = classifyLedgerReconciliation({
      verification: verification({
        ok: false,
        missing: ["2026_07_22_schema_update_control_plane"],
        error: "Missing migrations: 2026_07_22_schema_update_control_plane",
      }),
      baseline: sampleBaseline(),
      liveChecksumById: {
        "0000_promise_schema_migrations_ledger": "baseline0000aaaa",
      },
      registry,
    });
    expect(audit.classification).toBe("pending_only");
    expect(audit.blocked).toBe(true);
    expect(audit.counts.missingCount).toBe(1);
    expect(audit.counts.mismatchCount).toBe(0);
  });

  it("classifies unexpected extras as blocked", () => {
    const audit = classifyLedgerReconciliation({
      verification: verification({
        ok: false,
        extra: ["ghost_migration"],
        error: "Unexpected ledger entries: 1",
      }),
      baseline: sampleBaseline(),
      liveChecksumById: {
        "0000_promise_schema_migrations_ledger": "baseline0000aaaa",
        ghost_migration: "abc",
      },
    });
    expect(audit.classification).toBe("unexpected_extra");
    expect(audit.blocked).toBe(true);
    expect(audit.counts.extraCount).toBe(1);
  });

  it("classifies healthy complete ledger as not blocked", () => {
    const registry = getCanonicalRegistryIdentity();
    const liveChecksumById: Record<string, string> = { ...registry.checksumById };
    const baseline: TrustedBaselineLedger = {
      baselineVersion: "v-test",
      registryHead: registry.headVersion,
      migrations: registry.ids.map((id) => ({ id, checksum: registry.checksumById[id]! })),
    };
    const audit = classifyLedgerReconciliation({
      verification: verification({
        ok: true,
        appliedIds: registry.ids,
        currentVersion: registry.headVersion,
        missing: [],
        mismatched: [],
        extra: [],
        error: null,
      }),
      baseline,
      liveChecksumById,
      registry,
    });
    expect(audit.classification).toBe("healthy");
    expect(audit.blocked).toBe(false);
    expect(audit.counts.registryCount).toBe(MAIN_SCHEMA_MIGRATIONS.length);
    expect(audit.counts.missingCount).toBe(0);
  });

  it("evidence fingerprint is deterministic for identical redacted inputs", () => {
    const input = {
      verification: verification({
        ok: false,
        mismatched: [{ id: "x", ledger: "a", code: "b" }],
        error: "Checksum mismatch: x",
      }),
      baseline: sampleBaseline(),
      liveChecksumById: { x: "a" },
    };
    const a = classifyLedgerReconciliation(input);
    const b = classifyLedgerReconciliation(input);
    expect(a.evidenceFingerprint).toBe(b.evidenceFingerprint);
    const recomputed = computeEvidenceFingerprint({
      auditVersion: a.auditVersion,
      classification: a.classification,
      blocked: a.blocked,
      counts: a.counts,
      versions: a.versions,
      adoptionDecision: a.adoptionDecision,
      historicalLedgerMutation: a.historicalLedgerMutation,
    });
    expect(recomputed).toBe(a.evidenceFingerprint);
  });

  it("runLedgerReconciliationAudit is pure read path with injectable verify (no migrate)", async () => {
    const registry = getCanonicalRegistryIdentity();
    const verify = vi.fn(async () =>
      verification({
        ok: false,
        mismatched: [{ id: "m1", ledger: "old", code: "new" }],
        error: "Checksum mismatch: m1",
      })
    );
    const loadBaseline = vi.fn(async () => sampleBaseline());
    const audit = await runLedgerReconciliationAudit({
      verify,
      loadBaseline,
      liveChecksumById: { m1: "old", "0000_promise_schema_migrations_ledger": "baseline0000aaaa" },
    });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(loadBaseline).toHaveBeenCalledTimes(1);
    expect(audit.classification).toBe("checksum_mismatch");
    expect(audit.historicalLedgerMutation).toBe("none");
    expect(audit.adoptionDecision).toBe("not_performed");
    expect(audit.versions.requiredVersion).toBe(REQUIRED_MAIN_SCHEMA_VERSION);
    expect(audit.counts.registryCount).toBe(registry.ids.length);
    assertAuditRedacted(audit);
  });
});

describe("Protected runner retains zero-DDL blocks on mismatch/unavailable", () => {
  it("mismatch is not safe to migrate and processClaimed blocks DDL", async () => {
    const v = verification({
      ok: false,
      mismatched: [{ id: "x", ledger: "a", code: "b" }],
      error: "Checksum mismatch: x",
    });
    expect(isVerificationSafeToMigrate(v)).toBe(false);
    expect(mustBlockRunWithoutDdl(v)).toBe(true);

    const migrate = vi.fn(async () => {
      throw new Error("DDL must not run on mismatch");
    });
    const outcome = await processClaimedSchemaUpdateRun(baseRun(), {
      verify: async () => v,
      migrate,
      onIntegrityBlock: async (runId) => baseRun({ id: runId, status: "blocked", appliedCount: 0 }),
    });
    expect(outcome.ddlInvoked).toBe(false);
    expect(migrate).not.toHaveBeenCalled();
  });

  it("verification unavailable is not safe to migrate and processClaimed blocks DDL", async () => {
    const v = verification({
      ok: false,
      appliedIds: [],
      currentVersion: null,
      missing: [],
      mismatched: [],
      extra: [],
      error: "Ledger table does not exist",
    });
    expect(isVerificationSafeToMigrate(v)).toBe(false);
    expect(mustBlockRunWithoutDdl(v)).toBe(true);

    const migrate = vi.fn(async () => {
      throw new Error("DDL must not run when unavailable");
    });
    const outcome = await processClaimedSchemaUpdateRun(baseRun(), {
      verify: async () => v,
      migrate,
      onIntegrityBlock: async (runId) => baseRun({ id: runId, status: "blocked", appliedCount: 0 }),
    });
    expect(outcome.ddlInvoked).toBe(false);
    expect(migrate).not.toHaveBeenCalled();
  });
});

describe("Audit source authority — no parallel migration engine", () => {
  it("audit service uses canonical registry and does not invent a second ledger table", async () => {
    const src = await readFile(
      path.resolve(process.cwd(), "server/services/ledger-reconciliation-audit.service.ts"),
      "utf8"
    );
    expect(src).toMatch(/getCanonicalRegistryIdentity|main-schema-migrate\.service/);
    expect(src).toMatch(/promise_schema_migrations/);
    expect(src).not.toMatch(/main_schema_migrations|loadMigrationRegistry|migrations\/\*\.sql/);
    expect(src).toMatch(/adoptionDecision: \"not_performed\"/);
    expect(src).toMatch(/historicalLedgerMutation: \"none\"/);
    expect(src).not.toMatch(/UPDATE promise_schema_migrations|DELETE FROM promise_schema_migrations|INSERT INTO promise_schema_migrations/);
  });

  it("audit CLI script is read-only and never imports runMainSchemaMigrations", async () => {
    const src = await readFile(
      path.resolve(process.cwd(), "scripts/ledger-reconciliation-audit.ts"),
      "utf8"
    );
    expect(src).toMatch(/runLedgerReconciliationAudit/);
    expect(src).not.toMatch(/runMainSchemaMigrations/);
    expect(src).toMatch(/no DDL|read-only/i);
  });
});
