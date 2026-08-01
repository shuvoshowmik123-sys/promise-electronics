/**
 * SYSTEM-UNIFICATION-00C-A-HOTFIX-2A — Test hook containment + evidence correction.
 * One bounded run. Local/Neon only. Never Aiven.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import pg from "pg";
import bcrypt from "bcryptjs";

const DEV_PORT = process.env.QA_DEV_PORT || "5094";
const TEST_PORT = process.env.QA_TEST_PORT || "5095";
const DEV_BASE = process.env.QA_DEV_BASE || `http://127.0.0.1:${DEV_PORT}`;
const TEST_BASE = process.env.QA_TEST_BASE || `http://127.0.0.1:${TEST_PORT}`;
const REPORT_DIR = `mobile-qa/system-unification-00c-a-hotfix-2a/${process.env.QA_RUN_FOLDER || "live"}`;

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

async function waitHealth(url, ms = 180000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(`${url}/health`);
      if (r.status === 200) {
        await new Promise((x) => setTimeout(x, 2500));
        return true;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

function startServer(port, envExtra) {
  const child = spawn(
    "npx",
    ["cross-env", `PORT=${port}`, "tsx", "server/index.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SKIP_STARTUP_MIGRATIONS: "false",
        // Explicit: only test process may enable the session strip hook
        QA_SESSION_TEST_HOOK: envExtra.QA_SESSION_TEST_HOOK || "0",
        NODE_ENV: envExtra.NODE_ENV || "development",
        ...envExtra,
      },
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logBuf = "";
  child.stdout.on("data", (d) => {
    logBuf += d.toString();
  });
  child.stderr.on("data", (d) => {
    logBuf += d.toString();
  });
  return { child, getLog: () => logBuf };
}

async function loginCustomer(base, phone, password) {
  const res = await fetch(`${base}/api/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`customer login ${res.status}`);
  let cookies = cookieJar(res);
  const csrf = body.csrfToken || "";
  return { cookies, csrf, user: body };
}

async function loginAdmin(base, username, password) {
  const res = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`admin login ${res.status}`);
  let cookies = cookieJar(res);
  const csrfRes = await fetch(`${base}/api/admin/csrf-token`, { headers: { Cookie: cookies } });
  cookies = mergeCookies(cookies, csrfRes);
  const csrfBody = await csrfRes.json().catch(() => ({}));
  const csrf = csrfBody.csrfToken || "";
  return { cookies, csrf };
}

async function api(base, session, method, path, body, { useCsrf = true } = {}) {
  const headers = { "Content-Type": "application/json", Cookie: session.cookies || "" };
  if (useCsrf && session.csrf) headers["X-CSRF-TOKEN"] = session.csrf;
  const res = await fetch(`${base}${path}`, {
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

const fixtures = { users: [], srs: [], schema: null };
let devProc = null;
let testProc = null;

async function main() {
  console.log("00C-A-HOTFIX-2A QA");
  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const tag = `hf2a_${Date.now().toString(36)}`;
  const hash = await bcrypt.hash("Hf2aTest!99", 10);

  try {
    // Source: createRequireCustomerAuth removed
    const sessSrc = readFileSync("server/services/customer-session.service.ts", "utf8");
    log(
      "dead code: createRequireCustomerAuth absent",
      !sessSrc.includes("createRequireCustomerAuth"),
      sessSrc.includes("createRequireCustomerAuth") ? "still present" : "removed",
    );
    const custSrc = readFileSync("server/routes/customer.routes.ts", "utf8");
    const hookGated =
      custSrc.includes('NODE_ENV === "test"') &&
      custSrc.includes('QA_SESSION_TEST_HOOK === "1"') &&
      custSrc.includes("strip-password-stamp");
    log("source: strip hook dual-gated NODE_ENV=test && QA_SESSION_TEST_HOOK=1", hookGated);

    // Isolated migration proof (no public drop)
    const isoSchema = `qa_hf2a_${tag.replace(/[^a-z0-9_]/gi, "").slice(0, 18)}`;
    fixtures.schema = isoSchema;
    await client.query(`DROP SCHEMA IF EXISTS ${isoSchema} CASCADE`);
    await new Promise((resolve, reject) => {
      const p = spawn("npx", ["tsx", "scripts/qa-run-isolated-rqaa-migrate.mjs", isoSchema], {
        cwd: process.cwd(),
        env: { ...process.env },
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let err = "";
      p.stderr.on("data", (d) => (err += d));
      p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.slice(0, 300)))));
    });
    const after = await client.query(
      `SELECT
        (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema=$1 AND table_name='retail_quote_admin_acceptances') AS t,
        (SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname=$1 AND tablename='retail_quote_admin_acceptances') AS i,
        (SELECT COUNT(*)::int FROM pg_constraint c
          JOIN pg_class rel ON rel.oid=c.conrelid
          JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
          WHERE nsp.nspname=$1 AND rel.relname='retail_quote_admin_acceptances' AND c.contype='f') AS f`,
      [isoSchema],
    );
    log(
      "isolated migration function proof (table+index+FK)",
      Number(after.rows[0].t) >= 1 && Number(after.rows[0].i) >= 1 && Number(after.rows[0].f) >= 1,
      JSON.stringify(after.rows[0]),
    );

    // DEV server: NODE_ENV=development, no QA hook
    devProc = startServer(DEV_PORT, { NODE_ENV: "development", QA_SESSION_TEST_HOOK: "0" });
    const devOk = await waitHealth(DEV_BASE);
    log("dev server health (no QA_SESSION_TEST_HOOK)", devOk);

    // Unauthenticated probe of strip on dev
    const devStripAnon = await fetch(`${DEV_BASE}/api/test/customer-session/strip-password-stamp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    log(
      "dev process: strip-password-stamp is 404 (route not registered)",
      devStripAnon.status === 404,
      `HTTP ${devStripAnon.status}`,
    );

    // TEST server: NODE_ENV=test + QA_SESSION_TEST_HOOK=1 only for this process
    testProc = startServer(TEST_PORT, {
      NODE_ENV: "test",
      QA_SESSION_TEST_HOOK: "1",
      // Ensure POS force-fail harness does not interfere
      POS_R1H_FORCE_FAIL: "0",
    });
    const testOk = await waitHealth(TEST_BASE);
    log("test process health (NODE_ENV=test QA_SESSION_TEST_HOOK=1)", testOk);

    // Fixtures
    const ownerId = randomUUID();
    const ownerPhone = `015${String(Date.now()).slice(-8)}`;
    const staffId = randomUUID();
    const staffUser = `${tag}_staff`;
    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions, phone)
       VALUES ($1,$2,'HF2A Owner',$3,'Customer','Active','{}',$4)`,
      [ownerId, ownerPhone, hash, ownerPhone],
    );
    fixtures.users.push(ownerId);
    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions)
       VALUES ($1,$2,'HF2A Staff',$3,'Manager','Active',$4)`,
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

    // Wait for login readiness
    let staff;
    let owner;
    for (let i = 0; i < 10; i++) {
      try {
        staff = await loginAdmin(TEST_BASE, staffUser, "Hf2aTest!99");
        owner = await loginCustomer(TEST_BASE, ownerPhone, "Hf2aTest!99");
        break;
      } catch (e) {
        if (i === 9) throw e;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    // Dev: logged-in customer still gets 404 on strip (route absent on that process)
    let ownerDev;
    for (let i = 0; i < 6; i++) {
      try {
        ownerDev = await loginCustomer(DEV_BASE, ownerPhone, "Hf2aTest!99");
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    if (ownerDev) {
      const devStrip = await api(DEV_BASE, ownerDev, "POST", "/api/test/customer-session/strip-password-stamp", {});
      log("dev process with session: strip still 404", devStrip.status === 404, `HTTP ${devStrip.status}`);
    } else {
      log("dev process with session: strip still 404", false, "dev login failed");
    }

    // Test process: strip works for that session
    const strip = await api(TEST_BASE, owner, "POST", "/api/test/customer-session/strip-password-stamp", {});
    log("test process: strip works for test session", strip.status === 200 && strip.json.ok === true, `HTTP ${strip.status}`);

    const srId = randomUUID();
    await client.query(
      `INSERT INTO service_requests (
        id, ticket_number, customer_id, brand, primary_issue, customer_name, phone,
        status, tracking_status, is_quote, request_intent, quote_status, stage, created_at
      ) VALUES ($1,$2,$3,'Samsung','No power',$4,$5,'Pending','Request Received',true,'quote','pending_price','intake',NOW())`,
      [srId, `SRV-HF2A-${tag}`, ownerId, "HF2A Owner", ownerPhone],
    );
    fixtures.srs.push(srId);
    const ticket = (await client.query(`SELECT ticket_number FROM service_requests WHERE id=$1`, [srId])).rows[0]
      .ticket_number;

    // After strip, track should reauth-required on TEST server
    const reauth = await api(TEST_BASE, owner, "GET", `/api/customer/track/${ticket}`);
    log(
      "test process: after strip, track → SESSION_REAUTH_REQUIRED",
      reauth.status === 401 && reauth.json.code === "SESSION_REAUTH_REQUIRED",
      `HTTP ${reauth.status} code=${reauth.json.code}`,
    );

    // Fresh login + price + accept regression on TEST
    owner = await loginCustomer(TEST_BASE, ownerPhone, "Hf2aTest!99");
    await api(TEST_BASE, staff, "PATCH", `/api/admin/quotes/${srId}/price`, {
      quoteAmount: 1200,
      quoteValidDays: 7,
    });
    const acc = await api(TEST_BASE, owner, "POST", `/api/quotes/${srId}/accept`, {
      servicePreference: "service_center",
    });
    log(
      "regression: fresh phone accept with CSRF",
      acc.status === 200 && (acc.json.canonicalQuoteStatus === "accepted" || acc.json.quoteStatus === "accepted"),
      `HTTP ${acc.status}`,
    );

    // Password-change stale rejection (fresh session first)
    const sr2 = randomUUID();
    await client.query(
      `INSERT INTO service_requests (
        id, ticket_number, customer_id, brand, primary_issue, customer_name, phone,
        status, tracking_status, is_quote, request_intent, quote_status, stage, created_at
      ) VALUES ($1,$2,$3,'LG','Lines',$4,$5,'Pending','Request Received',true,'quote','pending_price','intake',NOW())`,
      [sr2, `SRV-HF2A2-${tag}`, ownerId, "HF2A Owner", ownerPhone],
    );
    fixtures.srs.push(sr2);
    await api(TEST_BASE, staff, "PATCH", `/api/admin/quotes/${sr2}/price`, { quoteAmount: 800, quoteValidDays: 7 });
    owner = await loginCustomer(TEST_BASE, ownerPhone, "Hf2aTest!99");
    await client.query(`UPDATE users SET password_changed_at = NOW() WHERE id=$1`, [ownerId]);
    const staleQ = await api(TEST_BASE, owner, "PATCH", `/api/service-requests/${sr2}/quote-response`, {
      response: "accepted",
    });
    const ticket2 = (await client.query(`SELECT ticket_number FROM service_requests WHERE id=$1`, [sr2])).rows[0]
      .ticket_number;
    const staleT = await api(TEST_BASE, owner, "GET", `/api/customer/track/${ticket2}`);
    const dbSt = await client.query(`SELECT quote_status FROM service_requests WHERE id=$1`, [sr2]);
    log(
      "regression: password-change stale quote-response + track SESSION_REVOKED",
      staleQ.status === 401 &&
        staleQ.json.code === "SESSION_REVOKED" &&
        staleT.status === 401 &&
        staleT.json.code === "SESSION_REVOKED" &&
        dbSt.rows[0].quote_status === "sent",
      `q=${staleQ.status}/${staleQ.json.code} t=${staleT.status} db=${dbSt.rows[0].quote_status}`,
    );
    await client.query(`UPDATE users SET password_changed_at = NULL WHERE id=$1`, [ownerId]);

    // Public proof — honest wording (no claim of create-from-absent on public)
    const pub = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema='public' AND table_name='retail_quote_admin_acceptances') AS table_ok,
        (SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname='public' AND indexname='idx_rqaa_service_request_id') AS index_ok,
        (SELECT COUNT(*)::int FROM pg_constraint WHERE conname='fk_rqaa_service_request') AS fk_ok
    `);
    const migSeen = /RetailQuoteAdminAcceptance.*migration complete/i.test(testProc.getLog() + devProc.getLog());
    log(
      "public proof: startup invocation observed and required public table/index/FK present",
      Number(pub.rows[0].table_ok) >= 1 &&
        Number(pub.rows[0].index_ok) >= 1 &&
        Number(pub.rows[0].fk_ok) >= 1 &&
        migSeen,
      `${JSON.stringify(pub.rows[0])} migLog=${migSeen}`,
    );

    // Source: no other test customer-session routes outside gated block
    const onlyOneTestPath = (custSrc.match(/\/api\/test\/customer-session\//g) || []).length === 1;
    log("only one /api/test/customer-session/* path in source (gated)", onlyOneTestPath);
  } catch (e) {
    console.error("QA aborted:", e.message);
    log("suite", false, e.message);
  } finally {
    try {
      for (const s of fixtures.srs) {
        await client.query(`DELETE FROM retail_quote_admin_acceptances WHERE service_request_id=$1`, [s]).catch(() => {});
        await client.query(`DELETE FROM service_request_events WHERE service_request_id=$1`, [s]).catch(() => {});
        await client.query(`DELETE FROM service_requests WHERE id=$1`, [s]).catch(() => {});
      }
      for (const u of fixtures.users) await client.query(`DELETE FROM users WHERE id=$1`, [u]).catch(() => {});
      if (fixtures.schema) await client.query(`DROP SCHEMA IF EXISTS ${fixtures.schema} CASCADE`);
      log("fixture cleanup", true);
    } catch (ce) {
      log("fixture cleanup", false, ce.message);
    }
    for (const p of [devProc, testProc]) {
      if (p?.child && !p.child.killed) {
        try {
          p.child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
      }
    }
    client.release();
    await pool.end();
  }

  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\nTOTAL PASS=${pass} FAIL=${fail}`);
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(`${REPORT_DIR}/qa-results.json`, JSON.stringify({ pass, fail, results }, null, 2));
  process.exit(fail > 0 ? 1 : 0);
}

main();
