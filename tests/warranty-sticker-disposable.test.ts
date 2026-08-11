/**
 * The warranty seal lifecycle against a real PostgreSQL database.
 *
 * The other seal suite reads the source and asserts it is wired a certain way.
 * That proves the code says what it appears to say and nothing about whether
 * it works — and until this file existed, the genuine path had never once run.
 * The only live exercise anybody had performed was typing a fake code and
 * getting "not genuine", which is the branch that touches the least.
 *
 * So this issues real seals, scans them, reissues them and scans the dead ones,
 * against real tables. Every assertion is about behaviour, not about text.
 *
 * Skips itself when no local PostgreSQL is reachable. The database is created
 * and dropped inside this file.
 */
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const MAINT_URL = process.env.TEST_LOCAL_PG_URL || "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const DB_NAME = `qa_warranty_seal_${process.pid.toString(36)}_${Date.now().toString(36)}`;
const DISPOSABLE_URL = MAINT_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);

const SEED = `
  INSERT INTO job_tickets (id, customer, customer_phone, device, tv_serial_number, status, completed_at,
                           warranty_days, parts_warranty_days, warranty_expiry_date,
                           parts_warranty_expiry_date, grace_period_days)
  VALUES
    ('job-covered', 'Karim Rahman', '01712345678', 'Samsung 43', 'SN-REAL-001', 'Completed', now(),
     30, 180, now() + interval '20 days', now() + interval '150 days', 7),
    ('job-lapsed', 'Old Customer', '01799999999', 'LG 32', 'SN-REAL-002', 'Completed', now() - interval '400 days',
     30, NULL, now() - interval '300 days', NULL, 0),
    ('job-nowarranty', 'No Cover', '01700000000', 'Sony 40', NULL, 'Completed', now(),
     0, NULL, NULL, NULL, 0);
`;

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

const STAFF = { id: "u-tech", name: "Rahim" };
const OTHER = { id: "u-manager", name: "Nadia" };

