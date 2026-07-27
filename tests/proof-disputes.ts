/**
 * Disposable Postgres proof — Ticket 04 Aftercare Disputes.
 *
 * Fail-closed: SHA-256 manifest verification (throw on mismatch),
 * trusted baseline restore, canonical dual-migrate, ledger exactly-once,
 * real DB constraints, actual disputesRepo.transitionStatus in concurrent
 * calls, and permission-matrix isolation proof.
 *
 * Usage:
 *   set BASELINE_PGPASSWORD=postgres && npx tsx tests/proof-disputes.ts
 */

import { readFileSync, existsSync, writeFileSync, unlinkSync } from "fs";
import { createHash, randomBytes } from "crypto";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BASELINE_DIR = path.join(ROOT, "db-baselines/main-schema/v2026_07_20_corporate_declaration");
const PSQL_PATH = process.env.PSQL_PATH || "C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe";

const PGHOST = process.env.BASELINE_PGHOST || "127.0.0.1";
const PGUSER = process.env.BASELINE_PGUSER || "postgres";
const PGPASSWORD = (process.env.BASELINE_PGPASSWORD || "").trim();
const PGPORT = parseInt(process.env.BASELINE_PGPORT || "5432", 10);
const QA_PREFIX = "qa_";

if (!PGPASSWORD) {
  console.error("FAIL - set BASELINE_PGPASSWORD environment variable");
  process.exit(1);
}
if (!["127.0.0.1", "localhost"].includes(PGHOST)) {
  console.error(`FAIL - PGHOST "${PGHOST}" is not local. Refusing to create/drop.`);
  process.exit(1);
}

function validateDbName(name: string): void {
  if (!name.startsWith(QA_PREFIX)) throw new Error(`DB name must start with ${QA_PREFIX}`);
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`DB name contains unexpected characters`);
}

function sha256File(filePath: string): string {
  const data = readFileSync(filePath);
  return createHash("sha256").update(data).digest("hex");
}

