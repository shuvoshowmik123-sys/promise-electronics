import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { readFile } from "fs/promises";
import path from "path";
import {
  CONTROL_PLANE_BOOTSTRAP_DOC,
  evaluateProtectedRunnerGate,
  isActiveRunStatus,
  isIntegrityBlocked,
  isVerificationSafeToMigrate,
  mapCanonicalMigrationResultToRunStatus,
  mustBlockRunWithoutDdl,
  projectCanonicalLedgerForBrowser,
  redactAnyBrowserPayload,
  redactRun,
  safeBlockMessageForVerification,
  sanitizeErrorMessage,
  type SchemaUpdateRun,
} from "../server/services/schema-update-run.service.js";
import type { LedgerVerification } from "../server/services/main-schema-migrate.service.js";
import {
  MAIN_SCHEMA_MIGRATIONS,
  REQUIRED_MAIN_SCHEMA_VERSION,
} from "../server/services/main-schema-migrate.service.js";

function baseRun(overrides: Partial<SchemaUpdateRun> = {}): SchemaUpdateRun {
  return {
    id: "run-1",
    status: "pending",
    requestedBy: "sa-1",
    requestedAt: new Date("2026-07-22T10:00:00.000Z"),
    confirmedAt: new Date("2026-07-22T10:00:00.000Z"),
    startedAt: null,
    finishedAt: null,
    requestSource: "super_admin_settings",
    releaseVersion: "1.0.0",
    targetPendingCount: 2,
    appliedCount: null,
    errorCategory: null,
    errorMessage: null,
    resultSummary: null,
    ...overrides,
  };
}

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

describe("Canonical MAIN registry authority", () => {
  it("control-plane migration is appended to MAIN_SCHEMA_MIGRATIONS (not a parallel ledger)", () => {
    const ids = MAIN_SCHEMA_MIGRATIONS.map((m) => m.id);
    expect(ids).toContain("2026_07_22_schema_update_control_plane");
    // Durable: asserts this migration made it into the ledger no later than the current head,
    // rather than hardcoding REQUIRED_MAIN_SCHEMA_VERSION to this migration's own id — which
    // breaks the instant any later migration is appended to the same registry.
    const controlPlaneIndex = ids.indexOf("2026_07_22_schema_update_control_plane");
    const headIndex = ids.indexOf(REQUIRED_MAIN_SCHEMA_VERSION);
    expect(headIndex).toBeGreaterThanOrEqual(0);
    expect(controlPlaneIndex).toBeLessThanOrEqual(headIndex);
    const control = MAIN_SCHEMA_MIGRATIONS.find(
      (m) => m.id === "2026_07_22_schema_update_control_plane"
    )!;
    expect(control.description).toMatch(/BOOTSTRAP CONSTRAINT/i);
    expect(control.up.toString()).toMatch(/schema_update_runs/);
    expect(control.up.toString()).toMatch(/uidx_schema_update_runs_one_active/);
    expect(control.up.toString()).not.toMatch(/main_schema_migrations/);
    expect(control.up.toString()).not.toMatch(/CREATE TABLE IF NOT EXISTS promise_schema_migrations/);
  });

  it("ledger table remains promise_schema_migrations in canonical executor source", async () => {
    const src = await readFile(
      path.resolve(process.cwd(), "server/services/main-schema-migrate.service.ts"),
      "utf8"
    );
    expect(src).toMatch(/promise_schema_migrations/);
    expect(src).toMatch(/export async function runMainSchemaMigrations/);
    expect(src).toMatch(/export async function verifyMainSchemaLedger/);
    expect(src).not.toMatch(/main_schema_migrations/);
  });
});

