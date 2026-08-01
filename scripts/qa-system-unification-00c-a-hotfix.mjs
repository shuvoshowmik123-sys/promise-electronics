/**
 * SYSTEM-UNIFICATION-00C-A-HOTFIX QA
 * Local/Neon only. Never Aiven.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";
import pg from "pg";
import bcrypt from "bcryptjs";

const BASE = process.env.QA_BASE || "http://127.0.0.1:5092";
const REPORT_DIR = `mobile-qa/system-unification-00c-a-hotfix/${process.env.QA_RUN_FOLDER || "live"}`;

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
  console.error("FAIL: refusing Aiven/production");
  process.exit(1);
}

const results = [];
function log(name, ok, detail = "") {
  results.push({ name, ok, detail: String(detail).slice(0, 400) });
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
  if (!res.ok) throw new Error(`admin login ${username}: ${res.status}`);
  let cookies = cookieJar(res);
  const csrfRes = await fetch(`${BASE}/api/admin/csrf-token`, { headers: { Cookie: cookies } });
  cookies = mergeCookies(cookies, csrfRes);
  const csrfBody = await csrfRes.json().catch(() => ({}));
  const csrf = csrfBody.csrfToken || csrfFromCookies(cookies) || "";
  if (!csrf) throw new Error("no admin CSRF");
  return { cookies, csrf };
}

async function loginCustomer(phone, password) {
  const res = await fetch(`${BASE}/api/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`customer login: ${res.status} ${JSON.stringify(body)}`);
  const cookies = cookieJar(res);
  const csrf = body.csrfToken || csrfFromCookies(cookies) || "";
  if (!csrf) throw new Error("no customer CSRF");
  return { cookies, csrf, user: body };
}

async function api(session, method, path, body, { useCsrf = true } = {}) {
  const headers = { "Content-Type": "application/json", Cookie: session.cookies || "" };
  if (useCsrf && session.csrf) headers["X-CSRF-TOKEN"] = session.csrf;
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

const fixtures = { users: [], srs: [], jobs: [], acceptances: [] };

async function main() {
  console.log("00C-A-HOTFIX QA", BASE);
  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const tag = `hf00ca_${Date.now().toString(36)}`;
  const hash = await bcrypt.hash("Hf00cA!99", 10);

  try {
    const health = await fetch(`${BASE}/health`).then((r) => r.status).catch(() => 0);
    log("server health", health === 200, `HTTP ${health}`);
    if (health !== 200) throw new Error("server down");

    // Ensure migration table exists (server should create it)
    await client.query(`
      CREATE TABLE IF NOT EXISTS retail_quote_admin_acceptances (
        id TEXT PRIMARY KEY,
        service_request_id TEXT NOT NULL,
        admin_user_id TEXT NOT NULL,
        admin_name TEXT,
        confirmation_note TEXT NOT NULL,
        accepted_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    const ownerId = randomUUID();
    const ownerPhone = `017${String(Date.now()).slice(-8)}`;
    const techId = randomUUID();
    const techUser = `${tag}_tech`;
    const quoteStaffId = randomUUID();
    const quoteStaffUser = `${tag}_qstaff`;
    const convertOnlyId = randomUUID();
    const convertOnlyUser = `${tag}_conv`;
    const bareAdminId = randomUUID();
    const bareAdminUser = `${tag}_bare`;

    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions, phone)
       VALUES ($1,$2,'HF Owner',$3,'Customer','Active','{}',$4)`,
      [ownerId, ownerPhone, hash, ownerPhone],
    );
    fixtures.users.push(ownerId);

    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions)
       VALUES ($1,$2,'HF Tech',$3,'Technician','Active',$4)`,
      [techId, techUser, hash, JSON.stringify({ jobs: true, "jobs.view": true, "jobs.reportOutcome": true })],
    );
    fixtures.users.push(techId);

    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions)
       VALUES ($1,$2,'HF Quote Staff',$3,'Manager','Active',$4)`,
      [
        quoteStaffId,
        quoteStaffUser,
        hash,
        JSON.stringify({
          "serviceRequests.view": true,
          "serviceRequests.quote": true,
          "serviceRequests.convertToJob": true,
          "jobs.create": true,
          "jobs.view": true,
        }),
      ],
    );
    fixtures.users.push(quoteStaffId);

    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions)
       VALUES ($1,$2,'HF Convert Only',$3,'Manager','Active',$4)`,
      [
        convertOnlyId,
        convertOnlyUser,
        hash,
        JSON.stringify({
          "serviceRequests.view": true,
          "serviceRequests.convertToJob": true,
          // missing jobs.create
        }),
      ],
    );
    fixtures.users.push(convertOnlyId);

    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions)
       VALUES ($1,$2,'HF Bare Admin',$3,'Manager','Active',$4)`,
      [bareAdminId, bareAdminUser, hash, JSON.stringify({ dashboard: true, "dashboard.view": true })],
    );
    fixtures.users.push(bareAdminId);

    const tech = await loginAdmin(techUser, "Hf00cA!99");
    const qstaff = await loginAdmin(quoteStaffUser, "Hf00cA!99");
    const convOnly = await loginAdmin(convertOnlyUser, "Hf00cA!99");
    const bare = await loginAdmin(bareAdminUser, "Hf00cA!99");
    const owner = await loginCustomer(ownerPhone, "Hf00cA!99");

    async function insertQuoteSr(suffix, extra = {}) {
      const id = randomUUID();
      await client.query(
        `INSERT INTO service_requests (
          id, ticket_number, customer_id, brand, primary_issue, customer_name, phone,
          status, tracking_status, is_quote, request_intent, quote_status, stage, created_at
        ) VALUES ($1,$2,$3,'Samsung','No power',$4,$5,'Pending','Request Received',true,'quote','pending_price','intake',NOW())`,
        [id, `SRV-HF-${suffix}`, extra.customerId ?? ownerId, "HF Owner", ownerPhone],
      );
      fixtures.srs.push(id);
      return id;
    }

    async function insertNormalSr(suffix) {
      const id = randomUUID();
      await client.query(
        `INSERT INTO service_requests (
          id, ticket_number, customer_id, brand, primary_issue, customer_name, phone,
          status, tracking_status, is_quote, request_intent, quote_status, quote_amount, stage, created_at
        ) VALUES ($1,$2,$3,'LG','Lines',$4,$5,'Pending','Request Received',false,null,null,null,'intake',NOW())`,
        [id, `SRV-HF-N-${suffix}`, ownerId, "HF Owner", ownerPhone],
      );
      fixtures.srs.push(id);
      return id;
    }

    // --- 1 tech without quote perm cannot admin accept/decline ---
    const sr1 = await insertQuoteSr(`${tag}1`);
    await api(qstaff, "PATCH", `/api/admin/quotes/${sr1}/price`, { quoteAmount: 1000, quoteValidDays: 7 });
    const tAcc = await api(tech, "PATCH", `/api/admin/service-requests/${sr1}/quote-response`, {
      response: "accepted",
      confirmationNote: "should fail no perm",
    });
    const tDec = await api(tech, "PATCH", `/api/admin/service-requests/${sr1}/quote-response`, {
      response: "rejected",
    });
    const st1 = await client.query(`SELECT quote_status FROM service_requests WHERE id=$1`, [sr1]);
    log(
      "1. no serviceRequests.quote → admin accept/decline 403",
      tAcc.status === 403 && tDec.status === 403 && st1.rows[0].quote_status === "sent",
      `accept=${tAcc.status} decline=${tDec.status} db=${st1.rows[0].quote_status}`,
    );

    // --- 2 customer quote-response without CSRF ---
    const noCsrf = await api({ cookies: owner.cookies, csrf: "" }, "PATCH", `/api/service-requests/${sr1}/quote-response`, {
      response: "accepted",
    }, { useCsrf: false });
    const st2 = await client.query(`SELECT quote_status FROM service_requests WHERE id=$1`, [sr1]);
    log(
      "2. customer quote-response without CSRF → 403 unchanged",
      noCsrf.status === 403 && st2.rows[0].quote_status === "sent",
      `HTTP ${noCsrf.status} db=${st2.rows[0].quote_status}`,
    );

    // --- 3 password change invalidates session ---
    // Session stamped passwordChangedAtStamp=0 at login; setting password_changed_at changes live stamp
    await client.query(`UPDATE users SET password_changed_at = NOW() WHERE id=$1`, [ownerId]);
    const pcaCheck = await client.query(`SELECT password_changed_at IS NOT NULL AS has_pca FROM users WHERE id=$1`, [
      ownerId,
    ]);
    const st3before = await client.query(`SELECT quote_status FROM service_requests WHERE id=$1`, [sr1]);
    const stale = await api(owner, "PATCH", `/api/service-requests/${sr1}/quote-response`, { response: "accepted" });
    const st3 = await client.query(`SELECT quote_status FROM service_requests WHERE id=$1`, [sr1]);
    log(
      "3. password change → customer 401, status unchanged",
      pcaCheck.rows[0]?.has_pca === true &&
        (stale.status === 401 || stale.json.code === "SESSION_REVOKED") &&
        st3.rows[0].quote_status === st3before.rows[0].quote_status,
      `HTTP ${stale.status} code=${stale.json.code} db=${st3.rows[0].quote_status} hasPca=${pcaCheck.rows[0]?.has_pca}`,
    );
    // Clear for later owner tests
    await client.query(`UPDATE users SET password_changed_at = NULL WHERE id=$1`, [ownerId]);
    const owner2 = await loginCustomer(ownerPhone, "Hf00cA!99");

    // --- 4 real owner with CSRF accept ---
    const acc4 = await api(owner2, "PATCH", `/api/service-requests/${sr1}/quote-response`, { response: "accepted" });
    log(
      "4. owner CSRF accept succeeds",
      acc4.status === 200 && acc4.json.canonicalQuoteStatus === "accepted",
      `HTTP ${acc4.status} state=${acc4.json.canonicalQuoteStatus}`,
    );

    // --- 5 admin with quote perm + note ---
    const sr5 = await insertQuoteSr(`${tag}5`);
    await api(qstaff, "PATCH", `/api/admin/quotes/${sr5}/price`, { quoteAmount: 2200, quoteValidDays: 7 });
    const secretNote = `QA contact note ${tag} unique-secret-phrase`;
    const acc5 = await api(qstaff, "PATCH", `/api/admin/service-requests/${sr5}/quote-response`, {
      response: "accepted",
      confirmationNote: secretNote,
    });
    log(
      "5. admin accept with note succeeds",
      acc5.status === 200 && acc5.json.canonicalQuoteStatus === "accepted",
      `HTTP ${acc5.status}`,
    );

    // --- 6 admin-only read has note ---
    const adminRead = await api(qstaff, "GET", `/api/admin/service-requests/${sr5}/quote-admin-acceptances`);
    const hasNote =
      adminRead.status === 200 &&
      Array.isArray(adminRead.json.items) &&
      adminRead.json.items.some((r) => r.confirmationNote === secretNote);
    log("6. confirmation note on admin-only path", hasNote, `HTTP ${adminRead.status} n=${adminRead.json.items?.length}`);

    // --- 7 note absent from customer detail/track ---
    const ticket5 = (await client.query(`SELECT ticket_number FROM service_requests WHERE id=$1`, [sr5])).rows[0]
      .ticket_number;
    const custDetail = await api(owner2, "GET", `/api/customer/service-requests/${sr5}`);
    const custTrack = await api(owner2, "GET", `/api/customer/track/${ticket5}`);
    const detailLeak = JSON.stringify(custDetail.json).includes(secretNote);
    const trackLeak = JSON.stringify(custTrack.json).includes(secretNote);
    const timelineOk = (custDetail.json.timeline || []).every(
      (e) => !/unique-secret-phrase/i.test(e.message || "") && !/Note:\s*/i.test(e.message || ""),
    );
    log(
      "7. note absent from customer detail/track",
      !detailLeak && !trackLeak && timelineOk && custDetail.status === 200,
      `detailLeak=${detailLeak} trackLeak=${trackLeak}`,
    );

    // --- 8 normal SR price/send 400 ---
    const normalId = await insertNormalSr(`${tag}n`);
    const beforeN = await client.query(
      `SELECT is_quote, quote_status, quote_amount, request_intent FROM service_requests WHERE id=$1`,
      [normalId],
    );
    const priceN = await api(qstaff, "PATCH", `/api/admin/quotes/${normalId}/price`, { quoteAmount: 999 });
    const sendN = await api(qstaff, "POST", `/api/admin/service-requests/${normalId}/send-quote`, {
      quoteAmount: 999,
    });
    const afterN = await client.query(
      `SELECT is_quote, quote_status, quote_amount, request_intent FROM service_requests WHERE id=$1`,
      [normalId],
    );
    const unchanged =
      JSON.stringify(beforeN.rows[0]) === JSON.stringify(afterN.rows[0]);
    log(
      "8. normal SR NOT_QUOTE_REQUEST unchanged",
      priceN.status === 400 &&
        priceN.json.code === "NOT_QUOTE_REQUEST" &&
        sendN.status === 400 &&
        sendN.json.code === "NOT_QUOTE_REQUEST" &&
        unchanged,
      `price=${priceN.status} send=${sendN.status} unchanged=${unchanged}`,
    );

    // --- 9 quote verify-and-convert cannot bypass ---
    const sr9 = await insertQuoteSr(`${tag}9`);
    await api(qstaff, "PATCH", `/api/admin/quotes/${sr9}/price`, { quoteAmount: 3000, quoteValidDays: 7 });
    // unaccepted
    const vac9 = await api(qstaff, "POST", `/api/admin/service-requests/${sr9}/verify-and-convert`, {
      verificationNotes: "bypass attempt",
    });
    const jobs9 = await client.query(`SELECT COUNT(*)::int AS c FROM job_tickets WHERE parent_job_id=$1`, [sr9]);
    log(
      "9. verify-and-convert blocked for quotes",
      vac9.status === 409 && vac9.json.code === "USE_RETAIL_QUOTE_CONVERT" && jobs9.rows[0].c === 0,
      `HTTP ${vac9.status} code=${vac9.json.code} jobs=${jobs9.rows[0].c}`,
    );

    // --- 10 convert needs convert + jobs.create ---
    const sr10 = await insertQuoteSr(`${tag}10`);
    await api(qstaff, "PATCH", `/api/admin/quotes/${sr10}/price`, { quoteAmount: 4000, quoteValidDays: 7 });
    await api(owner2, "POST", `/api/quotes/${sr10}/accept`, { servicePreference: "service_center" });
    const badConv = await api(convOnly, "POST", `/api/quotes/${sr10}/convert`, {});
    const goodConv = await api(qstaff, "POST", `/api/quotes/${sr10}/convert`, {});
    if (goodConv.json.jobId) fixtures.jobs.push(goodConv.json.jobId);
    log(
      "10. convert requires convertToJob + jobs.create",
      badConv.status === 403 && (goodConv.status === 201 || goodConv.status === 200) && goodConv.json.jobId,
      `noCreate=${badConv.status} ok=${goodConv.status} job=${goodConv.json.jobId}`,
    );

    // --- 11 quote list rejects bare admin ---
    const listBare = await api(bare, "GET", `/api/admin/quotes`);
    const listOk = await api(qstaff, "GET", `/api/admin/quotes`);
    log(
      "11. quote list permission",
      listBare.status === 403 && listOk.status === 200 && Array.isArray(listOk.json),
      `bare=${listBare.status} ok=${listOk.status}`,
    );

    // --- 12 regression: owner accept, accepted-before-expiry, revise, concurrent ---
    const sr12a = await insertQuoteSr(`${tag}12a`);
    await api(qstaff, "PATCH", `/api/admin/quotes/${sr12a}/price`, { quoteAmount: 5500, quoteValidDays: 7 });
    const a12 = await api(owner2, "POST", `/api/quotes/${sr12a}/accept`, { servicePreference: "service_center" });
    await client.query(`UPDATE service_requests SET quote_expires_at = NOW() - INTERVAL '2 days' WHERE id=$1`, [sr12a]);
    const c12 = await api(qstaff, "POST", `/api/quotes/${sr12a}/convert`, {});
    if (c12.json.jobId) fixtures.jobs.push(c12.json.jobId);
    log(
      "12a. owner accept + convert after expiry",
      a12.status === 200 && (c12.status === 201 || c12.status === 200) && Number(c12.json.estimatedCost) === 5500,
      `accept=${a12.status} conv=${c12.status}`,
    );

    const sr12b = await insertQuoteSr(`${tag}12b`);
    await api(qstaff, "PATCH", `/api/admin/quotes/${sr12b}/price`, { quoteAmount: 1000, quoteValidDays: 7 });
    await api(owner2, "POST", `/api/quotes/${sr12b}/accept`, { servicePreference: "service_center" });
    await api(qstaff, "PATCH", `/api/admin/quotes/${sr12b}/price`, { quoteAmount: 1500, quoteValidDays: 7 });
    const mid = await api(qstaff, "POST", `/api/quotes/${sr12b}/convert`, {});
    await api(owner2, "POST", `/api/quotes/${sr12b}/accept`, { servicePreference: "service_center" });
    const after = await api(qstaff, "POST", `/api/quotes/${sr12b}/convert`, {});
    if (after.json.jobId) fixtures.jobs.push(after.json.jobId);
    log(
      "12b. revision blocks until re-accept",
      mid.status === 409 && (after.status === 201 || after.status === 200) && Number(after.json.estimatedCost) === 1500,
      `mid=${mid.status} after=${after.status}`,
    );

    const sr12c = await insertQuoteSr(`${tag}12c`);
    await api(qstaff, "PATCH", `/api/admin/quotes/${sr12c}/price`, { quoteAmount: 777, quoteValidDays: 7 });
    await api(owner2, "POST", `/api/quotes/${sr12c}/accept`, { servicePreference: "service_center" });
    const [x, y] = await Promise.all([
      api(qstaff, "POST", `/api/quotes/${sr12c}/convert`, {}),
      api(qstaff, "POST", `/api/quotes/${sr12c}/convert`, {}),
    ]);
    const jobIds = [x.json.jobId, y.json.jobId].filter(Boolean);
    const uniq = new Set(jobIds);
    const cnt = await client.query(`SELECT COUNT(*)::int AS c FROM job_tickets WHERE parent_job_id=$1`, [sr12c]);
    for (const j of uniq) fixtures.jobs.push(j);
    log(
      "12c. concurrent conversion one job",
      uniq.size === 1 && cnt.rows[0].c === 1,
      `jobs=${[...uniq]} db=${cnt.rows[0].c}`,
    );

    // Admin cannot use customer route as silent admin elev
    const adminOnCust = await api(qstaff, "PATCH", `/api/service-requests/${sr5}/quote-response`, {
      response: "accepted",
      confirmationNote: "should not work via customer route",
    });
    log(
      "extra. admin session on customer quote-response rejected",
      adminOnCust.status === 401 || adminOnCust.status === 403,
      `HTTP ${adminOnCust.status}`,
    );
  } catch (e) {
    console.error("QA aborted:", e);
    log("suite", false, e.message);
  } finally {
    try {
      for (const j of fixtures.jobs) {
        await client.query(`DELETE FROM job_tickets WHERE id=$1`, [j]).catch(() => {});
      }
      for (const s of fixtures.srs) {
        await client.query(`DELETE FROM retail_quote_admin_acceptances WHERE service_request_id=$1`, [s]).catch(() => {});
        await client.query(`DELETE FROM service_request_events WHERE service_request_id=$1`, [s]).catch(() => {});
        await client.query(`DELETE FROM service_requests WHERE id=$1`, [s]).catch(() => {});
      }
      for (const u of fixtures.users) {
        await client.query(`DELETE FROM users WHERE id=$1`, [u]).catch(() => {});
      }
      const leftSr = await client.query(
        `SELECT COUNT(*)::int AS c FROM service_requests WHERE ticket_number LIKE 'SRV-HF-%' OR ticket_number LIKE 'SRV-HF-N-%'`,
      );
      log(
        "fixture cleanup",
        leftSr.rows[0].c === 0,
        `remaining HF tickets=${leftSr.rows[0].c} cleaned users=${fixtures.users.length}`,
      );
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
    writeFileSync(`${REPORT_DIR}/qa-results.json`, JSON.stringify({ pass, fail, results }, null, 2));
  } catch (_) {}
  process.exit(fail > 0 ? 1 : 0);
}

main();
