/**
 * SYSTEM-UNIFICATION-00C-B-HOTFIX-1 QA
 * Local/Neon only. Never Aiven. One bounded run.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import pg from "pg";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";

const PORT = process.env.QA_PORT || "5112";
const BASE = process.env.QA_BASE || `http://127.0.0.1:${PORT}`;
const RUN_ID =
  process.env.QA_RUN_FOLDER ||
  new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const REPORT_DIR = `mobile-qa/system-unification-00c-b-hotfix-1/${RUN_ID}`;

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
function log(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail: String(detail).slice(0, 500) });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
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

async function waitHealth(ms = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.status === 200) {
        // Wait for migrations/session store after health flips green
        await new Promise((x) => setTimeout(x, 6000));
        return true;
      }
    } catch {
      /* */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function login(username, password, attempts = 12) {
  let lastErr = "unknown";
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastErr = `login ${username} ${res.status}`;
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      let cookies = cookieJar(res);
      const csrfRes = await fetch(`${BASE}/api/admin/csrf-token`, { headers: { Cookie: cookies } });
      cookies = mergeCookies(cookies, csrfRes);
      const csrfBody = await csrfRes.json().catch(() => ({}));
      return { cookies, csrf: csrfBody.csrfToken || "", user: body.user || body };
    } catch (e) {
      lastErr = e.message || String(e);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error(lastErr);
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
  return { status: res.status, json };
}

const fixtures = { users: [], jobs: [], pos: [], manual: [], refunds: [], notifications: [] };
let child = null;

function killChild() {
  if (!child) return;
  try {
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: true });
    } else {
      child.kill("SIGTERM");
      child.kill("SIGKILL");
    }
  } catch {
    /* */
  }
  child = null;
}

