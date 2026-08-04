/**
 * CUSTOMER-ACCOUNT-SETUP-DEAD-END-REPAIR-01A — indexed phone lookup.
 *
 * getUserByPhoneNormalized used to load every row of `users` on every login and
 * filter in JavaScript. It now reads the indexed users.phone_normalized first
 * and falls back to the legacy null/blank set only.
 *
 * The fallback is the load-bearing half: phone_normalized is not populated by
 * every path that creates a customer (admin-created customers, for one), so an
 * indexed-only lookup would silently match fewer users than before — the exact
 * class of silent-shrink bug this project has already hit twice.
 *
 * Skips when no local PostgreSQL is reachable (e.g. CI). The disposable
 * database is created and dropped within this file.
 */
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const MAINT_URL = process.env.TEST_LOCAL_PG_URL || "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const DB_NAME = `qa_phone_lookup_${process.pid.toString(36)}_${Date.now().toString(36)}`;
const DISPOSABLE_URL = MAINT_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);

/**
 * phone_normalized is the canonical 10-digit form with no leading zero, written
 * by normalizePhone() in server/utils/phone.ts.
 *
 * u-indexed carries a raw phone that normalises to something else, so it can
 * only be found through the indexed column. u-legacy-null and u-legacy-blank are
 * the rows an indexed-only lookup would drop.
 */
const SEED = `
  INSERT INTO users (id, name, phone, phone_normalized, role, status, password, permissions, joined_at) VALUES
    ('u-indexed',      'Indexed',      'not-a-phone',  '1710000021', 'Customer', 'Active', 'x', '{}', NOW() - INTERVAL '5 day'),
    ('u-legacy-null',  'Legacy Null',  '01710000022',  NULL,         'Customer', 'Active', 'x', '{}', NOW() - INTERVAL '4 day'),
    ('u-legacy-blank', 'Legacy Blank', '01710000023',  '',           'Customer', 'Active', 'x', '{}', NOW() - INTERVAL '3 day'),
    ('u-plus-format',  'Plus Format',  '+8801710000024','1710000024', 'Customer', 'Active', 'x', '{}', NOW() - INTERVAL '2 day'),
    ('u-staff',        'A Technician', '01710000025',  '1710000025', 'Technician','Active', 'x', '{}', NOW() - INTERVAL '1 day');
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
  "getUserByPhoneNormalized on disposable PostgreSQL",
  () => {
    let admin: pg.Client;
    let dbClient: pg.Client;
    let getUserByPhoneNormalized: (phone: string) => Promise<any>;
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

      // Build the table from the drizzle schema rather than hand-listing columns.
      // `db.select()` with no projection asks for every column the schema knows
      // about, so a hand-written subset fails on whichever field was added last.
      const { getTableColumns } = await import("drizzle-orm");
      const schema = await import("../shared/schema.js");
      const columns = getTableColumns(schema.users as any);

      const ddl = Object.values(columns as Record<string, any>).map((col) => {
        const type =
          col.dataType === "boolean" ? "BOOLEAN" :
          col.dataType === "number" ? "NUMERIC" :
          col.dataType === "date" ? "TIMESTAMP" :
          "TEXT";
        const parts = [`"${col.name}"`, type];
        if (col.primary) parts.push("PRIMARY KEY");
        // NOT NULL only where the schema has no default to supply a value — the
        // seed below sets the columns this lookup actually reads, and defaulted
        // columns would otherwise reject every insert.
        else if (col.notNull && !col.hasDefault) parts.push("NOT NULL");
        return parts.join(" ");
      });

      await dbClient.query(`CREATE TABLE users (${ddl.join(", ")});`);
      await dbClient.query(`CREATE INDEX idx_users_phone_normalized ON users (phone_normalized);`);
      await dbClient.query(SEED);

      process.env.DATABASE_URL = DISPOSABLE_URL;
      const repo = await import("../server/repositories/user.repository.js");
      getUserByPhoneNormalized = repo.getUserByPhoneNormalized;
      const dbModule = await import("../server/db.js");
      resetDbPool = dbModule.resetDbPool;
    });

    afterAll(async () => {
      if (!LOCAL_PG_AVAILABLE) return;
      if (originalEnv.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalEnv.DATABASE_URL;

      if (resetDbPool) await resetDbPool("phone lookup test cleanup");
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

    it("finds a row through the indexed column when the raw phone would not match", async () => {
      const user = await getUserByPhoneNormalized("01710000021");
      expect(user?.id).toBe("u-indexed");
    });

    it("still finds a legacy row whose phone_normalized is NULL", async () => {
      const user = await getUserByPhoneNormalized("01710000022");
      expect(user?.id).toBe("u-legacy-null");
    });

    it("still finds a legacy row whose phone_normalized is blank", async () => {
      const user = await getUserByPhoneNormalized("01710000023");
      expect(user?.id).toBe("u-legacy-blank");
    });

    it("matches the same number written in any accepted format", async () => {
      for (const form of ["01710000024", "+8801710000024", "8801710000024", "1710000024"]) {
        const user = await getUserByPhoneNormalized(form);
        expect(user?.id, `lookup by ${form}`).toBe("u-plus-format");
      }
    });

    it("returns undefined for a number nobody holds", async () => {
      await expect(getUserByPhoneNormalized("01710000099")).resolves.toBeUndefined();
    });

    it("returns undefined for an unusable input rather than scanning", async () => {
      await expect(getUserByPhoneNormalized("")).resolves.toBeUndefined();
    });

    it("still matches non-customer roles — registration's duplicate check depends on it", async () => {
      // This function is role-agnostic on purpose: register uses it to refuse a
      // phone already held by staff. Narrowing it here would silently change
      // that behaviour.
      const user = await getUserByPhoneNormalized("01710000025");
      expect(user?.id).toBe("u-staff");
    });
  },
);
