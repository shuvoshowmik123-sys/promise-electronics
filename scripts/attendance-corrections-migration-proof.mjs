/**
 * WORKFORCE-UX-01 — disposable MAIN migration proof (attendance corrections foundation).
 *
 * Fail-closed local-only harness (modeled on db-baselines restore-and-verify + qa_* proofs):
 *  1) Static structure scan of main-schema-migrate.service.ts (labeled STATIC ONLY)
 *  2) Create disposable DB named only `qa_workforceux01_<stamp>_<hex>`
 *  3) Restore trusted forward baseline v2026_07_20_corporate_declaration
 *  4) Run real `db:migrate:main` twice (MAIN_MIGRATION_RELEASE_MODE=true)
 *  5) Assert ledger head + attendance effective columns + unique (user_id,date)
 *     + correction table + pending unique + status check
 *  6) Second disposable: seed user/date duplicates → migrate must fail preflight
 *  7) Drop only validated-prefix disposable DBs in finally
 *
 * Never touches promise_dev / Aiven / Neon / production. Connection secrets redacted.
 *
 * Host command (requires local PostgreSQL + password env):
 *
 *   set BASELINE_PGPASSWORD=<local-postgres-password>
 *   node scripts/attendance-corrections-migration-proof.mjs
 *
 * Optional: BASELINE_PGHOST BASELINE_PGPORT BASELINE_PGUSER PG_BIN
 * Optional: --static-only  (structure scan only; does NOT satisfy disposable proof)
 */

import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BASELINE_DIR = path.join(ROOT, "db-baselines/main-schema/v2026_07_20_corporate_declaration");
const MIGRATE_SRC = path.join(ROOT, "server/services/main-schema-migrate.service.ts");
const TSX_CLI = path.join(ROOT, "node_modules/tsx/dist/cli.mjs");
const PG_BIN = process.env.PG_BIN || "C:\\Program Files\\PostgreSQL\\18\\bin";

/** Strict disposable name prefix — never drop/create anything else. */
const SAFE_PREFIX = "qa_workforceux01_";
const TARGET_MIGRATION_ID = "2026_07_21_attendance_corrections";
const BASELINE_LEDGER_COUNT = 31;

const evidenceDir =
  process.env.WORKFORCE_UX01_EVIDENCE_DIR ||
  path.join(ROOT, "mobile-qa/workforce-ux-01-migration-proof");
mkdirSync(evidenceDir, { recursive: true });

const results = [];
const log = [];
let PASS = 0;
let FAIL = 0;

function ok(name, detail = "") {
  PASS++;
  results.push({ name, status: "PASS", detail: detail || null });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, reason) {
  FAIL++;
  results.push({ name, status: "FAIL", reason: String(reason) });
  console.error(`  FAIL  ${name} — ${reason}`);
}

