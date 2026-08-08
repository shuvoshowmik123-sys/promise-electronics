/**
 * Does an approved warranty claim ever close?
 *
 * QA reported that a claim stays at in_repair forever after its re-service job
 * is finished. Reading the code agreed — create-job sets in_repair, and
 * nothing anywhere sets closed — but a grep proves only that a line is absent,
 * not that the behaviour is wrong. Every file-content test written for this
 * project so far has passed while the system misbehaved, twice.
 *
 * So this drives the real app against a real PostgreSQL: approve a claim,
 * create its job through the actual endpoint, complete that job through the
 * actual endpoint, and read the claim back out of the database.
 *
 * If the loop closes, this passes. If claims accumulate forever, it fails —
 * and it fails for the right reason, in the words a person would use.
 */
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import request from "supertest";
import bcrypt from "bcryptjs";

const MAINT_URL = process.env.TEST_LOCAL_PG_URL || "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const DB_NAME = `qa_claimclose_${process.pid.toString(36)}_${Date.now().toString(36)}`;
const DISPOSABLE_URL = MAINT_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);

vi.mock("../server/services/db-readiness.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../server/services/db-readiness.js")>();
    return { ...actual, isDbReady: () => true };
});

// Per-IP limits are shared by every actor here; the limits themselves are
// proven elsewhere.
vi.mock("../server/routes/middleware/rate-limit.js", async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
    const stubbed: Record<string, unknown> = {};
    for (const key of Object.keys(actual)) {
        stubbed[key] = typeof actual[key] === "function" ? passThrough : actual[key];
    }
    return stubbed;
});

// SMS is failing in production; assert the flow works without it.
vi.mock("../server/services/sms.service.js", async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        smsService: {
            ...actual.smsService,
            sendSms: async () => ({ success: false, error: "stubbed: provider unavailable" }),
        },
    };
});

function probeLocalPostgres(): boolean {
  if (!/localhost|127\.0\.0\.1|::1/i.test(MAINT_URL)) return false;
  const script = `
    const pg = require(${JSON.stringify("pg")});
    const c = new pg.Client({ connectionString: ${JSON.stringify(MAINT_URL)}, connectionTimeoutMillis: 3000 });
    c.connect().then(() => { console.log("PG_OK"); return c.end(); }).catch(() => { process.exit(0); });
  `;
  const res = spawnSync(process.execPath, ["-e", script], { cwd: process.cwd(), timeout: 10_000, encoding: "utf8" });
  return /PG_OK/.test(res.stdout || "");
}

const LOCAL_PG_AVAILABLE = probeLocalPostgres();

// Admin login caps passwords at 13 characters (adminLoginSchema), so this
// cannot be longer without the login failing validation before any auth check.
const PASSWORD = "TestPass123!";
const CUSTOMER_PHONE = "+8801711200001";

