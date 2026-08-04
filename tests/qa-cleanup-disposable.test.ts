/**
 * QA cleanup — refusal rules and cascade order, against real PostgreSQL.
 *
 * This tool deletes production rows, so the tests that matter are the ones
 * proving it REFUSES: staff accounts, paid-for requests, converted jobs, and
 * customers with shop orders. A cleanup tool that over-deletes is worse than no
 * cleanup tool.
 *
 * Skips when no local PostgreSQL is reachable. The database is created and
 * dropped within this file.
 */
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";

const MAINT_URL = process.env.TEST_LOCAL_PG_URL || "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const DB_NAME = `qa_cleanup_${process.pid.toString(36)}_${Date.now().toString(36)}`;
const DISPOSABLE_URL = MAINT_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);

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
    cwd: process.cwd(), timeout: 10_000, encoding: "utf8",
  });
  return /PG_OK/.test(res.stdout || "");
}

const LOCAL_PG_AVAILABLE = probeLocalPostgres();

const SCHEMA = `
  CREATE TABLE users (
    id TEXT PRIMARY KEY, name TEXT, phone TEXT, phone_normalized TEXT,
    role TEXT, customer_account_state TEXT
  );
  CREATE TABLE service_requests (
    id TEXT PRIMARY KEY, ticket_number TEXT, phone TEXT, customer_id TEXT,
    converted_job_id TEXT, created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE service_request_events (id TEXT PRIMARY KEY, service_request_id TEXT);
  CREATE TABLE customer_repair_journeys (
    id TEXT PRIMARY KEY, customer_id TEXT, service_request_id TEXT, quote_request_id TEXT
  );
  CREATE TABLE customer_repair_journey_events (id TEXT PRIMARY KEY, journey_id TEXT);
  CREATE TABLE customer_reset_links (id TEXT PRIMARY KEY, user_id TEXT);
  CREATE TABLE device_tokens (id TEXT PRIMARY KEY, user_id TEXT, token TEXT);
  CREATE TABLE inquiries (id TEXT PRIMARY KEY, phone TEXT, message TEXT);
  CREATE TABLE manual_payments (id TEXT PRIMARY KEY, service_request_id TEXT);
  CREATE TABLE orders (id TEXT PRIMARY KEY, customer_id TEXT);
`;

const SEED = `
  INSERT INTO users (id, name, phone, phone_normalized, role, customer_account_state) VALUES
    ('u-qa',      'QA Test',    '+8801700000901', '1700000901', 'Customer',   'active'),
    ('u-staff',   'Technician', '+8801700000902', '1700000902', 'Technician', NULL),
    ('u-paid',    'Paid Cust',  '+8801700000903', '1700000903', 'Customer',   'active'),
    ('u-job',     'Job Cust',   '+8801700000904', '1700000904', 'Customer',   'active'),
    ('u-order',   'Order Cust', '+8801700000905', '1700000905', 'Customer',   'active');

  INSERT INTO service_requests (id, ticket_number, phone, customer_id, converted_job_id) VALUES
    ('sr-qa',    'SRV-QA-0001',    '+8801700000901', 'u-qa',    NULL),
    ('sr-paid',  'SRV-PAID-0001',  '+8801700000903', 'u-paid',  NULL),
    ('sr-job',   'SRV-JOB-0001',   '+8801700000904', 'u-job',   'JOB-123'),
    ('sr-order', 'SRV-ORDER-0001', '+8801700000905', 'u-order', NULL);

  INSERT INTO service_request_events (id, service_request_id) VALUES ('ev-1', 'sr-qa'), ('ev-2', 'sr-qa');
  INSERT INTO customer_repair_journeys (id, customer_id, service_request_id) VALUES ('j-qa', 'u-qa', 'sr-qa');
  INSERT INTO customer_repair_journey_events (id, journey_id) VALUES ('je-1', 'j-qa');
  INSERT INTO customer_reset_links (id, user_id) VALUES ('rl-1', 'u-qa');
  INSERT INTO device_tokens (id, user_id, token) VALUES ('dt-1', 'u-qa', 'tok');
  INSERT INTO inquiries (id, phone, message) VALUES ('inq-1', '+8801700000901', '[ACCOUNT_RECOVERY] test');
  INSERT INTO manual_payments (id, service_request_id) VALUES ('pay-1', 'sr-paid');
  INSERT INTO orders (id, customer_id) VALUES ('ord-1', 'u-order');
`;

