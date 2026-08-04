/**
 * The driver handover flow, end to end, against the real app and a real
 * disposable PostgreSQL.
 *
 * This is the half production QA could not reach: nobody has pressed Receive as
 * an actual Driver since the permission fix, because the driver password was
 * wrong. Everything here uses accounts created in this file, so no credentials
 * are needed and the whole journey can be walked.
 *
 * The journey: admin transfers a pickup request, the sole driver is assigned
 * automatically, that driver sends a handover code, the customer sees it in
 * their account, the driver redeems it, custody advances.
 *
 * Driven with supertest agents so each actor has their own cookie jar — the
 * permission boundary being tested is real, not simulated.
 *
 * Skips when no local PostgreSQL is reachable. The database is created and
 * dropped within this file.
 */
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import request from "supertest";
import bcrypt from "bcryptjs";

const MAINT_URL = process.env.TEST_LOCAL_PG_URL || "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const DB_NAME = `qa_handover_${process.pid.toString(36)}_${Date.now().toString(36)}`;
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

describe.skipIf(!LOCAL_PG_AVAILABLE)("driver handover flow (real app, disposable PostgreSQL)", () => {
  let admin: pg.Client;
  let dbClient: pg.Client;
  let app: any;
  let resetDbPool: (reason: string) => Promise<void>;
  const originalEnv: Record<string, string | undefined> = {};

  let serviceRequestId = "";
  let ticketNumber = "";

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
    const { PgTable } = await import("drizzle-orm/pg-core");
    const schema = await import("../shared/schema.js");
    for (const value of Object.values(schema as Record<string, unknown>)) {
      if (!is(value, PgTable)) continue;
      const table = value as any;
      const name = table[Object.getOwnPropertySymbols(table)
        .find((s) => String(s) === "Symbol(drizzle:Name)")!];
      const cols = Object.values(getTableColumns(table) as Record<string, any>).map((col) => {
        const type = col.dataType === "boolean" ? "BOOLEAN"
          : col.dataType === "number" ? "NUMERIC"
          : col.dataType === "date" ? "TIMESTAMP"
          : col.dataType === "json" ? "JSONB" : "TEXT";
        const parts = [`"${col.name}"`, type];
        if (col.primary) parts.push("PRIMARY KEY");
        else if (col.notNull && !col.hasDefault) parts.push("NOT NULL");
        // Defaults matter: pickup_schedules.created_at feeds logistics_tasks,
        // which is NOT NULL there. Dropping the default made intake insert a
        // null and the sync failed silently.
        if (col.hasDefault && type === "TIMESTAMP") parts.push("DEFAULT NOW()");
        return parts.join(" ");
      });
      await dbClient.query(`CREATE TABLE IF NOT EXISTS "${name}" (${cols.join(", ")})`).catch(() => undefined);
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
    if (resetDbPool) await resetDbPool("handover flow teardown");
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
   * Sign in and satisfy the two preconditions every admin mutation has, both of
   * which cost real time to discover:
   *
   *   - CSRF: admin POSTs need X-XSRF-TOKEN, so the token must be fetched first
   *     (403 without it).
   *   - Attendance: gated staff must have checked in for the day or every
   *     mutation returns 412 CHECK_IN_REQUIRED. A driver who has not checked in
   *     genuinely cannot perform a handover — that is the business rule, not a
   *     test artefact.
   */
  const loginAdmin = async (username: string) => {
    const agent = request.agent(app);
    const res = await agent.post("/api/admin/login").send({ username, password: PASSWORD });
    expect(res.status, `login ${username}`).toBe(200);

    const csrfRes = await agent.get("/api/admin/csrf-token");
    const csrf = csrfRes.body?.csrfToken;

    const post = (url: string) =>
      agent.post(url).set(csrf ? { "X-XSRF-TOKEN": csrf } : {});

    return { agent, post };
  };

  /** Record a check-in so the attendance gate lets this user act. */
  const checkIn = async (userId: string, name: string, role: string) => {
    await dbClient.query(
      `INSERT INTO attendance_records (id, user_id, user_name, user_role, check_in_time, date)
       VALUES ($1, $2, $3, $4, NOW(), to_char(now() AT TIME ZONE 'Asia/Dhaka','YYYY-MM-DD'))
       ON CONFLICT DO NOTHING`,
      [`att-${userId}`, userId, name, role],
    );
  };

  it("a customer submits a pickup request and the sole driver is assigned automatically", async () => {
    const customer = request.agent(app);
    const submitted = await customer.post("/api/service-requests").send({
      brand: "Samsung", primaryIssue: "No power", customerName: "Handover Test",
      phone: CUSTOMER_PHONE, address: "Test address",
      servicePreference: "home_pickup", serviceMode: "pickup",
      requestIntent: "repair", status: "Pending",
    });
    expect(submitted.status).toBe(201);
    serviceRequestId = submitted.body.id;
    ticketNumber = submitted.body.ticketNumber;

    await checkIn("u-super", "Super Admin", "Super Admin");
    const superAdmin = await loginAdmin("superadmin");
    const transfer = await superAdmin
      .post(`/api/admin/service-requests/${serviceRequestId}/transfer-to-pickup`)
      .send({});

    expect(transfer.status).toBe(201);
    // The two things that were broken: the stage never moved, and the task sat
    // unassigned waiting for a human.
    expect(transfer.body.stage).toBe("pickup_scheduled");
    expect(transfer.body.autoAssignedDriver).toBe("Test Driver");
  }, 30_000);

  it("the DRIVER can send a handover code — this returned 403 before the fix", async () => {
    await checkIn("u-driver", "Test Driver", "Driver");
    const driver = await loginAdmin("testdriver");
    const send = await driver
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/send`)
      .send({ action: "receive" });

    expect(send.status).toBe(200);
    expect(send.body.codeIssued).toBe(true);
    // SMS is stubbed as failing, as it is in production. In-app must carry it.
    expect(send.body.delivered.sms).toBe(false);
    expect(send.body.delivered.inApp).toBe(true);
  }, 30_000);

  it("the code never appears anywhere on the driver's side", async () => {
    // Assert the PRODUCTION contract: _testCode is a development-only
    // affordance, so flip the flag the route reads for this request.
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
    await checkIn("u-driver", "Test Driver", "Driver");
    const driver = await loginAdmin("testdriver");
    const send = await driver
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/send`)
      .send({ action: "receive" });

    // A driver who can read the code can confirm a handover with no customer
    // present, which removes the control entirely.
    const body = JSON.stringify(send.body);
    expect(body).not.toMatch(/\b\d{6}\b/);
    expect(body).not.toContain("_testCode");
    // The phone is masked too, so a driver cannot harvest customer numbers.
    expect(body).not.toContain(CUSTOMER_PHONE);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  }, 30_000);

  it("the customer can read the code in their own account", async () => {
    const rows = await dbClient.query(
      `SELECT message FROM notifications WHERE user_id = (
         SELECT id FROM users WHERE phone = $1 LIMIT 1
       ) ORDER BY created_at DESC LIMIT 1`,
      [CUSTOMER_PHONE],
    );
    expect(rows.rowCount).toBeGreaterThan(0);
    expect(String(rows.rows[0].message)).toMatch(/\b\d{6}\b/);
  }, 30_000);

  it("a wrong code is refused, and the right one completes the handover", async () => {
    await checkIn("u-driver", "Test Driver", "Driver");
    const driver = await loginAdmin("testdriver");

    const wrong = await driver
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/confirm`)
      .send({ action: "receive", code: "000000" });
    expect(wrong.status).toBe(400);

    // Read the real code the way the customer would.
    const rows = await dbClient.query(
      `SELECT message FROM notifications WHERE user_id = (
         SELECT id FROM users WHERE phone = $1 LIMIT 1
       ) ORDER BY created_at DESC LIMIT 1`,
      [CUSTOMER_PHONE],
    );
    const code = String(rows.rows[0].message).match(/\b(\d{6})\b/)?.[1];
    expect(code).toBeTruthy();

    const confirm = await driver
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/confirm`)
      .send({ action: "receive", code });
    expect(confirm.status).toBe(200);

    const sr = await dbClient.query(`SELECT stage FROM service_requests WHERE id = $1`, [serviceRequestId]);
    expect(sr.rows[0].stage).not.toBe("pickup_scheduled");
  }, 30_000);

  it("a driver still cannot reach service-request administration", async () => {
    await checkIn("u-driver", "Test Driver", "Driver");
    const driver = await loginAdmin("testdriver");
    const res = await driver.agent.get("/api/service-requests");
    expect([401, 403]).toContain(res.status);
  }, 30_000);
});
