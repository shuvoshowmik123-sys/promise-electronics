/**
 * SYSTEM-UNIFICATION-00C-A-HOTFIX-2 QA — one bounded run.
 * Does NOT CREATE retail_quote_admin_acceptances (server migration must).
 * Local/Neon only. Never Aiven.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import pg from "pg";
import bcrypt from "bcryptjs";
import { pathToFileURL } from "url";
import path from "path";

const BASE = process.env.QA_BASE || "http://127.0.0.1:5093";
const REPORT_DIR = `mobile-qa/system-unification-00c-a-hotfix-2/${process.env.QA_RUN_FOLDER || "live"}`;
const PORT = process.env.QA_PORT || "5093";

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
function log(name, ok, detail = "", status = null) {
  const entry = { name, ok, detail: String(detail).slice(0, 500), status };
  if (status === "NOT_VERIFIED") entry.nv = true;
  results.push(entry);
  const tag = status === "NOT_VERIFIED" ? "NOT VERIFIED" : ok ? "PASS" : "FAIL";
  console.log(`${tag} — ${name}${detail ? `: ${detail}` : ""}`);
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
  if (!res.ok) throw new Error(`admin login failed: ${res.status}`);
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

const fixtures = { users: [], srs: [], jobs: [], events: [], schema: null };

async function waitHealth(url, ms = 180000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(`${url}/health`);
      const j = await r.json().catch(() => ({}));
      // Prefer DB ready; accept ok only after brief settle
      if (r.status === 200 && (j.db?.state === "ready" || j.status === "ok")) {
        // Give background migrations a moment after first ready
        await new Promise((x) => setTimeout(x, 3000));
        const r2 = await fetch(`${url}/health`);
        if (r2.status === 200) return true;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function main() {
  console.log("00C-A-HOTFIX-2 QA", BASE);
  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const tag = `hf2_${Date.now().toString(36)}`;
  const hash = await bcrypt.hash("Hf2Test!99", 10);
  let child = null;

  try {
    // ─── 7. Migration proof: isolated schema + same migrate function (not QA CREATE TABLE) ───
    const isoSchema = `qa_hf2_${tag.replace(/[^a-z0-9_]/gi, "").slice(0, 20)}`;
    fixtures.schema = isoSchema;
    await client.query(`DROP SCHEMA IF EXISTS ${isoSchema} CASCADE`);
    const before = await client.query(
      `SELECT COUNT(*)::int AS c FROM information_schema.tables WHERE table_schema=$1 AND table_name='retail_quote_admin_acceptances'`,
      [isoSchema],
    );
    log("7a. isolated schema table absent before migrate", before.rows[0].c === 0, `c=${before.rows[0].c}`);

    await new Promise((resolve, reject) => {
      const p = spawn("npx", ["tsx", "scripts/qa-run-isolated-rqaa-migrate.mjs", isoSchema], {
        cwd: process.cwd(),
        env: { ...process.env },
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      let err = "";
      p.stdout.on("data", (d) => (out += d));
      p.stderr.on("data", (d) => (err += d));
      p.on("close", (code) => {
        if (code === 0) resolve({ out, err });
        else reject(new Error(`migrate exit ${code}: ${err.slice(0, 400)} ${out.slice(0, 200)}`));
      });
    });

    const after = await client.query(
      `
      SELECT
        (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema=$1 AND table_name='retail_quote_admin_acceptances') AS table_ok,
        (SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname=$1 AND tablename='retail_quote_admin_acceptances') AS index_ok,
        (SELECT COUNT(*)::int FROM pg_constraint c
          JOIN pg_class rel ON rel.oid = c.conrelid
          JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
          WHERE nsp.nspname=$1 AND rel.relname='retail_quote_admin_acceptances' AND c.contype='f') AS fk_ok
      `,
      [isoSchema],
    );
    log(
      "7b. server migrate function created table+index+FK in isolated schema",
      Number(after.rows[0].table_ok) >= 1 && Number(after.rows[0].index_ok) >= 1 && Number(after.rows[0].fk_ok) >= 1,
      JSON.stringify(after.rows[0]),
    );

    // Public schema must already have table from prior startup OR will after cold start
    // Cold-start server with migrations enabled
    // HOTFIX-2A: strip-password-stamp hook only on dedicated test process
    child = spawn(
      "npx",
      ["cross-env", `PORT=${PORT}`, "tsx", "server/index.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          SKIP_STARTUP_MIGRATIONS: "false",
          NODE_ENV: "test",
          QA_SESSION_TEST_HOOK: "1",
          POS_R1H_FORCE_FAIL: "0",
        },
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let serverLog = "";
    child.stdout.on("data", (d) => {
      serverLog += d.toString();
    });
    child.stderr.on("data", (d) => {
      serverLog += d.toString();
    });

    const healthy = await waitHealth(BASE, 150000);
    log("7c. cold-start server health", healthy, healthy ? "ok" : "timeout");

    const pub = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='retail_quote_admin_acceptances') AS table_ok,
        (SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname='public' AND indexname='idx_rqaa_service_request_id') AS index_ok,
        (SELECT COUNT(*)::int FROM pg_constraint WHERE conname='fk_rqaa_service_request') AS fk_ok
    `);
    log(
      "7d. public schema table/index/FK after server start (server-created, not QA CREATE)",
      Number(pub.rows[0].table_ok) >= 1 && Number(pub.rows[0].index_ok) >= 1 && Number(pub.rows[0].fk_ok) >= 1,
      JSON.stringify(pub.rows[0]),
    );
    // Wait briefly for concurrent startup migration log line
    for (let i = 0; i < 15 && !/RetailQuoteAdminAcceptance.*migration complete/i.test(serverLog); i++) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    const migLog = /RetailQuoteAdminAcceptance.*migration complete/i.test(serverLog);
    log("7e. server log shows migration complete (no secrets)", migLog, migLog ? "log marker found" : "marker missing — catalogs still authoritative");

    // Source-trace Google paths
    const gAuth = readFileSync("server/customerGoogleAuth.ts", "utf8");
    const cRoutes = readFileSync("server/routes/customer.routes.ts", "utf8");
    const sess = readFileSync("server/services/customer-session.service.ts", "utf8");
    const oauthWired =
      gAuth.includes("establishCustomerSession") &&
      gAuth.includes("/api/customer/callback") &&
      (gAuth.includes("Native Google") || gAuth.includes("native"));
    const phoneWired =
      cRoutes.includes("establishCustomerSession") &&
      cRoutes.includes("authMethod: 'phone'") &&
      cRoutes.includes("authMethod: 'google'");
    const sharedImpl = sess.includes("passwordChangedAtStamp") && sess.includes("parsePasswordChangedAtMs");
    log(
      "4. OAuth callback + native Google + phone use shared establishCustomerSession (source trace)",
      oauthWired && phoneWired && sharedImpl,
      `oauth=${oauthWired} phone=${phoneWired} shared=${sharedImpl}`,
    );
    log(
      "4b. Google E2E with real credentials",
      true,
      "No Google E2E credentials in this environment",
      "NOT_VERIFIED",
    );

    // Fixtures
    const ownerId = randomUUID();
    const ownerPhone = `016${String(Date.now()).slice(-8)}`;
    const staffId = randomUUID();
    const staffUser = `${tag}_staff`;
    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions, phone)
       VALUES ($1,$2,'HF2 Owner',$3,'Customer','Active','{}',$4)`,
      [ownerId, ownerPhone, hash, ownerPhone],
    );
    fixtures.users.push(ownerId);
    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions)
       VALUES ($1,$2,'HF2 Staff',$3,'Manager','Active',$4)`,
      [
        staffId,
        staffUser,
        hash,
        JSON.stringify({
          "serviceRequests.view": true,
          "serviceRequests.quote": true,
          "serviceRequests.convertToJob": true,
          "jobs.create": true,
        }),
      ],
    );
    fixtures.users.push(staffId);

    let staff;
    let owner;
    for (let i = 0; i < 8; i++) {
      try {
        staff = await loginAdmin(staffUser, "Hf2Test!99");
        owner = await loginCustomer(ownerPhone, "Hf2Test!99");
        break;
      } catch (e) {
        if (i === 7) throw e;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    async function insertQuoteSr(suffix) {
      const id = randomUUID();
      await client.query(
        `INSERT INTO service_requests (
          id, ticket_number, customer_id, brand, primary_issue, customer_name, phone,
          status, tracking_status, is_quote, request_intent, quote_status, stage, created_at
        ) VALUES ($1,$2,$3,'Samsung','No power',$4,$5,'Pending','Request Received',true,'quote','pending_price','intake',NOW())`,
        [id, `SRV-HF2-${suffix}`, ownerId, "HF2 Owner", ownerPhone],
      );
      fixtures.srs.push(id);
      return id;
    }

    const sr1 = await insertQuoteSr(`${tag}1`);
    await api(staff, "PATCH", `/api/admin/quotes/${sr1}/price`, { quoteAmount: 1500, quoteValidDays: 7 });
    const ticket1 = (await client.query(`SELECT ticket_number FROM service_requests WHERE id=$1`, [sr1])).rows[0]
      .ticket_number;

    // 1. Stale session after password change
    await client.query(`UPDATE users SET password_changed_at = NOW() WHERE id=$1`, [ownerId]);
    const st1q = await api(owner, "PATCH", `/api/service-requests/${sr1}/quote-response`, { response: "accepted" });
    const st1t = await api(owner, "GET", `/api/customer/track/${ticket1}`);
    const db1 = await client.query(`SELECT quote_status FROM service_requests WHERE id=$1`, [sr1]);
    log(
      "1. password change: quote-response + track → 401 SESSION_REVOKED; quote stays sent",
      st1q.status === 401 &&
        st1q.json.code === "SESSION_REVOKED" &&
        st1t.status === 401 &&
        st1t.json.code === "SESSION_REVOKED" &&
        db1.rows[0].quote_status === "sent",
      `quote=${st1q.status}/${st1q.json.code} track=${st1t.status}/${st1t.json.code} db=${db1.rows[0].quote_status}`,
    );

    // Fresh login after clear stamp baseline
    await client.query(`UPDATE users SET password_changed_at = NULL WHERE id=$1`, [ownerId]);
    owner = await loginCustomer(ownerPhone, "Hf2Test!99");

    // 2. Missing passwordChangedAtStamp → SESSION_REAUTH_REQUIRED
    const strip = await api(owner, "POST", `/api/test/customer-session/strip-password-stamp`, {});
    const reauth = await api(owner, "GET", `/api/customer/track/${ticket1}`);
    log(
      "2. missing passwordChangedAtStamp → 401 SESSION_REAUTH_REQUIRED",
      strip.status === 200 && reauth.status === 401 && reauth.json.code === "SESSION_REAUTH_REQUIRED",
      `strip=${strip.status} track=${reauth.status}/${reauth.json.code}`,
    );

    // 3. Fresh phone login accept with CSRF
    owner = await loginCustomer(ownerPhone, "Hf2Test!99");
    const acc = await api(owner, "POST", `/api/quotes/${sr1}/accept`, { servicePreference: "service_center" });
    log(
      "3. fresh phone-login accept with CSRF",
      acc.status === 200 && (acc.json.canonicalQuoteStatus === "accepted" || acc.json.quoteStatus === "accepted"),
      `HTTP ${acc.status} state=${acc.json.canonicalQuoteStatus}`,
    );

    // 5. Legacy quote accepted event secret
    const secret = `LEGACY_SECRET_PHRASE_${tag}_DO_NOT_LEAK`;
    const evId = randomUUID();
    await client.query(
      `INSERT INTO service_request_events (id, service_request_id, status, message, actor, occurred_at)
       VALUES ($1,$2,'Quote Accepted',$3,'Admin',NOW())`,
      [evId, sr1, `Staff accepted with Note: ${secret}`],
    );
    fixtures.events.push(evId);
    owner = await loginCustomer(ownerPhone, "Hf2Test!99");
    const detail = await api(owner, "GET", `/api/customer/service-requests/${sr1}`);
    const track = await api(owner, "GET", `/api/customer/track/${ticket1}`);
    const blob = JSON.stringify({ detail: detail.json, track: track.json });
    const hasSecret = blob.includes(secret);
    const hasGeneric =
      JSON.stringify(detail.json.timeline || []).includes("Quote accepted.") ||
      (detail.json.timeline || []).some((e) => e.message === "Quote accepted.");
    log(
      "5. legacy Quote Accepted event projected as Quote accepted. (no secret)",
      detail.status === 200 && track.status === 200 && !hasSecret && hasGeneric,
      `secretLeak=${hasSecret} generic=${hasGeneric}`,
    );

    // 6. Authorization regressions
    const techId = randomUUID();
    const techUser = `${tag}_tech`;
    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions)
       VALUES ($1,$2,'HF2 Tech',$3,'Technician','Active',$4)`,
      [techId, techUser, hash, JSON.stringify({ "jobs.view": true })],
    );
    fixtures.users.push(techId);
    const tech = await loginAdmin(techUser, "Hf2Test!99");
    const sr6 = await insertQuoteSr(`${tag}6`);
    await api(staff, "PATCH", `/api/admin/quotes/${sr6}/price`, { quoteAmount: 900, quoteValidDays: 7 });
    const t403 = await api(tech, "PATCH", `/api/admin/service-requests/${sr6}/quote-response`, {
      response: "accepted",
      confirmationNote: "should fail",
    });
    const noCsrf = await api({ cookies: owner.cookies, csrf: "" }, "PATCH", `/api/service-requests/${sr6}/quote-response`, {
      response: "accepted",
    }, { useCsrf: false });
    const adminOk = await api(staff, "PATCH", `/api/admin/service-requests/${sr6}/quote-response`, {
      response: "accepted",
      confirmationNote: "Customer confirmed on call HF2",
    });
    const noteRead = await api(staff, "GET", `/api/admin/service-requests/${sr6}/quote-admin-acceptances`);
    const noteOk =
      noteRead.status === 200 &&
      (noteRead.json.items || []).some((i) => String(i.confirmationNote || "").includes("Customer confirmed"));
    log(
      "6. auth regressions (no quote perm 403, no CSRF 403, admin accept+note OK)",
      t403.status === 403 && noCsrf.status === 403 && adminOk.status === 200 && noteOk,
      `tech=${t403.status} csrf=${noCsrf.status} admin=${adminOk.status} note=${noteOk}`,
    );

    // 8. Log hygiene: no secret phrase / phone pattern dump in captured serverLog
    const phoneLeak = serverLog.includes(ownerPhone);
    const secretInLog = serverLog.includes(secret);
    const tokenLeak = /Bearer\s+[A-Za-z0-9\-_]{20,}/.test(serverLog);
    log(
      "8. no raw phone/secret/token in captured server logs from this run",
      !phoneLeak && !secretInLog && !tokenLeak,
      `phone=${phoneLeak} secret=${secretInLog} token=${tokenLeak}`,
    );
  } catch (e) {
    console.error("QA aborted:", e.message);
    log("suite", false, e.message);
  } finally {
    try {
      for (const j of fixtures.jobs) await client.query(`DELETE FROM job_tickets WHERE id=$1`, [j]).catch(() => {});
      for (const e of fixtures.events) await client.query(`DELETE FROM service_request_events WHERE id=$1`, [e]).catch(() => {});
      for (const s of fixtures.srs) {
        await client.query(`DELETE FROM retail_quote_admin_acceptances WHERE service_request_id=$1`, [s]).catch(() => {});
        await client.query(`DELETE FROM service_request_events WHERE service_request_id=$1`, [s]).catch(() => {});
        await client.query(`DELETE FROM service_requests WHERE id=$1`, [s]).catch(() => {});
      }
      for (const u of fixtures.users) await client.query(`DELETE FROM users WHERE id=$1`, [u]).catch(() => {});
      if (fixtures.schema) {
        await client.query(`DROP SCHEMA IF EXISTS ${fixtures.schema} CASCADE`);
      }
      const left = await client.query(
        `SELECT COUNT(*)::int AS c FROM service_requests WHERE ticket_number LIKE 'SRV-HF2-%'`,
      );
      log("fixture cleanup", left.rows[0].c === 0, `remaining=${left.rows[0].c}`);
    } catch (ce) {
      log("fixture cleanup", false, ce.message);
    }
    if (child && !child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    client.release();
    await pool.end();
  }

  const pass = results.filter((r) => r.ok && r.status !== "NOT_VERIFIED").length;
  const fail = results.filter((r) => !r.ok && r.status !== "NOT_VERIFIED").length;
  const nv = results.filter((r) => r.status === "NOT_VERIFIED").length;
  console.log(`\nTOTAL PASS=${pass} FAIL=${fail} NOT_VERIFIED=${nv}`);
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(`${REPORT_DIR}/qa-results.json`, JSON.stringify({ pass, fail, nv, results }, null, 2));
  process.exit(fail > 0 ? 1 : 0);
}

main();