describe.skipIf(!LOCAL_PG_AVAILABLE)("QA cleanup (disposable PostgreSQL)", () => {
  let admin: pg.Client;
  let dbClient: pg.Client;
  let previewCleanup: any;
  let executeCleanup: any;
  let resetDbPool: (reason: string) => Promise<void>;
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    if (!LOCAL_PG_AVAILABLE) return;
    originalEnv.DATABASE_URL = process.env.DATABASE_URL;
    admin = new pg.Client({ connectionString: MAINT_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    dbClient = new pg.Client({ connectionString: DISPOSABLE_URL });
    await dbClient.connect();
    await dbClient.query(SCHEMA);

    process.env.DATABASE_URL = DISPOSABLE_URL;
    const svc = await import("../server/services/qa-cleanup.service.js");
    previewCleanup = svc.previewCleanup;
    executeCleanup = svc.executeCleanup;
    resetDbPool = (await import("../server/db.js")).resetDbPool;
  }, 60_000);

  beforeEach(async () => {
    if (!LOCAL_PG_AVAILABLE) return;
    for (const t of [
      "users", "service_requests", "service_request_events", "customer_repair_journeys",
      "customer_repair_journey_events", "customer_reset_links", "device_tokens",
      "inquiries", "manual_payments", "orders",
    ]) await dbClient.query(`DELETE FROM ${t}`);
    await dbClient.query(SEED);
  });

  afterAll(async () => {
    if (!LOCAL_PG_AVAILABLE) return;
    if (originalEnv.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalEnv.DATABASE_URL;
    if (resetDbPool) await resetDbPool("qa cleanup test teardown");
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

  const count = async (table: string, where = "") =>
    Number((await dbClient.query(`SELECT count(*)::int n FROM ${table} ${where}`)).rows[0].n);

  // ── Refusals: the tests that matter most ──────────────────────────────

  it("refuses to touch a staff account", async () => {
    const p = await previewCleanup({ phones: ["+8801700000902"] });
    expect(p.safeToDelete).toBe(false);
    expect(p.blockers.some((b: any) => b.kind === "not_a_customer")).toBe(true);
    await expect(executeCleanup({ phones: ["+8801700000902"] })).rejects.toThrow(/Refusing/);
    expect(await count("users", "WHERE id = 'u-staff'")).toBe(1);
  });

  it("refuses a request that has payments against it", async () => {
    const p = await previewCleanup({ ticketNumbers: ["SRV-PAID-0001"] });
    expect(p.blockers.some((b: any) => b.kind === "has_payments")).toBe(true);
    await expect(executeCleanup({ ticketNumbers: ["SRV-PAID-0001"] })).rejects.toThrow(/Refusing/);
    expect(await count("service_requests", "WHERE id = 'sr-paid'")).toBe(1);
  });

  it("refuses a request already converted to a job", async () => {
    const p = await previewCleanup({ ticketNumbers: ["SRV-JOB-0001"] });
    expect(p.blockers.some((b: any) => b.kind === "converted_to_job")).toBe(true);
    expect(await count("service_requests", "WHERE id = 'sr-job'")).toBe(1);
  });

  it("refuses a customer who has shop orders", async () => {
    const p = await previewCleanup({ phones: ["+8801700000905"] });
    expect(p.blockers.some((b: any) => b.kind === "has_orders")).toBe(true);
  });

  it("refuses when nothing was targeted", async () => {
    const p = await previewCleanup({});
    expect(p.safeToDelete).toBe(false);
    expect(p.blockers[0].kind).toBe("no_target");
  });

  it("reports no match rather than silently succeeding", async () => {
    const p = await previewCleanup({ phones: ["+8801799999999"] });
    expect(p.blockers.some((b: any) => b.kind === "no_match")).toBe(true);
  });

  // ── The happy path ────────────────────────────────────────────────────

  it("preview changes nothing", async () => {
    await previewCleanup({ phones: ["+8801700000901"] });
    expect(await count("users")).toBe(5);
    expect(await count("service_requests")).toBe(4);
  });

  it("removes a clean test customer and every dependent row", async () => {
    const p = await previewCleanup({ phones: ["+8801700000901"] });
    expect(p.safeToDelete).toBe(true);
    expect(p.counts).toMatchObject({
      customers: 1, serviceRequests: 1, serviceRequestEvents: 2,
      journeys: 1, journeyEvents: 1, inquiries: 1, resetLinks: 1, deviceTokens: 1,
    });

    await executeCleanup({ phones: ["+8801700000901"] });

    expect(await count("users", "WHERE id = 'u-qa'")).toBe(0);
    expect(await count("service_requests", "WHERE id = 'sr-qa'")).toBe(0);
    expect(await count("service_request_events")).toBe(0);
    expect(await count("customer_repair_journeys")).toBe(0);
    expect(await count("customer_repair_journey_events")).toBe(0);
    expect(await count("customer_reset_links")).toBe(0);
    expect(await count("device_tokens")).toBe(0);
    expect(await count("inquiries")).toBe(0);

    // Everyone else untouched.
    expect(await count("users")).toBe(4);
    expect(await count("service_requests")).toBe(3);
  });

  it("finds a customer by ticket number too, and takes their account with it", async () => {
    const p = await previewCleanup({ ticketNumbers: ["SRV-QA-0001"] });
    expect(p.serviceRequests.map((s: any) => s.ticketNumber)).toContain("SRV-QA-0001");
    await executeCleanup({ ticketNumbers: ["SRV-QA-0001"] });
    expect(await count("service_requests", "WHERE id = 'sr-qa'")).toBe(0);
  });

  it("leaves no dangling journey pointing at a deleted request", async () => {
    await executeCleanup({ phones: ["+8801700000901"] });
    const orphans = await dbClient.query(`
      SELECT j.id FROM customer_repair_journeys j
      LEFT JOIN service_requests sr ON sr.id = j.service_request_id
      WHERE j.service_request_id IS NOT NULL AND sr.id IS NULL
    `);
    expect(orphans.rowCount).toBe(0);
  });
});
