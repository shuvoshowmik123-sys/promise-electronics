import { afterEach, describe, expect, it } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import {
  activateDisposableBaselineAdoption,
  assertAdoptionVerificationRedacted,
  assertRestoredLedgerMatchesExpected,
  BASELINE_ADOPTION_DOC,
  computeAdoptionEvidenceFingerprint,
  countBaselineLedgerVsCurrentDisagreements,
  deactivateDisposableBaselineAdoption,
  DISPOSABLE_ADOPTION_DB_PREFIX,
  evaluateBaselineAdoptionGate,
  isDisposableAdoptionDatabaseName,
  MAIN_SCHEMA_TRUST_BASELINE_ADOPTION_ENV,
  parseDatabaseUrl,
  verifyBaselineAdoption,
  verifyBaselineManifestFileIntegrity,
  verifyFrozenSourceIdentities,
  type FrozenSourceIdentityManifest,
} from "../server/services/baseline-adoption.service.js";
import {
  clearAdoptionExpectedChecksumSession,
  getAdoptionExpectedChecksumSession,
  resolveExpectedLedgerChecksum,
} from "../server/services/adoption-expected-checksum-session.js";
import {
  evaluateLedgerAgainstRegistry,
  getCanonicalRegistryIdentity,
  MAIN_SCHEMA_MIGRATIONS,
} from "../server/services/main-schema-migrate.service.js";
import type { TrustedBaselineLedger } from "../server/services/ledger-reconciliation-audit.service.js";

function disposableUrl(name = `${DISPOSABLE_ADOPTION_DB_PREFIX}proof1`): string {
  return `postgresql://postgres:secret@127.0.0.1:5432/${name}`;
}

/** Baseline ledger identity A — deliberately differs from current source. */
function baselineWithDivergedLedgerA(
  overrides: Partial<TrustedBaselineLedger> = {}
): TrustedBaselineLedger {
  const registry = getCanonicalRegistryIdentity();
  const firstIds = registry.ids.slice(0, 3);
  return {
    baselineVersion: "v-test-baseline-diverged-A",
    registryHead: firstIds[firstIds.length - 1] || null,
    migrations: firstIds.map((id, i) => ({
      id,
      // A: historical ledger checksums (NOT equal to current source)
      checksum: `aaaa${i.toString(16).padStart(12, "0")}`.slice(0, 16),
    })),
    ...overrides,
  };
}

/** Frozen source identity B aligned with current source for adopted ids. */
function frozenBMatchingCurrent(
  baseline: TrustedBaselineLedger,
  registry = getCanonicalRegistryIdentity()
): FrozenSourceIdentityManifest {
  return {
    schemaVersion: 1,
    baselineVersion: baseline.baselineVersion,
    registryHead: baseline.registryHead,
    identityKind: "current_source_checksum_v1",
    migrations: baseline.migrations.map((m) => ({
      id: m.id,
      sourceChecksum: registry.checksumById[m.id]!,
    })),
  };
}

function optInEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    [MAIN_SCHEMA_TRUST_BASELINE_ADOPTION_ENV]: "true",
  } as NodeJS.ProcessEnv;
}

afterEach(() => {
  clearAdoptionExpectedChecksumSession();
});

describe("Disposable DB name + URL parsing", () => {
  it("accepts only qa_schema_update_ prefix", () => {
    expect(isDisposableAdoptionDatabaseName("qa_schema_update_abc")).toBe(true);
    expect(isDisposableAdoptionDatabaseName("promise_dev")).toBe(false);
  });

  it("classifies local vs cloud hosts", () => {
    expect(parseDatabaseUrl(disposableUrl()).isLocal).toBe(true);
    expect(
      parseDatabaseUrl("postgresql://u:p@x.aivencloud.com:1234/app").isAivenOrNeon
    ).toBe(true);
  });
});

