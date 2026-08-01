/**
 * SYSTEM-UNIFICATION-00C-A QA — Retail Quote Contract
 * Local/Neon only. Never Aiven.
 * Usage: node scripts/qa-system-unification-00c-a.mjs
 * Env: QA_BASE (default http://127.0.0.1:5091), DATABASE_URL from .env
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";
import pg from "pg";
import bcrypt from "bcryptjs";

const BASE = process.env.QA_BASE || "http://127.0.0.1:5091";
const RUN_ID = process.env.QA_RUN_ID || new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const REPORT_DIR = `mobile-qa/system-unification-00c-a/${process.env.QA_RUN_FOLDER || "live"}`;

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
if (!DATABASE_URL) {
  console.error("FAIL: DATABASE_URL not set");
  process.exit(1);
}
if (/aiven/i.test(DATABASE_URL)) {
  console.error("FAIL: refusing Aiven/production URL");
  process.exit(1);
}

const results = [];
function log(name, ok, detail = "") {
  results.push({ name, ok, detail: String(detail).slice(0, 500) });
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

function csrfFromCookies(cookies) {
  const m = /XSRF-TOKEN=([^;]+)/.exec(cookies);
  return m ? decodeURIComponent(m[1]) : "";
}

async function loginAdmin(username, password) {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`admin login ${username}: ${res.status} ${JSON.stringify(body)}`);
  let cookies = cookieJar(res);
  const csrfRes = await fetch(`${BASE}/api/admin/csrf-token`, { headers: { Cookie: cookies } });
  cookies = mergeCookies(cookies, csrfRes);
  const csrfBody = await csrfRes.json().catch(() => ({}));
  const csrf = csrfBody.csrfToken || csrfFromCookies(cookies) || "";
  if (!csrf) throw new Error("no CSRF");
  return { cookies, csrf, user: body.user || body };
}

async function loginCustomer(phone, password) {
  const res = await fetch(`${BASE}/api/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`customer login: ${res.status} ${JSON.stringify(body)}`);
  let cookies = cookieJar(res);
  const csrf = body.csrfToken || csrfFromCookies(cookies) || "";
  if (!csrf) throw new Error("customer login: no CSRF token");
  return { cookies, csrf, user: body };
}

async function api(session, method, path, body, { csrf = true } = {}) {
  const headers = { "Content-Type": "application/json", Cookie: session.cookies || "" };
  if (csrf && session.csrf) headers["X-CSRF-TOKEN"] = session.csrf;
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
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

const fixtureIds = { users: [], srs: [], jobs: [], quotations: [] };

async function main() {
  console.log("00C-A Retail Quote QA against", BASE);
  console.log("DB:", DATABASE_URL.replace(/:[^:@/]+@/, ":***@").slice(0, 100));

  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const tag = `qa00ca_${Date.now().toString(36)}`;

  try {
    // Health
    const health = await fetch(`${BASE}/health`).then((r) => r.status).catch(() => 0);
    if (health !== 200) {
      log("server health", false, `status ${health}`);
      throw new Error("Server not healthy");
    }
    log("server health", true);

    const hash = await bcrypt.hash("Qa00cA!99", 10);
    const ownerId = randomUUID();
    const otherId = randomUUID();
    const staffId = randomUUID();
    const staffUser = `${tag}_staff`;
    const ownerPhone = `017${String(Date.now()).slice(-8)}`;
    const otherPhone = `018${String(Date.now()).slice(-8)}`;

    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions, phone)
       VALUES ($1,$2,'QA Owner',$3,'Customer','Active','{}',$4)`,
      [ownerId, ownerPhone, hash, ownerPhone],
    );
    fixtureIds.users.push(ownerId);
    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions, phone)
       VALUES ($1,$2,'QA Other',$3,'Customer','Active','{}',$4)`,
      [otherId, otherPhone, hash, otherPhone],
    );
    fixtureIds.users.push(otherId);
    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions)
       VALUES ($1,$2,'QA Quote Staff',$3,'Manager','Active',$4)`,
      [
        staffId,
        staffUser,
        hash,
        JSON.stringify({
          serviceRequests: true,
          "serviceRequests.view": true,
          "serviceRequests.quote": true,
          "serviceRequests.convertToJob": true,
          "serviceRequests.edit": true,
          jobs: true,
          "jobs.view": true,
          "jobs.create": true,
        }),
      ],
    );
    fixtureIds.users.push(staffId);

    const staff = await loginAdmin(staffUser, "Qa00cA!99");
    const owner = await loginCustomer(ownerPhone, "Qa00cA!99");
    const other = await loginCustomer(otherPhone, "Qa00cA!99");

    // Insufficient permission user
    const noPermId = randomUUID();
    const noPermUser = `${tag}_noperm`;
    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions)
       VALUES ($1,$2,'QA NoPerm',$3,'Technician','Active',$4)`,
      [noPermId, noPermUser, hash, JSON.stringify({ jobs: true, "jobs.view": true })],
    );
    fixtureIds.users.push(noPermId);

    // Create quote SRs via DB for controlled states
    async function insertSr(suffix, extra = {}) {
      const id = randomUUID();
      const ticket = `SRV-QA00CA-${suffix}`;
      await client.query(
        `INSERT INTO service_requests (
          id, ticket_number, customer_id, brand, primary_issue, customer_name, phone,
          status, tracking_status, is_quote, request_intent, quote_status, stage, created_at
        ) VALUES ($1,$2,$3,'Samsung','No power',$4,$5,'Pending','Request Received',true,'quote','pending_price','intake',NOW())`,
        [id, ticket, extra.customerId ?? ownerId, extra.name || "QA Owner", extra.phone || ownerPhone],
      );
      fixtureIds.srs.push(id);
      return id;
    }

    // --- 1 send/price ---
    const sr1 = await insertSr(`${tag}1`);
    const price1 = await api(staff, "PATCH", `/api/admin/quotes/${sr1}/price`, {
      quoteAmount: 4500,
      quoteNotes: "Panel check",
      quoteValidDays: 7,
    });
    log(
      "1. quote send/price",
      price1.status === 200 &&
        Number(price1.json.quoteAmount) === 4500 &&
        (price1.json.canonicalQuoteStatus === "sent" || price1.json.quoteStatus === "sent"),
      `HTTP ${price1.status} amount=${price1.json.quoteAmount} state=${price1.json.canonicalQuoteStatus}`,
    );
    const db1 = await client.query(`SELECT quote_amount, quote_status, status FROM service_requests WHERE id=$1`, [sr1]);
    log(
      "1b. DB price snapshot",
      Number(db1.rows[0]?.quote_amount) === 4500 && String(db1.rows[0]?.quote_status).toLowerCase() === "sent",
      JSON.stringify(db1.rows[0]),
    );

    // --- 2 owner accept ---
    const acc2 = await api(owner, "POST", `/api/quotes/${sr1}/accept`, {
      servicePreference: "service_center",
    });
    log(
      "2. owner customer acceptance",
      acc2.status === 200 &&
        (acc2.json.canonicalQuoteStatus === "accepted" || acc2.json.quoteStatus === "accepted"),
      `HTTP ${acc2.status} state=${acc2.json.canonicalQuoteStatus}`,
    );

    // --- 3 other customer reject ---
    const sr3 = await insertSr(`${tag}3`);
    await api(staff, "PATCH", `/api/admin/quotes/${sr3}/price`, { quoteAmount: 1000, quoteValidDays: 7 });
    const acc3 = await api(other, "POST", `/api/quotes/${sr3}/accept`, {
      servicePreference: "service_center",
    });
    log(
      "3. other customer rejection",
      acc3.status === 403 && acc3.json.code === "NOT_OWNER",
      `HTTP ${acc3.status} code=${acc3.json.code}`,
    );

    // --- 4 admin accept missing note ---
    const sr4 = await insertSr(`${tag}4`);
    await api(staff, "PATCH", `/api/admin/quotes/${sr4}/price`, { quoteAmount: 2000, quoteValidDays: 7 });
    const acc4 = await api(staff, "PATCH", `/api/service-requests/${sr4}/quote-response`, {
      response: "accepted",
    });
    log(
      "4. admin accept missing confirmation note rejected",
      acc4.status === 400 && acc4.json.code === "CONFIRMATION_NOTE_REQUIRED",
      `HTTP ${acc4.status} code=${acc4.json.code}`,
    );

    // --- 5 admin accept with note ---
    const acc5 = await api(staff, "PATCH", `/api/service-requests/${sr4}/quote-response`, {
      response: "accepted",
      confirmationNote: "Called customer on phone; verbal accept recorded.",
    });
    log(
      "5. admin acceptance with note succeeds",
      acc5.status === 200 && acc5.json.canonicalQuoteStatus === "accepted",
      `HTTP ${acc5.status} state=${acc5.json.canonicalQuoteStatus}`,
    );

    // --- 6 expired unaccepted cannot convert ---
    const sr6 = await insertSr(`${tag}6`);
    await api(staff, "PATCH", `/api/admin/quotes/${sr6}/price`, { quoteAmount: 3000, quoteValidDays: 7 });
    await client.query(
      `UPDATE service_requests SET quote_expires_at = NOW() - INTERVAL '1 day', accepted_at = NULL WHERE id=$1`,
      [sr6],
    );
    const conv6 = await api(staff, "POST", `/api/quotes/${sr6}/convert`, {});
    log(
      "6. expired unaccepted cannot convert",
      conv6.status === 409 && (conv6.json.code === "QUOTE_EXPIRED" || /expir/i.test(conv6.json.error || "")),
      `HTTP ${conv6.status} code=${conv6.json.code}`,
    );

    // --- 7 timely accepted converts after expiry ---
    const sr7 = await insertSr(`${tag}7`);
    await api(staff, "PATCH", `/api/admin/quotes/${sr7}/price`, { quoteAmount: 5500, quoteValidDays: 7 });
    await api(owner, "POST", `/api/quotes/${sr7}/accept`, { servicePreference: "service_center" });
    await client.query(
      `UPDATE service_requests SET quote_expires_at = NOW() - INTERVAL '2 days' WHERE id=$1`,
      [sr7],
    );
    // acceptedAt still set → still accepted
    const st7 = await client.query(`SELECT quote_status, accepted_at, quote_expires_at FROM service_requests WHERE id=$1`, [sr7]);
    const conv7 = await api(staff, "POST", `/api/quotes/${sr7}/convert`, {});
    const ok7 =
      (conv7.status === 201 || conv7.status === 200) &&
      conv7.json.jobId &&
      Number(conv7.json.estimatedCost) === 5500;
    log(
      "7. timely accepted converts after expiry",
      ok7,
      `HTTP ${conv7.status} job=${conv7.json.jobId} est=${conv7.json.estimatedCost} dbAcc=${!!st7.rows[0]?.accepted_at}`,
    );
    if (conv7.json.jobId) fixtureIds.jobs.push(conv7.json.jobId);

    // --- 8 revised cannot convert until re-accepted ---
    const sr8 = await insertSr(`${tag}8`);
    await api(staff, "PATCH", `/api/admin/quotes/${sr8}/price`, { quoteAmount: 1000, quoteValidDays: 7 });
    await api(owner, "POST", `/api/quotes/${sr8}/accept`, { servicePreference: "service_center" });
    await api(staff, "PATCH", `/api/admin/quotes/${sr8}/price`, { quoteAmount: 1999, quoteValidDays: 7 });
    const conv8a = await api(staff, "POST", `/api/quotes/${sr8}/convert`, {});
    log(
      "8a. revised quote cannot convert",
      conv8a.status === 409 && conv8a.json.code === "QUOTE_NOT_ACCEPTED",
      `HTTP ${conv8a.status} code=${conv8a.json.code}`,
    );
    await api(owner, "POST", `/api/quotes/${sr8}/accept`, { servicePreference: "service_center" });
    const conv8b = await api(staff, "POST", `/api/quotes/${sr8}/convert`, {});
    log(
      "8b. re-accepted after revise converts",
      (conv8b.status === 201 || conv8b.status === 200) && Number(conv8b.json.estimatedCost) === 1999,
      `HTTP ${conv8b.status} est=${conv8b.json.estimatedCost}`,
    );
    if (conv8b.json.jobId) fixtureIds.jobs.push(conv8b.json.jobId);

    // --- 9 repeated conversion one job ---
    const again = await api(staff, "POST", `/api/quotes/${sr8}/convert`, {});
    log(
      "9. repeated conversion returns one job",
      again.status === 200 &&
        again.json.idempotent === true &&
        again.json.jobId === conv8b.json.jobId,
      `HTTP ${again.status} job=${again.json.jobId} same=${again.json.jobId === conv8b.json.jobId}`,
    );

    // --- 10 concurrent conversion ---
    const sr10 = await insertSr(`${tag}10`);
    await api(staff, "PATCH", `/api/admin/quotes/${sr10}/price`, { quoteAmount: 7777, quoteValidDays: 7 });
    await api(owner, "POST", `/api/quotes/${sr10}/accept`, { servicePreference: "service_center" });
    const [cA, cB] = await Promise.all([
      api(staff, "POST", `/api/quotes/${sr10}/convert`, {}),
      api(staff, "POST", `/api/quotes/${sr10}/convert`, {}),
    ]);
    const jobIds = [cA.json.jobId, cB.json.jobId].filter(Boolean);
    const uniqueJobs = new Set(jobIds);
    const jobCount = await client.query(`SELECT COUNT(*)::int AS c FROM job_tickets WHERE parent_job_id=$1`, [sr10]);
    log(
      "10. concurrent conversion one job only",
      uniqueJobs.size === 1 && jobCount.rows[0].c === 1 && (cA.status < 300 || cB.status < 300),
      `jobs=${[...uniqueJobs]} dbCount=${jobCount.rows[0].c} HTTP ${cA.status}/${cB.status}`,
    );
    for (const j of uniqueJobs) fixtureIds.jobs.push(j);

    // --- 11 formal quotation cannot convert ---
    const qid = randomUUID();
    const qnum = `QT-QA00CA-${tag}`;
    await client.query(
      `INSERT INTO quotations (id, quotation_number, customer_name, customer_phone, status, subtotal, total, created_by, created_by_name, created_at, updated_at)
       VALUES ($1,$2,'Formal','01700000000','Accepted',100,100,$3,'QA',NOW(),NOW())`,
      [qid, qnum, staffId],
    );
    fixtureIds.quotations.push(qid);
    const convQ = await api(staff, "POST", `/api/quotes/${qid}/convert`, {});
    // Should 404 not found as SR, not create job from quotation
    const fakeJob = await client.query(`SELECT id FROM job_tickets WHERE notes ILIKE $1 LIMIT 1`, [`%${qnum}%`]);
    log(
      "11. formal quotation cannot create/convert repair job",
      (convQ.status === 404 || convQ.status === 400 || convQ.status === 409) && fakeJob.rowCount === 0,
      `HTTP ${convQ.status} fakeJobs=${fakeJob.rowCount}`,
    );

    // --- 12 unauth + insufficient permission ---
    const unauth = await fetch(`${BASE}/api/admin/quotes/${sr1}/price`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteAmount: 1 }),
    });
    log("12a. unauthenticated price rejected", unauth.status === 401 || unauth.status === 403, `HTTP ${unauth.status}`);

    let noPerm;
    try {
      noPerm = await loginAdmin(noPermUser, "Qa00cA!99");
    } catch (e) {
      noPerm = null;
      log("12b. insufficient-permission login", false, String(e.message));
    }
    if (noPerm) {
      const badPrice = await api(noPerm, "PATCH", `/api/admin/quotes/${sr3}/price`, { quoteAmount: 9 });
      const badConv = await api(noPerm, "POST", `/api/quotes/${sr3}/convert`, {});
      log(
        "12b. insufficient-permission attempts rejected",
        (badPrice.status === 403 || badPrice.status === 401) && (badConv.status === 403 || badConv.status === 401),
        `price=${badPrice.status} convert=${badConv.status}`,
      );
    }

    // send-quote path smoke
    const srSend = await insertSr(`${tag}send`);
    const sendR = await api(staff, "POST", `/api/admin/service-requests/${srSend}/send-quote`, {
      quoteAmount: 888,
      quoteNotes: "send-quote path",
      quoteValidDays: 5,
    });
    log("extra. send-quote path", sendR.status === 200 && Number(sendR.json.quoteAmount) === 888, `HTTP ${sendR.status}`);
  } catch (e) {
    console.error("QA aborted:", e.message);
    log("suite", false, e.message);
  } finally {
    // Cleanup fixtures
    try {
      for (const j of fixtureIds.jobs) {
        await client.query(`DELETE FROM job_tickets WHERE id=$1`, [j]).catch(() => {});
      }
      for (const s of fixtureIds.srs) {
        await client.query(`DELETE FROM service_request_events WHERE service_request_id=$1`, [s]).catch(() => {});
        await client.query(`DELETE FROM service_requests WHERE id=$1`, [s]).catch(() => {});
      }
      for (const q of fixtureIds.quotations) {
        await client.query(`DELETE FROM quotation_items WHERE quotation_id=$1`, [q]).catch(() => {});
        await client.query(`DELETE FROM quotations WHERE id=$1`, [q]).catch(() => {});
      }
      for (const u of fixtureIds.users) {
        await client.query(`DELETE FROM users WHERE id=$1`, [u]).catch(() => {});
      }
      log("fixture cleanup", true, `users=${fixtureIds.users.length} srs=${fixtureIds.srs.length} jobs=${fixtureIds.jobs.length}`);
    } catch (ce) {
      log("fixture cleanup", false, ce.message);
    }
    client.release();
    await pool.end();
  }

  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\nTOTAL PASS=${pass} FAIL=${fail}`);

  try {
    mkdirSync(REPORT_DIR, { recursive: true });
    writeFileSync(
      `${REPORT_DIR}/qa-results.json`,
      JSON.stringify({ runId: RUN_ID, base: BASE, pass, fail, results }, null, 2),
    );
  } catch (_) {}

  process.exit(fail > 0 ? 1 : 0);
}

main();
