/**
 * CUSTOMER-REPAIR-VISIBILITY-REPAIR-01A-HOTFIX-2 — Test A concurrency proof.
 *
 * Proves ownership-safe linking against a REAL disposable local PostgreSQL:
 * - two customers race to claim the same unowned request — exactly one wins;
 * - the request and its journey end with the same winning customer;
 * - the losing customer cannot overwrite either record afterwards;
 * - journey adoption re-checks service_requests.customer_id in SQL, so stale
 *   or malicious request ids cannot transfer a journey;
 * - a different non-null owner is never overwritten.
 *
 * Skips the whole suite when no local PostgreSQL is reachable (e.g. CI).
 * The disposable database is created and dropped within this file.
 */
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const MAINT_URL = process.env.TEST_LOCAL_PG_URL || "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const DB_NAME = `qa_link_race_${process.pid.toString(36)}_${Date.now().toString(36)}`;
const DISPOSABLE_URL = MAINT_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);

const SEED = `
  INSERT INTO service_requests (id, phone, customer_id) VALUES
    ('sr-race', '01710000001', NULL),
    ('sr-b', '01710000002', 'cust-b'),
    ('sr-free', '01710000003', NULL);

  INSERT INTO customer_repair_journeys (id, customer_id, service_request_id, quote_request_id) VALUES
    ('j-race', NULL, 'sr-race', NULL),
    ('j-b-owned', 'cust-b', 'sr-b', NULL),
    ('j-b-orphan', NULL, 'sr-b', NULL);
`;

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

async function query(client: pg.Client, sqlText: string): Promise<Record<string, unknown>[]> {
  const res = await client.query(sqlText);
  return res.rows;
}

describe.skipIf(!LOCAL_PG_AVAILABLE)(
  "HOTFIX-2 Test A — ownership-safe linking concurrency on disposable PostgreSQL",
  () => {
    let admin: pg.Client;
    let dbClient: pg.Client;
    let customerService: any;
    let resetDbPool: (reason: string) => Promise<void>;
    const originalEnv: Record<string, string | undefined> = {};

    async function owner(table: string, id: string): Promise<string | null> {
      const rows = await query(dbClient, `SELECT customer_id FROM ${table} WHERE id = '${id}'`);
      return (rows[0]?.customer_id as string | null) ?? null;
    }

    beforeAll(async () => {
      if (!LOCAL_PG_AVAILABLE) return;

      originalEnv.DATABASE_URL = process.env.DATABASE_URL;
      admin = new pg.Client({ connectionString: MAINT_URL });
      await admin.connect();
      await admin.query(`CREATE DATABASE ${DB_NAME}`);

      dbClient = new pg.Client({ connectionString: DISPOSABLE_URL });
      await dbClient.connect();
      await dbClient.query(`
        CREATE TABLE service_requests (
          id TEXT PRIMARY KEY,
          phone TEXT,
          phone_normalized TEXT,
          customer_id TEXT
        );
        CREATE TABLE customer_repair_journeys (
          id TEXT PRIMARY KEY,
          customer_id TEXT,
          service_request_id TEXT,
          quote_request_id TEXT,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);
      await dbClient.query(SEED);

      process.env.DATABASE_URL = DISPOSABLE_URL;
      const serviceModule = await import("../server/services/customer.service.js");
      customerService = serviceModule.customerService;
      const dbModule = await import("../server/db.js");
      resetDbPool = dbModule.resetDbPool;
    });

    afterAll(async () => {
      if (!LOCAL_PG_AVAILABLE) return;
      if (originalEnv.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalEnv.DATABASE_URL;

      if (resetDbPool) await resetDbPool("HOTFIX-2 link race test cleanup");
      if (dbClient) await dbClient.end();
      if (admin) {
        await admin.query(`
          SELECT pg_terminate_backend(pid) FROM pg_stat_activity
          WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid()
        `).catch(() => undefined);
        await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`).catch(() => undefined);
        await admin.end();
      }
    });

    it("two customers claim the same unowned request concurrently — exactly one winner", async () => {
      const [a, b] = await Promise.all([
        customerService.linkServiceRequestsByPhone("01710000001", "cust-a"),
        customerService.linkServiceRequestsByPhone("01710000001", "cust-b"),
      ]);

      expect(a + b).toBe(1);
      const requestOwner = await owner("service_requests", "sr-race");
      expect(["cust-a", "cust-b"]).toContain(requestOwner);
      expect(await owner("customer_repair_journeys", "j-race")).toBe(requestOwner);
    });

    it("the losing customer cannot overwrite the request or the journey afterwards", async () => {
      const winner = await owner("service_requests", "sr-race");
      const loser = winner === "cust-a" ? "cust-b" : "cust-a";

      const again = await customerService.linkServiceRequestsByPhone("01710000001", loser);

      expect(again).toBe(0);
      expect(await owner("service_requests", "sr-race")).toBe(winner);
      expect(await owner("customer_repair_journeys", "j-race")).toBe(winner);
    });

    it("unowned request can be linked via the explicit path", async () => {
      const ok = await customerService.linkServiceRequestToCustomer("sr-free", "cust-a");
      expect(ok).toBe(true);
      expect(await owner("service_requests", "sr-free")).toBe("cust-a");
    });

    it("a different non-null owner is never overwritten", async () => {
      const ok = await customerService.linkServiceRequestToCustomer("sr-b", "cust-a");
      expect(ok).toBe(false);
      expect(await owner("service_requests", "sr-b")).toBe("cust-b");
    });

    it("stale or malicious request ids cannot transfer a journey", async () => {
      await customerService.linkServiceRequestToCustomer("sr-b", "cust-a");
      expect(await owner("customer_repair_journeys", "j-b-owned")).toBe("cust-b");
      expect(await owner("customer_repair_journeys", "j-b-orphan")).toBeNull();

      const ghost = await customerService.linkServiceRequestToCustomer("no-such-id", "cust-a");
      expect(ghost).toBe(false);
    });

    it("journey adoption rechecks the request owner in SQL", async () => {
      await customerService.linkServiceRequestsByPhone("01710000002", "cust-a");
      expect(await owner("customer_repair_journeys", "j-b-orphan")).toBeNull();
    });

    it("zero newly linked requests still permits same-owner journey adoption", async () => {
      const linked = await customerService.linkServiceRequestsByPhone("01710000002", "cust-b");
      expect(linked).toBe(0);
      expect(await owner("customer_repair_journeys", "j-b-orphan")).toBe("cust-b");
    });

    it("already-owned-by-same-customer request is not treated as failure", async () => {
      const ok = await customerService.linkServiceRequestToCustomer("sr-b", "cust-b");
      expect(ok).toBe(true);
      expect(await owner("service_requests", "sr-b")).toBe("cust-b");
    });
  },
);
