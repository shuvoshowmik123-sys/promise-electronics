/**
 * Same-session account claim — end-to-end against the real app and a real
 * disposable PostgreSQL.
 *
 * The journey this proves, reproduced on production before the fix:
 *
 *   POST /api/service-requests   201   (intake creates an unclaimed account)
 *   POST /api/customer/register  400   ACCOUNT_SETUP_REQUIRED
 *
 * The customer was told to contact support about a repair record they had
 * created seconds earlier, from the same browser.
 *
 * Registration now succeeds when the request carries the session that submitted
 * the repair — and only then. Knowing the phone number is not enough, which is
 * the second test here and the one that matters for security.
 *
 * Uses supertest's `agent`, which persists cookies across requests, so the
 * session continuity being tested is genuine rather than simulated.
 *
 * Skips when no local PostgreSQL is reachable. The database is created and
 * dropped within this file.
 */
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import request from "supertest";

const MAINT_URL = process.env.TEST_LOCAL_PG_URL || "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const DB_NAME = `qa_claim_${process.pid.toString(36)}_${Date.now().toString(36)}`;
const DISPOSABLE_URL = MAINT_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);

// The readiness gate 503s every route until a full MAIN schema boot has run.
// We build the schema directly, so force it ready — every other export stays real.
vi.mock("../server/services/db-readiness.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../server/services/db-readiness.js")>();
    return { ...actual, isDbReady: () => true };
});

// Rate limits are per-IP and every test here shares one. Registration allows 3
// per hour, so the fourth test would 429 on a limiter rather than the behaviour
// under test. Limits themselves are proven elsewhere; disable them here.
vi.mock("../server/routes/middleware/rate-limit.js", async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
    const stubbed: Record<string, unknown> = {};
    for (const key of Object.keys(actual)) {
        stubbed[key] = typeof actual[key] === "function" ? passThrough : actual[key];
    }
    return stubbed;
});

function probeLocalPostgres(): boolean {
  if (!/localhost|127\.0\.0\.1|::1/i.test(MAINT_URL)) return false;
  const script = `
    const pg = require(${JSON.stringify("pg")});
    const c = new pg.Client({
      connectionString: ${JSON.stringify(MAINT_URL)},
      connectionTimeoutMillis: 3000,
    });
    c.connect()
      .then(() => { console.log("PG_OK"); return c.end(); })
      .catch(() => { process.exit(0); });
  `;
  const res = spawnSync(process.execPath, ["-e", script], {
    cwd: process.cwd(),
    timeout: 10_000,
    encoding: "utf8",
  });
  return /PG_OK/.test(res.stdout || "");
}

const LOCAL_PG_AVAILABLE = probeLocalPostgres();

const REPAIR = {
  brand: "Samsung",
  primaryIssue: "No power",
  customerName: "QA Claim Test",
  servicePreference: "service_center",
  serviceMode: "drop_off",
  requestIntent: "repair",
  status: "Pending",
};

