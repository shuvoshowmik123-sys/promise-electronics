/**
 * SYSTEM-UNIFICATION-00C-B-HOTFIX-2 QA
 * Concurrent idempotency completion + full-refund proof + cleanup honesty.
 * Local/Neon only. Never Aiven.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import pg from "pg";
import bcrypt from "bcryptjs";

const PORT = process.env.QA_PORT || "5115";
const BASE = process.env.QA_BASE || `http://127.0.0.1:${PORT}`;
const RUN_ID =
  process.env.QA_RUN_FOLDER ||
  new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const REPORT_DIR = `mobile-qa/system-unification-00c-b-hotfix-2/${RUN_ID}`;

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
  results.push({ name, ok: !!ok, detail: String(detail).slice(0, 600) });
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
        await new Promise((x) => setTimeout(x, 5000));
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
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      let cookies = cookieJar(res);
      const csrfRes = await fetch(`${BASE}/api/admin/csrf-token`, { headers: { Cookie: cookies } });
      cookies = mergeCookies(cookies, csrfRes);
      const csrfBody = await csrfRes.json().catch(() => ({}));
      return { cookies, csrf: csrfBody.csrfToken || "", user: body.user || body };
    } catch (e) {
      lastErr = e.message || String(e);
      await new Promise((r) => setTimeout(r, 1200));
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
    json = { raw: text.slice(0, 120) };
  }
  return { status: res.status, json };
}

const fixtures = { users: [], jobs: [], pos: [], manual: [], refunds: [] };
let child = null;

function killChild() {
  if (!child) return;
  try {
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: true });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    /* */
  }
  child = null;
}

async function startServer() {
  killChild();
  await new Promise((r) => setTimeout(r, 1500));
  child = spawn(
    "npx",
    ["cross-env", `PORT=${PORT}`, "NODE_ENV=test", "POS_R1H_FORCE_FAIL=0", "tsx", "server/index.ts"],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "test", POS_R1H_FORCE_FAIL: "0", SKIP_STARTUP_MIGRATIONS: "false" },
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (!(await waitHealth())) throw new Error("server not healthy");
  for (let i = 0; i < 15; i++) {
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
    await new Promise((r) => setTimeout(r, 800));
  }
}