describe.skipIf(!LOCAL_PG_AVAILABLE)("a warranty claim closes when its re-service job completes", () => {
  let admin: pg.Client;
  let dbClient: pg.Client;
  let app: any;
  let resetDbPool: (reason: string) => Promise<void>;
  const originalEnv: Record<string, string | undefined> = {};


  beforeAll(async () => {
    if (!LOCAL_PG_AVAILABLE) return;

    for (const [k, v] of Object.entries({
      DATABASE_URL: DISPOSABLE_URL,
      SESSION_SECRET: "test-only-dummy-session-secret-never-a-real-secret",
      INTAKE_FINGERPRINT_SECRET: "test-only-dummy-fingerprint-secret-16chars-min",
      NODE_ENV: "development",
    })) {
      originalEnv[k] = process.env[k];
      process.env[k] = v;
    }

    admin = new pg.Client({ connectionString: MAINT_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    dbClient = new pg.Client({ connectionString: DISPOSABLE_URL });
    await dbClient.connect();

    // Tables from the drizzle model; hand-listing columns rots on the next
    // schema change.
    const { getTableColumns, is } = await import("drizzle-orm");
    const { PgTable, getTableConfig } = await import("drizzle-orm/pg-core");
    const schema = await import("../shared/schema.js");
    const pendingTables: { name: string; sql: string }[] = [];
    const pendingIndexes: string[] = [];
    for (const value of Object.values(schema as Record<string, unknown>)) {
      if (!is(value, PgTable)) continue;
      const table = value as any;
      const name = table[Object.getOwnPropertySymbols(table)
        .find((s) => String(s) === "Symbol(drizzle:Name)")!];
      const cols = Object.values(getTableColumns(table) as Record<string, any>).map((col) => {
        // TIMESTAMPTZ when the model says so. A naive TIMESTAMP compared against
        // NOW() is converted using the session time zone, so a row written five
        // minutes into the future read back as already expired — every
        // `expires_at > NOW()` lookup silently returned nothing.
        const type = col.dataType === "boolean" ? "BOOLEAN"
          : col.dataType === "number" ? "NUMERIC"
          : col.dataType === "date" ? (col.withTimezone ? "TIMESTAMPTZ" : "TIMESTAMP")
          : col.dataType === "json" ? "JSONB" : "TEXT";
        const parts = [`"${col.name}"`, type];
        if (col.primary) parts.push("PRIMARY KEY");
        else if (col.notNull && !col.hasDefault) parts.push("NOT NULL");
        // Defaults matter: pickup_schedules.created_at feeds logistics_tasks,
        // which is NOT NULL there. Dropping the default made intake insert a
        // null and the sync failed silently.
        if (col.hasDefault && (type === "TIMESTAMP" || type === "TIMESTAMPTZ")) parts.push("DEFAULT NOW()");
        // Non-timestamp defaults were being dropped entirely, so counters like
        // custody_handover_codes.attempts/max_attempts arrived as NULL and every
        // `attempts < max_attempts` predicate silently matched nothing.
        else if (col.hasDefault && type === "NUMERIC" && typeof col.default === "number") {
            parts.push(`DEFAULT ${col.default}`);
        }
        else if (col.hasDefault && type === "BOOLEAN" && typeof col.default === "boolean") {
            parts.push(`DEFAULT ${col.default}`);
        }
        return parts.join(" ");
      });
      pendingTables.push({ name, sql: `CREATE TABLE IF NOT EXISTS "${name}" (${cols.join(", ")})` });

      /**
       * Unique indexes matter, not just columns.
       *
       * Production code uses `ON CONFLICT (job_ticket_id) DO NOTHING` when
       * recording a feedback opportunity on delivery. Without the matching
       * unique index PostgreSQL rejects the statement, the service's catch
       * block then runs another query on the now-poisoned transaction, and the
       * whole delivery fails with an opaque "current transaction is aborted"
       * that names nothing. Columns alone were not a faithful schema.
       */
      for (const idx of getTableConfig(table).indexes) {
        const cfg = (idx as any).config;
        if (!cfg?.unique) continue;
        const idxCols = (cfg.columns ?? []).map((c: any) => `"${c.name}"`).filter(Boolean);
        if (!idxCols.length) continue;
        pendingIndexes.push(
          `CREATE UNIQUE INDEX IF NOT EXISTS "${cfg.name}" ON "${name}" (${idxCols.join(", ")})`,
        );
      }
    }

    /**
     * Create in dependency order, and do NOT swallow failures.
     *
     * The model is iterated in declaration order, which has nothing to do with
     * foreign-key dependencies, so a table can be created before the one it
     * references. The old code hid that with `.catch(() => undefined)`: a table
     * that failed to create simply did not exist, and the first test to touch
     * it failed somewhere far away with no mention of DDL.
     *
     * Retrying until no further progress is made resolves any ordering the
     * model happens to have. Whatever is still failing afterwards is a real
     * error and is raised — a missing table must never be silent.
     */
    let remaining = pendingTables;
    while (remaining.length > 0) {
      const failed: typeof remaining = [];
      let lastError: Error | null = null;
      for (const table of remaining) {
        try {
          await dbClient.query(table.sql);
        } catch (err) {
          lastError = err as Error;
          failed.push(table);
        }
      }
      if (failed.length === remaining.length) {
        throw new Error(
          `Disposable schema could not be created. Unresolved tables: ${failed.map((t) => t.name).join(", ")}. Last error: ${lastError?.message}`,
        );
      }
      remaining = failed;
    }

    for (const idxSql of pendingIndexes) {
      await dbClient.query(idxSql);
    }

    // Tables and columns owned by the MAIN schema migrations.
    await dbClient.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS customer_account_state TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP;
      CREATE INDEX IF NOT EXISTS idx_users_phone_normalized ON users (phone_normalized);
      CREATE TABLE IF NOT EXISTS customer_repair_journeys (
        id TEXT PRIMARY KEY, customer_id TEXT, service_request_id TEXT, quote_request_id TEXT,
        job_ticket_id TEXT, current_stage TEXT NOT NULL DEFAULT 'draft',
        current_status TEXT NOT NULL DEFAULT 'active',
        customer_friendly_status TEXT NOT NULL DEFAULT 'Received.',
        next_action TEXT, next_action_label TEXT, next_update_eta TIMESTAMP,
        service_mode TEXT NOT NULL DEFAULT 'quote_only',
        pickup_required BOOLEAN NOT NULL DEFAULT FALSE,
        dropoff_required BOOLEAN NOT NULL DEFAULT FALSE,
        customer_note TEXT, admin_note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS customer_repair_journey_events (
        id TEXT PRIMARY KEY, journey_id TEXT NOT NULL, event_type TEXT NOT NULL,
        title TEXT NOT NULL, message TEXT, actor_type TEXT NOT NULL DEFAULT 'system',
        actor_id TEXT, metadata JSONB DEFAULT '{}',
        is_customer_visible BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS customer_reset_links (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ, invalidated_at TIMESTAMPTZ,
        invalidated_reason TEXT, phone_attempts INTEGER NOT NULL DEFAULT 0,
        created_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS logistics_tasks (
        id TEXT PRIMARY KEY, task_type TEXT, source_type TEXT,
        service_request_id TEXT, job_ticket_id TEXT, customer_id TEXT,
        customer_name TEXT, customer_phone TEXT, customer_phone_normalized TEXT,
        pickup_address TEXT, delivery_address TEXT, scheduled_date TIMESTAMP, time_window TEXT,
        status TEXT, assigned_driver_id TEXT, assigned_driver_name TEXT,
        zone TEXT, route_order NUMERIC, latitude NUMERIC, longitude NUMERIC,
        proof_photo_url TEXT, signature_url TEXT, notes TEXT, failure_reason TEXT,
        reschedule_reason TEXT, completed_at TIMESTAMP, cancelled_at TIMESTAMP,
        legacy_pickup_schedule_id TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `).catch(() => undefined);

    /**
     * Build custody_handover_codes from the REAL migration, not the Drizzle model.
     *
     * The generator above emits columns, types, PK, NOT NULL and defaults — but
     * never REFERENCES. So the harness produced a table with no foreign keys,
     * and a fully green suite proved nothing about the schema that actually
     * ships. It hid a defect that would have failed every single issuance in
     * production: the FK on notification_id is immediate, and issuance inserted
     * the custody row before the notification it points at.
     *
     * Running the migration's own `up()` means this table is exactly what
     * production gets, constraints included, and that class of defect fails
     * here on the first run instead of after deployment.
     */
    await dbClient.query(`DROP TABLE IF EXISTS custody_handover_codes`);
    const { MAIN_SCHEMA_MIGRATIONS } = await import("../server/services/main-schema-migrate.service.js");
    const custodyMigration = MAIN_SCHEMA_MIGRATIONS.find((m) => m.id === "2026_08_05_custody_handover_codes");
    if (!custodyMigration) throw new Error("custody_handover_codes migration missing from MAIN registry");
    await custodyMigration.up(dbClient as any);

    /**
     * customer_repair_journeys is managed entirely in raw SQL — it has no
     * Drizzle table at all — so a schema built from the model is missing
     * warranty_claim_id and every claim write 500s on "column does not exist".
     * Production has it. This keeps the harness honest to production rather
     * than to the model, which is the thing worth being faithful to.
     */
    await dbClient.query(
      `ALTER TABLE customer_repair_journeys ADD COLUMN IF NOT EXISTS warranty_claim_id TEXT`,
    );


    const hash = await bcrypt.hash(PASSWORD, 10);
    await dbClient.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions, joined_at)
       VALUES ('u-super','superadmin','Super Admin',$1,'Super Admin','Active','{}',NOW()),
              ('u-driver','testdriver','Test Driver',$1,'Driver','Active','{}',NOW())`,
      [hash],
    );

    const { createApp } = await import("../server/app.js");
    app = await createApp();
    resetDbPool = (await import("../server/db.js")).resetDbPool;
  }, 90_000);

  afterAll(async () => {
    if (!LOCAL_PG_AVAILABLE) return;
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (resetDbPool) await resetDbPool("claim closure teardown");
    if (dbClient) await dbClient.end();
    if (admin) {
      await admin.query(`
        SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid()
      `).catch(() => undefined);
      await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`).catch(() => undefined);
      await admin.end();
    }
  }, 30_000);


  /**
   * Admin write requests need a CSRF token fetched on the same cookie jar.
   * Without it every POST/PATCH is a 403 that says nothing about the feature.
   */
  async function adminAgent() {
    const agent = request.agent(app);
    await agent.post("/api/admin/login").send({ username: "superadmin", password: PASSWORD }).expect(200);
    const csrfRes = await agent.get("/api/admin/csrf-token");
    const csrf = csrfRes.body?.csrfToken;
    return {
      post: (url: string) => agent.post(url).set(csrf ? { "X-XSRF-TOKEN": csrf } : {}),
      patch: (url: string) => agent.patch(url).set(csrf ? { "X-XSRF-TOKEN": csrf } : {}),
    };
  }

  const CLAIM_ID = "QA-CLAIM-CLOSE-1";
  const ORIGINAL_JOB_ID = "QA-JOB-ORIGINAL-1";
  let newJobId = "";

  it("an approved claim becomes in_repair when its job is created", async () => {
    const agent = await adminAgent();

    // A finished repair, still under parts warranty.
    const future = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
    await dbClient.query(
      `INSERT INTO job_tickets (id, customer, customer_phone, device, issue, status,
         warranty_days, warranty_expiry_date, parts_warranty_days, parts_warranty_expiry_date,
         created_at, completed_at)
       VALUES ($1,'QA Claim Customer',$2,'LG 43in','Panel replacement','Completed',
         30,$3,180,$3,NOW(),NOW())`,
      [ORIGINAL_JOB_ID, CUSTOMER_PHONE, future],
    );

    await dbClient.query(
      `INSERT INTO warranty_claims (id, original_job_id, customer, customer_phone, device,
         claim_type, claim_reason, warranty_valid, warranty_expiry_date,
         claimed_by, claimed_by_name, claimed_by_role, status, created_at, updated_at)
       VALUES ($1,$2,'QA Claim Customer',$3,'LG 43in','parts','Lines on screen returned',
         TRUE,$4,'qa','QA Admin','Super Admin','approved',NOW(),NOW())`,
      [CLAIM_ID, ORIGINAL_JOB_ID, CUSTOMER_PHONE, future],
    );

    const res = await agent.post(`/api/warranty-claims/${CLAIM_ID}/create-job`).send({});
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    newJobId = res.body?.job?.id;
    expect(newJobId, "create-job must return the new job").toBeTruthy();

    const { rows } = await dbClient.query(
      `SELECT status, new_job_id FROM warranty_claims WHERE id = $1`, [CLAIM_ID],
    );
    expect(rows[0].status).toBe("in_repair");
    expect(rows[0].new_job_id).toBe(newJobId);
  }, 30_000);

  it("finishing the re-service job closes the claim", async () => {
    const agent = await adminAgent();

    /**
     * Walked the way a technician walks it, not forced with an UPDATE.
     *
     * There is no PATCH /api/job-tickets/:id — status only moves through
     * advance-status and set-outcome, and 'In Progress' deliberately refuses a
     * blind advance. Writing 'Completed' straight into the row would have
     * skipped transitionJobStatus, which is exactly the funnel the fix has to
     * hang off, so the test would have proved nothing about the real path.
     */
    const step = async (label: string, call: Promise<any>) => {
      const r = await call;
      expect(r.status, `${label}: ${JSON.stringify(r.body)}`).toBeLessThan(400);
      return r;
    };
    await step("Pending -> In Progress", agent.post(`/api/job-tickets/${newJobId}/advance-status`).send({}));
    await step("In Progress -> Testing", agent.post(`/api/job-tickets/${newJobId}/set-outcome`).send({ outcome: "repair_ok" }));
    // Ready is gated on durable final-test evidence, not on a checkbox.
    await step("final test pass", agent.post(`/api/job-tickets/${newJobId}/final-test-runs`).send({ outcome: "pass", checkCodes: ["power_on", "picture", "sound"] }));
    await step("Testing -> Ready", agent.post(`/api/job-tickets/${newJobId}/advance-status`).send({ testingConfirmed: true }));
    await step("Ready -> Completed", agent.post(`/api/job-tickets/${newJobId}/advance-status`).send({}));

    const { rows: jobRows } = await dbClient.query(
      `SELECT status FROM job_tickets WHERE id = $1`, [newJobId],
    );
    expect(jobRows[0].status, "the re-service job really did complete").toBe("Completed");

    /**
     * The claim must not still be open.
     *
     * Left at in_repair it is indistinguishable from work in progress, so the
     * claims list becomes a graveyard and nobody can answer "what is still
     * outstanding?" — which is the only question that list exists to answer.
     */
    const { rows } = await dbClient.query(
      `SELECT status FROM warranty_claims WHERE id = $1`, [CLAIM_ID],
    );
    // 'completed' is the terminal state the schema itself documents:
    // 'pending' | 'approved' | 'rejected' | 'in_repair' | 'completed'.
    expect(rows[0].status, "claim should close once its re-service job is done").toBe("completed");
  }, 30_000);
});
