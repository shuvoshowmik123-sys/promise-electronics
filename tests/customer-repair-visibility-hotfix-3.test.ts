/**
 * CUSTOMER-REPAIR-VISIBILITY-REPAIR-01A-HOTFIX-3
 *
 * Two properties, proven against a REAL disposable local PostgreSQL because
 * both live entirely in SQL and a mock would prove nothing:
 *
 * ITEM 1 — a journey whose two references prove DIFFERENT owners is adopted by
 *   neither customer. `orphan-journey-reconcile.service.ts` already skipped that
 *   case (`skippedConflictingOwners`); the login-time linker did not, so the two
 *   paths disagreed about the same row.
 *
 * ITEM 2 — the linker no longer scans every service request per login, and the
 *   faster path must not link FEWER rows: `phone_normalized` is NULL or blank on
 *   legacy rows, and those must still match on their raw phone.
 *
 * Skips when no local PostgreSQL is reachable (e.g. CI). The disposable
 * database is created and dropped within this file.
 */
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const MAINT_URL = process.env.TEST_LOCAL_PG_URL || "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const DB_NAME = `qa_hotfix3_${process.pid.toString(36)}_${Date.now().toString(36)}`;
const DISPOSABLE_URL = MAINT_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);

/**
 * `phone_normalized` mirrors production: last 10 digits, no leading zero, so
 * 01710000013 normalises to 1710000013.
 *
 * sr-indexed deliberately carries a raw phone that normalises to something
 * else. It can therefore ONLY be found through the indexed column — if the
 * indexed read regressed to a scan-and-filter, that test fails.
 *
 * sr-legacy (NULL) and sr-blank ('') are the rows an indexed-only lookup would
 * silently drop.
 */
const SEED = `
  INSERT INTO service_requests (id, phone, phone_normalized, customer_id) VALUES
    ('sr-conflict-a', '01710000010', '1710000010', NULL),
    ('sr-conflict-b', '01710000011', '1710000011', 'cust-other'),
    ('sr-solo',       '01710000012', '1710000012', NULL),
    ('sr-indexed',    'not-a-phone', '1710000013', NULL),
    ('sr-legacy',     '01710000014', NULL,         NULL),
    ('sr-blank',      '01710000015', '',           NULL),
    ('sr-x-owned',    '01710000016', '1710000016', 'cust-other'),
    ('sr-x-free',     '01710000017', '1710000017', NULL);

  INSERT INTO customer_repair_journeys (id, customer_id, service_request_id, quote_request_id) VALUES
    ('j-conflict',   NULL, 'sr-conflict-a', 'sr-conflict-b'),
    ('j-solo',       NULL, 'sr-solo',       NULL),
    ('j-x-conflict', NULL, 'sr-x-free',     'sr-x-owned');
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

describe.skipIf(!LOCAL_PG_AVAILABLE)(
  "HOTFIX-3 — journey ownership conflicts and indexed linking on disposable PostgreSQL",
  () => {
    let admin: pg.Client;
    let dbClient: pg.Client;
    let customerService: any;
    let resetDbPool: (reason: string) => Promise<void>;
    const originalEnv: Record<string, string | undefined> = {};

    async function owner(table: string, id: string): Promise<string | null> {
      const res = await dbClient.query(`SELECT customer_id FROM ${table} WHERE id = $1`, [id]);
      return (res.rows[0]?.customer_id as string | null) ?? null;
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
        CREATE INDEX idx_service_requests_phone_normalized
          ON service_requests (phone_normalized);
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

      if (resetDbPool) await resetDbPool("HOTFIX-3 test cleanup");
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

    // ── ITEM 1 — conflicting journey ownership ──────────────────────────────

    it("does not adopt a journey whose other reference proves a different owner", async () => {
      const linked = await customerService.linkServiceRequestsByPhone("01710000010", "cust-a");

      // The request itself is still linked — it is unambiguously unowned.
      expect(linked).toBe(1);
      expect(await owner("service_requests", "sr-conflict-a")).toBe("cust-a");

      // The journey is not, because its quote reference belongs to cust-other.
      expect(await owner("customer_repair_journeys", "j-conflict")).toBeNull();
    });

    it("the conflicting journey is not adopted by the other owner either", async () => {
      await customerService.linkServiceRequestsByPhone("01710000011", "cust-other");
      expect(await owner("customer_repair_journeys", "j-conflict")).toBeNull();
    });

    it("still adopts a single-reference journey — the guard must not break the working path", async () => {
      const linked = await customerService.linkServiceRequestsByPhone("01710000012", "cust-a");

      expect(linked).toBe(1);
      expect(await owner("customer_repair_journeys", "j-solo")).toBe("cust-a");
    });

    it("applies the same conflict rule on the explicit single-request path", async () => {
      const ok = await customerService.linkServiceRequestToCustomer("sr-x-free", "cust-a");

      expect(ok).toBe(true);
      expect(await owner("service_requests", "sr-x-free")).toBe("cust-a");
      expect(await owner("customer_repair_journeys", "j-x-conflict")).toBeNull();
    });

    // ── ITEM 2 — indexed lookup without losing legacy rows ──────────────────

    it("finds a row through phone_normalized when the raw phone would not match", async () => {
      const linked = await customerService.linkServiceRequestsByPhone("01710000013", "cust-a");

      expect(linked).toBe(1);
      expect(await owner("service_requests", "sr-indexed")).toBe("cust-a");
    });

    it("still links a legacy row whose phone_normalized is NULL", async () => {
      const linked = await customerService.linkServiceRequestsByPhone("01710000014", "cust-a");

      expect(linked).toBe(1);
      expect(await owner("service_requests", "sr-legacy")).toBe("cust-a");
    });

    it("still links a legacy row whose phone_normalized is blank", async () => {
      const linked = await customerService.linkServiceRequestsByPhone("01710000015", "cust-a");

      expect(linked).toBe(1);
      expect(await owner("service_requests", "sr-blank")).toBe("cust-a");
    });

    it("does not touch a request already owned by someone else", async () => {
      const linked = await customerService.linkServiceRequestsByPhone("01710000016", "cust-a");

      expect(linked).toBe(0);
      expect(await owner("service_requests", "sr-x-owned")).toBe("cust-other");
    });

    it("matches each phone exactly once — no duplicate ids across the two reads", async () => {
      // Re-linking an already-owned-by-this-customer row is a no-op, not a
      // double count, which also proves the dedupe map holds.
      const again = await customerService.linkServiceRequestsByPhone("01710000014", "cust-a");
      expect(again).toBe(0);
    });
  },
);
