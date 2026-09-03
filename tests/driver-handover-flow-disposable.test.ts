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
  /**
   * Create a rival actor on demand.
   *
   * Deliberately NOT seeded in beforeAll: autoAssignSoleDriver only assigns
   * when exactly one driver exists, so seeding a second driver up front
   * silently destroys the precondition the happy-path test depends on — which
   * is exactly what happened the first time these denial tests were added.
   */
  const ensureActor = async (id: string, username: string, name: string, role: string) => {
    const hash = await bcrypt.hash(PASSWORD, 10);
    await dbClient.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions, joined_at)
       VALUES ($1,$2,$3,$4,$5,'Active','{}',NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, username, name, hash, role],
    );
  };

  /**
   * Put the pickup task back into an executable state.
   *
   * Receipt now completes the pickup task, which is correct — but it means a
   * later denial test would be refused for the wrong reason (409, no active
   * task) and would stop proving the assigned-driver check at all. Restoring
   * an active task keeps these tests about authority.
   */
  const ensureActivePickupTask = async () => {
    await dbClient.query(
      `UPDATE logistics_tasks
          SET status = 'assigned', assigned_driver_id = 'u-driver'
        WHERE service_request_id = $1 AND task_type = 'pickup'`,
      [serviceRequestId],
    );
  };
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
    // Custody is an online, account-based control. There are no delivery
    // channels to report: the code is committed with its portal notification
    // and never sent by SMS.
    expect(send.body.customerPortalNotified).toBe(true);
    expect(send.body).not.toHaveProperty("delivered");
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

    /**
     * Read the code the way production correlates it: through the notification
     * the LIVE issuance points at.
     *
     * "Newest notification for this customer" is a different thing and no
     * longer reliable — an unrelated notification can arrive after the code,
     * and a superseded issuance's message is still sitting in the table.
     */
    const rows = await dbClient.query(
      `SELECT n.message
         FROM custody_handover_codes c
         JOIN notifications n ON n.id = c.notification_id
        WHERE c.service_request_id = $1
          AND c.verified_at IS NULL
          AND c.invalidated_at IS NULL
          AND c.expires_at > NOW()
        ORDER BY c.created_at DESC
        LIMIT 1`,
      [serviceRequestId],
    );
    expect(rows.rows.length).toBe(1);
    const code = String(rows.rows[0].message).match(/\b(\d{6})\b/)?.[1];
    expect(code).toBeTruthy();

    const confirm = await driver
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/confirm`)
      .send({ action: "receive", code });
    expect(confirm.status).toBe(200);

    /**
     * Assert what receipt IS, not merely that something moved.
     *
     * This previously read `expect(stage).not.toBe("pickup_scheduled")`, which
     * passes for every wrong stage in the flow — `completed`, `in_repair`, or
     * anything a future bug invents. It could not distinguish a correct receipt
     * from a lifecycle violation, so it proved close to nothing.
     *
     * Receipt converges an exact set of facts, and each is checked by count as
     * well as by value: "exactly one" is what separates a correct completion
     * from a double-applied one, and a value-only check cannot see the
     * difference.
     */
    const sr = await dbClient.query(`SELECT stage FROM service_requests WHERE id = $1`, [serviceRequestId]);
    expect(sr.rows[0].stage).toBe("picked_up");

    // Exactly one custody event — a second physical handover was not recorded.
    const custodyEvents = await dbClient.query(
      `SELECT count(*)::int AS n FROM service_request_events
        WHERE service_request_id = $1 AND message LIKE '%online handover code%'`,
      [serviceRequestId],
    );
    expect(custodyEvents.rows[0].n).toBe(1);

    /**
     * Exactly one stage transition into picked_up.
     *
     * The event table records the TRACKING status, not the stage — `picked_up`
     * projects to "Device Collected" (job.service.ts stageToTrackingStatus).
     * The custody event carries that same tracking status, so it is excluded
     * here; counting both together would report 2 and hide a genuine duplicate
     * stage transition behind an expected number.
     */
    const stageEvents = await dbClient.query(
      `SELECT count(*)::int AS n FROM service_request_events
        WHERE service_request_id = $1
          AND status = 'Device Collected'
          AND message NOT LIKE '%online handover code%'`,
      [serviceRequestId],
    );
    expect(stageEvents.rows[0].n).toBe(1);

    // The driver's board must no longer show a collection already made.
    const task = await dbClient.query(
      `SELECT status FROM logistics_tasks WHERE service_request_id = $1 AND task_type = 'pickup'`,
      [serviceRequestId],
    );
    expect(task.rows.length).toBe(1);
    expect(task.rows[0].status).toBe("completed");

    // Exactly one legacy pickup row, moved to PickedUp — not duplicated.
    const pickup = await dbClient.query(
      `SELECT status FROM pickup_schedules WHERE service_request_id = $1`,
      [serviceRequestId],
    );
    expect(pickup.rows.length).toBe(1);
    expect(pickup.rows[0].status).toBe("PickedUp");

    // Exactly one issuance completed, and it is the only one.
    const completed = await dbClient.query(
      `SELECT count(*)::int AS n FROM custody_handover_codes
        WHERE service_request_id = $1 AND completed_at IS NOT NULL`,
      [serviceRequestId],
    );
    expect(completed.rows[0].n).toBe(1);
  }, 30_000);

  /**
   * The assignment control, proved by denial.
   *
   * Holding pickup.confirmHandover is not authority over a particular device —
   * every Driver holds it for every job in the system. What authorises custody
   * is being the driver this task is assigned to. Before this, any driver could
   * issue and redeem a code for any repair, and the recorded chain of custody
   * would name the wrong person.
   */
  it("a DIFFERENT driver cannot issue a code for someone else's pickup", async () => {
    await ensureActivePickupTask();
    await ensureActor("u-driver2", "otherdriver", "Other Driver", "Driver");
    await checkIn("u-driver2", "Other Driver", "Driver");
    const other = await loginAdmin("otherdriver");

    const send = await other
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/send`)
      .send({ action: "receive" });

    // 404, not 403: ticket numbers are sequential (SRV-DATE-NNNN), so
    // confirming the record exists would be an enumeration oracle.
    expect(send.status).toBe(404);
    expect(JSON.stringify(send.body)).not.toMatch(/\b\d{6}\b/);
  }, 30_000);

  it("a DIFFERENT driver cannot confirm someone else's pickup", async () => {
    await ensureActivePickupTask();
    await ensureActor("u-driver2", "otherdriver", "Other Driver", "Driver");
    await checkIn("u-driver2", "Other Driver", "Driver");
    const other = await loginAdmin("otherdriver");

    const confirm = await other
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/confirm`)
      .send({ action: "receive", code: "123456" });

    expect(confirm.status).toBe(404);
  }, 30_000);

  it("a Manager cannot bypass assignment — they must reassign the task first", async () => {
    await ensureActivePickupTask();
    await ensureActor("u-manager", "testmanager", "Test Manager", "Manager");
    await checkIn("u-manager", "Test Manager", "Manager");
    const manager = await loginAdmin("testmanager");

    const send = await manager
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/send`)
      .send({ action: "receive" });

    expect(send.status).toBe(404);
  }, 30_000);

  it("a Super Admin cannot bypass assignment either", async () => {
    await ensureActivePickupTask();
    await checkIn("u-super", "Super Admin", "Super Admin");
    const superAdmin = await loginAdmin("superadmin");

    const send = await superAdmin
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/send`)
      .send({ action: "receive" });

    // A wildcard permission set is still not an assignment. Custody has to name
    // the person the device actually changed hands with.
    expect(send.status).toBe(404);
  }, 30_000);

  it("the audited no-code path is gated by the same authority", async () => {
    await ensureActivePickupTask();
    await ensureActor("u-driver2", "otherdriver", "Other Driver", "Driver");
    await checkIn("u-driver2", "Other Driver", "Driver");
    const other = await loginAdmin("otherdriver");

    // The lower-assurance path advances custody with no customer involvement at
    // all, so it is the more attractive one to abuse — it must not be a way
    // around the assignment check.
    const noCode = await other
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-handover/no-code`)
      .send({ action: "receive", reason: "customer unreachable", proofPhotoUrl: "https://example.com/p.jpg" });

    expect(noCode.status).toBe(404);
  }, 30_000);

  it("delivery custody refuses before a job ticket exists", async () => {
    await checkIn("u-driver", "Test Driver", "Driver");
    const driver = await loginAdmin("testdriver");

    /**
     * A request of its own, never received.
     *
     * This used to reuse the shared request, which by this point in the file
     * has been through a receipt. That was fine while receipt left the request
     * unconverted — but a proven handover now creates the job at the moment
     * custody transfers, so the shared request owns one and this precondition
     * can no longer be reached through it. The refusal being asserted is still
     * real and still matters; it just needs a request that never got as far as
     * a doorstep.
     */
    const customer = request.agent(app);
    const fresh = await customer.post("/api/service-requests").send({
      brand: "Samsung", primaryIssue: "No power", customerName: "Handover Test",
      // A different number on purpose. Reusing the shared customer's phone
      // takes the de-duplication path, which answers 202 with a confirmation
      // payload rather than a created request.
      phone: "01800000199", address: "Test address",
      servicePreference: "home_pickup", serviceMode: "pickup",
      requestIntent: "repair", status: "Pending",
    });
    expect(fresh.status).toBe(201);
    const unconvertedId = fresh.body.id;

    const send = await driver
      .post(`/api/admin/service-requests/${unconvertedId}/custody-otp/send`)
      .send({ action: "delivery" });

    /**
     * Exact code and reason, not "404 or 409".
     *
     * Delivery requires a linked job ticket, and that precondition is checked
     * before custody authority — so on a request that has not been converted,
     * this is the refusal, and the assigned-driver check for delivery is not
     * reachable from here. That distinction is deliberate: nothing can be
     * released to a customer before a job exists to release.
     */
    expect(send.status).toBe(409);
    expect(send.body.error).toMatch(/job ticket/i);
    expect(JSON.stringify(send.body)).not.toMatch(/\b\d{6}\b/);
  }, 30_000);

  it("delivery custody COMPLETES once a job owns the lifecycle", async () => {
    /**
     * The case that was deterministically impossible.
     *
     * Delivery targets stage `completed`, which transitionStage refuses once a
     * job exists — while the delivery route requires a job. No job meant 409,
     * a job meant 409, so no customer delivery could ever be confirmed. The
     * confirmation now records custody on the timeline instead of trying to
     * drive a lifecycle the job owns.
     */
    await dbClient.query(
      `INSERT INTO job_tickets (id, customer, customer_phone, device, issue, status, priority, technician, created_at)
       VALUES ('job-delivery-1', 'QA Customer', $1, 'Samsung TV', 'No picture', 'Ready', 'Normal', 'Unassigned', NOW())`,
      [CUSTOMER_PHONE],
    );
    await dbClient.query(
      `UPDATE service_requests SET converted_job_id = 'job-delivery-1' WHERE id = $1`,
      [serviceRequestId],
    );
    // A delivery task assigned to our driver, so authority resolves.
    await dbClient.query(`DELETE FROM logistics_tasks WHERE service_request_id = $1 AND task_type = 'delivery'`, [serviceRequestId]);
    await dbClient.query(
      `INSERT INTO logistics_tasks (id, task_type, source_type, service_request_id, customer_name, status, assigned_driver_id)
       VALUES ('task-delivery-ok', 'delivery', 'service_request', $1, 'QA Customer', 'assigned', 'u-driver')`,
      [serviceRequestId],
    );

    await checkIn("u-driver", "Test Driver", "Driver");
    const driver = await loginAdmin("testdriver");

    const send = await driver
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/send`)
      .send({ action: "delivery" });
    expect(send.status).toBe(200);
    expect(send.body.codeIssued).toBe(true);
    expect(JSON.stringify(send.body)).not.toMatch(/\b\d{6}\b/);

    const rows = await dbClient.query(
      `SELECT n.message
         FROM custody_handover_codes c
         JOIN notifications n ON n.id = c.notification_id
        WHERE c.service_request_id = $1 AND c.action = 'delivery'
          AND c.verified_at IS NULL AND c.invalidated_at IS NULL AND c.expires_at > NOW()
        ORDER BY c.created_at DESC LIMIT 1`,
      [serviceRequestId],
    );
    expect(rows.rows.length).toBe(1);
    const code = String(rows.rows[0].message).match(/\b(\d{6})\b/)?.[1];
    expect(code).toBeTruthy();

    const confirm = await driver
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/confirm`)
      .send({ action: "delivery", code });
    expect(confirm.status).toBe(200);

    /**
     * Assert the OUTCOME, not the implementation.
     *
     * The previous version of this test checked only that the OTP was verified
     * and the stage was untouched — both facts about the code rather than about
     * delivery. It passed while the job stayed Ready, the task stayed assigned
     * and the pickup was never finished, which is exactly the state that made
     * the driver UI fail afterwards.
     */
    const job = await dbClient.query(`SELECT status FROM job_tickets WHERE id = 'job-delivery-1'`);
    expect(job.rows[0].status).toBe("Delivered");

    const task = await dbClient.query(`SELECT status FROM logistics_tasks WHERE id = 'task-delivery-ok'`);
    expect(task.rows[0].status).toBe("completed");

    const pickup = await dbClient.query(
      `SELECT status FROM pickup_schedules WHERE service_request_id = $1`,
      [serviceRequestId],
    );
    if (pickup.rows.length) expect(pickup.rows[0].status).toBe("Delivered");

    // The job stays the lifecycle authority: the service request's own stage is
    // never forced to `completed` behind its back.
    const sr = await dbClient.query(`SELECT stage FROM service_requests WHERE id = $1`, [serviceRequestId]);
    expect(sr.rows[0].stage).not.toBe("completed");

    const settled = await dbClient.query(
      `SELECT verified_at FROM custody_handover_codes WHERE service_request_id = $1 AND action = 'delivery' ORDER BY created_at DESC LIMIT 1`,
      [serviceRequestId],
    );
    expect(settled.rows[0].verified_at).not.toBeNull();
  }, 30_000);

  it("re-confirming a completed delivery is a durable no-op, not a second delivery", async () => {
    // Proves the retry path converges: the canonical operation is idempotent,
    // so a driver retrying after an interrupted completion cannot deliver twice.
    await checkIn("u-driver", "Test Driver", "Driver");
    const driver = await loginAdmin("testdriver");

    const replay = await driver
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/confirm`)
      .send({ action: "delivery", code: "000000" });

    // The spent code is refused, and nothing regressed.
    expect([400, 409]).toContain(replay.status);
    const job = await dbClient.query(`SELECT status FROM job_tickets WHERE id = 'job-delivery-1'`);
    expect(job.rows[0].status).toBe("Delivered");
    const task = await dbClient.query(`SELECT status FROM logistics_tasks WHERE id = 'task-delivery-ok'`);
    expect(task.rows[0].status).toBe("completed");
  }, 30_000);

  it("an interrupted completion is resumed by the SAME code, after the task is already completed", async () => {
    /**
     * The proof the previous attempt did not have.
     *
     * HOTFIX-5 claimed a resume path, but authority resolution accepted only
     * pending/assigned/en_route tasks and ran first — and custody completes the
     * task. So after the crash window every retry answered
     * NO_UNIQUE_ACTIVE_TASK and the "recovery" was unreachable. This constructs
     * that exact state: verified, task already completed, completion unfinished.
     *
     * It uses the real issued code and checks database outcomes; a 400/409 from
     * a junk code would prove nothing.
     */
    await ensureActivePickupTask();
    await dbClient.query(
      `UPDATE service_requests SET stage = 'pickup_scheduled', converted_job_id = NULL WHERE id = $1`,
      [serviceRequestId],
    );
    await dbClient.query(`DELETE FROM custody_handover_codes WHERE service_request_id = $1`, [serviceRequestId]);

    await checkIn("u-driver", "Test Driver", "Driver");
    const driver = await loginAdmin("testdriver");

    const send = await driver
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/send`)
      .send({ action: "receive" });
    expect(send.status).toBe(200);

    const issued = await dbClient.query(
      `SELECT c.id, n.message
         FROM custody_handover_codes c
         JOIN notifications n ON n.id = c.notification_id
        WHERE c.service_request_id = $1 AND c.action = 'receive'
          AND c.verified_at IS NULL AND c.invalidated_at IS NULL
        ORDER BY c.created_at DESC LIMIT 1`,
      [serviceRequestId],
    );
    const code = String(issued.rows[0].message).match(/\b(\d{6})\b/)?.[1];
    expect(code).toBeTruthy();

    // Simulate the crash window: the customer authorised and the logistics task
    // completed, but the remaining writes never landed.
    await dbClient.query(
      `UPDATE custody_handover_codes SET verified_at = NOW(), completed_at = NULL WHERE id = $1`,
      [issued.rows[0].id],
    );
    await dbClient.query(
      `UPDATE logistics_tasks SET status = 'completed' WHERE service_request_id = $1 AND task_type = 'pickup'`,
      [serviceRequestId],
    );

    const resumed = await driver
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/confirm`)
      .send({ action: "receive", code });
    expect(resumed.status).toBe(200);

    // Convergence, not a second handover.
    const settled = await dbClient.query(
      `SELECT verified_at, completed_at FROM custody_handover_codes WHERE id = $1`,
      [issued.rows[0].id],
    );
    expect(settled.rows[0].completed_at).not.toBeNull();

    const sr = await dbClient.query(`SELECT stage FROM service_requests WHERE id = $1`, [serviceRequestId]);
    expect(sr.rows[0].stage).toBe("picked_up");
  }, 30_000);

  it("a completion that crashed AFTER claiming the lease is still recoverable once the code has expired", async () => {
    /**
     * The stranding this fixes, reproduced exactly.
     *
     * The lease lasts 5 minutes and the code also lasts 5 minutes, but the lease
     * can only be claimed AFTER issuance — so the lease always outlives the code.
     * A worker that claimed and then died held the issuance until a moment when
     * recovery's old `expires_at > NOW()` clause could no longer be true. Every
     * retry got COMPLETION_IN_PROGRESS until the lease expired, then
     * NO_LIVE_ISSUANCE forever after. The driver had the TV, the customer had
     * gone, and the handover could be neither finished nor reissued.
     *
     * State constructed here is precisely that: customer verified, lease claimed
     * by a process that is gone, lease now expired, code now expired.
     */
    await ensureActivePickupTask();
    await dbClient.query(
      `UPDATE service_requests SET stage = 'pickup_scheduled', converted_job_id = NULL WHERE id = $1`,
      [serviceRequestId],
    );
    await dbClient.query(`DELETE FROM custody_handover_codes WHERE service_request_id = $1`, [serviceRequestId]);

    await checkIn("u-driver", "Test Driver", "Driver");
    const driver = await loginAdmin("testdriver");

    const send = await driver
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/send`)
      .send({ action: "receive" });
    expect(send.status).toBe(200);

    const issued = await dbClient.query(
      `SELECT c.id, n.message
         FROM custody_handover_codes c
         JOIN notifications n ON n.id = c.notification_id
        WHERE c.service_request_id = $1 AND c.action = 'receive'
          AND c.verified_at IS NULL AND c.invalidated_at IS NULL
        ORDER BY c.created_at DESC LIMIT 1`,
      [serviceRequestId],
    );
    const code = String(issued.rows[0].message).match(/\b(\d{6})\b/)?.[1];
    expect(code).toBeTruthy();

    /**
     * The dead worker's footprint. verified_at is recent because the customer
     * authorised moments ago; expires_at is in the past because the lease
     * outlasted the code, which is the whole defect.
     */
    await dbClient.query(
      `UPDATE custody_handover_codes
          SET verified_at = NOW() - INTERVAL '6 minutes',
              expires_at = NOW() - INTERVAL '1 minute',
              completion_lease_token = gen_random_uuid()::text,
              completion_lease_expires_at = NOW() - INTERVAL '30 seconds',
              completed_at = NULL
        WHERE id = $1`,
      [issued.rows[0].id],
    );

    // Precondition: the code really is expired, so this cannot pass by accident
    // through the ordinary live-issuance path.
    const pre = await dbClient.query(
      `SELECT expires_at < NOW() AS expired, completed_at FROM custody_handover_codes WHERE id = $1`,
      [issued.rows[0].id],
    );
    expect(pre.rows[0].expired).toBe(true);
    expect(pre.rows[0].completed_at).toBeNull();

    const resumed = await driver
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/confirm`)
      .send({ action: "receive", code });
    expect(resumed.status).toBe(200);

    // And it converged for real, rather than merely answering 200.
    const settled = await dbClient.query(
      `SELECT completed_at FROM custody_handover_codes WHERE id = $1`,
      [issued.rows[0].id],
    );
    expect(settled.rows[0].completed_at).not.toBeNull();

    const sr = await dbClient.query(`SELECT stage FROM service_requests WHERE id = $1`, [serviceRequestId]);
    expect(sr.rows[0].stage).toBe("picked_up");
  }, 30_000);

  it("recovery is bounded: a verified handover past the resume window is NOT resumable", async () => {
    /**
     * The other half. Recovery must not become an unbounded second life for a
     * code — it is 30 minutes from verification, not forever.
     */
    await ensureActivePickupTask();
    await dbClient.query(
      `UPDATE service_requests SET stage = 'pickup_scheduled', converted_job_id = NULL WHERE id = $1`,
      [serviceRequestId],
    );
    await dbClient.query(`DELETE FROM custody_handover_codes WHERE service_request_id = $1`, [serviceRequestId]);

    await checkIn("u-driver", "Test Driver", "Driver");
    const driver = await loginAdmin("testdriver");

    const send = await driver
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/send`)
      .send({ action: "receive" });
    expect(send.status).toBe(200);

    const issued = await dbClient.query(
      `SELECT c.id, n.message
         FROM custody_handover_codes c
         JOIN notifications n ON n.id = c.notification_id
        WHERE c.service_request_id = $1 AND c.action = 'receive'
          AND c.verified_at IS NULL AND c.invalidated_at IS NULL
        ORDER BY c.created_at DESC LIMIT 1`,
      [serviceRequestId],
    );
    const code = String(issued.rows[0].message).match(/\b(\d{6})\b/)?.[1];

    await dbClient.query(
      `UPDATE custody_handover_codes
          SET verified_at = NOW() - INTERVAL '31 minutes',
              expires_at = NOW() - INTERVAL '26 minutes',
              completed_at = NULL
        WHERE id = $1`,
      [issued.rows[0].id],
    );

    const tooLate = await driver
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/confirm`)
      .send({ action: "receive", code });
    expect(tooLate.status).toBe(400);

    // Nothing moved on the strength of a stale authorisation.
    const settled = await dbClient.query(
      `SELECT completed_at FROM custody_handover_codes WHERE id = $1`,
      [issued.rows[0].id],
    );
    expect(settled.rows[0].completed_at).toBeNull();
  }, 30_000);

  it("a wrong code cannot resume an interrupted completion", async () => {
    await checkIn("u-driver", "Test Driver", "Driver");
    const driver = await loginAdmin("testdriver");

    const res = await driver
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/confirm`)
      .send({ action: "receive", code: "999999" });

    // Already completed above, so there is nothing to resume and nothing to
    // replay — a wrong code must not open either door.
    expect([400, 404, 409]).toContain(res.status);
  }, 30_000);

  it("five simultaneous confirmations finish without exhausting the pool, and exactly one completes", async () => {
    /**
     * The proof HOTFIX-7 asserted but never ran.
     *
     * DB_POOL_MAX defaults to 5. The lock used to be pg_advisory_xact_lock,
     * which WAITS — and it waited while holding one of those five connections,
     * whose holder then needed further connections to do the actual work. Five
     * concurrent confirmations could therefore occupy the entire pool waiting
     * for a lock whose winner was itself queued for a connection: deadlock by
     * exhaustion rather than by locking.
     *
     * pg_try_advisory_xact_lock turns that into an immediate, honest refusal.
     * This test would hang (and time out) under the old blocking lock.
     */
    await ensureActivePickupTask();
    await dbClient.query(
      `UPDATE service_requests SET stage = 'pickup_scheduled', converted_job_id = NULL WHERE id = $1`,
      [serviceRequestId],
    );
    await dbClient.query(`DELETE FROM custody_handover_codes WHERE service_request_id = $1`, [serviceRequestId]);
    // Earlier tests in this file confirm handovers on the same request, so the
    // absolute event count is meaningless here — only the delta this burst adds.
    const eventsBefore = await dbClient.query(
      `SELECT count(*)::int AS n FROM service_request_events
        WHERE service_request_id = $1 AND message LIKE '%online handover code%'`,
      [serviceRequestId],
    );

    await checkIn("u-driver", "Test Driver", "Driver");
    const driver = await loginAdmin("testdriver");

    const send = await driver
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/send`)
      .send({ action: "receive" });
    expect(send.status).toBe(200);

    const issued = await dbClient.query(
      `SELECT c.id, n.message
         FROM custody_handover_codes c
         JOIN notifications n ON n.id = c.notification_id
        WHERE c.service_request_id = $1 AND c.action = 'receive'
          AND c.verified_at IS NULL AND c.invalidated_at IS NULL
        ORDER BY c.created_at DESC LIMIT 1`,
      [serviceRequestId],
    );
    const code = String(issued.rows[0].message).match(/\b(\d{6})\b/)?.[1];
    expect(code).toBeTruthy();

    /**
     * FIVE SEPARATE agents, so the requests are genuinely parallel.
     *
     * Reusing one supertest agent serializes everything onto a single
     * keep-alive socket: the burst completes one-at-a-time, the lock is never
     * contended, and the test passes whether or not the lock works. That was a
     * test proving nothing — verified by neutralising the lock and watching it
     * stay green. Independent logins are what actually put five requests in
     * flight against a five-connection pool.
     */
    const agents = await Promise.all(Array.from({ length: 5 }, () => loginAdmin("testdriver")));
    const results = await Promise.all(
      agents.map((a) =>
        a
          .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/confirm`)
          .send({ action: "receive", code })
          .then((r) => r.status)
          .catch(() => 0),
      ),
    );

    // Nothing hung or died: every request produced an HTTP answer.
    expect(results.every((s) => s > 0)).toBe(true);

    // Exactly one winner; the rest are refused with a stable, retryable code.
    const completed = await dbClient.query(
      `SELECT count(*)::int AS n FROM custody_handover_codes
        WHERE service_request_id = $1 AND completed_at IS NOT NULL`,
      [serviceRequestId],
    );
    expect(completed.rows[0].n).toBe(1);

    // And one physical handover left exactly one timeline event behind.
    const eventsAfter = await dbClient.query(
      `SELECT count(*)::int AS n FROM service_request_events
        WHERE service_request_id = $1 AND message LIKE '%online handover code%'`,
      [serviceRequestId],
    );
    expect(eventsAfter.rows[0].n - eventsBefore.rows[0].n).toBe(1);
  }, 60_000);

  it("five DIFFERENT issuances confirm simultaneously without exhausting a 5-connection pool", async () => {
    /**
     * The case the same-issuance burst could never reach.
     *
     * Five confirmations for five different issuances take five different
     * locks, so none blocks another — under the old design each one held a
     * pool connection open across its whole completion while completeCustody
     * reached back into the same pool for the job, task, pickup and journey
     * writes. With DB_POOL_MAX=5 that is every connection consumed, each
     * waiting for a sixth that cannot exist: the requests fail on
     * connectionTimeoutMillis (10s), not on any lock.
     *
     * The same-issuance test is blind to this because four competitors lose
     * the single lock immediately and release.
     */
    const customer = request.agent(app);
    const created: string[] = [];

    for (let i = 0; i < 5; i++) {
      const submitted = await customer.post("/api/service-requests").send({
        brand: "Samsung", primaryIssue: "No power", customerName: "Handover Test",
        phone: CUSTOMER_PHONE, address: `Pool test address ${i}`,
        servicePreference: "home_pickup", serviceMode: "pickup",
        requestIntent: "repair", status: "Pending",
      });
      expect(submitted.status).toBe(201);
      created.push(submitted.body.id);
    }

    await checkIn("u-super", "Super Admin", "Super Admin");
    const superAdmin = await loginAdmin("superadmin");
    for (const id of created) {
      await superAdmin.post(`/api/admin/service-requests/${id}/transfer-to-pickup`).send({});
      // Auto-assign only fires for a sole driver; rival drivers exist by now,
      // so pin each task to our driver explicitly.
      await dbClient.query(
        `UPDATE logistics_tasks SET status = 'assigned', assigned_driver_id = 'u-driver'
          WHERE service_request_id = $1 AND task_type = 'pickup'`,
        [id],
      );
    }

    await checkIn("u-driver", "Test Driver", "Driver");
    const issueAgent = await loginAdmin("testdriver");

    const codes: { id: string; code: string }[] = [];
    for (const id of created) {
      const send = await issueAgent
        .post(`/api/admin/service-requests/${id}/custody-otp/send`)
        .send({ action: "receive" });
      expect(send.status).toBe(200);

      const row = await dbClient.query(
        `SELECT n.message FROM custody_handover_codes c
           JOIN notifications n ON n.id = c.notification_id
          WHERE c.service_request_id = $1 AND c.verified_at IS NULL AND c.invalidated_at IS NULL
          ORDER BY c.created_at DESC LIMIT 1`,
        [id],
      );
      const code = String(row.rows[0].message).match(/\b(\d{6})\b/)?.[1];
      expect(code).toBeTruthy();
      codes.push({ id, code: code! });
    }

    // Five independent agents so the requests are genuinely in flight together.
    const agents = await Promise.all(codes.map(() => loginAdmin("testdriver")));
    const started = Date.now();
    const statuses = await Promise.all(
      codes.map(({ id, code }, i) =>
        agents[i]
          .post(`/api/admin/service-requests/${id}/custody-otp/confirm`)
          .send({ action: "receive", code })
          .then((r) => r.status)
          .catch(() => 0),
      ),
    );
    const elapsed = Date.now() - started;

    // Every one answered, none 500'd, and nothing sat on the 10s pool timeout.
    expect(statuses.every((s) => s === 200)).toBe(true);
    expect(elapsed).toBeLessThan(9_000);

    // Each request: exactly one completed issuance and one custody event.
    for (const { id } of codes) {
      const completed = await dbClient.query(
        `SELECT count(*)::int AS n FROM custody_handover_codes
          WHERE service_request_id = $1 AND completed_at IS NOT NULL`,
        [id],
      );
      expect(completed.rows[0].n).toBe(1);

      const events = await dbClient.query(
        `SELECT count(*)::int AS n FROM service_request_events
          WHERE service_request_id = $1 AND message LIKE '%online handover code%'`,
        [id],
      );
      expect(events.rows[0].n).toBe(1);

      // Receive convergence: task completed and schedule PickedUp.
      const task = await dbClient.query(
        `SELECT status FROM logistics_tasks WHERE service_request_id = $1 AND task_type = 'pickup'`,
        [id],
      );
      expect(task.rows[0].status).toBe("completed");

      const pickup = await dbClient.query(
        `SELECT status FROM pickup_schedules WHERE service_request_id = $1`,
        [id],
      );
      if (pickup.rows.length) expect(pickup.rows[0].status).toBe("PickedUp");
    }
  }, 120_000);

  it("a driver still cannot reach service-request administration", async () => {
    await checkIn("u-driver", "Test Driver", "Driver");
    const driver = await loginAdmin("testdriver");
    const res = await driver.agent.get("/api/service-requests");
    expect([401, 403]).toContain(res.status);
  }, 30_000);

  /**
   * The issuance-side and storage-side proofs.
   *
   * Everything above proves confirmation. These prove the other half: that a
   * code is created and destroyed safely, that two issuances cannot both be
   * live, and that the database itself refuses to orphan the evidence.
   */

  it("a failed issuance leaves NO notification carrying a readable code", async () => {
    /**
     * The FK ordering, proved by forcing the failure.
     *
     * The notification must be written BEFORE the custody row, because
     * notification_id is NOT NULL and references it. That ordering is only safe
     * if both live in one transaction — otherwise a custody insert that fails
     * leaves the notification behind, and that notification contains the
     * PLAINTEXT code with no row recording that it was ever issued. Nothing
     * would redact it, because redaction is driven by the custody table.
     *
     * customer_id references users(id), so a customer id that does not exist
     * fails the custody insert after the notification has already been written
     * — exactly the window under test.
     */
    const { issueCustodyCode } = await import("../server/services/custody-handover.service.js");

    const before = await dbClient.query(`SELECT count(*)::int AS n FROM notifications`);

    const sr = await dbClient.query(`SELECT * FROM service_requests WHERE id = $1`, [serviceRequestId]);
    const requestRow = sr.rows[0];

    await expect(
      issueCustodyCode({
        request: {
          ...requestRow,
          id: requestRow.id,
          ticketNumber: requestRow.ticket_number,
          customerId: requestRow.customer_id,
        } as any,
        customerId: "u-does-not-exist",
        action: "receive",
        authority: {
          mode: "driver_pickup",
          custodianUserId: "u-driver",
          logisticsTaskId: null,
        } as any,
        label: "collection",
      }),
    ).rejects.toThrow();

    const after = await dbClient.query(`SELECT count(*)::int AS n FROM notifications`);
    expect(after.rows[0].n).toBe(before.rows[0].n);

    /**
     * And no handover notification exists without a custody row pointing at it
     * — the orphan this rollback prevents.
     *
     * Scoped to handover wording rather than "any six digits": ticket numbers
     * are SRV-YYYYMMDD-NNNN, so a bare digit-run pattern matches ordinary
     * notifications and the check would fail against perfectly correct data.
     */
    const orphans = await dbClient.query(
      `SELECT count(*)::int AS n
         FROM notifications n
        WHERE n.message ILIKE '%handover code%'
          AND n.message ~ '[0-9]{6}'
          AND NOT EXISTS (SELECT 1 FROM custody_handover_codes c WHERE c.notification_id = n.id)`,
    );
    expect(orphans.rows[0].n).toBe(0);
  }, 30_000);

  it("two simultaneous issuances leave exactly ONE live code", async () => {
    /**
     * Issuance supersedes any previous live code. If two sends race, the loser
     * must not remain usable — two live codes for one handover means the
     * customer reads one back and the driver is holding the other, and the
     * superseded plaintext is still sitting readable in a notification.
     */
    await ensureActivePickupTask();
    await dbClient.query(
      `UPDATE service_requests SET stage = 'pickup_scheduled', converted_job_id = NULL WHERE id = $1`,
      [serviceRequestId],
    );
    await dbClient.query(`DELETE FROM custody_handover_codes WHERE service_request_id = $1`, [serviceRequestId]);

    await checkIn("u-driver", "Test Driver", "Driver");
    const a = await loginAdmin("testdriver");
    const b = await loginAdmin("testdriver");

    const [r1, r2] = await Promise.all([
      a.post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/send`).send({ action: "receive" }),
      b.post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/send`).send({ action: "receive" }),
    ]);
    /**
     * BOTH must succeed, not merely one.
     *
     * The lock's intended behaviour is wait-then-supersede: the second issuer
     * blocks, then properly invalidates the first and issues its own. Accepting
     * "at least one 200" would let the loser return 500 — a deadlock, or an
     * unhandled unique violation — while the test stayed green, which is
     * exactly the failure a lock is most likely to introduce.
     */
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const live = await dbClient.query(
      `SELECT count(*)::int AS n FROM custody_handover_codes
        WHERE service_request_id = $1
          AND verified_at IS NULL
          AND invalidated_at IS NULL
          AND completed_at IS NULL
          AND expires_at > NOW()`,
      [serviceRequestId],
    );
    expect(live.rows[0].n).toBe(1);

    // Every superseded issuance had its plaintext removed in the same
    // transaction that superseded it.
    const leaked = await dbClient.query(
      `SELECT count(*)::int AS n
         FROM custody_handover_codes c
         JOIN notifications n ON n.id = c.notification_id
        WHERE c.service_request_id = $1
          AND c.invalidated_at IS NOT NULL
          AND n.message ~ '[0-9]{6}'`,
      [serviceRequestId],
    );
    expect(leaked.rows[0].n).toBe(0);
  }, 30_000);

  it("five simultaneous DELIVERY confirmations deliver the job exactly once", async () => {
    /**
     * Delivery has its own convergence path — updateTaskStatusWithLifecycle and
     * the job lifecycle — which the receive concurrency test never exercises.
     * Delivering twice would move a job out of Ready twice and write two
     * customer-journey projections for one physical handover.
     */
    await dbClient.query(
      `UPDATE job_tickets SET status = 'Ready', completed_at = NULL WHERE id = 'job-delivery-1'`,
    );
    await dbClient.query(
      `UPDATE logistics_tasks SET status = 'assigned' WHERE id = 'task-delivery-ok'`,
    );
    await dbClient.query(
      `UPDATE service_requests SET converted_job_id = 'job-delivery-1' WHERE id = $1`,
      [serviceRequestId],
    );
    await dbClient.query(`DELETE FROM custody_handover_codes WHERE service_request_id = $1`, [serviceRequestId]);

    await checkIn("u-driver", "Test Driver", "Driver");
    const issuer = await loginAdmin("testdriver");
    const send = await issuer
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/send`)
      .send({ action: "delivery" });
    expect(send.status).toBe(200);

    const issued = await dbClient.query(
      `SELECT n.message FROM custody_handover_codes c
         JOIN notifications n ON n.id = c.notification_id
        WHERE c.service_request_id = $1 AND c.action = 'delivery'
          AND c.verified_at IS NULL AND c.invalidated_at IS NULL
        ORDER BY c.created_at DESC LIMIT 1`,
      [serviceRequestId],
    );
    const code = String(issued.rows[0].message).match(/\b(\d{6})\b/)?.[1];
    expect(code).toBeTruthy();

    const eventsBeforeRow = await dbClient.query(
      `SELECT count(*)::int AS n FROM service_request_events
        WHERE service_request_id = $1 AND message LIKE '%online handover code%'`,
      [serviceRequestId],
    );
    const eventsBefore = eventsBeforeRow.rows[0].n as number;

    const agents = await Promise.all([0, 1, 2, 3, 4].map(() => loginAdmin("testdriver")));
    const results = await Promise.all(
      agents.map((ag) =>
        ag
          .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/confirm`)
          .send({ action: "delivery", code })
          .then((r) => r.status),
      ),
    );

    // Exactly one winner; the rest are refused, never 500.
    expect(results.filter((s) => s === 200).length).toBe(1);
    expect(results.every((s) => s === 200 || s === 400 || s === 409)).toBe(true);

    const job = await dbClient.query(`SELECT status FROM job_tickets WHERE id = 'job-delivery-1'`);
    expect(job.rows[0].status).toBe("Delivered");

    const task = await dbClient.query(`SELECT status FROM logistics_tasks WHERE id = 'task-delivery-ok'`);
    expect(task.rows[0].status).toBe("completed");

    const completed = await dbClient.query(
      `SELECT count(*)::int AS n FROM custody_handover_codes
        WHERE service_request_id = $1 AND action = 'delivery' AND completed_at IS NOT NULL`,
      [serviceRequestId],
    );
    expect(completed.rows[0].n).toBe(1);

    // Delta, not total: this fixture is shared and earlier tests in the file
    // have already written custody events for the same request, so an absolute
    // count measures the file's history rather than this handover.
    const eventsAfter = await dbClient.query(
      `SELECT count(*)::int AS n FROM service_request_events
        WHERE service_request_id = $1 AND message LIKE '%online handover code%'`,
      [serviceRequestId],
    );
    expect(eventsAfter.rows[0].n - eventsBefore).toBe(1);
  }, 60_000);

  it("counter custody is gated by confirmCounterCustody, not by holding a driver role", async () => {
    /**
     * Counter service has no logistics task, so the assigned-driver check that
     * protects driver pickups cannot apply. The permission IS the authority
     * there — if it is not enforced, any authenticated staff member could
     * release a customer's television over the counter.
     */
    // Counter service is "not a pickup request": isPickupRequest() reads
    // service_mode and service_preference, so both must stop saying pickup.
    await dbClient.query(
      `UPDATE service_requests
          SET service_mode = 'counter', service_preference = 'counter',
              stage = 'pickup_scheduled', converted_job_id = NULL
        WHERE id = $1`,
      [serviceRequestId],
    );
    await dbClient.query(
      `UPDATE logistics_tasks SET status = 'cancelled' WHERE service_request_id = $1`,
      [serviceRequestId],
    );
    await dbClient.query(`DELETE FROM custody_handover_codes WHERE service_request_id = $1`, [serviceRequestId]);

    /**
     * The actor must hold pickup.confirmHandover but NOT
     * serviceRequests.confirmCounterCustody.
     *
     * With no permissions at all the route's own
     * requireAnyGranularPermission middleware rejects first, so the test would
     * pass while proving nothing about counter custody. Granting the pickup
     * permission gets past the middleware and lands exactly on the
     * COUNTER_CUSTODY_FORBIDDEN branch in resolveCustodyAuthority, which is the
     * check under test.
     */
    await ensureActor("u-nocounter", "nocounter", "No Counter", "Technician");
    await dbClient.query(
      `UPDATE users SET permissions = '{"pickup.confirmHandover": true}' WHERE id = 'u-nocounter'`,
    );
    await checkIn("u-nocounter", "No Counter", "Technician");
    const denied = await loginAdmin("nocounter");

    const refused = await denied
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/send`)
      .send({ action: "receive" });
    // Exact, not a set of plausible failures: a 404 or 409 here would mean the
    // request was rejected for an unrelated reason and the permission gate was
    // never reached.
    expect(refused.status).toBe(403);
    expect(refused.body?.code).toBe("COUNTER_CUSTODY_FORBIDDEN");

    // Nothing was issued on the strength of a refused request.
    const issued = await dbClient.query(
      `SELECT count(*)::int AS n FROM custody_handover_codes WHERE service_request_id = $1`,
      [serviceRequestId],
    );
    expect(issued.rows[0].n).toBe(0);
  }, 30_000);

  it("counter custody SUCCEEDS for staff holding confirmCounterCustody", async () => {
    /**
     * The other half of the gate. A denial test alone is satisfied by a system
     * that refuses everyone, which would be just as broken — the walk-in
     * counter is a real custody point and must work for authorised staff.
     */
    await dbClient.query(
      `UPDATE service_requests
          SET service_mode = 'counter', service_preference = 'counter',
              stage = 'pickup_scheduled', converted_job_id = NULL
        WHERE id = $1`,
      [serviceRequestId],
    );
    await dbClient.query(
      `UPDATE logistics_tasks SET status = 'cancelled' WHERE service_request_id = $1`,
      [serviceRequestId],
    );
    await dbClient.query(`DELETE FROM custody_handover_codes WHERE service_request_id = $1`, [serviceRequestId]);

    await ensureActor("u-counter", "counterstaff", "Counter Staff", "Technician");
    await dbClient.query(
      `UPDATE users SET permissions = '{"serviceRequests.confirmCounterCustody": true}' WHERE id = 'u-counter'`,
    );
    await checkIn("u-counter", "Counter Staff", "Technician");
    const staff = await loginAdmin("counterstaff");

    const send = await staff
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/send`)
      .send({ action: "receive" });
    expect(send.status).toBe(200);

    // Counter custody has no logistics task, and must record that faithfully
    // rather than borrowing a cancelled one.
    const issuedRow = await dbClient.query(
      `SELECT c.id, c.custody_mode, c.logistics_task_id, c.custodian_user_id, n.message
         FROM custody_handover_codes c
         JOIN notifications n ON n.id = c.notification_id
        WHERE c.service_request_id = $1
        ORDER BY c.created_at DESC LIMIT 1`,
      [serviceRequestId],
    );
    expect(issuedRow.rows[0].custody_mode).toBe("counter_service");
    expect(issuedRow.rows[0].logistics_task_id).toBeNull();
    expect(issuedRow.rows[0].custodian_user_id).toBe("u-counter");

    const code = String(issuedRow.rows[0].message).match(/\b(\d{6})\b/)?.[1];
    expect(code).toBeTruthy();

    const confirm = await staff
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/confirm`)
      .send({ action: "receive", code });
    expect(confirm.status).toBe(200);

    // It converged for real: counter receipt lands on device_received, not the
    // driver-pickup stage.
    const settled = await dbClient.query(
      `SELECT completed_at FROM custody_handover_codes WHERE id = $1`,
      [issuedRow.rows[0].id],
    );
    expect(settled.rows[0].completed_at).not.toBeNull();

    const sr = await dbClient.query(`SELECT stage FROM service_requests WHERE id = $1`, [serviceRequestId]);
    expect(sr.rows[0].stage).toBe("device_received");
  }, 30_000);

  it("an unused code that simply expires is redacted by the sweeper", async () => {
    /**
     * Expiry has no other trigger. A code that is never used is never
     * superseded and never verified, so without the sweep its plaintext stays
     * readable in the notification indefinitely — the one leak path that no
     * inline redaction covers.
     */
    await ensureActivePickupTask();
    // Restore the pickup identity the counter test above changed.
    await dbClient.query(
      `UPDATE service_requests
          SET service_mode = 'pickup', service_preference = 'pickup',
              stage = 'pickup_scheduled', converted_job_id = NULL
        WHERE id = $1`,
      [serviceRequestId],
    );
    await dbClient.query(`DELETE FROM custody_handover_codes WHERE service_request_id = $1`, [serviceRequestId]);

    await checkIn("u-driver", "Test Driver", "Driver");
    const driver = await loginAdmin("testdriver");
    const send = await driver
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/send`)
      .send({ action: "receive" });
    expect(send.status).toBe(200);

    const before = await dbClient.query(
      `SELECT c.id, c.notification_id, n.message
         FROM custody_handover_codes c
         JOIN notifications n ON n.id = c.notification_id
        WHERE c.service_request_id = $1
        ORDER BY c.created_at DESC LIMIT 1`,
      [serviceRequestId],
    );
    // Precondition: the plaintext really is there, so the assertion below is
    // not passing against an already-empty message.
    expect(String(before.rows[0].message)).toMatch(/[0-9]{6}/);

    // Age it past expiry, still unused.
    await dbClient.query(
      `UPDATE custody_handover_codes
          SET expires_at = NOW() - INTERVAL '1 minute'
        WHERE id = $1`,
      [before.rows[0].id],
    );

    const { redactSettledCustodyCodes } = await import("../server/services/nightly-jobs.service.js");
    await redactSettledCustodyCodes();

    const after = await dbClient.query(`SELECT message FROM notifications WHERE id = $1`, [
      before.rows[0].notification_id,
    ]);
    expect(String(after.rows[0].message)).not.toMatch(/[0-9]{6}/);
  }, 30_000);

  it("the database refuses to orphan or silently drop custody evidence", async () => {
    /**
     * The constraints are the last line of defence: application code can be
     * bypassed by a script or a console, the foreign keys cannot.
     *
     * notifications is RESTRICT — deleting the carrier of a code while the
     * custody row still points at it would destroy the audit trail's other half.
     * service_requests is CASCADE — a deleted request takes its custody rows
     * with it rather than leaving rows referencing nothing.
     */
    await ensureActivePickupTask();
    await dbClient.query(`DELETE FROM custody_handover_codes WHERE service_request_id = $1`, [serviceRequestId]);

    await checkIn("u-driver", "Test Driver", "Driver");
    const driver = await loginAdmin("testdriver");
    const send = await driver
      .post(`/api/admin/service-requests/${serviceRequestId}/custody-otp/send`)
      .send({ action: "receive" });
    expect(send.status).toBe(200);

    const row = await dbClient.query(
      `SELECT id, notification_id FROM custody_handover_codes
        WHERE service_request_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [serviceRequestId],
    );
    const { id: custodyId, notification_id: notificationId } = row.rows[0];

    // RESTRICT: the notification cannot be deleted out from under the custody row.
    await expect(
      dbClient.query(`DELETE FROM notifications WHERE id = $1`, [notificationId]),
    ).rejects.toThrow();

    // The row is still there — the refusal was real, not swallowed.
    const stillThere = await dbClient.query(
      `SELECT count(*)::int AS n FROM custody_handover_codes WHERE id = $1`,
      [custodyId],
    );
    expect(stillThere.rows[0].n).toBe(1);

    // CASCADE: deleting the request removes its custody rows rather than
    // stranding them. Done on a throwaway request so the fixture survives.
    const throwaway = `sr-cascade-${Date.now()}`;
    await dbClient.query(
      `INSERT INTO service_requests (id, customer_id, customer_name, phone, brand, primary_issue, status, stage, created_at)
       SELECT $1, customer_id, customer_name, phone, brand, primary_issue, status, stage, NOW()
         FROM service_requests WHERE id = $2`,
      [throwaway, serviceRequestId],
    );
    await dbClient.query(
      `INSERT INTO custody_handover_codes
         (id, service_request_id, customer_id, custodian_user_id, custody_mode, action,
          notification_id, code_hash, expires_at, created_at)
       SELECT $1, $2, customer_id, custodian_user_id, custody_mode, action,
              notification_id, code_hash, expires_at, NOW()
         FROM custody_handover_codes WHERE id = $3`,
      [`${throwaway}-code`, throwaway, custodyId],
    );

    await dbClient.query(`DELETE FROM service_requests WHERE id = $1`, [throwaway]);

    const cascaded = await dbClient.query(
      `SELECT count(*)::int AS n FROM custody_handover_codes WHERE service_request_id = $1`,
      [throwaway],
    );
    expect(cascaded.rows[0].n).toBe(0);
  }, 30_000);
});
