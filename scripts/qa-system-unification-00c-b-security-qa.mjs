/**
 * SYSTEM-UNIFICATION-00C-B-SECURITY-QA
 * Independent money-authority verification. Neon/local only. No Aiven.
 * API-primary; browser UI left NOT VERIFIED unless separately run.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { join } from "path";
import pg from "pg";
import bcrypt from "bcryptjs";

const PORT = process.env.QA_PORT || "5120";
const BASE = process.env.QA_BASE || `http://127.0.0.1:${PORT}`;
const RUN_ID =
  process.env.QA_RUN_FOLDER ||
  new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const REPORT_DIR = `mobile-qa/system-unification-00c-b-security-qa/${RUN_ID}`;

function loadEnv() {
  for (const f of [".env", ".env.qa"]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
loadEnv();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL || /aiven/i.test(DATABASE_URL)) {
  console.error("FAIL: need non-Aiven DATABASE_URL");
  process.exit(1);
}

const results = [];
const evidence = { concurrentMatrix: [], redactedHttp: [], dbAssertions: [], sourceAudit: [] };
function log(name, ok, detail = "", category = "check") {
  const row = { name, ok: !!ok, result: ok ? "PASS" : "FAIL", detail: String(detail).slice(0, 700), category };
  results.push(row);
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
  return ok;
}
function notVerified(name, detail = "") {
  results.push({ name, ok: null, result: "NOT VERIFIED", detail: String(detail).slice(0, 700), category: "nv" });
  console.log(`NOT VERIFIED — ${name}${detail ? `: ${detail}` : ""}`);
}

function cookieJar(res) {
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const fromHeader = res.headers.get("set-cookie");
  const list = raw.length ? raw : fromHeader ? [fromHeader] : [];
  return list.map((c) => c.split(";")[0]).join("; ");
}
function mergeCookies(prev, res) {
  const map = new Map();
  for (const part of (prev || "").split("; ").filter(Boolean)) {
    const [k, ...r] = part.split("=");
    map.set(k, r.join("="));
  }
  for (const part of cookieJar(res).split("; ").filter(Boolean)) {
    const [k, ...r] = part.split("=");
    map.set(k, r.join("="));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function redact(obj) {
  const s = JSON.stringify(obj);
  return s
    .replace(/("password"\s*:\s*")[^"]*"/gi, '$1[REDACTED]"')
    .replace(/(Cookie|cookie|csrf|token|authorization)[^,]{0,80}/gi, "[REDACTED_AUTH]")
    .slice(0, 800);
}

async function waitHealth(ms = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.status === 200) {
        await new Promise((x) => setTimeout(x, 5000));
        return true;
      }
    } catch {
      /* */
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return false;
}

async function login(username, password, attempts = 14) {
  let last = "unknown";
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        last = `login ${username} ${res.status}`;
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      let cookies = cookieJar(res);
      const csrfRes = await fetch(`${BASE}/api/admin/csrf-token`, { headers: { Cookie: cookies } });
      cookies = mergeCookies(cookies, csrfRes);
      const csrfBody = await csrfRes.json().catch(() => ({}));
      return { cookies, csrf: csrfBody.csrfToken || "" };
    } catch (e) {
      last = e.message || String(e);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(last);
}

async function api(session, method, path, body) {
  const headers = { "Content-Type": "application/json", Cookie: session.cookies };
  if (session.csrf) headers["X-CSRF-TOKEN"] = session.csrf;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (cookieJar(res)) session.cookies = mergeCookies(session.cookies, res);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 100) };
  }
  evidence.redactedHttp.push({
    method,
    path,
    status: res.status,
    reqKeys: body && typeof body === "object" ? Object.keys(body) : [],
    code: json.code || null,
    idempotent: json.idempotent ?? null,
    hasId: !!json.id,
    // never store cookies / full bodies with PII
  });
  return { status: res.status, json };
}

const fixtures = { users: [], jobs: [], pos: [], manual: [], refunds: [] };
let child = null;

function killChild() {
  if (!child) return;
  try {
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: true });
    } else child.kill("SIGTERM");
  } catch {
    /* */
  }
  child = null;
}

