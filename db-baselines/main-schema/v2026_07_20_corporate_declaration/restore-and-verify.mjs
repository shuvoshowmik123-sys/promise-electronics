/**
 * SYSTEM-FOUNDATION-MAIN-BASELINE-01A
 * Restore forward baseline into disposable local DB; prove release CLI is idempotent at head.
 * Credentials redacted in logs. Drops only the uniquely named disposable database.
 */
import { createHash, randomBytes } from "crypto";
import { spawnSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_DIR = __dirname;
const ROOT = path.resolve(__dirname, "../../..");
const PG_BIN = process.env.PG_BIN || "C:\\Program Files\\PostgreSQL\\18\\bin";
const PGHOST = process.env.BASELINE_PGHOST || "127.0.0.1";
const PGUSER = process.env.BASELINE_PGUSER || "postgres";
const PGPASSWORD = process.env.BASELINE_PGPASSWORD || process.env.PGPASSWORD;
const PGPORT = process.env.BASELINE_PGPORT || "5432";
const TSX_CLI = path.join(ROOT, "node_modules/tsx/dist/cli.mjs");

const schemaPath = path.join(BASELINE_DIR, "schema.sql");
const ledgerPath = path.join(BASELINE_DIR, "promise-schema-migrations.sql");
const manifestPath = path.join(BASELINE_DIR, "manifest.json");

const evidenceDir =
  process.env.BASELINE_EVIDENCE_DIR ||
  path.join(ROOT, "mobile-qa/system-foundation-main-baseline-01a/20260720-0335");
mkdirSync(evidenceDir, { recursive: true });

function sha256File(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function redact(s) {
  let value = String(s)
    .replace(/postgresql:\/\/[^@\s]+@/gi, "postgresql://***:***@")
    .replace(/password[=:]\s*\S+/gi, "password=***");
  if (PGPASSWORD) {
    value = value.replace(
      new RegExp(PGPASSWORD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      "***",
    );
  }
  return value;
}

function runPsql(db, argsExtra) {
  const r = spawnSync(
    path.join(PG_BIN, "psql.exe"),
    ["-U", PGUSER, "-h", PGHOST, "-p", String(PGPORT), "-d", db, ...argsExtra],
    {
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD },
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  const out = redact((r.stdout || "") + (r.stderr || ""));
  if (r.status !== 0) {
    throw new Error(`psql ${db} failed (${r.status}): ${out.slice(0, 2000)}`);
  }
  return out;
}

const log = [];
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const dbName = `promise_bl_v31_${stamp}_${randomBytes(2).toString("hex")}`;
const dbUrl = `postgresql://${encodeURIComponent(PGUSER)}:${encodeURIComponent(PGPASSWORD || "")}@${PGHOST}:${PGPORT}/${dbName}`;
let created = false;
let dropped = false;

try {
  if (!PGPASSWORD) {
    throw new Error("BASELINE_PGPASSWORD or PGPASSWORD is required");
  }
  if (!existsSync(schemaPath) || !existsSync(ledgerPath) || !existsSync(manifestPath)) {
    throw new Error("Baseline files missing in " + BASELINE_DIR);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const schemaHash = sha256File(schemaPath);
  const ledgerHash = sha256File(ledgerPath);
  if (schemaHash !== manifest.files["schema.sql"].sha256) {
    throw new Error(`schema.sql hash mismatch got=${schemaHash}`);
  }
  if (ledgerHash !== manifest.files["promise-schema-migrations.sql"].sha256) {
    throw new Error(`ledger sql hash mismatch got=${ledgerHash}`);
  }
  log.push({ step: "hash-verify", ok: true, schemaHash, ledgerHash });

  runPsql("postgres", ["-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`]);
  runPsql("postgres", ["-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${dbName};`]);
  created = true;
  log.push({ step: "create-db", ok: true, dbName });

  runPsql(dbName, ["-v", "ON_ERROR_STOP=1", "-f", schemaPath]);
  log.push({ step: "restore-schema", ok: true });
  runPsql(dbName, ["-v", "ON_ERROR_STOP=1", "-f", ledgerPath]);
  log.push({ step: "restore-ledger", ok: true });

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  const ledgerCount = await client.query(`SELECT count(*)::int AS n FROM promise_schema_migrations`);
  const usersCount = await client.query(`SELECT count(*)::int AS n FROM users`);
  const jobsCount = await client.query(`SELECT count(*)::int AS n FROM job_tickets`);
  const col = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='job_tickets' AND column_name='corporate_declaration'
    ) AS has_col
  `);
  const ledgerIds = await client.query(
    `SELECT id, checksum FROM promise_schema_migrations ORDER BY id`,
  );
  await client.end();

  if (ledgerCount.rows[0].n !== 31) {
    throw new Error(`ledger row count ${ledgerCount.rows[0].n} expected 31`);
  }
  if (usersCount.rows[0].n !== 0 || jobsCount.rows[0].n !== 0) {
    throw new Error(
      `unexpected app data users=${usersCount.rows[0].n} jobs=${jobsCount.rows[0].n}`,
    );
  }
  if (!col.rows[0].has_col) {
    throw new Error("corporate_declaration column missing after restore");
  }
  log.push({
    step: "post-restore-checks",
    ok: true,
    ledgerRows: 31,
    users: 0,
    job_tickets: 0,
    corporate_declaration: true,
    ledgerIdCount: ledgerIds.rows.length,
  });

  for (const run of [1, 2]) {
    const r = spawnSync(
      process.execPath,
      [TSX_CLI, "server/db-migrate-main.ts"],
      {
        encoding: "utf8",
        cwd: ROOT,
        env: {
          ...process.env,
          DATABASE_URL: dbUrl,
          MAIN_MIGRATION_RELEASE_MODE: "true",
          NODE_ENV: "development",
          PGPASSWORD,
        },
        maxBuffer: 20 * 1024 * 1024,
      },
    );
    const mout = redact((r.stdout || "") + (r.stderr || ""));
    if (r.status !== 0) {
      throw new Error(`migrate run ${run} failed: ${mout.slice(0, 1500)}`);
    }
    if (!/SUCCESS|All 31 required migrations complete/i.test(mout)) {
      throw new Error(`migrate run ${run} unexpected output: ${mout.slice(-800)}`);
    }
    log.push({
      step: `migrate-run-${run}`,
      ok: true,
      exit: 0,
      snippet: mout.slice(-500),
    });
  }

  process.env.DATABASE_URL = dbUrl;
  const serviceUrl = pathToFileURL(
    path.join(ROOT, "server/services/main-schema-migrate.service.ts"),
  ).href;
  const {
    verifyMainSchemaLedger,
    MAIN_SCHEMA_MIGRATIONS,
    REQUIRED_MAIN_SCHEMA_VERSION,
  } = await import(serviceUrl);
  const v = await verifyMainSchemaLedger();
  if (
    !v.ok ||
    v.appliedIds.length !== MAIN_SCHEMA_MIGRATIONS.length ||
    v.currentVersion !== REQUIRED_MAIN_SCHEMA_VERSION ||
    v.missing.length ||
    v.mismatched.length ||
    v.extra.length
  ) {
    throw new Error(`post-migrate verify failed: ${JSON.stringify({
      ok: v.ok,
      currentVersion: v.currentVersion,
      applied: v.appliedIds.length,
      missing: v.missing,
      mismatched: v.mismatched,
      extra: v.extra,
      error: v.error,
    })}`);
  }
  log.push({
    step: "verify-ledger-31-31",
    ok: true,
    currentVersion: v.currentVersion,
    appliedCount: v.appliedIds.length,
  });

  runPsql("postgres", [
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`,
  ]);
  dropped = true;
  log.push({ step: "drop-db", ok: true, dbName });

  const summary = {
    status: "PASS",
    dbName,
    registryHead: REQUIRED_MAIN_SCHEMA_VERSION,
    ledgerRows: 31,
    migrateRuns: 2,
    dropped,
    historicalFullChain: "NOT_VERIFIED",
    cloudProduction: "NOT_VERIFIED",
    scope: "forward-only baseline verify",
    log,
  };
  writeFileSync(
    path.join(evidenceDir, "restore-verify-results.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify({ status: "PASS", dbName, dropped, registryHead: REQUIRED_MAIN_SCHEMA_VERSION }, null, 2));
  process.exit(0);
} catch (e) {
  try {
    if (created && !dropped) {
      runPsql("postgres", [
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`,
      ]);
      log.push({ step: "drop-db-on-error", ok: true, dbName });
    }
  } catch (dropErr) {
    log.push({ step: "drop-db-on-error", ok: false, error: redact(dropErr.message) });
  }
  const err = redact(e?.message || String(e));
  writeFileSync(
    path.join(evidenceDir, "restore-verify-results.json"),
    JSON.stringify({ status: "FAIL", dbName, error: err, log }, null, 2),
  );
  console.error(err);
  process.exit(1);
}