describe.skipIf(!LOCAL_PG_AVAILABLE)("same-session account claim (real app, disposable PostgreSQL)", () => {
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

    // Build every table from the drizzle schema. Hand-listing columns rots the
    // moment a field is added; foreign keys are omitted so creation order does
    // not matter for a throwaway database.
    const { getTableColumns, is } = await import("drizzle-orm");
    const { PgTable } = await import("drizzle-orm/pg-core");
    const schema = await import("../shared/schema.js");

    for (const value of Object.values(schema as Record<string, unknown>)) {
      if (!is(value, PgTable)) continue;
      const table = value as any;
      const name = table[Object.getOwnPropertySymbols(table).find(
        (s) => String(s) === "Symbol(drizzle:Name)",
      )!];
      const columns = getTableColumns(table);

      const ddl = Object.values(columns as Record<string, any>).map((col) => {
        const type =
          col.dataType === "boolean" ? "BOOLEAN" :
          col.dataType === "number" ? "NUMERIC" :
          col.dataType === "date" ? "TIMESTAMP" :
          col.dataType === "json" ? "JSONB" :
          "TEXT";
        const parts = [`"${col.name}"`, type];
        if (col.primary) parts.push("PRIMARY KEY");
        else if (col.notNull && !col.hasDefault) parts.push("NOT NULL");
        return parts.join(" ");
      });

      await dbClient.query(`CREATE TABLE IF NOT EXISTS "${name}" (${ddl.join(", ")})`).catch(() => undefined);
    }

    // Tables and columns created by the MAIN schema migrations rather than the
    // drizzle model. Registration touches all of these: password_changed_at on
    // claim, customer_repair_journeys via the account linker, and
    // customer_reset_links when invalidating any outstanding staff-issued link.
    await dbClient.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS customer_account_state TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP;
      CREATE INDEX IF NOT EXISTS idx_users_phone_normalized ON users (phone_normalized);

      CREATE TABLE IF NOT EXISTS customer_repair_journeys (
        id TEXT PRIMARY KEY,
        customer_id TEXT,
        service_request_id TEXT,
        quote_request_id TEXT,
        job_ticket_id TEXT,
        current_stage TEXT NOT NULL DEFAULT 'draft',
        current_status TEXT NOT NULL DEFAULT 'active',
        customer_friendly_status TEXT NOT NULL DEFAULT 'We received your request.',
        next_action TEXT,
        next_action_label TEXT,
        next_update_eta TIMESTAMP,
        service_mode TEXT NOT NULL DEFAULT 'quote_only',
        pickup_required BOOLEAN NOT NULL DEFAULT FALSE,
        dropoff_required BOOLEAN NOT NULL DEFAULT FALSE,
        customer_note TEXT,
        admin_note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS customer_repair_journey_events (
        id TEXT PRIMARY KEY,
        journey_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT,
        actor_type TEXT NOT NULL DEFAULT 'system',
        actor_id TEXT,
        metadata JSONB DEFAULT '{}',
        is_customer_visible BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS customer_reset_links (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        invalidated_at TIMESTAMPTZ,
        invalidated_reason TEXT,
        phone_attempts INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `).catch(() => undefined);

    const { createApp } = await import("../server/app.js");
    app = await createApp();
    const dbModule = await import("../server/db.js");
    resetDbPool = dbModule.resetDbPool;
  }, 60_000);

  afterAll(async () => {
    if (!LOCAL_PG_AVAILABLE) return;
    for (const [k, v] of Object.entries(originalEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (resetDbPool) await resetDbPool("same-session claim test cleanup");
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

  it("the browser that submitted the request can register with that number", async () => {
    const phone = "+8801711100001";
    // agent(), not request() — cookies persist, so this is one browser.
    const browser = request.agent(app);

    const submitted = await browser.post("/api/service-requests").send({ ...REPAIR, phone });
    expect(submitted.status).toBe(201);

    // Intake created an unclaimed account for this phone.
    const before = await dbClient.query(
      `SELECT customer_account_state FROM users WHERE phone = $1`, [phone],
    );
    expect(before.rows[0]?.customer_account_state).toBe("unclaimed");

    // Same browser, same number. This returned 400 ACCOUNT_SETUP_REQUIRED before.
    const registered = await browser.post("/api/customer/register").send({
      name: "QA Claim Test",
      phone,
      password: "QaClaim12345!",
    });
    expect(registered.status).toBe(201);

    const after = await dbClient.query(
      `SELECT customer_account_state, password FROM users WHERE phone = $1`, [phone],
    );
    expect(after.rows[0]?.customer_account_state).toBe("active");
    expect(String(after.rows[0]?.password).startsWith("$2")).toBe(true);
  }, 30_000);

  it("a DIFFERENT browser cannot claim the same number", async () => {
    const phone = "+8801711100002";

    const submitter = request.agent(app);
    const submitted = await submitter.post("/api/service-requests").send({ ...REPAIR, phone });
    expect(submitted.status).toBe(201);

    // A stranger who knows the number, with no session from the submission.
    const stranger = request.agent(app);
    const attempt = await stranger.post("/api/customer/register").send({
      name: "Not The Submitter",
      phone,
      password: "Attacker12345!",
    });

    expect(attempt.status).toBe(400);
    expect(attempt.body.code).toBe("ACCOUNT_SETUP_REQUIRED");

    const row = await dbClient.query(
      `SELECT customer_account_state FROM users WHERE phone = $1`, [phone],
    );
    expect(row.rows[0]?.customer_account_state).toBe("unclaimed");
  }, 30_000);

  it("the claim is single-use — the same session cannot claim twice", async () => {
    const phone = "+8801711100003";
    const browser = request.agent(app);

    await browser.post("/api/service-requests").send({ ...REPAIR, phone });
    const first = await browser.post("/api/customer/register").send({
      name: "QA Claim Test", phone, password: "QaClaim12345!",
    });
    expect(first.status).toBe(201);

    // Now active, so a second attempt is an ordinary duplicate, not a claim.
    const second = await browser.post("/api/customer/register").send({
      name: "QA Claim Test", phone, password: "Different12345!",
    });
    expect(second.status).toBe(400);
    expect(second.body.code).not.toBe("ACCOUNT_SETUP_REQUIRED");
  }, 30_000);

  it("registering with a password up front never creates an unclaimed account", async () => {
    // The mobile wizard's new optional password field registers BEFORE
    // submitting, which is what stops the unclaimed row existing at all.
    const phone = "+8801711100004";
    const browser = request.agent(app);

    const registered = await browser.post("/api/customer/register").send({
      name: "QA Upfront", phone, password: "QaUpfront12345!",
    });
    expect(registered.status).toBe(201);

    const submitted = await browser.post("/api/service-requests").send({ ...REPAIR, phone });
    expect(submitted.status).toBe(201);

    const rows = await dbClient.query(
      `SELECT customer_account_state FROM users WHERE phone = $1`, [phone],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]?.customer_account_state).not.toBe("unclaimed");
  }, 30_000);
});