describe("Canonical ledger projection (fail-closed integrity)", () => {
  it("projects checksum mismatch as blocked without exposing hashes", () => {
    const v = verification({
      ok: false,
      mismatched: [{ id: "2026_07_17_b2b_rule_profile", ledger: "oldhash", code: "newhash" }],
      missing: ["2026_07_22_schema_update_control_plane"],
      appliedIds: ["0000_promise_schema_migrations_ledger"],
      currentVersion: "0000_promise_schema_migrations_ledger",
      error: "Checksum mismatch: 2026_07_17_b2b_rule_profile",
    });
    expect(isIntegrityBlocked(v)).toBe(true);
    const browser = projectCanonicalLedgerForBrowser(v);
    expect(browser.state).toBe("blocked");
    expect(browser.mismatchCount).toBe(1);
    expect(browser.pendingCount).toBe(1);
    expect(browser.ledgerHealthy).toBe(false);
    expect(JSON.stringify(browser)).not.toMatch(/oldhash|newhash|checksum/i);
  });

  it("projects unexpected ledger extras as blocked", () => {
    const v = verification({
      ok: false,
      extra: ["ghost_migration"],
      error: "Unexpected ledger entries: 1",
    });
    expect(isIntegrityBlocked(v)).toBe(true);
    expect(projectCanonicalLedgerForBrowser(v).state).toBe("blocked");
  });

  it("projects missing-only from readable ledger as pending and safe to migrate", () => {
    const v = verification({
      ok: false,
      missing: ["2026_07_22_schema_update_control_plane"],
      error: "Missing migrations: 2026_07_22_schema_update_control_plane",
    });
    expect(isIntegrityBlocked(v)).toBe(false);
    expect(isVerificationSafeToMigrate(v)).toBe(true);
    expect(mustBlockRunWithoutDdl(v)).toBe(false);
    const browser = projectCanonicalLedgerForBrowser(v);
    expect(browser.state).toBe("pending");
    expect(browser.pendingCount).toBe(1);
  });

  it("projects absent ledger as unknown and not safe to migrate", () => {
    const v = verification({
      ok: false,
      appliedIds: [],
      currentVersion: null,
      missing: MAIN_SCHEMA_MIGRATIONS.map((m) => m.id),
      error: "Ledger table does not exist",
    });
    expect(isVerificationSafeToMigrate(v)).toBe(false);
    expect(mustBlockRunWithoutDdl(v)).toBe(true);
    const browser = projectCanonicalLedgerForBrowser(v);
    expect(browser.state).toBe("unknown");
    expect(browser.ledgerHealthy).toBe(false);
    expect(browser.appliedCount).toBe(0);
    expect(browser.registryCount).toBe(MAIN_SCHEMA_MIGRATIONS.length);
    expect(JSON.stringify(browser)).not.toMatch(/Ledger table does not exist|checksum|postgres/i);
  });

  it("projects verification connection error (no mismatch) as unknown and not safe", () => {
    const v = verification({
      ok: false,
      appliedIds: [],
      currentVersion: null,
      missing: [],
      mismatched: [],
      extra: [],
      error: "connect ECONNREFUSED 127.0.0.1:5432",
    });
    expect(isIntegrityBlocked(v)).toBe(false);
    expect(isVerificationSafeToMigrate(v)).toBe(false);
    expect(mustBlockRunWithoutDdl(v)).toBe(true);
    const browser = projectCanonicalLedgerForBrowser(v);
    expect(browser.state).toBe("unknown");
    expect(browser.ledgerHealthy).toBe(false);
    expect(safeBlockMessageForVerification(v)).toMatch(/unavailable|no migrations were applied/i);
    expect(safeBlockMessageForVerification(v)).not.toMatch(/ECONNREFUSED|127\.0\.0\.1/i);
    expect(JSON.stringify(browser)).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|postgres/i);
  });

  it("projects DATABASE_URL missing verification as unknown and not safe", () => {
    const v = verification({
      ok: false,
      appliedIds: [],
      currentVersion: null,
      missing: [],
      mismatched: [],
      extra: [],
      error: "DATABASE_URL is not set",
    });
    expect(isVerificationSafeToMigrate(v)).toBe(false);
    expect(mustBlockRunWithoutDdl(v)).toBe(true);
    expect(projectCanonicalLedgerForBrowser(v).state).toBe("unknown");
  });

  it("projects healthy ledger as ok and safe to migrate", () => {
    const ids = MAIN_SCHEMA_MIGRATIONS.map((m) => m.id);
    const v = verification({
      ok: true,
      appliedIds: ids,
      currentVersion: ids[ids.length - 1]!,
      missing: [],
      mismatched: [],
      extra: [],
      error: null,
    });
    expect(isVerificationSafeToMigrate(v)).toBe(true);
    const browser = projectCanonicalLedgerForBrowser(v);
    expect(browser.state).toBe("ok");
    expect(browser.ledgerHealthy).toBe(true);
    expect(browser.pendingCount).toBe(0);
  });
});