describe.skipIf(!LOCAL_PG_AVAILABLE)("warranty seals against real PostgreSQL", () => {
  let admin: pg.Client;
  let db: pg.Client;
  let service: typeof import("../server/services/warranty-sticker.service.js");
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    if (!LOCAL_PG_AVAILABLE) return;
    originalEnv.DATABASE_URL = process.env.DATABASE_URL;

    admin = new pg.Client({ connectionString: MAINT_URL });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${DB_NAME}`);

    db = new pg.Client({ connectionString: DISPOSABLE_URL });
    await db.connect();
    /**
     * Built from the Drizzle model, not hand-listed.
     *
     * A hand-written table looks fine until the code does `select()` — which
     * asks for every column the model declares — and the query dies on one
     * that was never created. Reusing the repo's own builder keeps this
     * faithful through the next schema change.
     */
    const dbClient = db;
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

    await db.query(SEED);

    process.env.DATABASE_URL = DISPOSABLE_URL;
    service = await import("../server/services/warranty-sticker.service.js");
  }, 60_000);

  afterAll(async () => {
    if (!LOCAL_PG_AVAILABLE) return;
    if (originalEnv.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalEnv.DATABASE_URL;
    try { const { resetDbPool } = await import("../server/db.js"); await resetDbPool("test teardown"); } catch { /* pool may not exist */ }
    await db?.end().catch(() => { });
    await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`).catch(() => { });
    await admin?.end().catch(() => { });
  }, 60_000);

  it("issues exactly two seals, with two different codes", async () => {
    const seals = await service.ensureStickersForJob("job-covered", STAFF);
    expect(seals).toHaveLength(2);

    const placements = seals.map((s) => s.placement).sort();
    expect(placements).toEqual(["inner", "outer"]);

    // The whole design: one code on both would only ever say "this is job X".
    expect(seals[0].code).not.toBe(seals[1].code);
    for (const seal of seals) expect(seal.code).toMatch(/^[2-9A-HJ-NP-Z]{12}$/);
  });

  it("does not mint a second pair when asked again", async () => {
    // Printing twice must not put four live codes on one television.
    const again = await service.ensureStickersForJob("job-covered", STAFF);
    expect(again).toHaveLength(2);
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM warranty_stickers WHERE job_ticket_id = 'job-covered' AND voided_at IS NULL`,
    );
    expect(rows[0].n).toBe(2);
  });

  it("refuses a job that carries no warranty", async () => {
    await expect(service.ensureStickersForJob("job-nowarranty", STAFF)).rejects.toMatchObject({
      code: "NO_WARRANTY",
    });
  });

  it("recognises a real seal and reports live cover", async () => {
    const [seal] = await service.ensureStickersForJob("job-covered", STAFF);
    const outcome = await service.verifySticker(seal.code, STAFF);

    expect(outcome.result).toBe("genuine");
    expect(outcome.job?.id).toBe("job-covered");
    expect(outcome.job?.serviceValid).toBe(true);
    expect(outcome.job?.partsValid).toBe(true);
    // The counter compares this against the back of the set in front of them.
    expect(outcome.job?.tvSerialNumber).toBe("SN-REAL-001");
    // Both live seals come back so the pair can be checked against each other.
    expect(outcome.siblings).toHaveLength(2);
  });

  it("reads a lower-case, dash-separated code the way it was typed", async () => {
    const [seal] = await service.ensureStickersForJob("job-covered", STAFF);
    const typed = seal.code.toLowerCase().replace(/(.{4})(?=.)/g, "$1-");
    const outcome = await service.verifySticker(` ${typed} `, STAFF);
    expect(outcome.result).toBe("genuine");
  });

  it("says genuine but expired rather than refusing outright", async () => {
    // Whether to honour lapsed cover is a decision for a person; the system's
    // job is to report accurately, not to slam the door.
    const seals = await service.ensureStickersForJob("job-lapsed", STAFF);
    const outcome = await service.verifySticker(seals[0].code, STAFF);
    expect(outcome.result).toBe("genuine");
    expect(outcome.job?.serviceValid).toBe(false);
    expect(outcome.job?.partsValid).toBe(false);
  });

  it("rejects a code it never issued, and writes the attempt down", async () => {
    const outcome = await service.verifySticker("ZZZZ2222XXXX", OTHER);
    expect(outcome.result).toBe("unknown");
    expect(outcome.job).toBeUndefined();

    // A forgery is only visible if the misses are kept.
    const { rows } = await db.query(
      `SELECT result, scanned_by_name FROM warranty_sticker_scans WHERE scanned_code = 'ZZZZ2222XXXX'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].result).toBe("unknown");
    expect(rows[0].scanned_by_name).toBe("Nadia");
  });

  it("records who scanned a genuine seal too", async () => {
    const [seal] = await service.ensureStickersForJob("job-covered", STAFF);
    await service.verifySticker(seal.code, OTHER);
    const { rows } = await db.query(
      `SELECT result FROM warranty_sticker_scans WHERE scanned_code = $1 ORDER BY scanned_at DESC LIMIT 1`,
      [seal.code],
    );
    expect(rows[0].result).toBe("genuine");
  });

  it("replaces a damaged pair, and the old codes go dead", async () => {
    const before = await service.ensureStickersForJob("job-covered", STAFF);
    const beforeCodes = before.map((s) => s.code).sort();

    const after = await service.reissueStickersForJob("job-covered", STAFF, "Printed crooked");
    const afterCodes = after.map((s) => s.code).sort();

    expect(after).toHaveLength(2);
    // Genuinely new codes, not the same pair handed back.
    expect(afterCodes).not.toEqual(beforeCodes);

    const { rows } = await db.query(
      `SELECT count(*)::int AS live FROM warranty_stickers WHERE job_ticket_id = 'job-covered' AND voided_at IS NULL`,
    );
    expect(rows[0].live, "a job must never carry more than one live pair").toBe(2);
  });

  it("still recognises a replaced seal, and says it was replaced", async () => {
    /**
     * The reason a voided row is kept rather than deleted. An old sticker is
     * still physically out there; a code that had vanished from the records
     * would read as a forgery, which is a different accusation entirely.
     */
    const { rows } = await db.query(
      `SELECT code FROM warranty_stickers WHERE job_ticket_id = 'job-covered' AND voided_at IS NOT NULL LIMIT 1`,
    );
    const deadCode = rows[0].code as string;

    const outcome = await service.verifySticker(deadCode, STAFF);
    expect(outcome.result).toBe("voided");
    expect(outcome.sticker?.voidedReason).toContain("Printed crooked");
    expect(outcome.sticker?.voidedReason).toContain("Rahim");
    // It still names the repair, so the counter is not left stranded.
    expect(outcome.job?.id).toBe("job-covered");
  });

  it("demands a reason before replacing", async () => {
    await expect(service.reissueStickersForJob("job-covered", STAFF, "   ")).rejects.toMatchObject({
      code: "REASON_REQUIRED",
    });
  });

  it("never issues the same code to two televisions", async () => {
    // The database is the guarantee, not the retry loop above it.
    const { rows } = await db.query(
      `SELECT count(*)::int AS total, count(DISTINCT code)::int AS unique_codes FROM warranty_stickers`,
    );
    expect(rows[0].unique_codes).toBe(rows[0].total);
  });
});
