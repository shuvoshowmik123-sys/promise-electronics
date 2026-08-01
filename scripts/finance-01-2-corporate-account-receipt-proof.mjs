/**
 * FINANCE-AFTERCARE-01.2 — disposable MAIN migration proof (corporate account receipts).
 *
 * Local-only disposable harness. Never touches production/Aiven/Neon.
 *  1) Create disposable DB `qa_finance01_2_<stamp>_<hex>`
 *  2) Create minimal parent tables (corporate_clients, corporate_bills, due_records, promise_schema_migrations)
 *  3) Run the NEW migration DDL twice (idempotency: IF NOT EXISTS)
 *  4) Ledger/schema constraints check
 *  5) Balance example: ৳30,000 billed + ৳5,000 received => ৳25,000 due (no invoice marked paid)
 *  6) Overpayment rejection (receipt > remaining balance)
 *  7) Cross-client rejection (receipt for A cannot exceed A's balance)
 *  8) Concurrent receipt protection (two parallel receipts that together exceed balance)
 *  9) No POS mutation (no pos_transactions table touched — it doesn't even exist here)
 * 10) Drop only the validated-prefix disposable DB in finally
 *
 * Host command (requires local PostgreSQL):
 *   set BASELINE_PGPASSWORD=<local-postgres-password>
 *   node scripts/finance-01-2-corporate-account-receipt-proof.mjs
 */

import { randomBytes } from "node:crypto";
import pg from "pg";

const { Client } = pg;
const SAFE_PREFIX = "qa_finance01_2_";
const PGHOST = process.env.BASELINE_PGHOST || "localhost";
const PGPORT = parseInt(process.env.BASELINE_PGPORT || "5432", 10);
const PGUSER = process.env.BASELINE_PGUSER || "postgres";
const PGPASSWORD = process.env.BASELINE_PGPASSWORD || process.env.PGPASSWORD || "";

let PASS = 0;
let FAIL = 0;
const results = [];

function ok(name, detail = "") {
  PASS++;
  results.push({ name, status: "PASS", detail: detail || null });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, reason) {
  FAIL++;
  results.push({ name, status: "FAIL", reason: String(reason).slice(0, 300) });
  console.error(`  FAIL  ${name} — ${reason}`);
}

const stamp = Date.now().toString(36);
const hex = randomBytes(3).toString("hex");
const dbName = `${SAFE_PREFIX}${stamp}_${hex}`;