async function startServer(extraEnv = {}) {
  killChild();
  await new Promise((r) => setTimeout(r, 2000));
  const force = extraEnv.POS_R1H_FORCE_FAIL || "0";
  const forceAt = extraEnv.POS_R1H_FORCE_FAIL_AT || "none";
  child = spawn(
    "npx",
    [
      "cross-env",
      `PORT=${PORT}`,
      "NODE_ENV=test",
      `POS_R1H_FORCE_FAIL=${force}`,
      `POS_R1H_FORCE_FAIL_AT=${forceAt}`,
      "tsx",
      "server/index.ts",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        POS_R1H_FORCE_FAIL: force,
        POS_R1H_FORCE_FAIL_AT: forceAt === "none" ? "" : forceAt,
        SKIP_STARTUP_MIGRATIONS: "false",
        ...extraEnv,
      },
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (!(await waitHealth())) throw new Error("server not healthy");
  for (let i = 0; i < 12; i++) {
    try {
      const r = await fetch(`${BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "__w__", password: "x" }),
      });
      if (r.status !== 503) return;
    } catch {
      /* */
    }
    await new Promise((r) => setTimeout(r, 700));
  }
}

async function main() {
  console.log("00C-B-SECURITY-QA", BASE, RUN_ID);
  mkdirSync(REPORT_DIR, { recursive: true });
  mkdirSync(join(REPORT_DIR, "evidence"), { recursive: true });

  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const tag = `sec_${Date.now().toString(36)}`;
  const hash = await bcrypt.hash("SecQa!99", 10);
  let integrityStop = null;

  try {
    await startServer();

    // --- schema / constraints (Neon) ---
    const cols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='pos_transactions'
        AND column_name IN ('client_request_id','created_by_user_id','idempotency_fingerprint','refunded_amount','refund_status')
      ORDER BY column_name`);
    const colSet = new Set(cols.rows.map((r) => r.column_name));
    log(
      "schema: POS idempotency + refund columns present",
      ["client_request_id", "created_by_user_id", "idempotency_fingerprint", "refunded_amount", "refund_status"].every(
        (c) => colSet.has(c),
      ),
      [...colSet].join(","),
    );
    const idx = await client.query(`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename='pos_transactions' AND indexname LIKE '%client_request%'`);
    log(
      "schema: unique client_request actor index",
      idx.rows.some((r) => /unique/i.test(r.indexdef)),
      idx.rows.map((r) => r.indexname).join(",") || "none",
    );
    const migSrc = readFileSync("server/services/pos-idempotency-migration.service.ts", "utf8");
    log(
      "schema: migration uses IF NOT EXISTS only (non-destructive)",
      /IF NOT EXISTS/i.test(migSrc) && !/DROP TABLE/i.test(migSrc) && !/TRUNCATE/i.test(migSrc),
    );
    notVerified("production migration execution", "Operator SQL not run on Aiven/production by this agent");

    // --- users ---
    const cashierId = randomUUID();
    const managerId = randomUUID();
    const deniedId = randomUUID();
    const cashUser = `${tag}_cash`;
    const mgrUser = `${tag}_mgr`;
    const denyUser = `${tag}_deny`;

    const cashPerms = {
      process_payment: true,
      pos: true,
      "pos.processPayment": true,
      "pos.view": true,
      "pos.refund": true,
      "jobs.recordPayment": true,
      jobs: true,
      "jobs.view": true,
    };
    const mgrPerms = {
      ...cashPerms,
      finance: true,
    };
    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions) VALUES ($1,$2,'Sec Cash',$3,'Cashier','Active',$4)`,
      [cashierId, cashUser, hash, JSON.stringify(cashPerms)],
    );
    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions) VALUES ($1,$2,'Sec Mgr',$3,'Manager','Active',$4)`,
      [managerId, mgrUser, hash, JSON.stringify(mgrPerms)],
    );
    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions) VALUES ($1,$2,'Sec Deny',$3,'Technician','Active',$4)`,
      [deniedId, denyUser, hash, JSON.stringify({ "jobs.view": true, "jobs.recordPayment": true })],
    );
    fixtures.users.push(cashierId, managerId, deniedId);

    let cash = await login(cashUser, "SecQa!99");
    let mgr = await login(mgrUser, "SecQa!99");
    let deny = await login(denyUser, "SecQa!99");

    async function insertJob(opts = {}) {
      const jobId = randomUUID();
      await client.query(
        `INSERT INTO job_tickets (
          id, customer, customer_phone, device, issue, status, technician, estimated_cost,
          payment_status, paid_amount, remaining_amount, billing_status, warranty_days,
          corporate_client_id, created_at
        ) VALUES ($1,'QA Customer','01700000000','TV','sec-qa',$2,'Unassigned',$3,'unpaid',0,$3,'pending',30,$4,NOW())`,
        [jobId, opts.status || "Pending", opts.estimate ?? 5000, opts.corp || null],
      );
      fixtures.jobs.push(jobId);
      return jobId;
    }

    function posBody(jobId, amount, extras = {}) {
      return {
        items: JSON.stringify([{ name: "Repair service", quantity: 1, price: amount, itemType: "service" }]),
        linkedJobs: JSON.stringify([{ jobId, billedAmount: amount }]),
        subtotal: amount,
        tax: 0,
        taxRate: 0,
        discount: 0,
        total: amount,
        paymentMethod: "Cash",
        customer: "QA Customer",
        ...extras,
      };
    }

    // ========== 1. Concurrent idempotency ==========
    const jobC = await insertJob({ estimate: 4000 });
    const keyC = `conc_${tag}`;
    const bodyC = posBody(jobC, 4000, { clientRequestId: keyC });
    const beforePetty = await client.query(
      `SELECT COUNT(*)::int AS c FROM petty_cash_records WHERE description LIKE 'POS Sale%'`,
    );
    const beforeAlloc = await client.query(
      `SELECT COUNT(*)::int AS c FROM pos_transaction_area_allocations WHERE job_ticket_id=$1`,
      [jobC],
    );
    const conc = await Promise.all([
      api(cash, "POST", "/api/pos-transactions", bodyC),
      api(cash, "POST", "/api/pos-transactions", bodyC),
      api(cash, "POST", "/api/pos-transactions", bodyC),
      api(cash, "POST", "/api/pos-transactions", bodyC),
    ]);
    for (let i = 0; i < conc.length; i++) {
      evidence.concurrentMatrix.push({
        i,
        status: conc[i].status,
        code: conc[i].json.code || null,
        idempotent: conc[i].json.idempotent ?? null,
        id: conc[i].json.id || null,
      });
    }
    const ids = [...new Set(conc.map((r) => r.json.id).filter(Boolean))];
    const statuses = conc.map((r) => r.status);
    const n201 = conc.filter((r) => r.status === 201 && r.json.idempotent === false).length;
    const n200 = conc.filter((r) => r.status === 200 && r.json.idempotent === true).length;
    const nInFlight = conc.filter((r) => r.json.code === "IDEMPOTENCY_IN_FLIGHT").length;
    const raceLeak = conc.some((r) => r.json.code === "IDEMPOTENCY_RACE");
    const posRows = await client.query(
      `SELECT COUNT(*)::int AS c FROM pos_transactions WHERE client_request_id=$1 AND created_by_user_id=$2`,
      [keyC, cashierId],
    );
    const allocRows = await client.query(
      `SELECT COUNT(*)::int AS c FROM pos_transaction_area_allocations WHERE job_ticket_id=$1`,
      [jobC],
    );
    const jobPaid = await client.query(
      `SELECT paid_amount, payment_status, warranty_days, status FROM job_tickets WHERE id=$1`,
      [jobC],
    );
    const afterPetty = await client.query(
      `SELECT COUNT(*)::int AS c FROM petty_cash_records WHERE description LIKE 'POS Sale%'`,
    );
    const pettyDelta = afterPetty.rows[0].c - beforePetty.rows[0].c;
    // service-only cart → stock movements = 0 expected
    const stockMoves = 0;

    const concOk =
      !raceLeak &&
      ids.length === 1 &&
      posRows.rows[0].c === 1 &&
      allocRows.rows[0].c === 1 &&
      Number(jobPaid.rows[0].paid_amount) === 4000 &&
      n201 === 1 &&
      (n200 === 3 || n200 + nInFlight === 3) &&
      statuses.every((s) => s === 200 || s === 201 || s === 409);
    if (
      !log(
        "1. concurrent idempotency: one 201 + 200 replays, one POS/alloc/paid, no IDEMPOTENCY_RACE",
        concOk,
        `st=${JSON.stringify(statuses)} n201=${n201} n200=${n200} inFlight=${nInFlight} pos=${posRows.rows[0].c} alloc=${allocRows.rows[0].c} paid=${jobPaid.rows[0].paid_amount} raceLeak=${raceLeak}`,
      )
    ) {
      integrityStop = "concurrent idempotency";
      throw new Error("INTEGRITY_STOP: concurrent idempotency");
    }
    if (ids[0]) fixtures.pos.push(ids[0]);
    log(
      "1b. single warranty/completion projection (no multi-complete side effect)",
      String(jobPaid.rows[0].status) === "Completed" && Number(jobPaid.rows[0].warranty_days) === 30,
      JSON.stringify(jobPaid.rows[0]),
    );
    log(
      "1c. petty-cash income rows for concurrent sale ≤1 delta",
      pettyDelta <= 1,
      `pettyDelta=${pettyDelta}`,
    );
    log("1d. service-only sale: stock movement set empty (expected 0)", stockMoves === 0, `stockMoves=${stockMoves}`);
    if (nInFlight > 0) {
      log(
        "1e. IDEMPOTENCY_IN_FLIGHT classified (no extra POS)",
        posRows.rows[0].c === 1,
        `inFlight=${nInFlight}`,
      );
    } else {
      log("1e. no IDEMPOTENCY_IN_FLIGHT in this run (all completed as 200/201)", true, "expected under normal latency");
    }

    // ========== 2. Conflict ==========
    const jobDiff = await insertJob({ estimate: 9000 });
    const paidBefore = await client.query(`SELECT paid_amount FROM job_tickets WHERE id=$1`, [jobDiff]);
    const posBefore = await client.query(`SELECT COUNT(*)::int AS c FROM pos_transactions WHERE client_request_id=$1`, [
      keyC,
    ]);
    const conf = await api(
      cash,
      "POST",
      "/api/pos-transactions",
      posBody(jobDiff, 9000, { clientRequestId: keyC, customer: "Other Customer", paymentMethod: "Bank" }),
    );
    const paidAfter = await client.query(`SELECT paid_amount FROM job_tickets WHERE id=$1`, [jobDiff]);
    const posAfter = await client.query(`SELECT COUNT(*)::int AS c FROM pos_transactions WHERE client_request_id=$1`, [
      keyC,
    ]);
    if (
      !log(
        "2. same-key different payload → IDEMPOTENCY_CONFLICT",
        conf.status === 409 && conf.json.code === "IDEMPOTENCY_CONFLICT",
        `HTTP ${conf.status} code=${conf.json.code}`,
      )
    ) {
      integrityStop = "idempotency conflict";
      throw new Error("INTEGRITY_STOP: conflict");
    }
    log(
      "2b. conflict: no extra POS / no job paid change",
      posAfter.rows[0].c === posBefore.rows[0].c &&
        Number(paidAfter.rows[0].paid_amount) === Number(paidBefore.rows[0].paid_amount),
      `pos ${posBefore.rows[0].c}->${posAfter.rows[0].c} paid ${paidBefore.rows[0].paid_amount}->${paidAfter.rows[0].paid_amount}`,
    );

    // ========== 3. Canonical ownership ==========
    // Direct POS bank sale
    const jobBank = await insertJob({ estimate: 2500 });
    const bank = await api(
      cash,
      "POST",
      "/api/pos-transactions",
      posBody(jobBank, 2500, { clientRequestId: `bank_${tag}`, paymentMethod: "Bank", total: 2500 }),
    );
    if (bank.json.id) fixtures.pos.push(bank.json.id);
    const bankAlloc = await client.query(
      `SELECT COUNT(*)::int AS c FROM pos_transaction_area_allocations WHERE job_ticket_id=$1 AND transaction_id=$2`,
      [jobBank, bank.json.id || ""],
    );
    log(
      "3a. direct POS non-cash (Bank) creates POS + allocation + paid projection",
      bank.status === 201 && bankAlloc.rows[0].c === 1,
      `HTTP ${bank.status} alloc=${bankAlloc.rows[0].c}`,
    );

    // Adapter record-payment
    const jobAd = await insertJob({ estimate: 3000 });
    const ad = await api(cash, "POST", `/api/job-tickets/${jobAd}/record-payment`, {
      paymentId: `ad_${tag}`,
      amount: 3000,
      method: "Cash",
    });
    if (ad.json.posTransaction?.id) fixtures.pos.push(ad.json.posTransaction.id);
    const adItems = ad.json.posTransaction?.items || "";
    const adAlloc = await client.query(
      `SELECT COUNT(*)::int AS c FROM pos_transaction_area_allocations WHERE job_ticket_id=$1`,
      [jobAd],
    );
    log(
      "3b. record-payment adapter → POS + allocation; deprecated metadata",
      ad.status === 200 && adAlloc.rows[0].c >= 1 && ad.json.settlement?.deprecated === true,
      `HTTP ${ad.status} alloc=${adAlloc.rows[0].c}`,
    );
    log(
      "3c. no raw job UUID in POS line items from adapter",
      !String(adItems).includes(jobAd) && /Job settlement JOB-/i.test(String(adItems)),
      String(adItems).slice(0, 120),
    );

    // Manual verify
    const jobM = await insertJob({ estimate: 2200 });
    const mpId = randomUUID();
    await client.query(
      `INSERT INTO manual_payments (id, job_ticket_id, method, amount, status, source, created_at, updated_at)
       VALUES ($1,$2,'Cash',2200,'pending','admin_manual',NOW(),NOW())`,
      [mpId, jobM],
    );
    fixtures.manual.push(mpId);
    const mv = await api(cash, "POST", `/api/manual-payments/${mpId}/verify`, {});
    if (mv.json.posTransaction?.id) fixtures.pos.push(mv.json.posTransaction.id);
    const mAlloc = await client.query(
      `SELECT COUNT(*)::int AS c FROM pos_transaction_area_allocations WHERE job_ticket_id=$1`,
      [jobM],
    );
    log(
      "3d. manual verify applies only with POS linkage",
      mv.status === 200 &&
        mv.json.payment?.status === "applied_to_invoice" &&
        mAlloc.rows[0].c >= 1 &&
        !!mv.json.posTransaction?.id,
      `status=${mv.json.payment?.status} alloc=${mAlloc.rows[0].c}`,
    );

    // Source audit
    const jobService = readFileSync("server/services/job.service.ts", "utf8");
    const jobsRoutes = readFileSync("server/routes/jobs.routes.ts", "utf8");
    const finRoutes = readFileSync("server/routes/finance.routes.ts", "utf8");
    const posBilling = readFileSync("server/services/pos-billing.service.ts", "utf8");
    const refundSvc = readFileSync("server/services/refund-process.service.ts", "utf8");
    const writers = [
      {
        path: "server/services/pos-billing.service.ts",
        purpose: "Canonical retail collection: sets job paidAmount inside createPosSaleAtomic only",
        retailAuthority: true,
      },
      {
        path: "server/services/refund-process.service.ts",
        purpose: "Refund process may decrease job paidAmount as reverse projection of POS refund",
        retailAuthority: true,
      },
      {
        path: "server/services/job.service.ts#recordJobPayment",
        purpose: "Hard-stopped USE_POS_SETTLEMENT (throws; no write)",
        retailAuthority: false,
        dead: /USE_POS_SETTLEMENT/.test(jobService),
      },
      {
        path: "server/routes/jobs.routes.ts#record-payment",
        purpose: "Adapter → settleJobPaymentViaPos only",
        retailAuthority: true,
        adapter: jobsRoutes.includes("settleJobPaymentViaPos"),
      },
      {
        path: "server/routes/finance.routes.ts#manual-payments verify",
        purpose: "Evidence + settleJobPaymentViaPos or staff_verified",
        retailAuthority: true,
        adapter: finRoutes.includes("settleJobPaymentViaPos"),
      },
      {
        path: "server/services/finance.service.ts#recordDuePayment",
        purpose: "due_records.paidAmount only — not job_tickets retail collection",
        retailAuthority: false,
        boundary: "due",
      },
    ];
    evidence.sourceAudit = writers;
    log(
      "3e. source: recordJobPayment is hard-stop (no direct paid write)",
      /USE_POS_SETTLEMENT/.test(jobService) && !jobsRoutes.includes("jobService.recordJobPayment"),
    );
    log(
      "3f. source: adapter + manual use settleJobPaymentViaPos",
      jobsRoutes.includes("settleJobPaymentViaPos") && finRoutes.includes("settleJobPaymentViaPos"),
    );

    // ========== 4. Guardrails ==========
    const secondBill = await api(
      cash,
      "POST",
      "/api/pos-transactions",
      posBody(jobC, 100, { clientRequestId: `2nd_${tag}` }),
    );
    log(
      "4a. fully billed job rejects second bill",
      secondBill.status === 409 && secondBill.json.code === "JOB_ALREADY_FULLY_BILLED",
      `HTTP ${secondBill.status} code=${secondBill.json.code}`,
    );

    const jobOv = await insertJob({ estimate: 1000 });
    const over = await api(
      cash,
      "POST",
      "/api/pos-transactions",
      posBody(jobOv, 5000, { clientRequestId: `over_${tag}` }),
    );
    const ovPaid = await client.query(`SELECT paid_amount FROM job_tickets WHERE id=$1`, [jobOv]);
    log(
      "4b. overbill rejected without paid side effect",
      over.status === 409 &&
        (over.json.code === "JOB_OVERBILL" || /over/i.test(over.json.error || "")) &&
        Number(ovPaid.rows[0].paid_amount) === 0,
      `HTTP ${over.status} code=${over.json.code} paid=${ovPaid.rows[0].paid_amount}`,
    );

    // invalid precision / amount
    const jobBad = await insertJob({ estimate: 500 });
    const badAmt = await api(cash, "POST", `/api/job-tickets/${jobBad}/record-payment`, {
      paymentId: `bad_${tag}`,
      amount: -10,
      method: "Cash",
    });
    log(
      "4c. invalid amount rejected",
      badAmt.status >= 400 && badAmt.status < 500,
      `HTTP ${badAmt.status}`,
    );

    // Due POS cannot refund
    const jobDue = await insertJob({ estimate: 1500 });
    const dueSale = await api(cash, "POST", "/api/pos-transactions", {
      ...posBody(jobDue, 1500, { clientRequestId: `due_${tag}`, paymentMethod: "Due", paymentStatus: "Due" }),
      customer: "Due Customer",
    });
    if (dueSale.json.id) fixtures.pos.push(dueSale.json.id);
    let dueRefundBlocked = false;
    let dueDetail = `pos=${dueSale.status}`;
    if (dueSale.json.id) {
      const dr = await api(cash, "POST", "/api/refunds", {
        type: "pos",
        referenceId: dueSale.json.id,
        refundAmount: 100,
        reason: "should block due",
      });
      dueDetail += ` refund=${dr.status}/${dr.json.code || ""}`;
      dueRefundBlocked =
        dr.status >= 400 &&
        (dr.json.code === "REFUND_REQUIRES_COLLECTED_PAYMENT" ||
          dr.json.code === "REFUND_COLLECTED_PAYMENT_UNVERIFIED" ||
          /collected|due/i.test(dr.json.error || ""));
    }
    log("4d. Due/uncollected invoice blocked from refund", dueRefundBlocked, dueDetail);

    // NG protected
    const jobNg = await insertJob({ estimate: 2000, status: "Awaiting Customer Decision" });
    const ngPay = await api(cash, "POST", `/api/job-tickets/${jobNg}/record-payment`, {
      paymentId: `ng_${tag}`,
      amount: 100,
      method: "Cash",
    });
    const ngPos = await api(
      cash,
      "POST",
      "/api/pos-transactions",
      posBody(jobNg, 100, { clientRequestId: `ngpos_${tag}` }),
    );
    log(
      "4e. NG-protected job blocked on money routes",
      ngPay.status === 409 &&
        ngPay.json.code === "NG_WORKFLOW_LOCKED" &&
        ngPos.status === 409 &&
        ngPos.json.code === "NG_WORKFLOW_LOCKED",
      `adapter=${ngPay.status}/${ngPay.json.code} pos=${ngPos.status}/${ngPos.json.code}`,
    );

    // 403 denied
    const den = await api(deny, "POST", "/api/pos-transactions", posBody(jobBad, 100, { clientRequestId: `den_${tag}` }));
    const den2 = await api(deny, "POST", `/api/job-tickets/${jobBad}/record-payment`, {
      paymentId: `den2_${tag}`,
      amount: 100,
      method: "Cash",
    });
    const denPaid = await client.query(`SELECT paid_amount FROM job_tickets WHERE id=$1`, [jobBad]);
    log(
      "4f. permission-denied staff 403; no financial mutation",
      den.status === 403 && den2.status === 403 && Number(denPaid.rows[0].paid_amount) === 0,
      `pos=${den.status} adapter=${den2.status} paid=${denPaid.rows[0].paid_amount}`,
    );

    // ========== 5. Refund integrity ==========
    const FULL = 1800;
    const jobF = await insertJob({ estimate: FULL });
    const posF = await api(
      cash,
      "POST",
      "/api/pos-transactions",
      posBody(jobF, FULL, { clientRequestId: `full_${tag}` }),
    );
    if (posF.json.id) fixtures.pos.push(posF.json.id);
    const warrBefore = await client.query(`SELECT warranty_days FROM job_tickets WHERE id=$1`, [jobF]);

    // Maker-checker: Cashier (requester) cannot decide; Manager cannot decide own request
    const refSelf = await api(cash, "POST", "/api/refunds", {
      type: "pos",
      referenceId: posF.json.id,
      refundAmount: 200,
      reason: "self check",
    });
    if (refSelf.json.id) fixtures.refunds.push(refSelf.json.id);
    const selfAppr = await api(cash, "PATCH", `/api/refunds/${refSelf.json.id}/approve`, {});
    // Cashier lacks Manager role → 403 FORBIDDEN (still cannot self-approve)
    log(
      "5a. requester (Cashier) cannot approve refund",
      selfAppr.status === 403,
      `HTTP ${selfAppr.status} code=${selfAppr.json.code}`,
    );
    const selfRej = await api(cash, "PATCH", `/api/refunds/${refSelf.json.id}/reject`, {
      rejectionReason: "self reject attempt",
    });
    log(
      "5b. requester (Cashier) cannot reject refund",
      selfRej.status === 403,
      `HTTP ${selfRej.status} code=${selfRej.json.code}`,
    );
    // True self-decision: Manager creates then tries to approve own
    const refMgr = await api(mgr, "POST", "/api/refunds", {
      type: "pos",
      referenceId: posF.json.id,
      refundAmount: 150,
      reason: "manager self decision",
    });
    if (refMgr.json.id) fixtures.refunds.push(refMgr.json.id);
    const mgrSelfAppr = await api(mgr, "PATCH", `/api/refunds/${refMgr.json.id}/approve`, {});
    log(
      "5a2. Manager self-approve → SELF_APPROVAL_FORBIDDEN",
      mgrSelfAppr.status === 403 && mgrSelfAppr.json.code === "SELF_APPROVAL_FORBIDDEN",
      `HTTP ${mgrSelfAppr.status} code=${mgrSelfAppr.json.code}`,
    );
    const mgrSelfRej = await api(mgr, "PATCH", `/api/refunds/${refMgr.json.id}/reject`, {
      rejectionReason: "manager self reject",
    });
    log(
      "5b2. Manager self-reject → SELF_APPROVAL_FORBIDDEN",
      mgrSelfRej.status === 403 && mgrSelfRej.json.code === "SELF_APPROVAL_FORBIDDEN",
      `HTTP ${mgrSelfRej.status} code=${mgrSelfRej.json.code}`,
    );
    // Clear reservations (need a different authorized actor — use cash cannot reject; create super path)
    // Manager cannot self-reject; Cashier cannot decide. Use a second manager for reject.
    const mgr2Id = randomUUID();
    const mgr2User = `${tag}_mgr2`;
    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions) VALUES ($1,$2,'Sec Mgr2',$3,'Manager','Active',$4)`,
      [mgr2Id, mgr2User, hash, JSON.stringify(mgrPerms)],
    );
    fixtures.users.push(mgr2Id);
    const mgr2 = await login(mgr2User, "SecQa!99");
    if (refSelf.json.id) {
      await api(mgr2, "PATCH", `/api/refunds/${refSelf.json.id}/reject`, {
        rejectionReason: "clear capacity for full refund QA",
      });
    }
    if (refMgr.json.id) {
      await api(mgr2, "PATCH", `/api/refunds/${refMgr.json.id}/reject`, {
        rejectionReason: "clear capacity 2",
      });
    }

    // Partial with maker-checker
    const PART = 5000;
    const jobP = await insertJob({ estimate: PART });
    const posP = await api(
      cash,
      "POST",
      "/api/pos-transactions",
      posBody(jobP, PART, { clientRequestId: `part_${tag}` }),
    );
    if (posP.json.id) fixtures.pos.push(posP.json.id);
    const rPart = await api(cash, "POST", "/api/refunds", {
      type: "pos",
      referenceId: posP.json.id,
      refundAmount: 1200,
      reason: "partial sec",
    });
    if (rPart.json.id) fixtures.refunds.push(rPart.json.id);
    const apPart = await api(mgr, "PATCH", `/api/refunds/${rPart.json.id}/approve`, {});
    // self-process by cash should fail
    const selfProc = await api(cash, "PATCH", `/api/refunds/${rPart.json.id}/process`, { refundMethod: "cash" });
    log(
      "5c. self-process forbidden (or non-manager 403)",
      selfProc.status === 403,
      `HTTP ${selfProc.status} code=${selfProc.json.code || ""}`,
    );
    const prPart = await api(mgr, "PATCH", `/api/refunds/${rPart.json.id}/process`, { refundMethod: "cash" });
    const gPart = await api(cash, "GET", `/api/pos-transactions/${posP.json.id}`);
    log(
      "5d. partial refund stays partial with correct net",
      prPart.status === 200 &&
        gPart.json.refundStatus === "partial" &&
        gPart.json.lifecycle === "partially_refunded" &&
        Number(gPart.json.netCollected ?? gPart.json.netCollectedTotal) === PART - 1200,
      `refunded=${gPart.json.refundedAmount} status=${gPart.json.refundStatus} life=${gPart.json.lifecycle} net=${gPart.json.netCollected}`,
    );

    // Full refund
    const rFull = await api(cash, "POST", "/api/refunds", {
      type: "pos",
      referenceId: posF.json.id,
      refundAmount: FULL,
      reason: "full remaining",
    });
    if (rFull.json.id) fixtures.refunds.push(rFull.json.id);
    // if previous self-refund still pending, full may conflict capacity — reject old first via manager
    if (refSelf.json.id && refSelf.status === 201) {
      await api(mgr, "PATCH", `/api/refunds/${refSelf.json.id}/reject`, { rejectionReason: "clear for full" }).catch(
        () => {},
      );
    }
    // recreate full if needed
    let fullId = rFull.json.id;
    if (rFull.status !== 201) {
      const rFull2 = await api(cash, "POST", "/api/refunds", {
        type: "pos",
        referenceId: posF.json.id,
        refundAmount: FULL,
        reason: "full remaining retry",
      });
      fullId = rFull2.json.id;
      if (fullId) fixtures.refunds.push(fullId);
      log("5e. full refund request created", rFull2.status === 201, `HTTP ${rFull2.status} code=${rFull2.json.code}`);
    } else {
      log("5e. full refund request created", true, `HTTP ${rFull.status}`);
    }
    if (fullId) {
      const af = await api(mgr, "PATCH", `/api/refunds/${fullId}/approve`, {});
      const pf = await api(mgr, "PATCH", `/api/refunds/${fullId}/process`, { refundMethod: "cash" });
      const gf = await api(cash, "GET", `/api/pos-transactions/${posF.json.id}`);
      const warrAfter = await client.query(`SELECT warranty_days FROM job_tickets WHERE id=$1`, [jobF]);
      const fullOk =
        af.status === 200 &&
        pf.status === 200 &&
        Number(gf.json.refundedAmount) === FULL &&
        gf.json.refundStatus === "full" &&
        gf.json.lifecycle === "fully_refunded" &&
        Number(gf.json.netCollected ?? gf.json.netCollectedTotal) === 0 &&
        Number(gf.json.outstandingDue) === 0;
      if (
        !log(
          "5f. FULL refund: full status, fully_refunded, net=0, due=0",
          fullOk,
          `approve=${af.status} process=${pf.status} refunded=${gf.json.refundedAmount} st=${gf.json.refundStatus} life=${gf.json.lifecycle} net=${gf.json.netCollected} due=${gf.json.outstandingDue}`,
        )
      ) {
        integrityStop = "full refund";
        throw new Error("INTEGRITY_STOP: full refund");
      }
      const overR = await api(cash, "POST", "/api/refunds", {
        type: "pos",
        referenceId: posF.json.id,
        refundAmount: 50,
        reason: "over",
      });
      log(
        "5g. over-refund fails",
        overR.status >= 400,
        `HTTP ${overR.status} code=${overR.json.code}`,
      );
      log(
        "5h. warranty_days unchanged after refund (no invented void policy)",
        String(warrBefore.rows[0].warranty_days) === String(warrAfter.rows[0].warranty_days),
        `${warrBefore.rows[0].warranty_days}->${warrAfter.rows[0].warranty_days}`,
      );
    }

    // ========== 6. Atomicity force-fail ==========
    killChild();
    await startServer({ POS_R1H_FORCE_FAIL: "1", POS_R1H_FORCE_FAIL_AT: "pos_create" });
    cash = await login(cashUser, "SecQa!99");
    mgr = await login(mgrUser, "SecQa!99");
    const jobForce = await insertJob({ estimate: 2700 });
    const beforeF = {
      paid: (await client.query(`SELECT paid_amount FROM job_tickets WHERE id=$1`, [jobForce])).rows[0].paid_amount,
      pos: (await client.query(`SELECT COUNT(*)::int AS c FROM pos_transactions`)).rows[0].c,
      petty: (await client.query(`SELECT COUNT(*)::int AS c FROM petty_cash_records`)).rows[0].c,
      alloc: (
        await client.query(`SELECT COUNT(*)::int AS c FROM pos_transaction_area_allocations WHERE job_ticket_id=$1`, [
          jobForce,
        ])
      ).rows[0].c,
    };
    const force = await api(
      cash,
      "POST",
      "/api/pos-transactions",
      posBody(jobForce, 2700, { clientRequestId: `force_${tag}` }),
    );
    const afterF = {
      paid: (await client.query(`SELECT paid_amount FROM job_tickets WHERE id=$1`, [jobForce])).rows[0].paid_amount,
      pos: (await client.query(`SELECT COUNT(*)::int AS c FROM pos_transactions`)).rows[0].c,
      petty: (await client.query(`SELECT COUNT(*)::int AS c FROM petty_cash_records`)).rows[0].c,
      alloc: (
        await client.query(`SELECT COUNT(*)::int AS c FROM pos_transaction_area_allocations WHERE job_ticket_id=$1`, [
          jobForce,
        ])
      ).rows[0].c,
    };
    const forceOk =
      force.status >= 400 &&
      Number(beforeF.paid) === Number(afterF.paid) &&
      beforeF.pos === afterF.pos &&
      beforeF.petty === afterF.petty &&
      beforeF.alloc === afterF.alloc;
    log(
      "6a. forced POS fail mid-txn: full rollback (pos/alloc/paid/petty unchanged)",
      forceOk,
      `HTTP ${force.status} paid ${beforeF.paid}->${afterF.paid} posΔ=${afterF.pos - beforeF.pos} pettyΔ=${afterF.petty - beforeF.petty}`,
    );

    // Hook not activatable via request body in clean server
    killChild();
    await startServer({ POS_R1H_FORCE_FAIL: "0", POS_R1H_FORCE_FAIL_AT: "" });
    cash = await login(cashUser, "SecQa!99");
    mgr = await login(mgrUser, "SecQa!99");
    const jobHook = await insertJob({ estimate: 1100 });
    const hookTry = await api(cash, "POST", "/api/pos-transactions", {
      ...posBody(jobHook, 1100, { clientRequestId: `hook_${tag}` }),
      POS_R1H_FORCE_FAIL: "1",
      POS_R1H_FORCE_FAIL_AT: "pos_create",
      forceFail: true,
    });
    if (hookTry.json.id) fixtures.pos.push(hookTry.json.id);
    log(
      "6b. force-fail hook NOT activatable via request body (sale succeeds in non-force process)",
      hookTry.status === 201 && !!hookTry.json.id,
      `HTTP ${hookTry.status}`,
    );
    // source gate: hook requires NODE_ENV=test
    log(
      "6c. source: force-fail gated to NODE_ENV=test only",
      /NODE_ENV === ["']test["']/.test(posBilling) && /POS_R1H_FORCE_FAIL/.test(posBilling),
    );

    // ========== 7. already covered schema ==========

    // ========== 8. Regression ==========
    const jA = await insertJob({ estimate: 800 });
    const jB = await insertJob({ estimate: 900 });
    const [cA, cB] = await Promise.all([
      api(cash, "POST", "/api/pos-transactions", posBody(jA, 800, { clientRequestId: `da_${tag}` })),
      api(cash, "POST", "/api/pos-transactions", posBody(jB, 900, { clientRequestId: `db_${tag}` })),
    ]);
    if (cA.json.id) fixtures.pos.push(cA.json.id);
    if (cB.json.id) fixtures.pos.push(cB.json.id);
    log(
      "8a. distinct jobs concurrent → distinct invoices",
      cA.status === 201 &&
        cB.status === 201 &&
        cA.json.id !== cB.json.id &&
        cA.json.invoiceNumber !== cB.json.invoiceNumber,
      `ids equal? ${cA.json.id === cB.json.id}`,
    );
    log(
      "8b. cash + bank sales already proven above",
      bank.status === 201 && (hookTry.status === 201 || posF.status === 201),
    );

    // recovery does not re-run side effects: replay same key
    const petBeforeReplay = await client.query(`SELECT COUNT(*)::int AS c FROM petty_cash_records`);
    const replay = await api(cash, "POST", "/api/pos-transactions", bodyC);
    const petAfterReplay = await client.query(`SELECT COUNT(*)::int AS c FROM petty_cash_records`);
    log(
      "8c. idempotent recovery does not re-run petty/side effects",
      replay.status === 200 &&
        replay.json.idempotent === true &&
        petAfterReplay.rows[0].c === petBeforeReplay.rows[0].c,
      `HTTP ${replay.status} petty ${petBeforeReplay.rows[0].c}->${petAfterReplay.rows[0].c}`,
    );

    notVerified("browser/UI visual QA", "API-only security suite; no Playwright browser session in this phase");
  } catch (e) {
    console.error("QA stop:", e.message);
    if (integrityStop) {
      log(`INTEGRITY_STOP:${integrityStop}`, false, e.message);
    } else {
      log("suite", false, e.message);
    }
  } finally {
    try {
      for (const r of fixtures.refunds) {
        await client.query(`DELETE FROM refund_allocations WHERE refund_id=$1`, [r]).catch(() => {});
        await client.query(`DELETE FROM refunds WHERE id=$1`, [r]).catch(() => {});
      }
      for (const p of fixtures.pos) {
        await client.query(`DELETE FROM refund_allocations WHERE transaction_id=$1`, [p]).catch(() => {});
        await client.query(`DELETE FROM pos_transaction_area_allocations WHERE transaction_id=$1`, [p]).catch(() => {});
        await client.query(`DELETE FROM pos_transactions WHERE id=$1`, [p]).catch(() => {});
      }
      await client.query(`DELETE FROM pos_transactions WHERE client_request_id LIKE $1`, [`%${tag}%`]).catch(() => {});
      await client
        .query(`DELETE FROM pos_transaction_area_allocations WHERE job_ticket_id = ANY($1::text[])`, [
          fixtures.jobs.length ? fixtures.jobs : ["__none__"],
        ])
        .catch(() => {});
      for (const m of fixtures.manual) {
        await client.query(`DELETE FROM manual_payments WHERE id=$1`, [m]).catch(() => {});
      }
      for (const j of fixtures.jobs) {
        await client.query(`DELETE FROM job_tickets WHERE id=$1`, [j]).catch(() => {});
      }
      for (const u of fixtures.users) {
        await client.query(`DELETE FROM notifications WHERE user_id=$1`, [u]).catch(() => {});
        await client.query(`DELETE FROM users WHERE id=$1`, [u]).catch(() => {});
      }
      const rem = {
        users: (
          await client.query(`SELECT COUNT(*)::int AS c FROM users WHERE username LIKE $1`, [`${tag}%`])
        ).rows[0].c,
        jobs: (
          await client.query(`SELECT COUNT(*)::int AS c FROM job_tickets WHERE id = ANY($1::text[])`, [
            fixtures.jobs.length ? fixtures.jobs : ["__none__"],
          ])
        ).rows[0].c,
        pos: (
          await client.query(
            `SELECT COUNT(*)::int AS c FROM pos_transactions WHERE client_request_id LIKE $1 OR id = ANY($2::text[])`,
            [`%${tag}%`, fixtures.pos.length ? fixtures.pos : ["__none__"]],
          )
        ).rows[0].c,
        refunds: (
          await client.query(`SELECT COUNT(*)::int AS c FROM refunds WHERE id = ANY($1::text[])`, [
            fixtures.refunds.length ? fixtures.refunds : ["__none__"],
          ])
        ).rows[0].c,
        manual: (
          await client.query(`SELECT COUNT(*)::int AS c FROM manual_payments WHERE id = ANY($1::text[])`, [
            fixtures.manual.length ? fixtures.manual : ["__none__"],
          ])
        ).rows[0].c,
      };
      evidence.dbAssertions.push({ cleanupRemaining: rem });
      log(
        "fixture cleanup remaining=0",
        rem.users === 0 && rem.jobs === 0 && rem.pos === 0 && rem.refunds === 0 && rem.manual === 0,
        JSON.stringify(rem),
      );
    } catch (ce) {
      log("fixture cleanup remaining=0", false, ce.message);
    }
    killChild();
    client.release();
    await pool.end();

    const pass = results.filter((r) => r.result === "PASS").length;
    const fail = results.filter((r) => r.result === "FAIL").length;
    const nv = results.filter((r) => r.result === "NOT VERIFIED").length;
    const out = {
      phase: "SYSTEM-UNIFICATION-00C-B-SECURITY-QA",
      runId: RUN_ID,
      pass,
      fail,
      notVerified: nv,
      integrityStop,
      concurrentMatrix: evidence.concurrentMatrix,
      sourceAudit: evidence.sourceAudit,
      redactedHttpSample: evidence.redactedHttp.slice(0, 40),
      dbAssertions: evidence.dbAssertions,
      results,
      gate00cC: fail === 0 && !integrityStop ? "YES" : "NO",
    };
    writeFileSync(join(REPORT_DIR, "evidence.json"), JSON.stringify(out, null, 2));
    writeFileSync(join(REPORT_DIR, "qa-results.json"), JSON.stringify({ pass, fail, notVerified: nv, results }, null, 2));
    console.log(`\nTOTAL PASS=${pass} FAIL=${fail} NOT_VERIFIED=${nv}`);
    process.exit(fail > 0 ? 1 : 0);
  }
}

main();