describe("Protected runner gate (production disabled by default)", () => {
  it("denies when SCHEMA_PROTECTED_RUNNER_ENABLED is off", () => {
    const gate = evaluateProtectedRunnerGate({
      NODE_ENV: "development",
      DATABASE_URL: "postgres://localhost/dev",
    } as NodeJS.ProcessEnv);
    expect(gate.allowed).toBe(false);
    expect(gate.mode).toBe("disabled");
  });

  it("allows development local when protected runner enabled", () => {
    const gate = evaluateProtectedRunnerGate({
      NODE_ENV: "development",
      DATABASE_URL: "postgres://127.0.0.1:5432/dev",
      SCHEMA_PROTECTED_RUNNER_ENABLED: "true",
    } as NodeJS.ProcessEnv);
    expect(gate.allowed).toBe(true);
    expect(gate.mode).toBe("development");
  });

  it("blocks Aiven without ALLOW_PROD_DB_MIGRATE_MAIN", () => {
    const gate = evaluateProtectedRunnerGate({
      NODE_ENV: "development",
      DATABASE_URL: "postgres://user:pass@x.aivencloud.com:1234/app?sslmode=require",
      SCHEMA_PROTECTED_RUNNER_ENABLED: "true",
    } as NodeJS.ProcessEnv);
    expect(gate.allowed).toBe(false);
  });

  it("blocks production NODE_ENV without allow flag", () => {
    const gate = evaluateProtectedRunnerGate({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://localhost/dev",
      SCHEMA_PROTECTED_RUNNER_ENABLED: "true",
    } as NodeJS.ProcessEnv);
    expect(gate.allowed).toBe(false);
  });
});

