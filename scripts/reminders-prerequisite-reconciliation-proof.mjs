/**
 * Disposable proof for the ledgered reminders prerequisite reconciliation.
 *
 * Uses only a schema-only + promise_schema_migrations baseline restored into
 * locally-created databases whose names carry the strict safe prefix. The
 * ambient development database, Neon, Aiven, and production are rejected.
 * Credentials are read from environment variables and never placed in argv or
 * output.
 *
 * Required: REMINDERS_PROOF_PGPASSWORD (or PGPASSWORD), local PostgreSQL.
 * Optional: REMINDERS_PROOF_PGHOST, REMINDERS_PROOF_PGPORT,
 * REMINDERS_PROOF_PGUSER, PG_BIN, REMINDERS_PROOF_EVIDENCE_DIR.
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
// Reuse the existing local-only baseline-adoption prefix; do not broaden that guard.
const SAFE_PREFIX = "qa_schema_update_reminders_reconcile_";
const BASELINE_DIR = path.join(ROOT, "db-baselines/main-schema/v2026_07_20_corporate_declaration");
const TSX_CLI = path.join(ROOT, "node_modules/tsx/dist/cli.mjs");
const PG_BIN = process.env.PG_BIN || "C:\\Program Files\\PostgreSQL\\18\\bin";
const EVIDENCE_DIR = process.env.REMINDERS_PROOF_EVIDENCE_DIR || path.join(ROOT, "qa-tmp-reminders-reconciliation");
const RECONCILIATION_ID = "2026_07_19_reminders_prerequisite_reconciliation";
const SCHEDULER_ID = "2026_07_19_scheduler_delivery_claim_ddl";
const TRUST_BASELINE_ADOPTION_ENV = "MAIN_SCHEMA_TRUST_BASELINE_ADOPTION";
const LATER_IDS = [
  SCHEDULER_ID,
  "2026_07_19_scheduled_backup_runs_ddl",
  "2026_07_19_drawer_day_close_runs_ddl",
  "2026_07_20_corporate_declaration",
];

mkdirSync(EVIDENCE_DIR, { recursive: true });
const results = [];
let failures = 0;

function pass(name, detail = "") {
  results.push({ name, status: "PASS", detail: detail || null });
  console.log(`  PASS  ${name}${detail ? ` â€” ${detail}` : ""}`);
}

function fail(name, reason) {
  failures++;
  results.push({ name, status: "FAIL", reason: String(reason) });
  console.error(`  FAIL  ${name} â€” ${reason}`);
}

function redact(value) {
  let text = String(value);
  text = text.replace(/postgres(?:ql)?:\/\/[^@\s'\"]+@/gi, "postgresql://***:***@");
  text = text.replace(/postgres(?:ql)?:\/\/[^\s'\"]+/gi, "postgresql://***");
  for (const secret of [process.env.REMINDERS_PROOF_PGPASSWORD, process.env.PGPASSWORD].filter(Boolean)) {
    text = text.replaceAll(String(secret), "***");
  }
  return text.replace(new RegExp(`${SAFE_PREFIX}[a-z0-9_]+`, "gi"), `${SAFE_PREFIX}<redacted>`);
}

function assertSafeDbName(name) {
  if (!name.startsWith(SAFE_PREFIX) || !/^[a-z0-9_]+$/i.test(name)) {
    throw new Error("unsafe disposable database name");
  }
  for (const token of ["promise", "neon", "aiven", "prod", "dev"]) {
    if (name.includes(token)) throw new Error("banned disposable database token");
  }
}

function localAdmin() {
  const host = process.env.REMINDERS_PROOF_PGHOST || "127.0.0.1";
  const port = process.env.REMINDERS_PROOF_PGPORT || "5432";
  const user = process.env.REMINDERS_PROOF_PGUSER || "postgres";
  const password = process.env.REMINDERS_PROOF_PGPASSWORD || process.env.PGPASSWORD || "";
  if (!password) return { ok: false, reason: "missing_REMINDERS_PROOF_PGPASSWORD_or_PGPASSWORD" };
  if (host !== "127.0.0.1" && host !== "localhost") return { ok: false, reason: "proof_host_must_be_local" };
  return { ok: true, host, port, user, password };
}

function dbUrl(admin, name) {
  assertSafeDbName(name);
  return `postgresql://${encodeURIComponent(admin.user)}:${encodeURIComponent(admin.password)}@${admin.host}:${admin.port}/${name}`;
}

function assertSafeProofDatabaseUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("invalid proof database url");
  }
  const protocol = parsed.protocol.replace(/:$/, "").toLowerCase();
  if (protocol !== "postgres" && protocol !== "postgresql") throw new Error("proof database url must be postgres");
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") throw new Error("proof database url must be local");
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] || "");
  assertSafeDbName(databaseName);
}

function psql(admin, database, args) {
  const executable = path.join(PG_BIN, process.platform === "win32" ? "psql.exe" : "psql");
  if (process.platform === "win32" && !existsSync(executable)) throw new Error(`psql not found; set PG_BIN`);
  const result = spawnSync(executable, ["-U", admin.user, "-h", admin.host, "-p", String(admin.port), "-d", database, ...args], {
    cwd: ROOT,
    env: { ...process.env, PGPASSWORD: admin.password },
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const output = redact(`${result.stdout || ""}${result.stderr || ""}`);
  if (result.status !== 0) throw new Error(`psql failed (${result.status}): ${output.slice(0, 1000)}`);
  return output;
}

function createDatabase(admin, name) {
  assertSafeDbName(name);
  psql(admin, "postgres", ["-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${name} WITH (FORCE);`]);
  psql(admin, "postgres", ["-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${name};`]);
  psql(admin, name, ["-v", "ON_ERROR_STOP=1", "-f", path.join(BASELINE_DIR, "schema.sql")]);
  psql(admin, name, ["-v", "ON_ERROR_STOP=1", "-f", path.join(BASELINE_DIR, "promise-schema-migrations.sql")]);
}

function dropDatabase(admin, name) {
  assertSafeDbName(name);
  psql(admin, "postgres", ["-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${name} WITH (FORCE);`]);
}

function removePendingTail(admin, name) {
  const ids = LATER_IDS.map((id) => `'${id}'`).join(", ");
  psql(admin, name, ["-v", "ON_ERROR_STOP=1", "-c", `DELETE FROM promise_schema_migrations WHERE id IN (${ids});`]);
}

function runMigration(url, label) {
  if (!existsSync(TSX_CLI)) throw new Error("tsx CLI missing");
  assertSafeProofDatabaseUrl(url);
  const result = spawnSync(process.execPath, [TSX_CLI, "server/db-migrate-main.ts"], {
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL: url,
      MAIN_MIGRATION_RELEASE_MODE: "true",
      [TRUST_BASELINE_ADOPTION_ENV]: "true",
      NODE_ENV: "development",
      ALLOW_PROD_DB_MIGRATE_MAIN: "false",
    },
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const output = redact(`${result.stdout || ""}${result.stderr || ""}`);
  writeFileSync(path.join(EVIDENCE_DIR, `${label}.log.txt`), output.slice(0, 12000));
  return { status: result.status, output };
}

async function ledgerRows(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const rows = await client.query("SELECT id, checksum FROM promise_schema_migrations ORDER BY id");
    return rows.rows.map((row) => ({ id: row.id, checksum: row.checksum }));
  } finally {
    await client.end();
  }
}

function trustedBaselineChecksumById() {
  const manifest = JSON.parse(readFileSync(path.join(BASELINE_DIR, "manifest.json"), "utf8"));
  const entries = Array.isArray(manifest.migrations) ? manifest.migrations : [];
  return new Map(entries.map((entry) => [entry.id, entry.checksum]));
}

function assertTrustedHistoricBaselineRows(rows, label) {
  const baseline = trustedBaselineChecksumById();
  for (const row of rows) {
    const expected = baseline.get(row.id);
    if (expected === undefined) throw new Error(`historic ledger id missing from trusted baseline: ${row.id}`);
    if (row.checksum !== expected) throw new Error(`historic ledger checksum differs from trusted baseline: ${row.id}`);
  }
  pass(label, `${rows.length} historic rows`);
}

function assertHistoricLedgerRowsRetained(beforeRows, afterRows, label) {
  const after = new Map(afterRows.map((row) => [row.id, row.checksum]));
  for (const row of beforeRows) {
    if (!after.has(row.id)) throw new Error(`historic ledger row missing after migration: ${row.id}`);
    if (after.get(row.id) !== row.checksum) throw new Error(`historic ledger checksum rewritten after migration: ${row.id}`);
  }
  pass(label, `${beforeRows.length} rows unchanged`);
}

function assertReconciliationLedgerRowOnce(rows, label) {
  const count = rows.filter((row) => row.id === RECONCILIATION_ID).length;
  if (count !== 1) throw new Error(`reconciliation ledger row count=${count}`);
  pass(label);
}

function canonicalRegistryIds() {
  const source = readFileSync(path.join(ROOT, "server/services/main-schema-migrate.service.ts"), "utf8");
  return Array.from(source.matchAll(/^\s*id:\s*"([A-Za-z0-9_]{1,100})",/gm), (match) => match[1]);
}

function ledgerSnapshot(rows) {
  const expected = canonicalRegistryIds();
  const actual = new Set(rows.map((row) => row.id));
  const expectedSet = new Set(expected);
  return {
    missing: expected.filter((id) => !actual.has(id)),
    extra: rows.map((row) => row.id).filter((id) => !expectedSet.has(id)),
    duplicateCount: rows.length - actual.size,
    currentVersion: expected.at(-1) || null,
  };
}

async function assertReminderSchema(url, expectedExists) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const table = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema() AND table_name = 'reminders'
      ) AS exists
    `);
    if (Boolean(table.rows[0].exists) !== expectedExists) throw new Error(`reminders exists=${table.rows[0].exists}`);
    if (!expectedExists) return;
    const columns = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'reminders'
      ORDER BY ordinal_position
    `);
    const required = ["id", "user_id", "created_by", "title", "body", "remind_at", "repeat", "job_id", "is_sent", "sent_at", "is_dismissed", "dismissed_at", "created_at", "claim_owner", "claim_token", "claim_until", "attempt_count", "delivery_status", "last_attempt_at", "next_attempt_at", "last_failure_code"];
    const actual = columns.rows.map((row) => row.column_name);
    for (const column of required) if (!actual.includes(column)) throw new Error(`missing reminders.${column}`);
    pass("canonical_reminders_columns", `${actual.length} columns`);
  } finally {
    await client.end();
  }
}

function staticScan() {
  const source = readFileSync(path.join(ROOT, "server/services/main-schema-migrate.service.ts"), "utf8");
  for (const pattern of [
    `id: "${RECONCILIATION_ID}"`,
    "CREATE TABLE IF NOT EXISTS reminders",
    "REFERENCES job_tickets(id) ON DELETE SET NULL",
    "idx_reminders_user_id",
    "idx_reminders_remind_at",
    "idx_reminders_is_sent",
  ]) {
    if (!source.includes(pattern)) throw new Error(`static pattern missing: ${pattern}`);
  }
  pass("static_reconciliation_structure");
}

async function runScenario(admin, tag, removeReminder) {
  const name = `${SAFE_PREFIX}${tag}_${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}_${randomBytes(2).toString("hex")}`;
  const url = dbUrl(admin, name);
  let created = false;
  try {
    createDatabase(admin, name);
    created = true;
    if (removeReminder) {
      psql(admin, name, ["-v", "ON_ERROR_STOP=1", "-c", "DROP TABLE reminders;"]);
      pass(`${tag}_remove_prerequisite`);
    }
    removePendingTail(admin, name);
    const beforeRows = await ledgerRows(url);
    const before = ledgerSnapshot(beforeRows);
    if (!before.missing.includes(RECONCILIATION_ID)) throw new Error("reconciliation is not pending before run");
    if (before.missing[0] !== RECONCILIATION_ID) throw new Error(`unexpected first pending migration: ${before.missing[0]}`);
    pass(`${tag}_pending_preflight`, `first=${RECONCILIATION_ID}`);
    if (beforeRows.some((row) => row.id === RECONCILIATION_ID)) throw new Error("reconciliation ledger row exists before run");
    assertTrustedHistoricBaselineRows(beforeRows, `${tag}_trusted_historic_baseline_rows`);

    const first = runMigration(url, `${tag}-first`);
    if (first.status !== 0) throw new Error(`first migration exit ${first.status}`);
    pass(`${tag}_reconciliation_and_head`, "exit 0");
    await assertReminderSchema(url, true);
    const afterFirstRows = await ledgerRows(url);
    assertHistoricLedgerRowsRetained(beforeRows, afterFirstRows, `${tag}_historic_ledger_retained_after_first`);
    assertReconciliationLedgerRowOnce(afterFirstRows, `${tag}_reconciliation_ledger_row_once_after_first`);
    const after = ledgerSnapshot(afterFirstRows);
    if (after.missing.length || after.extra.length || after.duplicateCount) {
      throw new Error(`ledger not healthy at head: ${JSON.stringify({ missing: after.missing, extra: after.extra, duplicateCount: after.duplicateCount })}`);
    }
    pass(`${tag}_canonical_head`, after.currentVersion || "unknown");

    const second = runMigration(url, `${tag}-repeat`);
    if (second.status !== 0) throw new Error(`repeat migration exit ${second.status}`);
    pass(`${tag}_repeat_noop`, "exit 0");
    const afterRepeatRows = await ledgerRows(url);
    const repeated = ledgerSnapshot(afterRepeatRows);
    if (repeated.missing.length || repeated.extra.length || repeated.duplicateCount) throw new Error("ledger drift after repeat");
    assertHistoricLedgerRowsRetained(beforeRows, afterRepeatRows, `${tag}_historic_ledger_retained_after_repeat`);
    assertReconciliationLedgerRowOnce(afterRepeatRows, `${tag}_reconciliation_ledger_row_once_after_repeat`);
  } finally {
    if (created) {
      dropDatabase(admin, name);
      pass(`${tag}_prefix_cleanup`);
    }
  }
}

async function main() {
  console.log("Reminders prerequisite reconciliation proof");
  try {
    staticScan();
    const admin = localAdmin();
    if (!admin.ok) {
      fail("local_admin", admin.reason);
      process.exitCode = 2;
      return;
    }
    pass("local_target_class", `${admin.host}:${admin.port}`);
    await runScenario(admin, "missing", true);
    await runScenario(admin, "existing", false);
  } catch (error) {
    fail("disposable_proof", redact(error?.message || error));
  }
  const summary = { status: failures ? "FAIL" : "PASS", safePrefix: SAFE_PREFIX, failures, results };
  writeFileSync(path.join(EVIDENCE_DIR, "results.json"), JSON.stringify(summary, null, 2));
  console.log(`Summary: ${summary.status}`);
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error(redact(error?.message || error));
  process.exitCode = 1;
});