describe("Adoption gate — fail closed", () => {
  it("rejects without opt-in, ordinary dev name, cloud, production", () => {
    expect(
      evaluateBaselineAdoptionGate(
        { NODE_ENV: "development" } as NodeJS.ProcessEnv,
        disposableUrl()
      ).allowed
    ).toBe(false);

    expect(
      evaluateBaselineAdoptionGate(optInEnv(), "postgresql://postgres:x@localhost:5432/promise_dev")
        .targetClass
    ).toBe("local_non_disposable");

    expect(
      evaluateBaselineAdoptionGate(
        optInEnv(),
        "postgresql://u:p@x.aivencloud.com:1234/app"
      ).targetClass
    ).toBe("cloud_managed");

    expect(
      evaluateBaselineAdoptionGate(
        {
          NODE_ENV: "production",
          [MAIN_SCHEMA_TRUST_BASELINE_ADOPTION_ENV]: "true",
        } as NodeJS.ProcessEnv,
        disposableUrl()
      ).targetClass
    ).toBe("production_like");
  });

  it("allows local disposable with opt-in", () => {
    const gate = evaluateBaselineAdoptionGate(optInEnv(), disposableUrl());
    expect(gate.allowed).toBe(true);
    expect(gate.targetClass).toBe("local_disposable");
  });
});