describe("Redaction and safe browser payload", () => {
  it("redacts run without secrets or SQL", () => {
    const redacted = redactRun(
      baseRun({
        errorMessage: "password=secret postgres://u:p@host/db CREATE TABLE foo",
        errorCategory: "migration",
      })
    );
    expect(redacted.errorMessage).not.toMatch(/postgres:\/\//i);
    expect(redacted.errorMessage).not.toMatch(/password/i);
    expect(redacted.errorMessage).not.toMatch(/CREATE TABLE/i);
    expect((redacted as any).requestedBy).toBeUndefined();
    expect(redacted.isActive).toBe(true);
  });

  it("strips connection strings and checksums from arbitrary payloads", () => {
    const payload = redactAnyBrowserPayload({
      ok: true,
      database_url: "postgres://u:p@host/db",
      sql: "DROP TABLE users",
      checksum: "abc123",
      nested: { token: "xyz", status: "pending" },
    });
    expect(payload.database_url).toBe("[REDACTED]");
    expect(payload.sql).toBe("[REDACTED]");
    expect(payload.checksum).toBe("[REDACTED]");
    expect((payload.nested as any).token).toBe("[REDACTED]");
    expect((payload.nested as any).status).toBe("pending");
  });

  it("sanitizeErrorMessage never echoes stack traces", () => {
    const msg = sanitizeErrorMessage(
      "Error: boom\n    at Object.<anonymous> (server/foo.ts:10:5)",
      "unknown"
    );
    expect(msg).not.toMatch(/at Object/);
    expect(msg).toMatch(/could not complete/i);
  });

  it("active status helper", () => {
    expect(isActiveRunStatus("pending")).toBe(true);
    expect(isActiveRunStatus("running")).toBe(true);
    expect(isActiveRunStatus("succeeded")).toBe(false);
    expect(isActiveRunStatus("blocked")).toBe(false);
  });
});

describe("Integrity mismatch blocks DDL path", () => {
  it("mapCanonicalMigrationResultToRunStatus maps checksum fail to blocked", () => {
    const mapped = mapCanonicalMigrationResultToRunStatus({
      status: "failed",
      appliedIds: [],
      failedId: "m1",
      error:
        "Checksum mismatch for migration m1: ledger has abc, code has def. Failing closed — do not silently re-apply.",
      durationMs: 10,
      requiredVersion: REQUIRED_MAIN_SCHEMA_VERSION,
      currentVersion: null,
    });
    expect(mapped.status).toBe("blocked");
    expect(mapped.errorCategory).toBe("integrity");
    expect(mapped.safeMessage).toMatch(/integrity/i);
  });

  it("processClaimedSchemaUpdateRun does not invoke migrate on integrity block", async () => {
    const { processClaimedSchemaUpdateRun } = await import(
      "../server/services/schema-update-run.service.js"
    );
    const migrate = vi.fn(async () => {
      throw new Error("DDL must not run");
    });
    const verify = vi.fn(async (): Promise<LedgerVerification> =>
      verification({
        ok: false,
        mismatched: [{ id: "x", ledger: "a", code: "b" }],
        error: "Checksum mismatch: x",
      })
    );
    const onIntegrityBlock = vi.fn(async (runId: string) =>
      baseRun({ id: runId, status: "blocked", errorCategory: "integrity", appliedCount: 0 })
    );

    const outcome = await processClaimedSchemaUpdateRun(baseRun({ id: "run-1", status: "running" }), {
      verify,
      migrate,
      onIntegrityBlock,
    });
    expect(outcome.ddlInvoked).toBe(false);
    expect(migrate).not.toHaveBeenCalled();
    expect(onIntegrityBlock).toHaveBeenCalledWith(
      "run-1",
      expect.stringMatching(/integrity|no migrations were applied/i)
    );
    expect(outcome.run?.status).toBe("blocked");
  });

  it("processClaimedSchemaUpdateRun does not invoke migrate on verification error without mismatch", async () => {
    const { processClaimedSchemaUpdateRun } = await import(
      "../server/services/schema-update-run.service.js"
    );
    const migrate = vi.fn(async () => {
      throw new Error("DDL must not run");
    });
    const verify = vi.fn(async (): Promise<LedgerVerification> =>
      verification({
        ok: false,
        appliedIds: [],
        currentVersion: null,
        missing: [],
        mismatched: [],
        extra: [],
        error: "connect ECONNREFUSED 127.0.0.1:5432",
      })
    );
    const onIntegrityBlock = vi.fn(async (runId: string, message?: string) =>
      baseRun({
        id: runId,
        status: "blocked",
        errorCategory: "integrity",
        appliedCount: 0,
        errorMessage: message ?? null,
      })
    );

    const outcome = await processClaimedSchemaUpdateRun(baseRun({ id: "run-err", status: "running" }), {
      verify,
      migrate,
      onIntegrityBlock,
    });
    expect(outcome.ddlInvoked).toBe(false);
    expect(migrate).not.toHaveBeenCalled();
    expect(onIntegrityBlock).toHaveBeenCalledTimes(1);
    const msg = onIntegrityBlock.mock.calls[0]?.[1] as string;
    expect(msg).toMatch(/unavailable|no migrations were applied/i);
    expect(msg).not.toMatch(/ECONNREFUSED|127\.0\.0\.1/i);
    expect(outcome.run?.status).toBe("blocked");
  });

  it("processClaimedSchemaUpdateRun does not invoke migrate when ledger table is absent", async () => {
    const { processClaimedSchemaUpdateRun } = await import(
      "../server/services/schema-update-run.service.js"
    );
    const migrate = vi.fn(async () => {
      throw new Error("DDL must not run");
    });
    const verify = vi.fn(async (): Promise<LedgerVerification> =>
      verification({
        ok: false,
        appliedIds: [],
        currentVersion: null,
        missing: MAIN_SCHEMA_MIGRATIONS.map((m) => m.id),
        mismatched: [],
        extra: [],
        error: "Ledger table does not exist",
      })
    );
    const onIntegrityBlock = vi.fn(async (runId: string) =>
      baseRun({ id: runId, status: "blocked", errorCategory: "integrity", appliedCount: 0 })
    );

    const outcome = await processClaimedSchemaUpdateRun(
      baseRun({ id: "run-absent", status: "running" }),
      { verify, migrate, onIntegrityBlock }
    );
    expect(outcome.ddlInvoked).toBe(false);
    expect(migrate).not.toHaveBeenCalled();
    expect(onIntegrityBlock).toHaveBeenCalled();
  });

  it("processClaimedSchemaUpdateRun invokes canonical migrate when pending-only from readable ledger", async () => {
    const { processClaimedSchemaUpdateRun } = await import(
      "../server/services/schema-update-run.service.js"
    );
    const migrate = vi.fn(async () => ({
      status: "complete" as const,
      appliedIds: ["2026_07_22_schema_update_control_plane"],
      failedId: null,
      error: null,
      durationMs: 5,
      requiredVersion: REQUIRED_MAIN_SCHEMA_VERSION,
      currentVersion: "2026_07_22_schema_update_control_plane",
    }));
    const verify = vi.fn(async (): Promise<LedgerVerification> =>
      verification({
        ok: false,
        missing: ["2026_07_22_schema_update_control_plane"],
        error: "Missing migrations: 2026_07_22_schema_update_control_plane",
      })
    );
    const onMigrateComplete = vi.fn(async (runId: string) =>
      baseRun({ id: runId, status: "succeeded", appliedCount: 1 })
    );

    const outcome = await processClaimedSchemaUpdateRun(baseRun({ id: "run-2", status: "running" }), {
      verify,
      migrate,
      onMigrateComplete,
    });
    expect(outcome.ddlInvoked).toBe(true);
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(onMigrateComplete).toHaveBeenCalled();
    expect(outcome.result?.status).toBe("complete");
  });

  it("processClaimedSchemaUpdateRun invokes migrate when verification.ok (healthy ledger)", async () => {
    const { processClaimedSchemaUpdateRun } = await import(
      "../server/services/schema-update-run.service.js"
    );
    const ids = MAIN_SCHEMA_MIGRATIONS.map((m) => m.id);
    const migrate = vi.fn(async () => ({
      status: "skipped" as const,
      appliedIds: ids,
      failedId: null,
      error: null,
      durationMs: 1,
      requiredVersion: REQUIRED_MAIN_SCHEMA_VERSION,
      currentVersion: ids[ids.length - 1]!,
    }));
    const verify = vi.fn(async (): Promise<LedgerVerification> =>
      verification({
        ok: true,
        appliedIds: ids,
        currentVersion: ids[ids.length - 1]!,
        missing: [],
        mismatched: [],
        extra: [],
        error: null,
      })
    );
    const onMigrateComplete = vi.fn(async (runId: string) =>
      baseRun({ id: runId, status: "succeeded", appliedCount: ids.length })
    );

    const outcome = await processClaimedSchemaUpdateRun(baseRun({ id: "run-ok", status: "running" }), {
      verify,
      migrate,
      onMigrateComplete,
    });
    expect(outcome.ddlInvoked).toBe(true);
    expect(migrate).toHaveBeenCalledTimes(1);
  });
});

describe("HTTP control plane routes", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createApp(router: express.Router) {
    const app = express();
    app.use(express.json());
    app.use(router);
    return app;
  }

  it("denies non-Super Admin on status and request endpoints", async () => {
    vi.doMock("../server/routes/middleware/auth.js", () => ({
      requireAdminAuth: (req: any, _res: any, next: () => void) => {
        req.session = { adminUserId: "mgr-1" };
        req.user = { id: "mgr-1", role: "Manager" };
        next();
      },
      requireSuperAdmin: (_req: any, res: any) => {
        res.status(403).json({ error: "Super Admin access required" });
      },
    }));
    vi.doMock("../server/storage.js", () => ({
      storage: { getUser: vi.fn() },
    }));
    vi.doMock("../server/services/schema-update-run.service.js", async () => {
      const actual = await vi.importActual<any>("../server/services/schema-update-run.service.js");
      return {
        ...actual,
        getSchemaUpdateStatus: vi.fn(),
        createSchemaUpdateRequest: vi.fn(),
        getRunById: vi.fn(),
      };
    });

    const { default: router } = await import("../server/routes/schema-update.routes.js");
    const app = createApp(router);

    const statusRes = await request(app).get("/api/admin/schema-updates/status");
    expect(statusRes.status).toBe(403);

    const postRes = await request(app)
      .post("/api/admin/schema-updates/requests")
      .send({ confirm: true, password: "x" });
    expect(postRes.status).toBe(403);
  });

  it("requires confirmation and re-auth password for Super Admin request", async () => {
    const passwordHash = await bcrypt.hash("SuperSecret1", 4);

    vi.doMock("../server/routes/middleware/auth.js", () => ({
      requireAdminAuth: (req: any, _res: any, next: () => void) => {
        req.session = { adminUserId: "sa-1", csrfToken: "t" };
        req.user = { id: "sa-1", role: "Super Admin" };
        next();
      },
      requireSuperAdmin: (_req: any, _res: any, next: () => void) => next(),
    }));
    vi.doMock("../server/storage.js", () => ({
      storage: {
        getUser: vi.fn(async () => ({
          id: "sa-1",
          role: "Super Admin",
          password: passwordHash,
        })),
      },
    }));

    const createSchemaUpdateRequest = vi.fn(async (input: any) => {
      if (input.confirm !== true) {
        return {
          ok: false,
          status: 400,
          error: "Explicit confirmation is required.",
          code: "CONFIRMATION_REQUIRED",
        };
      }
      if (input.password !== "SuperSecret1") {
        return {
          ok: false,
          status: 401,
          error: "Re-authentication failed.",
          code: "REAUTH_FAILED",
        };
      }
      return { ok: true, duplicate: false, run: baseRun({ id: "new-run" }) };
    });

    vi.doMock("../server/services/schema-update-run.service.js", async () => {
      const actual = await vi.importActual<any>("../server/services/schema-update-run.service.js");
      return {
        ...actual,
        createSchemaUpdateRequest,
        getSchemaUpdateStatus: vi.fn(),
        getRunById: vi.fn(),
      };
    });

    const { default: router } = await import("../server/routes/schema-update.routes.js");
    const app = createApp(router);

    const badPw = await request(app)
      .post("/api/admin/schema-updates/requests")
      .send({ confirm: true, password: "wrong" });
    expect(badPw.status).toBe(401);
    expect(badPw.body.code).toBe("REAUTH_FAILED");
    expect(JSON.stringify(badPw.body)).not.toMatch(/postgres|password=|checksum/i);

    const ok = await request(app)
      .post("/api/admin/schema-updates/requests")
      .send({ confirm: true, password: "SuperSecret1" });
    expect(ok.status).toBe(201);
    expect(ok.body.run.id).toBe("new-run");
    expect(ok.body.run.status).toBe("pending");
    expect(ok.body.run.requestedBy).toBeUndefined();
  });

  it("returns existing active run on duplicate request (idempotent)", async () => {
    vi.doMock("../server/routes/middleware/auth.js", () => ({
      requireAdminAuth: (req: any, _res: any, next: () => void) => {
        req.session = { adminUserId: "sa-1" };
        req.user = { id: "sa-1", role: "Super Admin" };
        next();
      },
      requireSuperAdmin: (_req: any, _res: any, next: () => void) => next(),
    }));
    vi.doMock("../server/storage.js", () => ({
      storage: {
        getUser: vi.fn(async () => ({
          id: "sa-1",
          role: "Super Admin",
          password: await bcrypt.hash("x", 4),
        })),
      },
    }));
    vi.doMock("../server/services/schema-update-run.service.js", async () => {
      const actual = await vi.importActual<any>("../server/services/schema-update-run.service.js");
      return {
        ...actual,
        createSchemaUpdateRequest: vi.fn(async () => ({
          ok: true,
          duplicate: true,
          run: baseRun({ id: "existing-active", status: "running" }),
        })),
        getSchemaUpdateStatus: vi.fn(),
        getRunById: vi.fn(),
      };
    });

    const { default: router } = await import("../server/routes/schema-update.routes.js");
    const app = createApp(router);

    const res = await request(app)
      .post("/api/admin/schema-updates/requests")
      .send({ confirm: true, password: "x" });
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(res.body.run.id).toBe("existing-active");
    expect(res.body.run.status).toBe("running");
  });

  it("status endpoint projects canonical ledger fields and never exposes secrets", async () => {
    vi.doMock("../server/routes/middleware/auth.js", () => ({
      requireAdminAuth: (req: any, _res: any, next: () => void) => {
        req.session = { adminUserId: "sa-1" };
        req.user = { id: "sa-1", role: "Super Admin" };
        next();
      },
      requireSuperAdmin: (_req: any, _res: any, next: () => void) => next(),
    }));
    vi.doMock("../server/storage.js", () => ({ storage: { getUser: vi.fn() } }));
    vi.doMock("../server/services/schema-update-run.service.js", async () => {
      const actual = await vi.importActual<any>("../server/services/schema-update-run.service.js");
      return {
        ...actual,
        getSchemaUpdateStatus: vi.fn(async () =>
          actual.redactAnyBrowserPayload({
            controlPlane: "available",
            runnerEligible: false,
            runnerMode: "disabled",
            productionExecutionEnabled: false,
            releaseVersion: "1.0.0",
            ledger: {
              state: "blocked",
              appliedCount: 3,
              pendingCount: 1,
              mismatchCount: 1,
              extraCount: 0,
              ledgerHealthy: false,
              mainSchemaVersion: "some_version",
              registryCount: MAIN_SCHEMA_MIGRATIONS.length,
              registryHeadVersion: REQUIRED_MAIN_SCHEMA_VERSION,
              requiredVersion: REQUIRED_MAIN_SCHEMA_VERSION,
            },
            activeRun: null,
            lastRun: actual.redactRun(
              baseRun({
                status: "blocked",
                errorCategory: "integrity",
                errorMessage: "Schema integrity check failed. No migrations were applied.",
              })
            ),
            safeMessage: "Schema integrity is blocked.",
          })
        ),
        createSchemaUpdateRequest: vi.fn(),
        getRunById: vi.fn(),
      };
    });

    const { default: router } = await import("../server/routes/schema-update.routes.js");
    const app = createApp(router);
    const res = await request(app).get("/api/admin/schema-updates/status");
    expect(res.status).toBe(200);
    expect(res.body.ledger.state).toBe("blocked");
    expect(res.body.ledger.mismatchCount).toBe(1);
    expect(res.body.ledger.registryCount).toBe(MAIN_SCHEMA_MIGRATIONS.length);
    expect(res.body.lastRun?.status).toBe("blocked");
    expect(JSON.stringify(res.body)).not.toMatch(
      /postgres:\/\/|DATABASE_URL|checksum|CREATE TABLE|stack/i
    );
  });
});

