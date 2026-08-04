/**
 * CUSTOMER-REPAIR-VISIBILITY-REPAIR-01A-HOTFIX-1 — Test B.
 *
 * Exercises the CANONICAL reconcileOrphanJourneys SQL against a real
 * disposable local PostgreSQL database (qa_orphan_reconcile_*). It does NOT
 * trust the pure predicate — it proves the actual SQL behavior.
 *
 * Skips the whole suite when no local PostgreSQL is reachable (e.g. CI).
 * The disposable database is created and dropped within this file.
 */
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const MAINT_URL = process.env.TEST_LOCAL_PG_URL || "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const DB_NAME = `qa_orphan_reconcile_${process.pid.toString(36)}_${Date.now().toString(36)}`;
const DISPOSABLE_URL = MAINT_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);

const BASELINE_SEED = `
  INSERT INTO service_requests (id, customer_id) VALUES
    ('sr-unowned', NULL),
    ('sr-owned-a', 'cust-a'),
    ('sr-owned-b', 'cust-b'),
    ('sr-quote-owned', 'cust-q');

  INSERT INTO customer_repair_journeys (id, customer_id, service_request_id, quote_request_id) VALUES
    ('j-sr-unowned', NULL, 'sr-unowned', NULL),
    ('j-sr-adopt', NULL, 'sr-owned-a', NULL),
    ('j-quote-adopt', NULL, NULL, 'sr-quote-owned'),
    ('j-owned', 'cust-z', 'sr-owned-a', NULL),
    ('j-conflict', NULL, 'sr-owned-a', 'sr-owned-b'),
    ('j-agree', NULL, 'sr-owned-a', 'sr-owned-a'),
    ('j-norefs', NULL, NULL, NULL);
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
  "HOTFIX-1 Test B — reconcileOrphanJourneys against real disposable PostgreSQL",
  () => {
    let admin: pg.Client;
    let dbClient: pg.Client;
    let reconcile: (opts?: { dryRun?: boolean }) => Promise<any>;
    let resetDbPool: (reason: string) => Promise<void>;
    const originalEnv: Record<string, string | undefined> = {};

    async function journeyOwner(id: string): Promise<string | null> {
      const rows = await query(dbClient, `SELECT customer_id FROM customer_repair_journeys WHERE id = '${id}'`);
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
      await dbClient.query(BASELINE_SEED);

      process.env.DATABASE_URL = DISPOSABLE_URL;
      const serviceModule = await import("../server/services/orphan-journey-reconcile.service.js");
      reconcile = serviceModule.reconcileOrphanJourneys;
      const dbModule = await import("../server/db.js");
      resetDbPool = dbModule.resetDbPool;
    });

    afterAll(async () => {
      if (!LOCAL_PG_AVAILABLE) return;
      if (originalEnv.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalEnv.DATABASE_URL;

      if (resetDbPool) await resetDbPool("HOTFIX-1 reconcile test cleanup");
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

    it("dry-run counts candidates/conflicts/skips and writes nothing", async () => {
      const report = await reconcile();
      expect(report).toEqual({
        candidates: 3,
        adopted: 0,
        skippedUnownedRequest: 1,
        skippedAlreadyOwned: 1,
        skippedConflictingOwners: 1,
      });
      expect(await journeyOwner("j-sr-adopt")).toBeNull();
      expect(await journeyOwner("j-quote-adopt")).toBeNull();
      expect(await journeyOwner("j-agree")).toBeNull();
    });

    it("apply adopts via service_request_id AND quote_request_id", async () => {
      const report = await reconcile({ dryRun: false });
      expect(report.adopted).toBe(3);
      expect(await journeyOwner("j-sr-adopt")).toBe("cust-a");
      expect(await journeyOwner("j-quote-adopt")).toBe("cust-q");
      expect(await journeyOwner("j-agree")).toBe("cust-a");
    });

    it("never touches journeys with unowned requests", async () => {
      expect(await journeyOwner("j-sr-unowned")).toBeNull();
      expect(await journeyOwner("j-norefs")).toBeNull();
    });

    it("never overwrites an already-owned journey", async () => {
      expect(await journeyOwner("j-owned")).toBe("cust-z");
    });

    it("skips conflicting owners (both refs, different owners) and counts them", async () => {
      expect(await journeyOwner("j-conflict")).toBeNull();
    });

    it("is idempotent — second apply adopts nothing", async () => {
      const report = await reconcile({ dryRun: false });
      expect(report.adopted).toBe(0);
      expect(await journeyOwner("j-sr-adopt")).toBe("cust-a");
      expect(await journeyOwner("j-quote-adopt")).toBe("cust-q");
    });

    it("is atomic — a failing statement rolls back the whole run", async () => {
      await dbClient.query(`
        INSERT INTO service_requests (id, customer_id) VALUES ('sr-poison', 'poison');
        INSERT INTO customer_repair_journeys (id, customer_id, service_request_id, quote_request_id)
          VALUES ('j-poison', NULL, 'sr-poison', NULL);
        CREATE OR REPLACE FUNCTION qa_orphan_reconcile_poison() RETURNS trigger AS $$
        BEGIN
          IF NEW.customer_id = 'poison' THEN
            RAISE EXCEPTION 'poison owner touched';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER qa_orphan_reconcile_poison_trg
          BEFORE UPDATE ON customer_repair_journeys
          FOR EACH ROW EXECUTE FUNCTION qa_orphan_reconcile_poison();
      `);

      await expect(reconcile({ dryRun: false })).rejects.toThrow();

      expect(await journeyOwner("j-poison")).toBeNull();
      expect(await journeyOwner("j-sr-adopt")).toBe("cust-a");
      expect(await journeyOwner("j-quote-adopt")).toBe("cust-q");

      await dbClient.query(`
        DROP TRIGGER qa_orphan_reconcile_poison_trg ON customer_repair_journeys;
        DROP FUNCTION qa_orphan_reconcile_poison();
        DELETE FROM customer_repair_journeys WHERE id = 'j-poison';
        DELETE FROM service_requests WHERE id = 'sr-poison';
      `);
    });

    it("refuses remote targets unless ALLOW_REMOTE_ORPHAN_RECONCILE=1", async () => {
      process.env.DATABASE_URL = "postgresql://u:p@ep-fake-123.neon.tech/app";
      await expect(reconcile()).rejects.toThrow(/remote|Refusing/i);
      delete process.env.ALLOW_REMOTE_ORPHAN_RECONCILE;
      process.env.DATABASE_URL = DISPOSABLE_URL;
    });

    it("reports counts only — numeric fields, no PII", async () => {
      const report = await reconcile();
      expect(Object.values(report).every((v) => typeof v === "number")).toBe(true);
      expect(JSON.stringify(report)).toMatch(
        /^\{"candidates":\d+,"adopted":\d+,"skippedUnownedRequest":\d+,"skippedAlreadyOwned":\d+,"skippedConflictingOwners":\d+\}$/,
      );
    });
  },
);