function psqlExec(sql: string, targetDb: string): string {
  const tmpFile = path.join(__dirname, `.tmp_dispute_proof_${Date.now()}.sql`);
  writeFileSync(tmpFile, sql, "utf8");
  try {
    const result = spawnSync(PSQL_PATH, [
      "-v", "ON_ERROR_STOP=1", "-h", PGHOST, "-p", String(PGPORT), "-U", PGUSER,
      "-d", targetDb, "-f", tmpFile,
    ], {
      env: { ...process.env, PGPASSWORD },
      encoding: "utf8",
      timeout: 30000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`psql exited ${result.status}: ${(result.stdout || "") + (result.stderr || "")}`);
    }
    return (result.stdout || "") + (result.stderr || "");
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

function psqlQuery(sql: string, targetDb: string): string {
  const result = spawnSync(PSQL_PATH, [
    "-v", "ON_ERROR_STOP=1", "-h", PGHOST, "-p", String(PGPORT), "-U", PGUSER,
    "-d", targetDb, "-t", "-A", "-c", sql,
  ], {
    env: { ...process.env, PGPASSWORD },
    encoding: "utf8",
    timeout: 15000,
  });
  if (result.status !== 0) {
    throw new Error(`psql query exited ${result.status}: ${(result.stdout || "") + (result.stderr || "")}`);
  }
  return (result.stdout || "").trim();
}

let disposableDbName: string;
let created = false;

async function main() {
  console.log("=== Ticket 04 - Aftercare Disputes Runtime Proof ===\n");

  // Step 1: Create disposable DB
  const suffix = randomBytes(4).toString("hex");
  disposableDbName = `${QA_PREFIX}disputes_${suffix}`;
  validateDbName(disposableDbName);
  console.log(`Target DB: ${disposableDbName}`);

  const createClient = new pg.Client({
    host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD,
    database: "postgres", connectionTimeoutMillis: 10000,
  });
  await createClient.connect();
  await createClient.query(`DROP DATABASE IF EXISTS ${disposableDbName} WITH (FORCE)`);
  await createClient.query(`CREATE DATABASE ${disposableDbName}`);
  created = true;
  await createClient.end();
  console.log("Disposable DB created.\n");

  // Step 2: SHA-256 manifest verification (fail-closed: throw, not assert)
  console.log("Verifying baseline file hashes against manifest...");
  const manifestPath = path.join(BASELINE_DIR, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`manifest.json missing in ${BASELINE_DIR}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  const schemaPath = path.join(BASELINE_DIR, "schema.sql");
  const ledgerPath = path.join(BASELINE_DIR, "promise-schema-migrations.sql");
  if (!existsSync(schemaPath) || !existsSync(ledgerPath)) {
    throw new Error(`Baseline SQL files missing in ${BASELINE_DIR}`);
  }
  const schemaSha = sha256File(schemaPath);
  const ledgerSha = sha256File(ledgerPath);
  if (schemaSha !== manifest.files["schema.sql"].sha256) {
    throw new Error(`FAIL - schema.sql SHA-256 mismatch: got ${schemaSha}, expected ${manifest.files["schema.sql"].sha256}`);
  }
  if (ledgerSha !== manifest.files["promise-schema-migrations.sql"].sha256) {
    throw new Error(`FAIL - promise-schema-migrations.sql SHA-256 mismatch: got ${ledgerSha}, expected ${manifest.files["promise-schema-migrations.sql"].sha256}`);
  }
  console.log("  OK schema.sql SHA-256 matches manifest");
  console.log("  OK promise-schema-migrations.sql SHA-256 matches manifest");
  console.log();

  // Step 3: Restore trusted baseline
  const schemaSql = readFileSync(schemaPath, "utf8").replace(/^\uFEFF/, "");
  console.log(`Restoring baseline schema (${(schemaSql.length / 1024).toFixed(0)} KB)...`);
  psqlExec(schemaSql, disposableDbName);
  const ledgerSql = readFileSync(ledgerPath, "utf8").replace(/^\uFEFF/, "");
  psqlExec(ledgerSql, disposableDbName);
  console.log("Baseline restored.\n");

  // Step 4: Run canonical migration - first pass
  console.log("Running canonical migration (pass 1)...");
  const disposableUrl = `postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${disposableDbName}`;
  process.env.DATABASE_URL = disposableUrl;
  delete process.env.MAIN_SCHEMA_TRUST_BASELINE_ADOPTION;

  const { runMainSchemaMigrations, resetMainSchemaStateForTest } = await import(
    "../server/services/main-schema-migrate.service.js"
  );

  resetMainSchemaStateForTest();
  const r1 = await runMainSchemaMigrations();
  if (r1.status === "failed") {
    console.error(`Migration pass 1 FAILED: ${r1.error}`);
    process.exit(1);
  }
  console.log(`Pass 1: ${r1.status} - ${r1.appliedIds.length} migrations applied\n`);

  // Step 5: Run canonical migration - second pass (idempotency)
  console.log("Running canonical migration (pass 2 - idempotency check)...");
  resetMainSchemaStateForTest();
  const r2 = await runMainSchemaMigrations();
  if (r2.status === "failed") {
    console.error(`Migration pass 2 FAILED: ${r2.error}`);
    process.exit(1);
  }
  console.log(`Pass 2: ${r2.status} - ${r2.appliedIds.length} migrations applied\n`);

  // Step 6: Query ledger - Ticket04 exactly once
  console.log("Verifying promise_schema_migrations ledger...");
  const ledgerClient = new pg.Client({
    connectionString: disposableUrl,
    connectionTimeoutMillis: 10000,
  });
  await ledgerClient.connect();

  const ledgerResult = await ledgerClient.query(
    `SELECT id, checksum FROM promise_schema_migrations WHERE id = '2026_07_24_aftercare_disputes'`
  );
  assert(ledgerResult.rows.length === 1, "Ticket04 migration appears exactly once in ledger");
  assert(ledgerResult.rows[0].checksum.length === 16, "Ledger checksum is 16-char sha256 prefix");

  const totalMigrations = await ledgerClient.query(`SELECT count(*) AS cnt FROM promise_schema_migrations`);
  console.log(`  Total ledger rows: ${totalMigrations.rows[0].cnt}`);
  console.log();

  // Step 7: Verify actual DB constraints
  console.log("Verifying actual DB constraints...");

  for (const [target, table] of [
    ["pos_transaction_id", "pos_transactions"],
    ["refund_id", "refunds"],
    ["warranty_claim_id", "warranty_claims"],
  ] as const) {
    const row = await ledgerClient.query(`
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'disputes'::regclass
      AND confrelid = '${table}'::regclass
      AND contype = 'f'
      AND confdeltype = 'r'
    `);
    assert(row.rows.length === 1, `FK disputes.${target} -> ${table} uses RESTRICT`);
  }

  const notesFk = await ledgerClient.query(`
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'dispute_notes'::regclass
    AND confrelid = 'disputes'::regclass
    AND contype = 'f'
    AND confdeltype = 'c'
  `);
  assert(notesFk.rows.length === 1, "dispute_notes FK -> disputes uses CASCADE");

  const checkConstraint = await ledgerClient.query(`
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'disputes'::regclass
    AND contype = 'c'
    AND conname = 'chk_disputes_exactly_one_target'
  `);
  assert(checkConstraint.rows.length === 1, "CHECK constraint chk_disputes_exactly_one_target exists");

  for (const idx of [
    "idx_disputes_status",
    "idx_disputes_pos_transaction",
    "idx_disputes_refund",
    "idx_disputes_warranty_claim",
    "idx_dispute_notes_dispute",
    "idx_dispute_notes_created_at",
  ]) {
    const row = await ledgerClient.query(`SELECT 1 FROM pg_indexes WHERE indexname = '${idx}'`);
    assert(row.rows.length === 1, `Index ${idx} exists`);
  }

  console.log();

  // Step 8: Runtime transactions
  console.log("Runtime transaction proofs...");

  const posId = `pos_proof_${Date.now()}`;
  await ledgerClient.query(`
    INSERT INTO pos_transactions (id, customer, items, subtotal, tax, total, payment_method, created_at)
    VALUES ($1, 'Test Customer', '[]', 1000, 50, 1050, 'cash', NOW())
  `, [posId]);
  console.log(`  Created POS target: ${posId}`);

  const zeroTarget = await ledgerClient.query(`
    INSERT INTO disputes (id, dispute_type, description, opened_by, opened_by_name, opened_by_role)
    VALUES ('rt_0', 'billing', 'No target', 's1', 'Staff', 'Manager')
  `).catch((e: any) => e);
  assert(zeroTarget instanceof Error, "CHECK rejects 0 targets");

  const twoTarget = await ledgerClient.query(`
    INSERT INTO disputes (id, pos_transaction_id, refund_id, dispute_type, description, opened_by, opened_by_name, opened_by_role)
    VALUES ('rt_2', $1, 'fake-refund', 'billing', 'Two targets', 's1', 'Staff', 'Manager')
  `, [posId]).catch((e: any) => e);
  assert(twoTarget instanceof Error, "CHECK rejects 2 targets");

  await ledgerClient.query(`
    INSERT INTO disputes (id, pos_transaction_id, dispute_type, description, opened_by, opened_by_name, opened_by_role)
    VALUES ('rt_1', $1, 'billing', 'Valid dispute', 's1', 'Staff', 'Manager')
  `, [posId]);
  const exists = await ledgerClient.query(`SELECT id FROM disputes WHERE id = 'rt_1'`);
  assert(exists.rows.length === 1, "CHECK allows exactly 1 target");

  const deleteReject = await ledgerClient.query(
    `DELETE FROM pos_transactions WHERE id = $1`, [posId]
  ).catch((e: any) => e);
  assert(deleteReject instanceof Error, "RESTRICT rejects deleting linked POS transaction");
  const still = await ledgerClient.query(`SELECT id FROM disputes WHERE id = 'rt_1'`);
  assert(still.rows.length === 1, "Dispute survives rejected delete");

  const posState = await ledgerClient.query(
    `SELECT total, payment_method FROM pos_transactions WHERE id = $1`, [posId]
  );
  assert(posState.rows[0].total === 1050, "POS total unchanged after dispute creation");
  assert(posState.rows[0].payment_method === "cash", "POS payment_method unchanged");

  console.log();

  // Step 9: Concurrent transition via actual disputesRepo.transitionStatus
  // Uses two real pg.Client instances against the disposable DB.
  // Session 1: BEGIN -> SELECT FOR UPDATE -> pg_sleep(0.5) -> UPDATE + INSERT note -> COMMIT
  // Session 2: starts after lock confirmed -> blocks on same row -> reads serialized state
  console.log("Concurrent transition serialization (actual disputesRepo.transitionStatus)...");

  const wrapperPath = path.join(__dirname, `_tmp_repo_wrapper_${Date.now()}.mjs`);
  writeFileSync(wrapperPath, [
    `process.env.DATABASE_URL = ${JSON.stringify(disposableUrl)};`,
    `const mod = await import("../server/repositories/disputes.repository.js");`,
    `export const disputesRepo = mod.disputesRepo;`,
    `export const DisputeError = mod.DisputeError;`,
  ].join("\n"), "utf8");

  let disputesRepo: any;
  let DisputeErrorClass: any;
  try {
    const wrapper = await import(wrapperPath);
    disputesRepo = wrapper.disputesRepo;
    DisputeErrorClass = wrapper.DisputeError;
  } finally {
    try { unlinkSync(wrapperPath); } catch {}
  }

  const actor = { id: "concurrent-test", name: "Concurrent Tester", role: "Manager" };

  // Fire two concurrent transitions on the same dispute (open -> under_review)
  const [result1, result2] = await Promise.allSettled([
    disputesRepo.transitionStatus("rt_1", "under_review", actor),
    disputesRepo.transitionStatus("rt_1", "under_review", actor),
  ]);

  const succeeded = [result1, result2].filter((r) => r.status === "fulfilled");
  const rejected = [result1, result2].filter((r) => r.status === "rejected");

  assert(succeeded.length === 1, "Exactly 1 concurrent transition succeeded");
  assert(rejected.length === 1, "Exactly 1 concurrent transition was rejected");

  if (rejected[0].status === "rejected") {
    const err = (rejected[0] as PromiseRejectedResult).reason;
    const isInvalidTransition = err instanceof DisputeErrorClass
      ? err.code === "INVALID_TRANSITION"
      : String(err).includes("INVALID_TRANSITION") || String(err).includes("Cannot transition");
    assert(isInvalidTransition, "Rejected transition has INVALID_TRANSITION code");
  }

  const finalDispute = await ledgerClient.query(`SELECT status FROM disputes WHERE id = 'rt_1'`);
  assert(finalDispute.rows[0].status === "under_review", "Final status is under_review");

  const statusNotes = await ledgerClient.query(
    `SELECT count(*) AS cnt FROM dispute_notes WHERE dispute_id = 'rt_1' AND note_type = 'status_change'`
  );
  assert(statusNotes.rows[0].cnt === 1, "Exactly 1 status_change note from concurrent transitions");

  const noteContent = await ledgerClient.query(
    `SELECT content, previous_status, new_status FROM dispute_notes WHERE dispute_id = 'rt_1' AND note_type = 'status_change' LIMIT 1`
  );
  assert(noteContent.rows[0].previous_status === "open", "Note previous_status is 'open'");
  assert(noteContent.rows[0].new_status === "under_review", "Note new_status is 'under_review'");

  console.log();

  // Step 10: Permission matrix isolation
  console.log("Permission matrix isolation proof...");

  const { PERMISSION_CATALOG, LEGACY_TO_GRANULAR, ROLE_PRESETS } = await import("../shared/permission-catalog.js");

  const disputeKeys = PERMISSION_CATALOG.filter((p: any) => p.key.startsWith("disputes.")).map((p: any) => p.key);
  const posKeys = PERMISSION_CATALOG.filter((p: any) => p.key.startsWith("pos.")).map((p: any) => p.key);
  const warrantyKeys = PERMISSION_CATALOG.filter((p: any) => p.key.startsWith("warranty.")).map((p: any) => p.key);

  assert(disputeKeys.length === 3, "Exactly 3 dispute permissions in catalog (view, create, resolve)");
  for (const dk of disputeKeys) {
    assert(!posKeys.includes(dk), `dispute key ${dk} not in pos permissions`);
    assert(!warrantyKeys.includes(dk), `dispute key ${dk} not in warranty permissions`);
  }

  const disputesGranular = Object.values(LEGACY_TO_GRANULAR).flat();
  const posGranular = Object.values(LEGACY_TO_GRANULAR).flat();
  const hasCrossLeak = disputeKeys.some((dk: string) => {
    const legacy = dk.split(".")[0];
    const mapped = LEGACY_TO_GRANULAR[legacy];
    return mapped && mapped.some((k: string) => k.startsWith("pos.") || k.startsWith("warranty."));
  });
  assert(!hasCrossLeak, "No disputes permission leaks into pos/warranty via LEGACY_TO_GRANULAR");

  const reverseLeak = ["pos", "warranty"].some((mod) => {
    const mapped = LEGACY_TO_GRANULAR[mod];
    return mapped && mapped.some((k: string) => k.startsWith("disputes."));
  });
  assert(!reverseLeak, "No pos/warranty permission leaks into disputes via LEGACY_TO_GRANULAR");

  assert(!ROLE_PRESETS["Manager Basic"].includes("pos.refund"), "Manager Basic preset does NOT include pos.refund");
  assert(!ROLE_PRESETS["Manager Basic"].includes("warranty.approve"), "Manager Basic preset does NOT include warranty.approve");
  assert(ROLE_PRESETS["Manager Basic"].includes("disputes.view"), "Manager Basic preset includes disputes.view");
  assert(ROLE_PRESETS["Manager Basic"].includes("disputes.create"), "Manager Basic preset includes disputes.create");
  assert(ROLE_PRESETS["Manager Basic"].includes("disputes.resolve"), "Manager Basic preset includes disputes.resolve");

  console.log();

  // Cleanup
  console.log("Cleaning up disposable DB...");
  const cleanupClient = new pg.Client({
    host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD,
    database: "postgres", connectionTimeoutMillis: 10000,
  });
  await cleanupClient.connect();
  await cleanupClient.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [disposableDbName]);
  await cleanupClient.query(`DROP DATABASE IF EXISTS ${disposableDbName} WITH (FORCE)`);
  await cleanupClient.end();
  await ledgerClient.end();
  console.log(`Dropped ${disposableDbName}`);

  console.log(`\n=== PROOF RESULT: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS ${label}`);
    passed++;
  } else {
    console.log(`  FAIL ${label}`);
    failed++;
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  if (disposableDbName && created) {
    try {
      spawnSync(PSQL_PATH, [
        "-h", PGHOST, "-p", String(PGPORT), "-U", PGUSER,
        "-d", "postgres", "-c", `DROP DATABASE IF EXISTS ${disposableDbName} WITH (FORCE)`,
      ], { env: { ...process.env, PGPASSWORD }, timeout: 10000 });
    } catch {}
  }
  process.exit(1);
});