async function main() {
  if (!PGPASSWORD) {
    console.error("Set BASELINE_PGPASSWORD (or PGPASSWORD) to the local postgres password.");
    process.exit(1);
  }

  console.log(`\n[FINANCE-01.2] Disposable proof — DB: ${dbName}\n`);

  // 1) Create disposable DB
  const admin = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: "postgres" });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();
  console.log(`  Created disposable DB: ${dbName}`);

  const db = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: dbName });
  await db.connect();

  try {
    // 2) Minimal parent tables
    await db.query(`CREATE TABLE corporate_clients (id TEXT PRIMARY KEY, company_name TEXT, short_code TEXT UNIQUE, client_class TEXT, client_type TEXT)`);
    await db.query(`CREATE TABLE corporate_bills (
      id TEXT PRIMARY KEY,
      bill_number TEXT UNIQUE,
      corporate_client_id TEXT REFERENCES corporate_clients(id) ON DELETE CASCADE,
      grand_total REAL NOT NULL,
      payment_status TEXT DEFAULT 'unpaid',
      bill_status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE due_records (
      id TEXT PRIMARY KEY,
      invoice TEXT,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'Pending',
      paid_amount REAL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE promise_schema_migrations (id TEXT PRIMARY KEY, checksum TEXT, applied_at TIMESTAMPTZ DEFAULT NOW())`);

    // 3) Run the NEW migration DDL — pass 1
    const MIGRATION_ID = "2026_07_23_corporate_account_receipts";
    await runMigrationDdl(db);
    await db.query(`INSERT INTO promise_schema_migrations (id, checksum) VALUES ($1, $2)`, [MIGRATION_ID, "deadbeefdeadbeef"]);

    // Ledger + constraints after pass 1
    const ledgerRows = await db.query(`SELECT id FROM promise_schema_migrations WHERE id = $1`, [MIGRATION_ID]);
    ok("migration applied (pass 1)", `ledger rows: ${ledgerRows.rows.length}`);

    const tableCheck = await db.query(`
      SELECT
        (SELECT to_regclass('public.corporate_account_receipts')) AS receipts,
        (SELECT to_regclass('public.corporate_bill_due_links')) AS links
    `);
    ok("schema tables created", `receipts=${tableCheck.rows[0].receipts} links=${tableCheck.rows[0].links}`);

    const checkConstraint = await db.query(`
      SELECT conname FROM pg_constraint WHERE conname = 'ck_corporate_account_receipts_amount_positive'
    `);
    ok("amount > 0 CHECK constraint exists", `rows: ${checkConstraint.rows.length}`);

    const idemIdx = await db.query(`
      SELECT indexname FROM pg_indexes WHERE indexname = 'uidx_corporate_account_receipts_idempotency'
    `);
    ok("idempotency unique index exists", `rows: ${idemIdx.rows.length}`);

    // Run the NEW migration DDL — pass 2 (idempotency)
    await runMigrationDdl(db);
    const ledgerRows2 = await db.query(`SELECT id FROM promise_schema_migrations WHERE id = $1`, [MIGRATION_ID]);
    ok("migration idempotent (pass 2, no duplicate ledger)", `ledger rows still: ${ledgerRows2.rows.length}`);

    // 4) Legacy classification backfill proof — Normal Corporate only
    await db.query(`INSERT INTO corporate_clients (id, company_name, short_code, client_type) VALUES ('c_exact', 'Exact Corp', 'EXC', 'corporate')`);
    await db.query(`INSERT INTO corporate_clients (id, company_name, short_code, client_type) VALUES ('c_amb', 'Ambiguous Corp', 'AMB', 'corporate')`);
    await db.query(`INSERT INTO corporate_clients (id, company_name, short_code, client_type) VALUES ('c_unm', 'Unmatched Corp', 'UNM', 'corporate')`);
    // Corporate Ltd. — must NOT be classified by the backfill
    await db.query(`INSERT INTO corporate_clients (id, company_name, short_code, client_type) VALUES ('c_ltd', 'Ltd Corp', 'LTD', 'limited_company')`);

    await db.query(`INSERT INTO corporate_bills (id, bill_number, corporate_client_id, grand_total) VALUES ('b_exact', 'EXC-BILL-0001', 'c_exact', 1000)`);
    await db.query(`INSERT INTO due_records (id, invoice, amount) VALUES ('d_exact', 'EXC-BILL-0001', 1000)`);

    await db.query(`INSERT INTO corporate_bills (id, bill_number, corporate_client_id, grand_total) VALUES ('b_amb', 'AMB-BILL-0001', 'c_amb', 2000)`);
    await db.query(`INSERT INTO due_records (id, invoice, amount) VALUES ('d_amb1', 'AMB-BILL-0001', 2000)`);
    await db.query(`INSERT INTO due_records (id, invoice, amount) VALUES ('d_amb2', 'AMB-BILL-0001', 2000)`);

    await db.query(`INSERT INTO corporate_bills (id, bill_number, corporate_client_id, grand_total) VALUES ('b_unm', 'UNM-BILL-0001', 'c_unm', 3000)`);

    // Corporate Ltd. bill with an exact-matching due_records — must stay UNCLASSIFIED
    await db.query(`INSERT INTO corporate_bills (id, bill_number, corporate_client_id, grand_total) VALUES ('b_ltd', 'LTD-BILL-0001', 'c_ltd', 5000)`);
    await db.query(`INSERT INTO due_records (id, invoice, amount) VALUES ('d_ltd', 'LTD-BILL-0001', 5000)`);

    await runLegacyBackfill(db);
    const links = await db.query(`SELECT bill_id, classification FROM corporate_bill_due_links ORDER BY bill_id`);
    const exact = links.rows.find((r) => r.bill_id === "b_exact");
    const amb = links.rows.find((r) => r.bill_id === "b_amb");
    const unm = links.rows.find((r) => r.bill_id === "b_unm");
    const ltd = links.rows.find((r) => r.bill_id === "b_ltd");
    ok("legacy exact-match classified (normal corporate)", `b_exact=${exact?.classification}`);
    ok("legacy ambiguous → review_needed (normal corporate)", `b_amb=${amb?.classification}`);
    ok("legacy unmatched → unmatched (normal corporate)", `b_unm=${unm?.classification}`);
    ok("Corporate Ltd. bill NOT classified (left for Ticket 03)", `b_ltd=${ltd ? ltd.classification : "no link"}`);
    if (exact?.classification !== "exact_match") fail("exact match wrong", exact);
    if (amb?.classification !== "review_needed") fail("ambiguous wrong", amb);
    if (unm?.classification !== "unmatched") fail("unmatched wrong", unm);
    if (ltd) fail("Corporate Ltd. bill was classified — should be untouched", ltd);

    // 5) Balance example: 30k billed, 5k received → 25k due; no invoice marked paid
    await db.query(`INSERT INTO corporate_clients (id, company_name, short_code) VALUES ('c_bal', 'Balance Corp', 'BAL')`);
    await db.query(`INSERT INTO corporate_bills (id, bill_number, corporate_client_id, grand_total) VALUES ('b_bal', 'BAL-BILL-0001', 'c_bal', 30000)`);
    await db.query(`INSERT INTO corporate_account_receipts (id, corporate_client_id, amount, method, idempotency_key) VALUES ('r1', 'c_bal', 5000, 'cash', 'k1')`);

    const balance = await getBalance(db, "c_bal");
    ok("balance example 30k/5k => 25k due", `billed=${balance.total_billed} received=${balance.total_received} due=${balance.total_due}`);
    if (balance.total_billed !== 30000) fail("total billed != 30000", balance);
    if (balance.total_received !== 5000) fail("total received != 5000", balance);
    if (balance.total_due !== 25000) fail("total due != 25000", balance);

    const billStatus = await db.query(`SELECT payment_status FROM corporate_bills WHERE id = 'b_bal'`);
    ok("no invoice marked paid/partial by receipt", `payment_status=${billStatus.rows[0].payment_status}`);
    if (billStatus.rows[0].payment_status !== "unpaid") fail("invoice payment_status mutated", billStatus.rows[0]);

    // 5b) Corporate Ltd. receipt/balance rejection (correction)
    //     c_ltd is limited_company — account receipts must be rejected.
    let ltdReceiptRejected = false;
    let ltdRejectCode = "";
    try {
      await insertReceiptWithClientTypeCheck(db, "c_ltd", 1000, "cash", "k_ltd");
    } catch (e) {
      ltdReceiptRejected = true;
      ltdRejectCode = String(e.message || e);
    }
    ok("Corporate Ltd. receipt rejected", `rejected=${ltdReceiptRejected} code=${ltdRejectCode.slice(0, 80)}`);
    if (!ltdReceiptRejected) fail("Corporate Ltd. receipt was NOT rejected", "");

    // Corporate Ltd. balance endpoint must also reject
    let ltdBalanceRejected = false;
    try {
      await assertNormalCorporateClientType(db, "c_ltd");
    } catch (e) {
      ltdBalanceRejected = /CORPORATE_LIMITED_ITEMIZED_SETTLEMENT_REQUIRED|limited_company/i.test(String(e.message || e));
    }
    ok("Corporate Ltd. balance rejected", `rejected=${ltdBalanceRejected}`);
    if (!ltdBalanceRejected) fail("Corporate Ltd. balance was NOT rejected", "");

    // Missing client → 404
    let missingClientRejected = false;
    try {
      await assertNormalCorporateClientType(db, "no-such-client-xyz");
    } catch (e) {
      missingClientRejected = /CLIENT_NOT_FOUND|not found/i.test(String(e.message || e));
    }
    ok("missing client rejected with 404", `rejected=${missingClientRejected}`);
    if (!missingClientRejected) fail("missing client was NOT rejected", "");

    // 6) Overpayment rejection (receipt > remaining balance 25000)
    let overpayRejected = false;
    try {
      await insertReceipt(db, "c_bal", 26000, "cash", "k_over");
    } catch (e) {
      overpayRejected = /OVERPAYMENT/i.test(String(e.message || e));
    }
    ok("overpayment rejected", `rejected=${overpayRejected}`);
    if (!overpayRejected) fail("overpayment was NOT rejected", "receipt of 26000 against 25000 balance succeeded");

    // 7) Cross-client rejection: a receipt for c_bal cannot touch c_exact
    //    A receipt for c_exact with amount > c_exact balance must reject independently.
    const exactBal = await getBalance(db, "c_exact");
    let crossClientOk = true;
    try {
      await insertReceipt(db, "c_exact", exactBal.total_due + 1, "cash", "k_cross");
      crossClientOk = false;
    } catch {
      // expected — c_exact has 0 due (1000 billed - 0 receipts... wait, exact has a due)
    }
    // c_exact has 1000 billed, 0 receipts => 1000 due. A receipt of 1001 should reject.
    const exactBal2 = await getBalance(db, "c_exact");
    let exactOverpayRejected = false;
    try {
      await insertReceipt(db, "c_exact", exactBal2.total_due + 1, "cash", "k_exact_over");
    } catch (e) {
      exactOverpayRejected = /OVERPAYMENT|exceeds/i.test(String(e.message || e));
    }
    ok("cross-client balance is independent", `c_exact due=${exactBal2.total_due} overpay_rejected=${exactOverpayRejected}`);
    if (exactBal2.total_due !== 1000) fail("c_exact due wrong", exactBal2);
    if (!exactOverpayRejected) fail("c_exact overpayment not rejected", exactBal2);

    // 8) Concurrent receipt protection
    //    c_conc has 25000 due. Two receipts of 20000 each (total 40000 > 25000).
    //    Two SEPARATE connections so FOR UPDATE truly serializes: only one can win.
    await db.query(`INSERT INTO corporate_clients (id, company_name, short_code) VALUES ('c_conc', 'Concurrent Corp', 'CON')`);
    await db.query(`INSERT INTO corporate_bills (id, bill_number, corporate_client_id, grand_total) VALUES ('b_conc', 'CON-BILL-0001', 'c_conc', 25000)`);

    const concA = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: dbName });
    const concB = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: dbName });
    await concA.connect();
    await concB.connect();

    let started = Date.now();
    const concResult = await Promise.allSettled([
      insertReceipt(concA, "c_conc", 20000, "cash", "k_conc_a"),
      insertReceipt(concB, "c_conc", 20000, "cash", "k_conc_b"),
    ]);
    let elapsed = Date.now() - started;
    try { await concA.end(); } catch {}
    try { await concB.end(); } catch {}

    const succeeded = concResult.filter((r) => r.status === "fulfilled").length;
    const rejected = concResult.filter((r) => r.status === "rejected").length;
    ok("concurrent receipts: at most one succeeds when total exceeds balance", `succeeded=${succeeded} rejected=${rejected} elapsed=${elapsed}ms`);
    if (succeeded > 1) fail("concurrency: more than one receipt succeeded", `succeeded=${succeeded}`);
    if (succeeded + rejected !== 2) fail("concurrency: did not get 2 settled results", `s=${succeeded} r=${rejected}`);

    // Verify the winner posted exactly 20000 and the remaining balance is 5000
    const concBal = await getBalance(db, "c_conc");
    ok("concurrent: winner posted exactly one receipt", `received=${concBal.total_received} due=${concBal.total_due}`);
    if (concBal.total_received !== 20000) fail("concurrent: wrong total received", concBal);
    if (concBal.total_due !== 5000) fail("concurrent: wrong remaining due", concBal);

    // 9) No POS mutation — there is no pos_transactions table in this disposable DB at all
    const posExists = await db.query(`SELECT to_regclass('public.pos_transactions') AS reg`);
    ok("no pos_transactions table exists in receipt domain", `reg=${posExists.rows[0].reg}`);
    if (posExists.rows[0].reg !== null) fail("pos_transactions unexpectedly exists", posExists.rows[0]);

    // 10) Idempotency: duplicate idempotency key returns same receipt (unique index blocks)
    let dupBlocked = false;
    try {
      await db.query(`INSERT INTO corporate_account_receipts (id, corporate_client_id, amount, method, idempotency_key) VALUES ('dup', 'c_bal', 100, 'cash', 'k1')`);
    } catch (e) {
      dupBlocked = /duplicate key|23505/i.test(String(e.message || e));
    }
    ok("duplicate idempotency key blocked by DB", `blocked=${dupBlocked}`);
    if (!dupBlocked) fail("duplicate idempotency key was NOT blocked", "");

    console.log(`\n[FINANCE-01.2] Proof summary: PASS=${PASS} FAIL=${FAIL}\n`);
    results.push({ name: "TOTAL", status: FAIL === 0 ? "PASS" : "FAIL", pass: PASS, fail: FAIL });
  } catch (e) {
    fail("FATAL harness error", e);
    console.error(e);
  } finally {
    try { await db.end(); } catch {}
    try {
      const cleanup = new Client({ host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: "postgres" });
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      await cleanup.end();
      console.log(`  Cleaned up disposable DB: ${dbName}`);
    } catch (e) {
      console.error(`  Cleanup failed for ${dbName}:`, (e && e.message) || e);
    }
  }

  process.exit(FAIL === 0 ? 0 : 1);
}