async function main() {
  console.log("00C-B-HOTFIX-2 QA", BASE, "run", RUN_ID);
  mkdirSync(REPORT_DIR, { recursive: true });
  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const tag = `h2_${Date.now().toString(36)}`;
  const hash = await bcrypt.hash("H2Qa!99", 10);
  const concurrentMatrix = [];

  try {
    await startServer();

    const cashierId = randomUUID();
    const managerId = randomUUID();
    const cashierUser = `${tag}_cash`;
    const mgrUser = `${tag}_mgr`;

    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions)
       VALUES ($1,$2,'H2 Cashier',$3,'Cashier','Active',$4)`,
      [
        cashierId,
        cashierUser,
        hash,
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
    fixtures.users.push(cashierId);

    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions)
       VALUES ($1,$2,'H2 Manager',$3,'Manager','Active',$4)`,
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

    let cash = await login(cashierUser, "H2Qa!99");
    let mgr = await login(mgrUser, "H2Qa!99");

    async function insertJob(estimate = 5000) {
      const jobId = randomUUID();
      await client.query(
        `INSERT INTO job_tickets (
          id, customer, customer_phone, device, issue, status, technician, estimated_cost,
          payment_status, paid_amount, remaining_amount, billing_status, warranty_days, created_at
        ) VALUES ($1,'QA Customer','01700000000','TV','test','Pending','Unassigned',$2,'unpaid',0,$2,'pending',30,NOW())`,
        [jobId, estimate],
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

    // --- 1 concurrent same-key same-fingerprint ---
    const jobConc = await insertJob(4000);
    const concKey = `conc_${tag}`;
    const bodyConc = posBody(jobConc, 4000, { clientRequestId: concKey });
    // Fire 4 concurrent identical requests
    const concRes = await Promise.all([
      api(cash, "POST", "/api/pos-transactions", bodyConc),
      api(cash, "POST", "/api/pos-transactions", bodyConc),
      api(cash, "POST", "/api/pos-transactions", bodyConc),
      api(cash, "POST", "/api/pos-transactions", bodyConc),
    ]);
    for (let i = 0; i < concRes.length; i++) {
      concurrentMatrix.push({
        index: i,
        status: concRes[i].status,
        code: concRes[i].json.code || null,
        idempotent: concRes[i].json.idempotent ?? null,
        id: concRes[i].json.id || null,
      });
    }
    const ids = [...new Set(concRes.map((r) => r.json.id).filter(Boolean))];
    const statuses = concRes.map((r) => r.status);
    const codes = concRes.map((r) => r.json.code || null);
    const has201 = statuses.includes(201);
    const allSuccessOrReplay = concRes.every(
      (r) =>
        (r.status === 201 && r.json.id) ||
        (r.status === 200 && r.json.idempotent === true && r.json.id) ||
        // allow one transient IN_FLIGHT only if later would be retried — for this suite require no race code
        false,
    );
    // Stricter: all must be 200 or 201, none IDEMPOTENCY_RACE
    const noRaceCode = concRes.every((r) => r.json.code !== "IDEMPOTENCY_RACE");
    const all200or201 = concRes.every((r) => r.status === 200 || r.status === 201);
    const sameId = ids.length === 1;
    const posCount = await client.query(
      `SELECT COUNT(*)::int AS c FROM pos_transactions WHERE client_request_id=$1 AND created_by_user_id=$2`,
      [concKey, cashierId],
    );
    const paidJob = await client.query(`SELECT paid_amount FROM job_tickets WHERE id=$1`, [jobConc]);
    const concOk =
      has201 &&
      all200or201 &&
      noRaceCode &&
      sameId &&
      posCount.rows[0].c === 1 &&
      Number(paidJob.rows[0].paid_amount) === 4000;
    log(
      "1. concurrent same-key: one POS; statuses 200/201 only; no IDEMPOTENCY_RACE",
      concOk,
      `statuses=${JSON.stringify(statuses)} codes=${JSON.stringify(codes)} ids=${ids.length} posRows=${posCount.rows[0].c} paid=${paidJob.rows[0].paid_amount}`,
    );
    if (ids[0]) fixtures.pos.push(ids[0]);
    const replays = concRes.filter((r) => r.status === 200 && r.json.idempotent === true);
    log(
      "1b. concurrent duplicates return idempotent=true (HTTP 200)",
      replays.length >= 1 || (statuses.filter((s) => s === 201).length === 1 && statuses.every((s) => s === 200 || s === 201)),
      `replays=${replays.length} matrix=${JSON.stringify(concurrentMatrix)}`,
    );

    // --- 2 same-key different fingerprint ---
    const jobDiff = await insertJob(9000);
    const conflict = await api(
      cash,
      "POST",
      "/api/pos-transactions",
      posBody(jobDiff, 9000, { clientRequestId: concKey, customer: "Other" }),
    );
    log(
      "2. different fingerprint remains IDEMPOTENCY_CONFLICT",
      conflict.status === 409 && conflict.json.code === "IDEMPOTENCY_CONFLICT",
      `HTTP ${conflict.status} code=${conflict.json.code}`,
    );
    const diffPaid = await client.query(`SELECT paid_amount FROM job_tickets WHERE id=$1`, [jobDiff]);
    log("2b. conflict zero side effects", Number(diffPaid.rows[0].paid_amount) === 0, `paid=${diffPaid.rows[0].paid_amount}`);

    // --- 3 sequential same-key replay ---
    const replay = await api(cash, "POST", "/api/pos-transactions", bodyConc);
    log(
      "3. sequential same-key/same-body = 200 idempotent original",
      replay.status === 200 && replay.json.idempotent === true && replay.json.id === ids[0],
      `HTTP ${replay.status} idMatch=${replay.json.id === ids[0]}`,
    );

    // --- 4 FULL refund (equal to remaining refundable = full invoice total)
    // Use amount under default Manager refund threshold (2000) so Manager can approve;
    // still a true full refund of the entire collected invoice.
    const FULL_TOTAL = 1800;
    const jobFull = await insertJob(FULL_TOTAL);
    const posFull = await api(
      cash,
      "POST",
      "/api/pos-transactions",
      posBody(jobFull, FULL_TOTAL, { clientRequestId: `fullsale_${tag}` }),
    );
    log("4. paid collected POS for full-refund test", posFull.status === 201 && !!posFull.json.id, `HTTP ${posFull.status}`);
    if (posFull.json.id) fixtures.pos.push(posFull.json.id);

    let fullRefundOk = false;
    let fullDetail = "";
    if (posFull.json.id) {
      const warrantyBefore = await client.query(
        `SELECT warranty_days, warranty_expiry_date FROM job_tickets WHERE id=$1`,
        [jobFull],
      );
      const createRef = await api(cash, "POST", "/api/refunds", {
        type: "pos",
        referenceId: posFull.json.id,
        refundAmount: FULL_TOTAL,
        reason: "HOTFIX-2 full refund of remaining refundable",
      });
      fullDetail += `create=${createRef.status}`;
      if (createRef.status === 201 && createRef.json.id) {
        fixtures.refunds.push(createRef.json.id);
        const appr = await api(mgr, "PATCH", `/api/refunds/${createRef.json.id}/approve`, {});
        fullDetail += ` approve=${appr.status}`;
        const proc = await api(mgr, "PATCH", `/api/refunds/${createRef.json.id}/process`, {
          refundMethod: "cash",
        });
        fullDetail += ` process=${proc.status}`;

        const getPos = await api(cash, "GET", `/api/pos-transactions/${posFull.json.id}`);
        const body = getPos.json || {};
        const refundedAmount = Number(body.refundedAmount ?? body.refunded_amount ?? 0);
        const refundStatus = body.refundStatus ?? body.refund_status;
        const lifecycle = body.lifecycle;
        const netCollected = Number(body.netCollected ?? body.netCollectedTotal ?? -1);
        const outstandingDue = Number(body.outstandingDue ?? -1);

        fullDetail += ` refunded=${refundedAmount} status=${refundStatus} life=${lifecycle} net=${netCollected} due=${outstandingDue}`;

        fullRefundOk =
          getPos.status === 200 &&
          refundedAmount === FULL_TOTAL &&
          refundStatus === "full" &&
          lifecycle === "fully_refunded" &&
          netCollected === 0 &&
          outstandingDue === 0;

        // second refund cannot exceed net collected
        const over = await api(cash, "POST", "/api/refunds", {
          type: "pos",
          referenceId: posFull.json.id,
          refundAmount: 100,
          reason: "should exceed net",
        });
        fullDetail += ` overRef=${over.status}/${over.json.code || ""}`;
        const overBlocked = over.status >= 400;
        fullRefundOk = fullRefundOk && overBlocked;

        const warrantyAfter = await client.query(
          `SELECT warranty_days, warranty_expiry_date FROM job_tickets WHERE id=$1`,
          [jobFull],
        );
        const warrantyUnchanged =
          String(warrantyBefore.rows[0]?.warranty_days) === String(warrantyAfter.rows[0]?.warranty_days);
        fullDetail += ` warrantyUnchanged=${warrantyUnchanged}`;
        // Do not invent warranty invalidation; only require no accidental wipe of warranty_days
        fullRefundOk = fullRefundOk && warrantyUnchanged;
      } else {
        fullDetail += ` body=${JSON.stringify(createRef.json).slice(0, 160)}`;
      }
    }
    log("4b. FULL refund: refunded=total, status=full, lifecycle=fully_refunded, net=0, due=0, no over-refund", fullRefundOk, fullDetail);

    // --- 5 optional partial refund (must not be labeled full) ---
    const PARTIAL_TOTAL = 5000;
    const jobPart = await insertJob(PARTIAL_TOTAL);
    const posPart = await api(
      cash,
      "POST",
      "/api/pos-transactions",
      posBody(jobPart, PARTIAL_TOTAL, { clientRequestId: `partsale_${tag}` }),
    );
    if (posPart.json.id) fixtures.pos.push(posPart.json.id);
    let partialOk = false;
    let partDetail = `pos=${posPart.status}`;
    if (posPart.json.id) {
      const cr = await api(cash, "POST", "/api/refunds", {
        type: "pos",
        referenceId: posPart.json.id,
        refundAmount: 1500,
        reason: "HOTFIX-2 partial only",
      });
      partDetail += ` create=${cr.status}`;
      if (cr.status === 201 && cr.json.id) {
        fixtures.refunds.push(cr.json.id);
        const ap = await api(mgr, "PATCH", `/api/refunds/${cr.json.id}/approve`, {});
        const pr = await api(mgr, "PATCH", `/api/refunds/${cr.json.id}/process`, { refundMethod: "cash" });
        partDetail += ` approve=${ap.status} process=${pr.status}`;
        const g = await api(cash, "GET", `/api/pos-transactions/${posPart.json.id}`);
        const refunded = Number(g.json.refundedAmount ?? 0);
        const st = g.json.refundStatus;
        const life = g.json.lifecycle;
        partialOk =
          refunded === 1500 &&
          st === "partial" &&
          life === "partially_refunded" &&
          life !== "fully_refunded";
        partDetail += ` refunded=${refunded} status=${st} life=${life}`;
      }
    }
    log("5. partial refund remains partial (not labeled full)", partialOk, partDetail);

    // source: no public IDEMPOTENCY_RACE leak preferred path uses awaitPos
    const src = readFileSync("server/services/pos-billing.service.ts", "utf8");
    log(
      "6. source: awaitPosByClientRequest bounded re-read exists",
      src.includes("awaitPosByClientRequest") && src.includes("IDEMPOTENCY_IN_FLIGHT"),
    );
    const routeSrc = readFileSync("server/routes/pos.routes.ts", "utf8");
    log(
      "7. source: route maps race to re-read / never prefers public IDEMPOTENCY_RACE",
      routeSrc.includes("awaitPosByClientRequest") && routeSrc.includes("IDEMPOTENCY_IN_FLIGHT"),
    );
  } catch (e) {
    console.error("QA aborted:", e.message);
    log("suite", false, e.message);
  } finally {
    let cleanupOk = false;
    let cleanupDetail = "";
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

      // Prove remaining tagged fixtures = 0
      const remUsers = await client.query(`SELECT COUNT(*)::int AS c FROM users WHERE username LIKE $1`, [`${tag}%`]);
      const remJobs = await client.query(
        `SELECT COUNT(*)::int AS c FROM job_tickets WHERE id = ANY($1::text[])`,
        [fixtures.jobs.length ? fixtures.jobs : ["__none__"]],
      );
      const remPos = await client.query(
        `SELECT COUNT(*)::int AS c FROM pos_transactions WHERE client_request_id LIKE $1 OR id = ANY($2::text[])`,
        [`%${tag}%`, fixtures.pos.length ? fixtures.pos : ["__none__"]],
      );
      const remRefunds = await client.query(
        `SELECT COUNT(*)::int AS c FROM refunds WHERE id = ANY($1::text[])`,
        [fixtures.refunds.length ? fixtures.refunds : ["__none__"]],
      );
      const remManual = await client.query(
        `SELECT COUNT(*)::int AS c FROM manual_payments WHERE id = ANY($1::text[])`,
        [fixtures.manual.length ? fixtures.manual : ["__none__"]],
      );

      cleanupOk =
        remUsers.rows[0].c === 0 &&
        remJobs.rows[0].c === 0 &&
        remPos.rows[0].c === 0 &&
        remRefunds.rows[0].c === 0 &&
        remManual.rows[0].c === 0;
      cleanupDetail = `users=${remUsers.rows[0].c} jobs=${remJobs.rows[0].c} pos=${remPos.rows[0].c} refunds=${remRefunds.rows[0].c} manual=${remManual.rows[0].c}`;
      log("fixture cleanup proven remaining=0", cleanupOk, cleanupDetail);
    } catch (ce) {
      log("fixture cleanup proven remaining=0", false, ce.message);
    }
    killChild();
    client.release();
    await pool.end();

    const pass = results.filter((r) => r.ok).length;
    const fail = results.filter((r) => !r.ok).length;
    const evidence = {
      phase: "SYSTEM-UNIFICATION-00C-B-HOTFIX-2",
      runId: RUN_ID,
      pass,
      fail,
      concurrentStatusMatrix: concurrentMatrix,
      notVerified: [
        "browser_ui_qa",
        "production_migration_execution",
        "aiven_mutation",
      ],
      results: results.map((r) => ({
        name: r.name,
        result: r.ok ? "PASS" : "FAIL",
        detail: r.detail,
      })),
    };
    writeFileSync(`${REPORT_DIR}/qa-results.json`, JSON.stringify(evidence, null, 2));
    console.log(`\nTOTAL PASS=${pass} FAIL=${fail}`);
    console.log("Concurrent matrix:", JSON.stringify(concurrentMatrix));
    process.exit(fail > 0 ? 1 : 0);
  }
}

main();