function redact(s) {
  let value = String(s)
    .replace(/postgresql:\/\/[^@\s'"]+@/gi, "postgresql://***:***@")
    .replace(/postgresql:\/\/[^\s'"]+/gi, "postgresql://***")
    .replace(/password[=:]\s*\S+/gi, "password=***");
  const secrets = [process.env.BASELINE_PGPASSWORD, process.env.PGPASSWORD].filter(Boolean);
  for (const secret of secrets) {
    value = value.replace(
      new RegExp(String(secret).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      "***",
    );
  }
  value = value.replace(
    new RegExp(`${SAFE_PREFIX}[a-z0-9_]+`, "gi"),
    `${SAFE_PREFIX}<redacted>`,
  );
  return value;
}

function sha256File(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function assertSafeDbName(name) {
  if (typeof name !== "string" || !name.startsWith(SAFE_PREFIX)) {
    throw new Error(`REFUSE_UNSAFE_DB_NAME: only ${SAFE_PREFIX}* allowed, got ${redact(name)}`);
  }
  if (!/^[a-z0-9_]+$/i.test(name)) {
    throw new Error(`REFUSE_UNSAFE_DB_NAME_CHARS: ${redact(name)}`);
  }
  const banned = ["promise_dev", "postgres", "template0", "template1", "neon", "aiven", "prod"];
  for (const b of banned) {
    if (name === b || name.includes(b)) {
      throw new Error(`REFUSE_BANNED_DB_TOKEN: ${b}`);
    }
  }
}

function classifyLocalAdmin() {
  const host = process.env.BASELINE_PGHOST || "127.0.0.1";
  let password = process.env.BASELINE_PGPASSWORD || process.env.PGPASSWORD || "";
  let user = process.env.BASELINE_PGUSER || "postgres";
  const port = process.env.BASELINE_PGPORT || "5432";

  // Ambient DATABASE_URL may supply password only when host is local — never migrate ambient DB.
  try {
    if (process.env.DATABASE_URL) {
      const u = new URL(process.env.DATABASE_URL);
      if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") {
        return { ok: false, reason: "ambient_DATABASE_URL_not_local" };
      }
      if (!password && u.password) password = decodeURIComponent(u.password);
      if (u.username) user = u.username;
    }
  } catch {
    /* ignore parse errors */
  }

  if (!password) return { ok: false, reason: "missing_BASELINE_PGPASSWORD_or_PGPASSWORD" };
  if (host !== "127.0.0.1" && host !== "localhost") {
    return { ok: false, reason: `host_not_local:${host}` };
  }
  return {
    ok: true,
    host: host === "localhost" ? "localhost" : "127.0.0.1",
    port: String(port),
    user,
    password,
  };
}

function buildUrl(admin, dbName) {
  assertSafeDbName(dbName);
  return `postgresql://${encodeURIComponent(admin.user)}:${encodeURIComponent(admin.password)}@${admin.host}:${admin.port}/${dbName}`;
}

function runPsql(admin, db, argsExtra) {
  const psql = path.join(PG_BIN, process.platform === "win32" ? "psql.exe" : "psql");
  if (!existsSync(psql) && process.platform === "win32") {
    throw new Error(`psql not found at ${psql}; set PG_BIN`);
  }
  const r = spawnSync(
    psql,
    ["-U", admin.user, "-h", admin.host, "-p", String(admin.port), "-d", db, ...argsExtra],
    {
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: admin.password },
      maxBuffer: 40 * 1024 * 1024,
    },
  );
  const out = redact((r.stdout || "") + (r.stderr || ""));
  if (r.status !== 0) {
    throw new Error(`psql failed (${r.status}): ${out.slice(0, 2000)}`);
  }
  return out;
}

function makeDisposableName(tag) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const name = `${SAFE_PREFIX}${tag}_${stamp}_${randomBytes(2).toString("hex")}`;
  assertSafeDbName(name);
  return name;
}

function dropDisposableIfSafe(admin, dbName) {
  assertSafeDbName(dbName);
  runPsql(admin, "postgres", [
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`,
  ]);
}

function createAndRestoreBaseline(admin, dbName, schemaPath, ledgerPath) {
  assertSafeDbName(dbName);
  runPsql(admin, "postgres", [
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`,
  ]);
  runPsql(admin, "postgres", ["-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${dbName};`]);
  runPsql(admin, dbName, ["-v", "ON_ERROR_STOP=1", "-f", schemaPath]);
  runPsql(admin, dbName, ["-v", "ON_ERROR_STOP=1", "-f", ledgerPath]);
}

function runMainMigrate(dbUrl, runLabel) {
  if (!existsSync(TSX_CLI)) {
    throw new Error("tsx CLI missing — npm install first");
  }
  const r = spawnSync(process.execPath, [TSX_CLI, "server/db-migrate-main.ts"], {
    encoding: "utf8",
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
      MAIN_MIGRATION_RELEASE_MODE: "true",
      NODE_ENV: "development",
      // Never allow accidental prod migrate flags in this harness
      ALLOW_PROD_DB_MIGRATE_MAIN: "false",
    },
    maxBuffer: 20 * 1024 * 1024,
  });
  const out = redact((r.stdout || "") + (r.stderr || ""));
  writeFileSync(
    path.join(evidenceDir, `migrate-${runLabel}.log.txt`),
    out.slice(0, 12000),
  );
  return { status: r.status, out };
}

/** STATIC ONLY — does not prove disposable migrate. */
function runStaticStructureScan() {
  console.log("\n[STATIC ONLY] migration source structure scan");
  if (!existsSync(MIGRATE_SRC)) {
    fail("static_migrate_source", "main-schema-migrate.service.ts missing");
    return;
  }
  const src = readFileSync(MIGRATE_SRC, "utf8");
  const head = src.match(/REQUIRED_MAIN_SCHEMA_VERSION\s*=\s*"([^"]+)"/)?.[1];
  if (head === TARGET_MIGRATION_ID) ok("static_ledger_head", head);
  else fail("static_ledger_head", `expected ${TARGET_MIGRATION_ID}, got ${head}`);

  const checks = [
    ["static_migration_id", new RegExp(`id:\\s*"${TARGET_MIGRATION_ID}"`)],
    ["static_effective_check_in", /effective_check_in_time/],
    ["static_effective_check_out", /effective_check_out_time/],
    ["static_correction_table", /CREATE TABLE IF NOT EXISTS attendance_correction_requests/],
    ["static_pending_unique", /uidx_attendance_correction_one_pending/],
    ["static_user_date_unique", /uidx_attendance_user_date/],
    ["static_dupe_preflight", /ATTENDANCE_USER_DATE_DUPLICATES/],
    ["static_status_check", /chk_attendance_correction_status/],
  ];
  for (const [name, re] of checks) {
    if (re.test(src)) ok(name);
    else fail(name, "pattern missing");
  }
}

async function assertAttendanceSchema(client) {
  const cols = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'attendance_records'
      AND column_name IN ('effective_check_in_time', 'effective_check_out_time')
    ORDER BY column_name
  `);
  const colNames = cols.rows.map((r) => r.column_name);
  if (
    !colNames.includes("effective_check_in_time") ||
    !colNames.includes("effective_check_out_time")
  ) {
    throw new Error(`missing effective columns: ${colNames.join(",")}`);
  }
  ok("schema_effective_columns", colNames.join(","));

  const uidx = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'attendance_records'
      AND indexname = 'uidx_attendance_user_date'
  `);
  if (uidx.rows.length !== 1) {
    throw new Error("uidx_attendance_user_date missing");
  }
  const def = String(uidx.rows[0].indexdef || "");
  if (!/UNIQUE/i.test(def) || !/user_id/i.test(def) || !/\bdate\b/i.test(def)) {
    throw new Error(`unexpected unique index def: ${def}`);
  }
  ok("schema_uidx_attendance_user_date");

  const table = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'attendance_correction_requests'
    ) AS ok
  `);
  if (!table.rows[0].ok) throw new Error("attendance_correction_requests missing");
  ok("schema_correction_table");

  const pending = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'attendance_correction_requests'
      AND indexname = 'uidx_attendance_correction_one_pending'
  `);
  if (pending.rows.length !== 1) {
    throw new Error("uidx_attendance_correction_one_pending missing");
  }
  const pdef = String(pending.rows[0].indexdef || "");
  if (!/UNIQUE/i.test(pdef) || !/pending/i.test(pdef)) {
    throw new Error(`unexpected pending unique def: ${pdef}`);
  }
  ok("schema_pending_unique");

  const chk = await client.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.attendance_correction_requests'::regclass
      AND conname = 'chk_attendance_correction_status'
  `);
  if (chk.rows.length !== 1) {
    throw new Error("chk_attendance_correction_status missing");
  }
  const cdef = String(chk.rows[0].def || "");
  for (const st of ["pending", "approved", "rejected", "cancelled"]) {
    if (!cdef.includes(st)) throw new Error(`status check missing ${st}: ${cdef}`);
  }
  ok("schema_status_check");
}

async function assertLedgerHead(dbUrl) {
  process.env.DATABASE_URL = dbUrl;
  const serviceUrl = pathToFileURL(
    path.join(ROOT, "server/services/main-schema-migrate.service.ts"),
  ).href;
  const {
    verifyMainSchemaLedger,
    MAIN_SCHEMA_MIGRATIONS,
    REQUIRED_MAIN_SCHEMA_VERSION,
  } = await import(serviceUrl);

  if (REQUIRED_MAIN_SCHEMA_VERSION !== TARGET_MIGRATION_ID) {
    throw new Error(
      `registry head mismatch: ${REQUIRED_MAIN_SCHEMA_VERSION} !== ${TARGET_MIGRATION_ID}`,
    );
  }

  const v = await verifyMainSchemaLedger();
  if (
    !v.ok ||
    v.appliedIds.length !== MAIN_SCHEMA_MIGRATIONS.length ||
    v.currentVersion !== REQUIRED_MAIN_SCHEMA_VERSION ||
    v.missing.length ||
    v.mismatched.length ||
    v.extra.length
  ) {
    throw new Error(
      `ledger verify failed: ${JSON.stringify({
        ok: v.ok,
        currentVersion: v.currentVersion,
        applied: v.appliedIds.length,
        expected: MAIN_SCHEMA_MIGRATIONS.length,
        missing: v.missing,
        mismatched: v.mismatched,
        extra: v.extra,
        error: v.error,
      })}`,
    );
  }

  // Attendance migration present exactly once in ledger
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const rows = await client.query(
      `SELECT id, checksum FROM promise_schema_migrations WHERE id = $1`,
      [TARGET_MIGRATION_ID],
    );
    if (rows.rows.length !== 1) {
      throw new Error(
        `expected exactly one ledger row for ${TARGET_MIGRATION_ID}, got ${rows.rows.length}`,
      );
    }
    ok(
      "ledger_attendance_migration_once",
      `checksum=${rows.rows[0].checksum}`,
    );
    ok(
      "ledger_full_verify",
      `head=${v.currentVersion} applied=${v.appliedIds.length}`,
    );
  } finally {
    await client.end();
  }

  return { REQUIRED_MAIN_SCHEMA_VERSION, applied: v.appliedIds.length };
}

async function runDisposableHappyPath(admin, schemaPath, ledgerPath) {
  const dbName = makeDisposableName("main");
  const dbUrl = buildUrl(admin, dbName);
  let created = false;
  let dropped = false;

  try {
    createAndRestoreBaseline(admin, dbName, schemaPath, ledgerPath);
    created = true;
    ok("create_restore_baseline", `${SAFE_PREFIX}<redacted>`);

    const pre = new pg.Client({ connectionString: dbUrl });
    await pre.connect();
    try {
      const n = await pre.query(`SELECT count(*)::int AS n FROM promise_schema_migrations`);
      if (n.rows[0].n !== BASELINE_LEDGER_COUNT) {
        throw new Error(`baseline ledger count ${n.rows[0].n} expected ${BASELINE_LEDGER_COUNT}`);
      }
      ok("baseline_ledger_count", String(BASELINE_LEDGER_COUNT));
    } finally {
      await pre.end();
    }

    for (const run of [1, 2]) {
      const { status, out } = runMainMigrate(dbUrl, `happy-${run}`);
      if (status !== 0) {
        throw new Error(`migrate run ${run} exit ${status}: ${out.slice(0, 1200)}`);
      }
      if (!/SUCCESS|SKIPPED|complete|already/i.test(out)) {
        // still accept clean exit 0 with ledger write messages
        log.push({ step: `migrate-run-${run}-output-soft`, snippet: out.slice(-400) });
      }
      ok(`migrate_run_${run}`, "exit 0");
    }

    await assertLedgerHead(dbUrl);

    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    try {
      await assertAttendanceSchema(client);
    } finally {
      await client.end();
    }

    dropDisposableIfSafe(admin, dbName);
    dropped = true;
    ok("drop_happy_path_db");
    return { dbName, dropped };
  } finally {
    if (created && !dropped) {
      try {
        dropDisposableIfSafe(admin, dbName);
        ok("drop_happy_path_db_finally");
      } catch (e) {
        fail("drop_happy_path_db_finally", redact(e?.message || e));
      }
    }
  }
}

/**
 * Exercise ATTENDANCE_USER_DATE_DUPLICATES preflight on a second disposable DB.
 * Seeds two attendance_records with same (user_id, date) before migrate; expects failure.
 */
async function runDuplicatePreflightProof(admin, schemaPath, ledgerPath) {
  const dbName = makeDisposableName("dupe");
  const dbUrl = buildUrl(admin, dbName);
  let created = false;
  let dropped = false;

  try {
    createAndRestoreBaseline(admin, dbName, schemaPath, ledgerPath);
    created = true;
    ok("dupe_create_restore");

    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    try {
      // Minimal rows — baseline attendance_records has required user fields + date + check_in_time
      await client.query(`
        INSERT INTO attendance_records (id, user_id, user_name, user_role, date, check_in_time)
        VALUES
          ('qa-att-dup-1', 'qa-user-dup', 'QA Dup', 'Technician', '2026-07-15', NOW()),
          ('qa-att-dup-2', 'qa-user-dup', 'QA Dup', 'Technician', '2026-07-15', NOW())
      `);
      const cnt = await client.query(`
        SELECT count(*)::int AS n FROM attendance_records
        WHERE user_id = 'qa-user-dup' AND date = '2026-07-15'
      `);
      if (cnt.rows[0].n !== 2) {
        throw new Error(`expected 2 duplicate seed rows, got ${cnt.rows[0].n}`);
      }
      ok("dupe_seed_two_same_user_date");
    } finally {
      await client.end();
    }

    const { status, out } = runMainMigrate(dbUrl, "dupe-preflight");
    if (status === 0) {
      throw new Error(
        "expected migrate to FAIL on duplicate user/date preflight, but exit was 0",
      );
    }
    if (!/ATTENDANCE_USER_DATE_DUPLICATES|duplicate/i.test(out)) {
      throw new Error(
        `migrate failed but without expected preflight signal: ${out.slice(0, 1200)}`,
      );
    }
    ok("dupe_preflight_fail_closed", "migrate non-zero + ATTENDANCE_USER_DATE_DUPLICATES");

    // Confirm unique index was NOT applied
    const check = new pg.Client({ connectionString: dbUrl });
    await check.connect();
    try {
      const uidx = await check.query(`
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'uidx_attendance_user_date'
      `);
      if (uidx.rows.length > 0) {
        throw new Error("uidx_attendance_user_date should not exist after failed preflight");
      }
      ok("dupe_unique_index_not_created");
    } finally {
      await check.end();
    }

    dropDisposableIfSafe(admin, dbName);
    dropped = true;
    ok("drop_dupe_path_db");
  } finally {
    if (created && !dropped) {
      try {
        dropDisposableIfSafe(admin, dbName);
        ok("drop_dupe_path_db_finally");
      } catch (e) {
        fail("drop_dupe_path_db_finally", redact(e?.message || e));
      }
    }
  }
}

async function main() {
  const staticOnly = process.argv.includes("--static-only");
  console.log("WORKFORCE-UX-01 attendance corrections migration proof");
  console.log(`SAFE_PREFIX=${SAFE_PREFIX} (disposable DBs only)`);

  runStaticStructureScan();

  if (staticOnly) {
    console.log("\n--static-only: disposable migrate NOT run (does not satisfy ticket proof).");
    writeFileSync(
      path.join(evidenceDir, "results.json"),
      JSON.stringify(
        {
          status: FAIL ? "FAIL" : "STATIC_ONLY",
          note: "static structure scan only — disposable migrate NOT EXECUTED",
          pass: PASS,
          fail: FAIL,
          results,
        },
        null,
        2,
      ),
    );
    process.exit(FAIL ? 1 : 0);
  }

  console.log("\n[DISPOSABLE] local Postgres restore + dual migrate + schema asserts");

  const admin = classifyLocalAdmin();
  if (!admin.ok) {
    fail("local_admin", admin.reason);
    writeFileSync(
      path.join(evidenceDir, "results.json"),
      JSON.stringify(
        {
          status: "BLOCKED",
          reason: admin.reason,
          hostCommand:
            "set BASELINE_PGPASSWORD=<local-postgres-password> && node scripts/attendance-corrections-migration-proof.mjs",
          pass: PASS,
          fail: FAIL,
          results,
        },
        null,
        2,
      ),
    );
    console.error(
      "\nBLOCKED — local Postgres admin credentials required. Exact host command:\n" +
        "  set BASELINE_PGPASSWORD=<local-postgres-password>\n" +
        "  node scripts/attendance-corrections-migration-proof.mjs\n",
    );
    process.exit(2);
  }
  ok("local_target_class", `${admin.host}:${admin.port}`);

  const schemaPath = path.join(BASELINE_DIR, "schema.sql");
  const ledgerPath = path.join(BASELINE_DIR, "promise-schema-migrations.sql");
  const manifestPath = path.join(BASELINE_DIR, "manifest.json");
  if (!existsSync(schemaPath) || !existsSync(ledgerPath) || !existsSync(manifestPath)) {
    fail("baseline_files", "missing schema/ledger/manifest");
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (sha256File(schemaPath) !== manifest.files["schema.sql"].sha256) {
    fail("baseline_schema_hash", "mismatch");
    process.exit(1);
  }
  if (sha256File(ledgerPath) !== manifest.files["promise-schema-migrations.sql"].sha256) {
    fail("baseline_ledger_hash", "mismatch");
    process.exit(1);
  }
  ok("baseline_hashes");

  try {
    await runDisposableHappyPath(admin, schemaPath, ledgerPath);
    await runDuplicatePreflightProof(admin, schemaPath, ledgerPath);
  } catch (e) {
    fail("disposable_proof", redact(e?.message || e));
  }

  const status = FAIL === 0 ? "PASS" : "FAIL";
  const summary = {
    status,
    safePrefix: SAFE_PREFIX,
    targetMigration: TARGET_MIGRATION_ID,
    pass: PASS,
    fail: FAIL,
    historicalFullChain: "NOT_VERIFIED",
    cloudProduction: "NOT_VERIFIED",
    ambientSharedDb: "NOT_TOUCHED",
    results,
    log,
  };
  writeFileSync(path.join(evidenceDir, "results.json"), JSON.stringify(summary, null, 2));
  console.log(`\nSummary: ${status} (${PASS} pass, ${FAIL} fail)`);
  console.log(`Evidence: ${path.relative(ROOT, path.join(evidenceDir, "results.json"))}`);
  process.exit(FAIL ? 1 : 0);
}

main().catch((e) => {
  console.error(redact(e?.message || e));
  process.exit(1);
});