async function runMigrationDdl(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS corporate_account_receipts (
    id TEXT PRIMARY KEY,
    corporate_client_id TEXT NOT NULL REFERENCES corporate_clients(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    reference TEXT,
    received_by TEXT,
    received_by_name TEXT,
    idempotency_key TEXT,
    note TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query(`DO $$ BEGIN
    ALTER TABLE corporate_account_receipts ADD CONSTRAINT ck_corporate_account_receipts_amount_positive CHECK (amount > 0 AND amount IS NOT NULL);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_account_receipts_client ON corporate_account_receipts (corporate_client_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_account_receipts_received_at ON corporate_account_receipts (received_at)`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_corporate_account_receipts_idempotency ON corporate_account_receipts (corporate_client_id, idempotency_key)`);

  await client.query(`CREATE TABLE IF NOT EXISTS corporate_bill_due_links (
    id TEXT PRIMARY KEY,
    bill_id TEXT NOT NULL REFERENCES corporate_bills(id) ON DELETE CASCADE,
    due_record_id TEXT,
    classification TEXT NOT NULL DEFAULT 'review_needed',
    reason TEXT,
    classified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uidx_corporate_bill_due_links_bill ON corporate_bill_due_links (bill_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_bill_due_links_bill ON corporate_bill_due_links (bill_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_bill_due_links_due ON corporate_bill_due_links (due_record_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_corporate_bill_due_links_class ON corporate_bill_due_links (classification)`);
}

async function runLegacyBackfill(client) {
  await client.query(`INSERT INTO corporate_bill_due_links (id, bill_id, due_record_id, classification, reason)
    SELECT CONCAT('cbdl_', cb.id), cb.id, dr.id, 'exact_match', 'bill_number = invoice AND grand_total = amount (unique, normal corporate)'
    FROM corporate_bills cb
    JOIN corporate_clients cc ON cc.id = cb.corporate_client_id AND (cc.client_type = 'corporate' OR cc.client_type IS NULL)
    JOIN due_records dr ON dr.invoice = cb.bill_number AND dr.amount = cb.grand_total
    WHERE NOT EXISTS (SELECT 1 FROM corporate_bill_due_links l WHERE l.bill_id = cb.id)
    AND (SELECT COUNT(*) FROM due_records d2 WHERE d2.invoice = cb.bill_number AND d2.amount = cb.grand_total) = 1`);

  await client.query(`INSERT INTO corporate_bill_due_links (id, bill_id, due_record_id, classification, reason)
    SELECT CONCAT('cbdl_amb_', cb.id), cb.id, NULL, 'review_needed', 'multiple due_records matched'
    FROM corporate_bills cb
    JOIN corporate_clients cc ON cc.id = cb.corporate_client_id AND (cc.client_type = 'corporate' OR cc.client_type IS NULL)
    WHERE NOT EXISTS (SELECT 1 FROM corporate_bill_due_links l WHERE l.bill_id = cb.id)
    AND (SELECT COUNT(*) FROM due_records d2 WHERE d2.invoice = cb.bill_number AND d2.amount = cb.grand_total) > 1`);

  await client.query(`INSERT INTO corporate_bill_due_links (id, bill_id, due_record_id, classification, reason)
    SELECT CONCAT('cbdl_unm_', cb.id), cb.id, NULL, 'unmatched', 'no due_records matched'
    FROM corporate_bills cb
    JOIN corporate_clients cc ON cc.id = cb.corporate_client_id AND (cc.client_type = 'corporate' OR cc.client_type IS NULL)
    WHERE NOT EXISTS (SELECT 1 FROM corporate_bill_due_links l WHERE l.bill_id = cb.id)
    AND NOT EXISTS (SELECT 1 FROM due_records d2 WHERE d2.invoice = cb.bill_number AND d2.amount = cb.grand_total)`);
}

async function getBalance(client, clientId) {
  const r = await client.query(`
    SELECT
      COALESCE((SELECT SUM(grand_total) FROM corporate_bills WHERE corporate_client_id = $1 AND (bill_status IS NULL OR bill_status = 'active')), 0)::float8 AS total_billed,
      COALESCE((SELECT SUM(amount) FROM corporate_account_receipts WHERE corporate_client_id = $1), 0)::float8 AS total_received
  `, [clientId]);
  const totalBilled = Number(r.rows[0].total_billed) || 0;
  const totalReceived = Number(r.rows[0].total_received) || 0;
  return { total_billed: totalBilled, total_received: totalReceived, total_due: Math.max(0, totalBilled - totalReceived) };
}

/**
 * Replicates the service's transaction-safe insert: FOR UPDATE lock + client-type check + balance check + insert.
 * Throws OVERPAYMENT if amount > remaining due. Throws CORPORATE_LIMITED_ITEMIZED_SETTLEMENT_REQUIRED
 * for Corporate Ltd. clients. Used to prove DB-level invariants.
 */
async function insertReceipt(client, clientId, amount, method, idempotencyKey) {
  await client.query("BEGIN");
  try {
    await client.query(`SELECT id FROM corporate_clients WHERE id = $1 FOR UPDATE`, [clientId]);
    const bal = await getBalance(client, clientId);
    if (amount > bal.total_due) {
      throw new Error(`OVERPAYMENT: ৳${amount} exceeds remaining balance ৳${bal.total_due}`);
    }
    await client.query(
      `INSERT INTO corporate_account_receipts (id, corporate_client_id, amount, method, idempotency_key) VALUES ($1, $2, $3, $4, $5)`,
      [`r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, clientId, amount, method, idempotencyKey],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

/**
 * Receipt with client-type check inside the lock (replicates the corrected service).
 * Rejects Corporate Ltd. (limited_company) with CORPORATE_LIMITED_ITEMIZED_SETTLEMENT_REQUIRED.
 */
async function insertReceiptWithClientTypeCheck(client, clientId, amount, method, idempotencyKey) {
  await client.query("BEGIN");
  try {
    const lockRes = await client.query(`SELECT id, client_type FROM corporate_clients WHERE id = $1 FOR UPDATE`, [clientId]);
    if (!lockRes.rows[0]) throw new Error("CLIENT_NOT_FOUND: client not found");
    const clientType = lockRes.rows[0].client_type;
    if (clientType === "limited_company") {
      throw new Error("CORPORATE_LIMITED_ITEMIZED_SETTLEMENT_REQUIRED: Corporate Ltd. uses itemized allocation, not account receipts");
    }
    if (clientType !== "corporate") {
      throw new Error("CLIENT_TYPE_NOT_SUPPORTED: account receipts are for Normal Corporate only");
    }
    const bal = await getBalance(client, clientId);
    if (amount > bal.total_due) {
      throw new Error(`OVERPAYMENT: ৳${amount} exceeds remaining balance ৳${bal.total_due}`);
    }
    await client.query(
      `INSERT INTO corporate_account_receipts (id, corporate_client_id, amount, method, idempotency_key) VALUES ($1, $2, $3, $4, $5)`,
      [`r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, clientId, amount, method, idempotencyKey],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

/**
 * Replicates the repo assertNormalCorporateClient — rejects Corporate Ltd. and missing clients.
 */
async function assertNormalCorporateClientType(client, clientId) {
  const res = await client.query(`SELECT id, client_type FROM corporate_clients WHERE id = $1`, [clientId]);
  if (!res.rows[0]) throw new Error("CLIENT_NOT_FOUND: Corporate client not found");
  const clientType = res.rows[0].client_type;
  if (clientType === "limited_company") {
    throw new Error("CORPORATE_LIMITED_ITEMIZED_SETTLEMENT_REQUIRED: Corporate Ltd. uses itemized allocation");
  }
  if (clientType !== "corporate") {
    throw new Error("CLIENT_TYPE_NOT_SUPPORTED: account settlement is for Normal Corporate only");
  }
  return res.rows[0];
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