describe("Two-identity model: A (ledger) vs B (frozen source)", () => {
  it("known baseline A≠current is accepted when B matches current source", () => {
    const registry = getCanonicalRegistryIdentity();
    const baseline = baselineWithDivergedLedgerA();
    expect(countBaselineLedgerVsCurrentDisagreements(baseline, registry)).toBe(
      baseline.migrations.length
    );

    const frozen = frozenBMatchingCurrent(baseline, registry);
    const result = verifyFrozenSourceIdentities(baseline, frozen, registry);
    expect(result.ok).toBe(true);
    expect(result.identityMismatchCount).toBe(0);
    // A still diverges from current — that is OK for identity check
    for (const m of baseline.migrations) {
      expect(m.checksum).not.toBe(registry.checksumById[m.id]);
    }
  });

  it("does not compare source identity to baseline ledger A", () => {
    const registry = getCanonicalRegistryIdentity();
    const baseline = baselineWithDivergedLedgerA();
    // B equals A (wrong model) → should FAIL because current ≠ A
    const frozenWrong: FrozenSourceIdentityManifest = {
      schemaVersion: 1,
      baselineVersion: baseline.baselineVersion,
      registryHead: baseline.registryHead,
      identityKind: "current_source_checksum_v1",
      migrations: baseline.migrations.map((m) => ({
        id: m.id,
        sourceChecksum: m.checksum, // A values — must not be accepted as B when current differs
      })),
    };
    const result = verifyFrozenSourceIdentities(baseline, frozenWrong, registry);
    expect(result.ok).toBe(false);
    expect(result.identityMismatchCount).toBeGreaterThan(0);
  });

  it("tampered frozen source identity B blocks", () => {
    const registry = getCanonicalRegistryIdentity();
    const baseline = baselineWithDivergedLedgerA();
    const frozen = frozenBMatchingCurrent(baseline, registry);
    frozen.migrations[0] = {
      id: frozen.migrations[0]!.id,
      sourceChecksum: "ffffffffffffffff",
    };
    const result = verifyFrozenSourceIdentities(baseline, frozen, registry);
    expect(result.ok).toBe(false);
    expect(result.identityMismatchCount).toBe(1);
    expect(result.reason).toMatch(/source identity mismatch|body changed/i);
  });

  it("empty frozen B fails closed (no runtime generation)", () => {
    const baseline = baselineWithDivergedLedgerA();
    const result = verifyFrozenSourceIdentities(baseline, {
      schemaVersion: 1,
      baselineVersion: "v",
      registryHead: null,
      identityKind: "current_source_checksum_v1",
      migrations: [],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/empty|frozen/i);
  });
});

describe("Full adoption verification + session activation", () => {
  it("accepts diverged A when gate + manifest + B pass; activates expected ledger A", async () => {
    const baseline = baselineWithDivergedLedgerA();
    const frozen = frozenBMatchingCurrent(baseline);
    const { verification, sessionActive, expectedById } =
      await activateDisposableBaselineAdoption({
        env: optInEnv(),
        databaseUrl: disposableUrl(),
        loadBaseline: async () => baseline,
        loadFrozen: async () => frozen,
        verifyManifest: async () => ({
          ok: true,
          schemaSqlOk: true,
          ledgerSqlOk: true,
          reason: null,
        }),
      });

    expect(verification.ok).toBe(true);
    expect(verification.auditVersion).toBe("2");
    expect(verification.baselineLedgerIdentityAccepted).toBe(true);
    expect(verification.expectedHistoricChecksumsAccepted).toBe(true);
    expect(verification.historicalLedgerMutation).toBe("none");
    expect(sessionActive).toBe(true);
    expect(expectedById).not.toBeNull();
    for (const m of baseline.migrations) {
      expect(expectedById![m.id]).toBe(m.checksum);
    }
    assertAdoptionVerificationRedacted(verification);

    const session = getAdoptionExpectedChecksumSession();
    expect(session?.active).toBe(true);
    const codeChecksum = getCanonicalRegistryIdentity().checksumById[baseline.migrations[0]!.id]!;
    expect(codeChecksum).not.toBe(baseline.migrations[0]!.checksum);
    expect(
      resolveExpectedLedgerChecksum(baseline.migrations[0]!.id, codeChecksum)
    ).toBe(baseline.migrations[0]!.checksum);
  });

  it("tampered B rejects and does not activate session", async () => {
    const baseline = baselineWithDivergedLedgerA();
    const frozen = frozenBMatchingCurrent(baseline);
    frozen.migrations[0] = {
      id: frozen.migrations[0]!.id,
      sourceChecksum: "0000000000000000",
    };
    const { verification, sessionActive } = await activateDisposableBaselineAdoption({
      env: optInEnv(),
      databaseUrl: disposableUrl(),
      loadBaseline: async () => baseline,
      loadFrozen: async () => frozen,
      verifyManifest: async () => ({
        ok: true,
        schemaSqlOk: true,
        ledgerSqlOk: true,
        reason: null,
      }),
    });
    expect(verification.ok).toBe(false);
    expect(verification.adoptionDecision).toBe("rejected");
    expect(sessionActive).toBe(false);
    expect(getAdoptionExpectedChecksumSession()).toBeNull();
  });

  it("evidence fingerprint is deterministic", async () => {
    const baseline = baselineWithDivergedLedgerA();
    const frozen = frozenBMatchingCurrent(baseline);
    const a = await verifyBaselineAdoption({
      env: optInEnv(),
      databaseUrl: disposableUrl(),
      loadBaseline: async () => baseline,
      loadFrozen: async () => frozen,
      verifyManifest: async () => ({
        ok: true,
        schemaSqlOk: true,
        ledgerSqlOk: true,
        reason: null,
      }),
    });
    const recomputed = computeAdoptionEvidenceFingerprint({
      auditVersion: a.auditVersion,
      ok: a.ok,
      adoptionDecision: a.adoptionDecision,
      historicalLedgerMutation: a.historicalLedgerMutation,
      expectedHistoricChecksumsAccepted: a.expectedHistoricChecksumsAccepted,
      baselineLedgerIdentityAccepted: a.baselineLedgerIdentityAccepted,
      gate: a.gate,
      manifestIntegrity: a.manifestIntegrity,
      frozenSourceIdentity: a.frozenSourceIdentity,
      versions: a.versions,
      reasons: a.reasons,
    });
    expect(recomputed).toBe(a.evidenceFingerprint);
  });
});

describe("Canonical ledger verification uses A under opt-in session", () => {
  it("without session, baseline ledger A values mismatch against current code", () => {
    const registry = getCanonicalRegistryIdentity();
    const baseline = baselineWithDivergedLedgerA();
    const live: Record<string, string> = {};
    for (const m of baseline.migrations) live[m.id] = m.checksum;
    // Only partial ledger — missing rest of registry
    const result = evaluateLedgerAgainstRegistry(live);
    expect(result.mismatched.length).toBeGreaterThan(0);
    for (const m of baseline.migrations) {
      expect(result.mismatched.some((x) => x.id === m.id)).toBe(true);
    }
    // silence unused
    expect(registry.ids.length).toBeGreaterThan(0);
  });

  it("with adoption session, old baseline ledger entries resolve as applied (not mismatched)", async () => {
    const registry = getCanonicalRegistryIdentity();
    const baseline = baselineWithDivergedLedgerA();
    const frozen = frozenBMatchingCurrent(baseline, registry);

    await activateDisposableBaselineAdoption({
      env: optInEnv(),
      databaseUrl: disposableUrl(),
      loadBaseline: async () => baseline,
      loadFrozen: async () => frozen,
      verifyManifest: async () => ({
        ok: true,
        schemaSqlOk: true,
        ledgerSqlOk: true,
        reason: null,
      }),
    });

    const live: Record<string, string> = {};
    for (const m of baseline.migrations) {
      live[m.id] = m.checksum; // restored baseline A values
    }
    const result = evaluateLedgerAgainstRegistry(live);

    for (const m of baseline.migrations) {
      expect(result.mismatched.some((x) => x.id === m.id)).toBe(false);
      expect(result.appliedIds).toContain(m.id);
    }
    // Remaining registry ids after adopted prefix are missing (pending) — not mismatch
    expect(result.missing.length).toBeGreaterThan(0);
    expect(result.mismatched.length).toBe(0);
  });

  it("deactivating session restores strict current-code comparison", async () => {
    const baseline = baselineWithDivergedLedgerA();
    const frozen = frozenBMatchingCurrent(baseline);
    await activateDisposableBaselineAdoption({
      env: optInEnv(),
      databaseUrl: disposableUrl(),
      loadBaseline: async () => baseline,
      loadFrozen: async () => frozen,
      verifyManifest: async () => ({
        ok: true,
        schemaSqlOk: true,
        ledgerSqlOk: true,
        reason: null,
      }),
    });
    deactivateDisposableBaselineAdoption();

    const live: Record<string, string> = {};
    for (const m of baseline.migrations) live[m.id] = m.checksum;
    const result = evaluateLedgerAgainstRegistry(live);
    expect(result.mismatched.some((x) => x.id === baseline.migrations[0]!.id)).toBe(true);
  });

  it("assertRestoredLedgerMatchesExpected validates A restore without mutation", () => {
    const baseline = baselineWithDivergedLedgerA();
    const expectedById: Record<string, string> = {};
    for (const m of baseline.migrations) expectedById[m.id] = m.checksum;
    expect(assertRestoredLedgerMatchesExpected({ ...expectedById }, expectedById).ok).toBe(true);
    expect(
      assertRestoredLedgerMatchesExpected(
        { [baseline.migrations[0]!.id]: "deadbeefdeadbeef" },
        expectedById
      ).ok
    ).toBe(false);
  });
});

describe("Baseline SQL integrity + authority boundaries", () => {
  it("verifies real baseline SQL hashes against manifest", async () => {
    const result = await verifyBaselineManifestFileIntegrity();
    expect(result.ok).toBe(true);
  });

  it("normal startup does not import adoption or activate session", async () => {
    const src = await readFile(path.resolve(process.cwd(), "server/index.ts"), "utf8");
    expect(src).not.toMatch(/baseline-adoption\.service/);
    expect(src).not.toMatch(/activateDisposableBaselineAdoption/);
    expect(src).not.toMatch(/MAIN_SCHEMA_TRUST_BASELINE_ADOPTION/);
    expect(src).not.toMatch(/runMainSchemaMigrations\s*\(/);
  });

  it("adoption service has no ledger DML; docs state two-identity model", async () => {
    const src = await readFile(
      path.resolve(process.cwd(), "server/services/baseline-adoption.service.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/UPDATE\s+promise_schema_migrations/i);
    expect(src).not.toMatch(/DELETE\s+FROM\s+promise_schema_migrations/i);
    expect(src).not.toMatch(/INSERT\s+INTO\s+promise_schema_migrations/i);
    expect(src).toMatch(/Identity A|baseline ledger/i);
    expect(src).toMatch(/Identity B|frozen source/i);
    expect(BASELINE_ADOPTION_DOC).toMatch(/two-identity/i);
  });

  it("main migrator uses session + guarded dynamic adoption only (no static baseline-adoption import)", async () => {
    const src = await readFile(
      path.resolve(process.cwd(), "server/services/main-schema-migrate.service.ts"),
      "utf8"
    );
    expect(src).toMatch(/resolveExpectedLedgerChecksum/);
    expect(src).toMatch(/evaluateLedgerAgainstRegistry/);
    // Fail-closed: no static top-level import of baseline-adoption (cycle + always-on coupling).
    expect(src).not.toMatch(
      /(?:import|from)\s+['"]\.\/baseline-adoption\.service\.js['"]/
    );
    expect(src).not.toMatch(
      /^import\s+[^;]*baseline-adoption\.service/m
    );
    // Dynamic activation only inside ensureDisposableAdoptionSessionIfRequested, flag-gated.
    expect(src).toMatch(/async function ensureDisposableAdoptionSessionIfRequested/);
    expect(src).toMatch(
      /MAIN_SCHEMA_TRUST_BASELINE_ADOPTION\s*!==\s*["']true["']/
    );
    expect(src).toMatch(
      /await\s+import\(\s*["']\.\/baseline-adoption\.service\.js["']\s*\)/
    );
    expect(src).toMatch(/activateDisposableBaselineAdoption/);
    // import() of adoption appears only once (confined to the ensure helper path).
    const dynamicImportHits = src.match(
      /import\(\s*["']\.\/baseline-adoption\.service\.js["']\s*\)/g
    );
    expect(dynamicImportHits?.length).toBe(1);
    // ensure helper is the only call site for activateDisposableBaselineAdoption
    const activateHits = src.match(/activateDisposableBaselineAdoption/g);
    expect(activateHits?.length).toBe(1);
  });

  it("harness activates adoption session before bootstrap migrate under TSX", async () => {
    const harness = await readFile(
      path.resolve(process.cwd(), "scripts/disposable-baseline-adoption-proof.ts"),
      "utf8"
    );
    expect(harness).toMatch(/activateDisposableBaselineAdoption/);
    expect(harness).toMatch(/qa_schema_update_/);
    expect(harness).toMatch(/MAIN_SCHEMA_TRUST_BASELINE_ADOPTION/);
    expect(harness).toMatch(/frozen-source-identity|loadFrozen|FROZEN/);
    expect(harness).toMatch(/DROP DATABASE/);
    expect(harness).toMatch(/baseline-adoption\.service\.js/);
    expect(harness).toMatch(/requires project TSX runtime|ADOPTION_PROOF_UNDER_TSX|assertTsxRuntime/);

    const launcher = await readFile(
      path.resolve(process.cwd(), "scripts/disposable-baseline-adoption-proof.mjs"),
      "utf8"
    );
    expect(launcher).toMatch(/tsx\/dist\/cli\.mjs/);
    expect(launcher).toMatch(/disposable-baseline-adoption-proof\.ts/);
    expect(launcher).toMatch(/ADOPTION_PROOF_UNDER_TSX/);
    expect(launcher).not.toMatch(/baseline-adoption\.service/);
  });

  it("registry still has migrations (sanity)", () => {
    expect(MAIN_SCHEMA_MIGRATIONS.length).toBeGreaterThan(10);
  });
});