describe("DB concurrency invariant + bootstrap documentation", () => {
  it("MAIN migration SQL enforces one-active-run via partial unique index", () => {
    const control = MAIN_SCHEMA_MIGRATIONS.find(
      (m) => m.id === "2026_07_22_schema_update_control_plane"
    )!;
    const body = control.up.toString();
    expect(body).toMatch(/uidx_schema_update_runs_one_active/);
    expect(body).toMatch(/WHERE status IN \('pending', 'running'\)/);
    expect(body).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS/);
  });

  it("documents bootstrap constraint and trusted release path", () => {
    expect(CONTROL_PLANE_BOOTSTRAP_DOC).toMatch(/BOOTSTRAP CONSTRAINT/i);
    expect(CONTROL_PLANE_BOOTSTRAP_DOC).toMatch(/schema_update_runs/);
    expect(CONTROL_PLANE_BOOTSTRAP_DOC).toMatch(/db:migrate:main/);
    expect(CONTROL_PLANE_BOOTSTRAP_DOC).toMatch(/promise_schema_migrations/);
    expect(CONTROL_PLANE_BOOTSTRAP_DOC).toMatch(/main-schema-migrate/);
  });
});

describe("Express request path must not export DDL runner", () => {
  it("schema-update routes do not import runMainSchemaMigrations or spawn", async () => {
    const routeSrc = await readFile(
      path.resolve(process.cwd(), "server/routes/schema-update.routes.ts"),
      "utf8"
    );
    expect(routeSrc).not.toMatch(/runMainSchemaMigrations/);
    expect(routeSrc).not.toMatch(/child_process|spawn|exec\(/);
    expect(routeSrc).not.toMatch(/npm run/);
    expect(routeSrc).toMatch(/NEVER executes DDL/i);
  });

  it("protected runner imports canonical main-schema-migrate executor only", async () => {
    const runnerSrc = await readFile(
      path.resolve(process.cwd(), "scripts/protected-schema-runner.ts"),
      "utf8"
    );
    expect(runnerSrc).toMatch(/processClaimedSchemaUpdateRun/);
    expect(runnerSrc).toMatch(/schema-update-run\.service/);
    expect(runnerSrc).not.toMatch(/migrations\/\*\.sql|loadMigrationRegistry|main_schema_migrations/);
  });

  it("schema-update-run service calls canonical runMainSchemaMigrations", async () => {
    const svcSrc = await readFile(
      path.resolve(process.cwd(), "server/services/schema-update-run.service.ts"),
      "utf8"
    );
    expect(svcSrc).toMatch(/from \"\.\/main-schema-migrate\.service\.js\"/);
    expect(svcSrc).toMatch(/runMainSchemaMigrations/);
    expect(svcSrc).toMatch(/verifyMainSchemaLedger/);
    expect(svcSrc).not.toMatch(/main_schema_migrations|loadMigrationRegistry|migrations\/\*\.sql/);
  });
});