async function startServer(extraEnv = {}) {
  killChild();
  await new Promise((r) => setTimeout(r, 2500));
  const forceFail = extraEnv.POS_R1H_FORCE_FAIL || "0";
  const forceAt = extraEnv.POS_R1H_FORCE_FAIL_AT || "";
  // Put force-fail flags in cross-env so Windows shell cannot drop them
  const crossArgs = [
    "cross-env",
    `PORT=${PORT}`,
    "NODE_ENV=test",
    `POS_R1H_FORCE_FAIL=${forceFail}`,
    `POS_R1H_FORCE_FAIL_AT=${forceAt || "none"}`,
    "tsx",
    "server/index.ts",
  ];
  child = spawn("npx", crossArgs, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      POS_R1H_FORCE_FAIL: forceFail,
      POS_R1H_FORCE_FAIL_AT: forceAt,
      SKIP_STARTUP_MIGRATIONS: "false",
      ...extraEnv,
    },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!(await waitHealth())) throw new Error("server not healthy");
  // Probe login endpoint readiness (503 while store warms)
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(`${BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "__warmup__", password: "x" }),
      });
      if (r.status !== 503) return;
    } catch {
      /* */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function main() {
  console.log("00C-B-HOTFIX-1 QA", BASE, "run", RUN_ID);
  mkdirSync(REPORT_DIR, { recursive: true });
  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const tag = `h1_${Date.now().toString(36)}`;
  const hash = await bcrypt.hash("H1Qa!99", 10);

  try {
    await startServer();

    const cols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='pos_transactions'
        AND column_name IN ('client_request_id','created_by_user_id','idempotency_fingerprint')
    `);
    const colNames = cols.rows.map((r) => r.column_name).sort();
    log(
      "migration: idempotency columns present",
      colNames.includes("idempotency_fingerprint") &&
        colNames.includes("client_request_id") &&
        colNames.includes("created_by_user_id"),
      colNames.join(","),
    );

    const cashierId = randomUUID();
    const techId = randomUUID();
    const jobsOnlyId = randomUUID();
    const managerId = randomUUID();
    const cashierUser = `${tag}_cash`;
    const techUser = `${tag}_tech`;
    const jobsOnlyUser = `${tag}_jpay`;
    const mgrUser = `${tag}_mgr`;

    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions)
       VALUES ($1,$2,'H1 Cashier',$3,'Cashier','Active',$4)`,
      [
        cashierId,
        cashierUser,
        hash,
        JSON.stringify({
          process_payment: true,
          pos: true,
          "pos.processPayment": true,
          "pos.view": true,
          "jobs.recordPayment": true,
          jobs: true,
          "jobs.view": true,
        }),
      ],
    );
    fixtures.users.push(cashierId);

    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions)
       VALUES ($1,$2,'H1 Tech',$3,'Technician','Active',$4)`,
      [techId, techUser, hash, JSON.stringify({ "jobs.view": true, "jobs.reportOutcome": true })],
    );
    fixtures.users.push(techId);

    // jobs.recordPayment only — must 403 on POS settlement routes
    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions)
       VALUES ($1,$2,'H1 JobsPayOnly',$3,'Technician','Active',$4)`,
      [
        jobsOnlyId,
        jobsOnlyUser,
        hash,
        JSON.stringify({
          "jobs.view": true,
          "jobs.recordPayment": true,
          jobs: true,
        }),
      ],
    );
    fixtures.users.push(jobsOnlyId);

    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions)
       VALUES ($1,$2,'H1 Manager',$3,'Manager','Active',$4)`,
      [
        managerId,
        mgrUser,
        hash,
        JSON.stringify({
          process_payment: true,
          "pos.processPayment": true,
          "pos.view": true,
          "pos.refund": true,
          "jobs.recordPayment": true,
          jobs: true,
          "jobs.view": true,
          finance: true,
        }),
      ],
    );
    fixtures.users.push(managerId);

    let cash, tech, jpay, mgr;
    for (let i = 0; i < 8; i++) {
      try {
        cash = await login(cashierUser, "H1Qa!99");
        tech = await login(techUser, "H1Qa!99");
        jpay = await login(jobsOnlyUser, "H1Qa!99");
        mgr = await login(mgrUser, "H1Qa!99");
        break;
      } catch (e) {
        if (i === 7) throw e;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    async function insertJob(opts = {}) {
      const jobId = randomUUID();
      await client.query(
        `INSERT INTO job_tickets (
          id, customer, customer_phone, device, issue, status, technician, estimated_cost,
          payment_status, paid_amount, remaining_amount, billing_status, warranty_days,
          corporate_client_id, corporate_challan_id, created_at
        ) VALUES ($1,$2,$3,'TV','test','Pending','Unassigned',$4,'unpaid',0,$4,'pending',30,$5,$6,NOW())`,
        [
          jobId,
          opts.customer || "QA Customer",
          opts.phone || "01700000000",
          opts.estimate ?? 5000,
          opts.corpClient || null,
          opts.corpChallan || null,
        ],
      );
      fixtures.jobs.push(jobId);
      return jobId;
    }

    function posBody(jobId, amount, extras = {}) {
      return {
        items: JSON.stringify([{ name: "Repair", quantity: 1, price: amount, itemType: "service" }]),
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

    // --- 1 Canonical POS ---
    const job1 = await insertJob({ estimate: 5000 });
    const saleKey = `sale_${tag}_1`;
    const pos1 = await api(cash, "POST", "/api/pos-transactions", posBody(job1, 5000, { clientRequestId: saleKey }));
    log("1. canonical POS paid sale", pos1.status === 201 && !!pos1.json.id, `HTTP ${pos1.status}`);
    if (pos1.json.id) fixtures.pos.push(pos1.json.id);
    const j1 = await client.query(`SELECT paid_amount, payment_status FROM job_tickets WHERE id=$1`, [job1]);
    log(
      "1b. job projection after POS",
      Number(j1.rows[0]?.paid_amount) === 5000 && String(j1.rows[0]?.payment_status).toLowerCase() === "paid",
      JSON.stringify(j1.rows[0]),
    );

    // --- 2 same-key same-body replay ---
    const replay = await api(cash, "POST", "/api/pos-transactions", posBody(job1, 5000, { clientRequestId: saleKey }));
    log(
      "2. same-key/same-body replay = original POS",
      (replay.status === 200 || replay.status === 201) &&
        replay.json.id === pos1.json.id &&
        (replay.json.idempotent === true || replay.status === 200),
      `HTTP ${replay.status} sameId=${replay.json.id === pos1.json.id} idempotent=${replay.json.idempotent}`,
    );
    const posCount1 = await client.query(`SELECT COUNT(*)::int AS c FROM pos_transactions WHERE client_request_id=$1`, [
      saleKey,
    ]);
    log("2b. one POS row for key after replay", posCount1.rows[0].c === 1, `c=${posCount1.rows[0].c}`);

    // --- 3 same-key different-body = 409 ---
    const jobDiff = await insertJob({ estimate: 8000 });
    const conflict = await api(
      cash,
      "POST",
      "/api/pos-transactions",
      posBody(jobDiff, 8000, { clientRequestId: saleKey, customer: "Other Customer" }),
    );
    log(
      "3. same-key/different-body = IDEMPOTENCY_CONFLICT",
      conflict.status === 409 && conflict.json.code === "IDEMPOTENCY_CONFLICT",
      `HTTP ${conflict.status} code=${conflict.json.code}`,
    );
    const jobDiffPaid = await client.query(`SELECT paid_amount FROM job_tickets WHERE id=$1`, [jobDiff]);
    log(
      "3b. conflict has zero side effects on other job",
      Number(jobDiffPaid.rows[0].paid_amount) === 0 && posCount1.rows[0].c === 1,
      `paid=${jobDiffPaid.rows[0].paid_amount}`,
    );

    // --- 4 concurrent same-key ---
    const jobConc = await insertJob({ estimate: 2500 });
    const concKey = `sale_${tag}_conc`;
    const bodyConc = posBody(jobConc, 2500, { clientRequestId: concKey });
    const [a, b] = await Promise.all([
      api(cash, "POST", "/api/pos-transactions", bodyConc),
      api(cash, "POST", "/api/pos-transactions", bodyConc),
    ]);
    const concC = await client.query(`SELECT COUNT(*)::int AS c FROM pos_transactions WHERE client_request_id=$1`, [
      concKey,
    ]);
    const okConc =
      concC.rows[0].c === 1 &&
      ((a.status === 201 || a.status === 200) || (b.status === 201 || b.status === 200));
    log("4. concurrent same-key one POS only", okConc, `c=${concC.rows[0].c} HTTP ${a.status}/${b.status}`);
    const concId = a.json?.id || b.json?.id;
    if (concId) fixtures.pos.push(concId);

    // --- 5 second full bill ---
    const second = await api(cash, "POST", "/api/pos-transactions", posBody(job1, 100, { clientRequestId: `sale_${tag}_2nd` }));
    log(
      "5. second full bill rejected",
      second.status === 409 && second.json.code === "JOB_ALREADY_FULLY_BILLED",
      `HTTP ${second.status} code=${second.json.code}`,
    );

    // --- 6 adapter safe label (no raw job id in items) ---
    const job2 = await insertJob({ estimate: 3000 });
    const payId = `pay_${tag}_a`;
    const rec = await api(cash, "POST", `/api/job-tickets/${job2}/record-payment`, {
      paymentId: payId,
      amount: 3000,
      method: "Cash",
    });
    log(
      "6. record-payment adapter settles via POS",
      rec.status === 200 && rec.json.posTransaction?.id && rec.json.settlement?.deprecated === true,
      `HTTP ${rec.status}`,
    );
    if (rec.json.posTransaction?.id) fixtures.pos.push(rec.json.posTransaction.id);
    const itemsRow = await client.query(`SELECT items FROM pos_transactions WHERE id=$1`, [
      rec.json.posTransaction?.id,
    ]);
    const itemsStr = String(itemsRow.rows[0]?.items || "");
    const rawIdLeak = itemsStr.includes(job2);
    log("6b. raw job id absent from POS line items", !rawIdLeak, `items=${itemsStr.slice(0, 120)}`);
    log("6c. safe display ref in line items", /Job settlement JOB-/i.test(itemsStr), itemsStr.slice(0, 120));

    // --- 7 adapter retry ---
    const rec2 = await api(cash, "POST", `/api/job-tickets/${job2}/record-payment`, {
      paymentId: payId,
      amount: 3000,
      method: "Cash",
    });
    const payC = await client.query(`SELECT COUNT(*)::int AS c FROM pos_transactions WHERE client_request_id=$1`, [payId]);
    log(
      "7. adapter same-key/same-body one POS",
      rec2.status === 200 && payC.rows[0].c === 1,
      `HTTP ${rec2.status} c=${payC.rows[0].c}`,
    );

    // --- 8 adapter different body same key ---
    const confAdapter = await api(cash, "POST", `/api/job-tickets/${job2}/record-payment`, {
      paymentId: payId,
      amount: 1500,
      method: "Bank",
    });
    log(
      "8. adapter same-key/different-body conflict",
      confAdapter.status === 409 && confAdapter.json.code === "IDEMPOTENCY_CONFLICT",
      `HTTP ${confAdapter.status} code=${confAdapter.json.code}`,
    );

    // --- 9 corporate / due / unknown ---
    const jobCorp = await insertJob({ estimate: 1000 });
    await client.query(`UPDATE job_tickets SET corporate_client_id=$2 WHERE id=$1`, [jobCorp, "CORP_TEST_BOUNDARY"]).catch(
      () => null,
    );
    const corpCheck = await client.query(`SELECT corporate_client_id FROM job_tickets WHERE id=$1`, [jobCorp]);
    if (corpCheck.rows[0]?.corporate_client_id) {
      const corpPay = await api(cash, "POST", `/api/job-tickets/${jobCorp}/record-payment`, {
        paymentId: `corp_${tag}`,
        amount: 100,
        method: "Cash",
      });
      log(
        "9. corporate rejected",
        corpPay.status === 400 && corpPay.json.code === "CORPORATE_JOB_NOT_RETAIL",
        `HTTP ${corpPay.status} code=${corpPay.json.code}`,
      );
    } else {
      log("9. corporate rejected", false, "could not set corporate_client_id");
    }

    const jobDue = await insertJob({ estimate: 1500 });
    const duePay = await api(cash, "POST", `/api/job-tickets/${jobDue}/record-payment`, {
      paymentId: `due_${tag}`,
      amount: 1500,
      method: "Due",
    });
    log(
      "10. Due blocked",
      duePay.status === 400 && duePay.json.code === "DUE_NOT_ALLOWED_ON_ADAPTER",
      `HTTP ${duePay.status} code=${duePay.json.code}`,
    );

    const unk = await api(cash, "POST", `/api/job-tickets/${jobDue}/record-payment`, {
      paymentId: `unk_${tag}`,
      amount: 100,
      method: "CryptoMoon",
    });
    log(
      "11. unknown method blocked",
      unk.status === 400 && unk.json.code === "INVALID_PAYMENT_METHOD",
      `HTTP ${unk.status} code=${unk.json.code}`,
    );

    // --- 12 permissions ---
    log("12. technician 403", (await api(tech, "POST", `/api/job-tickets/${jobDue}/record-payment`, {
      paymentId: `tech_${tag}`,
      amount: 100,
      method: "Cash",
    })).status === 403);

    const jpayPos = await api(jpay, "POST", "/api/pos-transactions", posBody(jobDue, 100, { clientRequestId: `jpay_${tag}` }));
    log(
      "13. jobs.recordPayment-only POS 403",
      jpayPos.status === 403,
      `HTTP ${jpayPos.status}`,
    );
    const jpayRec = await api(jpay, "POST", `/api/job-tickets/${jobDue}/record-payment`, {
      paymentId: `jpay_rec_${tag}`,
      amount: 100,
      method: "Cash",
    });
    log(
      "14. jobs.recordPayment-only adapter 403",
      jpayRec.status === 403,
      `HTTP ${jpayRec.status}`,
    );
    log(
      "15. Cashier pos.processPayment permitted",
      pos1.status === 201,
      `earlier HTTP ${pos1.status}`,
    );

    // --- 16 manual verify success + apply ---
    const jobM = await insertJob({ estimate: 4000 });
    const mpId = randomUUID();
    await client.query(
      `INSERT INTO manual_payments (id, job_ticket_id, method, amount, status, source, customer_name, created_at, updated_at)
       VALUES ($1,$2,'cash',4000,'pending','admin_manual','QA Customer',NOW(),NOW())`,
      [mpId, jobM],
    );
    fixtures.manual.push(mpId);
    const mv = await api(cash, "POST", `/api/manual-payments/${mpId}/verify`, {});
    log(
      "16. manual verify applies via POS",
      mv.status === 200 && mv.json.payment?.status === "applied_to_invoice" && !!mv.json.posTransaction?.id,
      `HTTP ${mv.status} status=${mv.json.payment?.status}`,
    );
    if (mv.json.posTransaction?.id) fixtures.pos.push(mv.json.posTransaction.id);

    // --- 17 manual verify Due = 4xx + staff_verified, no accepted notify ---
    const jobMu = await insertJob({ estimate: 1200 });
    const mpDue = randomUUID();
    const custId = randomUUID();
    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, phone, created_at)
       VALUES ($1,$2,'H1 Cust',$3,'Customer','Active','01711112222',NOW())`,
      [custId, `${tag}_cust`, hash],
    ).catch(async () => {
      await client.query(
        `INSERT INTO users (id, username, name, password, role, status) VALUES ($1,$2,'H1 Cust',$3,'Customer','Active')`,
        [custId, `${tag}_cust`, hash],
      );
    });
    fixtures.users.push(custId);
    await client.query(
      `INSERT INTO manual_payments (id, job_ticket_id, method, amount, status, source, customer_phone, created_at, updated_at)
       VALUES ($1,$2,'Due',1200,'pending','customer_submission','01711112222',NOW(),NOW())`,
      [mpDue, jobMu],
    );
    fixtures.manual.push(mpDue);
    const beforeNotif = await client.query(
      `SELECT COUNT(*)::int AS c FROM notifications WHERE user_id=$1 AND type='success' AND context_type='customer_payment'`,
      [custId],
    ).catch(() => ({ rows: [{ c: 0 }] }));
    const mvDue = await api(cash, "POST", `/api/manual-payments/${mpDue}/verify`, {});
    const afterNotif = await client.query(
      `SELECT COUNT(*)::int AS c FROM notifications WHERE user_id=$1 AND type='success' AND context_type='customer_payment'`,
      [custId],
    ).catch(() => ({ rows: [{ c: 0 }] }));
    log(
      "17. manual Due verify returns 4xx + staff_verified",
      mvDue.status === 400 &&
        mvDue.json.code === "DUE_NOT_ALLOWED_ON_ADAPTER" &&
        mvDue.json.payment?.status === "staff_verified",
      `HTTP ${mvDue.status} code=${mvDue.json.code} payStatus=${mvDue.json.payment?.status}`,
    );
    log(
      "17b. verified-unapplied: no accepted customer notification",
      Number(afterNotif.rows[0].c) === Number(beforeNotif.rows[0].c),
      `notif ${beforeNotif.rows[0].c}->${afterNotif.rows[0].c}`,
    );
    const paidMu = await client.query(`SELECT paid_amount FROM job_tickets WHERE id=$1`, [jobMu]);
    log("17c. unapplied leaves job paid=0", Number(paidMu.rows[0].paid_amount) === 0, `paid=${paidMu.rows[0].paid_amount}`);

    // --- 18 manual corporate 4xx ---
    const jobMc = await insertJob({ estimate: 900 });
    await client.query(`UPDATE job_tickets SET corporate_client_id=$2 WHERE id=$1`, [jobMc, "CORP_TEST_BOUNDARY"]).catch(
      () => null,
    );
    const mpCorp = randomUUID();
    await client.query(
      `INSERT INTO manual_payments (id, job_ticket_id, method, amount, status, source, created_at, updated_at)
       VALUES ($1,$2,'Cash',900,'pending','admin_manual',NOW(),NOW())`,
      [mpCorp, jobMc],
    );
    fixtures.manual.push(mpCorp);
    const mvCorp = await api(cash, "POST", `/api/manual-payments/${mpCorp}/verify`, {});
    log(
      "18. manual corporate returns 4xx code",
      mvCorp.status === 400 && mvCorp.json.code === "CORPORATE_JOB_NOT_RETAIL",
      `HTTP ${mvCorp.status} code=${mvCorp.json.code}`,
    );

    // --- 19 forced mid-txn rollback ---
    killChild();
    await startServer({ POS_R1H_FORCE_FAIL: "1", POS_R1H_FORCE_FAIL_AT: "pos_create" });
    // re-login after restart
    cash = await login(cashierUser, "H1Qa!99");
    mgr = await login(mgrUser, "H1Qa!99");
    const jobF = await insertJob({ estimate: 2200 });
    const beforeF = await client.query(
      `SELECT paid_amount FROM job_tickets WHERE id=$1`,
      [jobF],
    );
    const beforePos = await client.query(`SELECT COUNT(*)::int AS c FROM pos_transactions`);
    const force = await api(cash, "POST", "/api/pos-transactions", posBody(jobF, 2200, { clientRequestId: `force_${tag}` }));
    const afterF = await client.query(`SELECT paid_amount FROM job_tickets WHERE id=$1`, [jobF]);
    const afterPos = await client.query(`SELECT COUNT(*)::int AS c FROM pos_transactions`);
    const forceFailOk =
      force.status >= 400 &&
      Number(beforeF.rows[0].paid_amount) === Number(afterF.rows[0].paid_amount) &&
      afterPos.rows[0].c === beforePos.rows[0].c;
    log(
      "19. forced POS mid-txn rollback leaves money unchanged",
      forceFailOk,
      `HTTP ${force.status} paid ${beforeF.rows[0].paid_amount}->${afterF.rows[0].paid_amount} posDelta=${afterPos.rows[0].c - beforePos.rows[0].c}`,
    );

    // restart clean for refund
    killChild();
    await startServer({ POS_R1H_FORCE_FAIL: "0", POS_R1H_FORCE_FAIL_AT: "" });
    cash = await login(cashierUser, "H1Qa!99");
    mgr = await login(mgrUser, "H1Qa!99");

    // --- 20 full refund approve/process (maker-checker: cashier request, manager approve/process) ---
    const jobR = await insertJob({ estimate: 3500 });
    const posR = await api(cash, "POST", "/api/pos-transactions", posBody(jobR, 3500, { clientRequestId: `refsale_${tag}` }));
    if (posR.json.id) fixtures.pos.push(posR.json.id);
    let refundOk = false;
    let refundDetail = `pos HTTP ${posR.status}`;
    if (posR.json.id) {
      // Cashier needs pos.refund to create — grant temporarily on cashier for create only via manager create
      // Manager creates? SELF_APPROVAL forbids same actor. Use cashier with pos.refund for create.
      await client.query(
        `UPDATE users SET permissions = $2 WHERE id = $1`,
        [
          cashierId,
          JSON.stringify({
            process_payment: true,
            pos: true,
            "pos.processPayment": true,
            "pos.view": true,
            "pos.refund": true,
            "jobs.recordPayment": true,
            jobs: true,
            "jobs.view": true,
          }),
        ],
      );
      cash = await login(cashierUser, "H1Qa!99");
      const createRef = await api(cash, "POST", "/api/refunds", {
        type: "pos",
        referenceId: posR.json.id,
        refundAmount: 500,
        reason: "HOTFIX-1 QA partial refund",
      });
      refundDetail += ` create=${createRef.status}`;
      if (createRef.status === 201 && createRef.json.id) {
        fixtures.refunds.push(createRef.json.id);
        const appr = await api(mgr, "PATCH", `/api/refunds/${createRef.json.id}/approve`, {});
        refundDetail += ` approve=${appr.status} code=${appr.json.code || ""}`;
        const proc = await api(mgr, "PATCH", `/api/refunds/${createRef.json.id}/process`, {
          refundMethod: "cash",
        });
        refundDetail += ` process=${proc.status} code=${proc.json.code || ""}`;
        const posAfter = await client.query(
          `SELECT refunded_amount, refund_status FROM pos_transactions WHERE id=$1`,
          [posR.json.id],
        );
        refundOk =
          appr.status === 200 &&
          proc.status === 200 &&
          Number(posAfter.rows[0]?.refunded_amount) >= 500;
        refundDetail += ` refunded=${posAfter.rows[0]?.refunded_amount} status=${posAfter.rows[0]?.refund_status}`;
      } else {
        refundDetail += ` body=${JSON.stringify(createRef.json).slice(0, 160)}`;
      }
    }
    log("20. full refund approve/process with authorized actor", refundOk, refundDetail);

    // --- 21 invoice sequence numeric authority (source + unit-ish DB probe) ---
    const src = readFileSync("server/services/pos-billing.service.ts", "utf8");
    const numericSeq =
      src.includes("MAX(") &&
      src.includes("AS INTEGER") &&
      !src.includes("ORDER BY invoice_number DESC");
    log("21. invoice sequence uses numeric MAX not lex sort", numericSeq, "source audit");

    // Simulate high suffix safety: insert phantom high invoice and ensure next > it
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const phantomId = randomUUID();
    await client.query(
      `INSERT INTO pos_transactions (id, invoice_number, items, subtotal, tax, total, payment_method, payment_status, refunded_amount, refund_status, created_at)
       VALUES ($1,$2,'[]',0,0,0,'Cash','Paid',0,'none',NOW())`,
      [phantomId, `INV-${datePrefix}-10005`],
    );
    fixtures.pos.push(phantomId);
    const jobSeq = await insertJob({ estimate: 100 });
    const seqSale = await api(cash, "POST", "/api/pos-transactions", posBody(jobSeq, 100, { clientRequestId: `seq_${tag}` }));
    if (seqSale.json.id) fixtures.pos.push(seqSale.json.id);
    const inv = String(seqSale.json.invoiceNumber || "");
    const suffix = parseInt(inv.split("-").pop() || "0", 10);
    log(
      "22. invoice sequence after high suffix (>9999)",
      seqSale.status === 201 && suffix >= 10006,
      `invoice=${inv} suffix=${suffix}`,
    );

    // source checks
    const finSrc = readFileSync("server/routes/finance.routes.ts", "utf8");
    log(
      "23. source: staff_verified does not call accepted notify blindly",
      finSrc.includes("status === 'applied_to_invoice'") &&
        finSrc.includes("notifyCustomerPaymentDecision") &&
        finSrc.includes("requireGranularPermission('pos.processPayment')"),
    );
    const jobSrc = readFileSync("server/routes/jobs.routes.ts", "utf8");
    log(
      "24. source: record-payment requires pos.processPayment",
      jobSrc.includes("requireGranularPermission('pos.processPayment')") &&
        jobSrc.includes("settleJobPaymentViaPos"),
    );
  } catch (e) {
    console.error("QA aborted:", e.message);
    log("suite", false, e.message);
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
        .query(`DELETE FROM pos_transaction_area_allocations WHERE job_ticket_id = ANY($1::text[])`, [fixtures.jobs])
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
      log("fixture cleanup", true, `jobs=${fixtures.jobs.length} pos=${fixtures.pos.length} refunds=${fixtures.refunds.length}`);
    } catch (ce) {
      log("fixture cleanup", false, ce.message);
    }
    killChild();
    client.release();
    await pool.end();
  }

  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\nTOTAL PASS=${pass} FAIL=${fail}`);
  writeFileSync(`${REPORT_DIR}/qa-results.json`, JSON.stringify({ pass, fail, runId: RUN_ID, results }, null, 2));
  process.exit(fail > 0 ? 1 : 0);
}

main();
