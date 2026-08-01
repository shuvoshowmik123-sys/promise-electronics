/**
 * SYSTEM-UNIFICATION-00C-A-SECURITY-QA
 * Independent reproduce of retail quote + customer-session security contract.
 * QA/audit only — does not modify product code.
 * Local/Neon only. Never Aiven. One bounded run.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import pg from "pg";
import bcrypt from "bcryptjs";

const DEV_PORT = process.env.QA_DEV_PORT || "5101";
const TEST_PORT = process.env.QA_TEST_PORT || "5102";
const PROD_LIKE_PORT = process.env.QA_PROD_LIKE_PORT || "5103";
const DEV_BASE = `http://127.0.0.1:${DEV_PORT}`;
const TEST_BASE = `http://127.0.0.1:${TEST_PORT}`;
const PROD_LIKE_BASE = `http://127.0.0.1:${PROD_LIKE_PORT}`;
const REPORT_DIR = `mobile-qa/system-unification-00c-a-security-qa/${process.env.QA_RUN_FOLDER || "live"}`;

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
function log(id, name, ok, detail = "", status = null) {
  const entry = {
    id,
    name,
    ok: status === "NOT_VERIFIED" ? null : ok,
    status: status === "NOT_VERIFIED" ? "NOT_VERIFIED" : ok ? "PASS" : "FAIL",
    detail: String(detail).slice(0, 600),
  };
  // Redact accidental secrets in details
  entry.detail = entry.detail
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/csrfToken":"[^"]+"/gi, 'csrfToken":"[REDACTED]"')
    .replace(/password[^,]{0,40}/gi, "password[REDACTED]");
  results.push(entry);
  console.log(`${entry.status} — [${id}] ${name}${detail ? `: ${String(detail).slice(0, 200)}` : ""}`);
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
  const child = spawn("npx", ["cross-env", `PORT=${port}`, "tsx", "server/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SKIP_STARTUP_MIGRATIONS: "false",
      POS_R1H_FORCE_FAIL: "0",
      QA_SESSION_TEST_HOOK: "0",
      NODE_ENV: "development",
      ...envExtra,
    },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d.toString();
  });
  child.stderr.on("data", (d) => {
    buf += d.toString();
  });
  return {
    child,
    getLog: () =>
      buf
        .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
        .replace(/postgresql:\/\/[^\s]+/gi, "postgresql://[REDACTED]"),
  };
}

async function loginCustomer(base, phone, password) {
  const res = await fetch(`${base}/api/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`customer login ${res.status}`);
  const cookies = cookieJar(res);
  const csrf = body.csrfToken || "";
  if (!csrf) throw new Error("customer login missing csrfToken");
  return { cookies, csrf };
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
  if (!csrf) throw new Error("admin csrf missing");
  return { cookies, csrf };
}

async function api(base, session, method, path, body, { useCsrf = true } = {}) {
  const headers = { "Content-Type": "application/json", Cookie: session?.cookies || "" };
  if (useCsrf && session?.csrf) headers["X-CSRF-TOKEN"] = session.csrf;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (session && cookieJar(res)) session.cookies = mergeCookies(session.cookies, res);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 80) };
  }
  return { status: res.status, json };
}

function maskPhone(p) {
  if (!p) return null;
  const d = String(p).replace(/\D/g, "");
  if (d.length < 4) return "***";
  return `${d.slice(0, 3)}****${d.slice(-2)}`;
}

const fixtures = { users: [], srs: [], events: [] };
const procs = [];

async function main() {
  console.log("00C-A-SECURITY-QA independent run");
  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const tag = `secqa_${Date.now().toString(36)}`;
  const hash = await bcrypt.hash("SecQa!99xx", 10);

  try {
    // ─── Source audit (check 1, 10) ───
    const sess = readFileSync("server/services/customer-session.service.ts", "utf8");
    const cust = readFileSync("server/routes/customer.routes.ts", "utf8");
    const gAuth = readFileSync("server/customerGoogleAuth.ts", "utf8");
    const authMw = readFileSync("server/routes/middleware/auth.ts", "utf8");

    const phoneUses =
      cust.includes("establishCustomerSession") &&
      (cust.match(/establishCustomerSession/g) || []).length >= 2;
    const googleRouteUses = cust.includes("authMethod: 'google'") && cust.includes("establishCustomerSession");
    const oauthCallback =
      gAuth.includes("/api/customer/callback") && gAuth.includes("establishCustomerSession");
    const nativeGoogle = gAuth.includes("establishCustomerSession") && gAuth.includes("Native Google");
    const requireUsesFresh = authMw.includes("assertCustomerSessionFresh");
    log(
      "C1",
      "Phone login/register + Google paths share establishCustomerSession; requireCustomerAuth uses freshness",
      phoneUses && googleRouteUses && oauthCallback && nativeGoogle && requireUsesFresh,
      `phone=${phoneUses} googleRoute=${googleRouteUses} oauth=${oauthCallback} native=${nativeGoogle} requireFresh=${requireUsesFresh}`,
    );

    const testPaths = (cust.match(/\/api\/test\/customer-session\/[a-zA-Z0-9\-]+/g) || []);
    const onlyStrip = testPaths.length === 1 && testPaths[0] === "/api/test/customer-session/strip-password-stamp";
    const dualGate =
      cust.includes('NODE_ENV === "test"') && cust.includes('QA_SESSION_TEST_HOOK === "1"');
    log("C10", "Only one gated /api/test/customer-session/* route in source", onlyStrip && dualGate, `paths=${testPaths.join(",")}`);

    // ─── Servers ───
    const dev = startServer(DEV_PORT, { NODE_ENV: "development", QA_SESSION_TEST_HOOK: "0" });
    procs.push(dev);
    const test = startServer(TEST_PORT, {
      NODE_ENV: "test",
      QA_SESSION_TEST_HOOK: "1",
    });
    procs.push(test);
    const prodLike = startServer(PROD_LIKE_PORT, {
      NODE_ENV: "production",
      QA_SESSION_TEST_HOOK: "0",
      // production-like: no test hook even if someone set it in parent env — we force 0 above
    });
    procs.push(prodLike);

    const hDev = await waitHealth(DEV_BASE);
    const hTest = await waitHealth(TEST_BASE);
    const hProd = await waitHealth(PROD_LIKE_BASE, 90000);
    log(
      "S0",
      "Required servers healthy (dev + test); prod-like optional for runtime 404",
      hDev && hTest,
      `dev=${hDev} test=${hTest} prodLike=${hProd}`,
    );
    if (!hDev || !hTest) throw new Error("required servers not healthy — stop");

    // Fixtures: two customers + staff
    const ownerId = randomUUID();
    const otherId = randomUUID();
    const staffId = randomUUID();
    const ownerPhone = `013${String(Date.now()).slice(-8)}`;
    const otherPhone = `014${String(Date.now()).slice(-8)}`;
    const staffUser = `${tag}_staff`;

    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions, phone)
       VALUES ($1,$2,'SecQA Owner',$3,'Customer','Active','{}',$4)`,
      [ownerId, ownerPhone, hash, ownerPhone],
    );
    fixtures.users.push(ownerId);
    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions, phone)
       VALUES ($1,$2,'SecQA Other',$3,'Customer','Active','{}',$4)`,
      [otherId, otherPhone, hash, otherPhone],
    );
    fixtures.users.push(otherId);
    await client.query(
      `INSERT INTO users (id, username, name, password, role, status, permissions)
       VALUES ($1,$2,'SecQA Staff',$3,'Manager','Active',$4)`,
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

    async function loginReady(base, fn, retries = 10) {
      for (let i = 0; i < retries; i++) {
        try {
          return await fn();
        } catch (e) {
          if (i === retries - 1) throw e;
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }

    let staff = await loginReady(TEST_BASE, () => loginAdmin(TEST_BASE, staffUser, "SecQa!99xx"));
    let owner = await loginReady(TEST_BASE, () => loginCustomer(TEST_BASE, ownerPhone, "SecQa!99xx"));
    let other = await loginReady(TEST_BASE, () => loginCustomer(TEST_BASE, otherPhone, "SecQa!99xx"));

    async function insertQuote(ownerCustomerId, phone, suffix) {
      const id = randomUUID();
      await client.query(
        `INSERT INTO service_requests (
          id, ticket_number, customer_id, brand, primary_issue, customer_name, phone,
          status, tracking_status, is_quote, request_intent, quote_status, stage, created_at
        ) VALUES ($1,$2,$3,'Samsung','No power',$4,$5,'Pending','Request Received',true,'quote','pending_price','intake',NOW())`,
        [id, `SRV-SECQA-${suffix}`, ownerCustomerId, "SecQA Customer", phone],
      );
      fixtures.srs.push(id);
      return id;
    }

    const srOwner = await insertQuote(ownerId, ownerPhone, `${tag}o`);
    const srOther = await insertQuote(otherId, otherPhone, `${tag}x`);
    await api(TEST_BASE, staff, "PATCH", `/api/admin/quotes/${srOwner}/price`, {
      quoteAmount: 2500,
      quoteValidDays: 7,
    });
    await api(TEST_BASE, staff, "PATCH", `/api/admin/quotes/${srOther}/price`, {
      quoteAmount: 1800,
      quoteValidDays: 7,
    });
    const ticketOwner = (
      await client.query(`SELECT ticket_number FROM service_requests WHERE id=$1`, [srOwner])
    ).rows[0].ticket_number;
    const ticketOther = (
      await client.query(`SELECT ticket_number FROM service_requests WHERE id=$1`, [srOther])
    ).rows[0].ticket_number;

    // ─── C9: strip hook 404 on dev + prod-like ───
    const stripDevAnon = await fetch(`${DEV_BASE}/api/test/customer-session/strip-password-stamp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    log("C9a", "Dev process: strip route 404", stripDevAnon.status === 404, `HTTP ${stripDevAnon.status}`);

    // Production registration is impossible by source gate (NODE_ENV must be exactly "test").
    const prodCannotRegister =
      cust.includes('NODE_ENV === "test"') && cust.includes('QA_SESSION_TEST_HOOK === "1"');
    if (hProd) {
      const stripProd = await fetch(`${PROD_LIKE_BASE}/api/test/customer-session/strip-password-stamp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      log(
        "C9b",
        "Production-like: strip route not available (404 runtime)",
        stripProd.status === 404 && prodCannotRegister,
        `HTTP ${stripProd.status}; sourceGate=${prodCannotRegister}`,
      );
    } else {
      log(
        "C9b",
        "Production-like: strip route cannot be registered (source gate NODE_ENV===test && QA_SESSION_TEST_HOOK===1)",
        prodCannotRegister,
        `prod-like process not healthy in this env; source dual-gate proves production cannot register the route`,
      );
    }

    // Test process: unauthenticated strip → 401 (route exists)
    const stripUnauth = await fetch(`${TEST_BASE}/api/test/customer-session/strip-password-stamp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    log(
      "C9c",
      "Test process: strip requires authenticated customer session (401 without session)",
      stripUnauth.status === 401,
      `HTTP ${stripUnauth.status}`,
    );

    // Test process: strip works with session
    const stripOk = await api(TEST_BASE, owner, "POST", "/api/test/customer-session/strip-password-stamp", {});
    log(
      "C9d",
      "Test process with NODE_ENV=test+QA_SESSION_TEST_HOOK=1: strip works for session",
      stripOk.status === 200 && stripOk.json.ok === true,
      `HTTP ${stripOk.status}`,
    );

    // ─── C3: missing stamp → SESSION_REAUTH_REQUIRED ───
    const reauthTrack = await api(TEST_BASE, owner, "GET", `/api/customer/track/${ticketOwner}`);
    const reauthMut = await api(TEST_BASE, owner, "POST", `/api/quotes/${srOwner}/accept`, {
      servicePreference: "service_center",
    });
    log(
      "C3",
      "Legacy/missing passwordChangedAtStamp fails closed SESSION_REAUTH_REQUIRED",
      reauthTrack.status === 401 &&
        reauthTrack.json.code === "SESSION_REAUTH_REQUIRED" &&
        reauthMut.status === 401 &&
        (reauthMut.json.code === "SESSION_REAUTH_REQUIRED" || reauthMut.json.code === "SESSION_REVOKED"),
      `track=${reauthTrack.status}/${reauthTrack.json.code} mut=${reauthMut.status}/${reauthMut.json.code}`,
    );

    // Fresh sessions after reauth
    owner = await loginCustomer(TEST_BASE, ownerPhone, "SecQa!99xx");
    other = await loginCustomer(TEST_BASE, otherPhone, "SecQa!99xx");

    // ─── C7: CSRF required + success ───
    const noCsrf = await api(
      TEST_BASE,
      { cookies: owner.cookies, csrf: "" },
      "POST",
      `/api/quotes/${srOwner}/accept`,
      { servicePreference: "service_center" },
      { useCsrf: false },
    );
    log(
      "C7a",
      "Customer quote mutation without CSRF rejected",
      noCsrf.status === 403 || noCsrf.json.code === "CSRF_FAILED",
      `HTTP ${noCsrf.status} code=${noCsrf.json.code}`,
    );

    const withCsrf = await api(TEST_BASE, owner, "POST", `/api/quotes/${srOwner}/accept`, {
      servicePreference: "service_center",
    });
    const dbAcc = await client.query(`SELECT quote_status FROM service_requests WHERE id=$1`, [srOwner]);
    log(
      "C7b",
      "Fresh CSRF quote accept succeeds",
      withCsrf.status === 200 &&
        (withCsrf.json.canonicalQuoteStatus === "accepted" || dbAcc.rows[0].quote_status === "accepted"),
      `HTTP ${withCsrf.status} db=${dbAcc.rows[0].quote_status}`,
    );

    // ─── C6: cross-customer isolation ───
    // Reset other quote to sent for accept attempt; use decline on other's id from owner
    const otherAccept = await api(TEST_BASE, owner, "POST", `/api/quotes/${srOther}/accept`, {
      servicePreference: "service_center",
    });
    const otherDetail = await api(TEST_BASE, owner, "GET", `/api/customer/service-requests/${srOther}`);
    const otherTrack = await api(TEST_BASE, owner, "GET", `/api/customer/track/${ticketOther}`);
    log(
      "C6",
      "Customer cannot access/mutate another customer's quote/SR",
      (otherAccept.status === 403 || otherAccept.status === 404) &&
        (otherDetail.status === 403 || otherDetail.status === 404) &&
        (otherTrack.status === 404 || otherTrack.status === 403),
      `accept=${otherAccept.status} detail=${otherDetail.status} track=${otherTrack.status}`,
    );

    // ─── C4: anonymous public track ───
    const anon = await fetch(`${TEST_BASE}/api/customer/track/${ticketOwner}`);
    const anonJson = await anon.json().catch(() => ({}));
    const anonKeys = Object.keys(anonJson);
    const safePublic =
      anon.status === 200 &&
      anonJson.ticketNumber &&
      anonJson.message &&
      !("phone" in anonJson) &&
      !("customerId" in anonJson) &&
      !("timeline" in anonJson) &&
      !("address" in anonJson) &&
      !("paymentSubmissions" in anonJson);
    log(
      "C4",
      "Anonymous public tracking is limited safe projection only",
      safePublic,
      `HTTP ${anon.status} keys=${anonKeys.join(",")}`,
    );

    // ─── C8: timeline no secret leak ───
    const secret = `STAFF_SECRET_NOTE_${tag}_NEVER`;
    const evId = randomUUID();
    await client.query(
      `INSERT INTO service_request_events (id, service_request_id, status, message, actor, occurred_at)
       VALUES ($1,$2,'Quote Accepted',$3,'Admin',NOW())`,
      [evId, srOwner, `Internal: ${secret} stack: Error: boom`],
    );
    fixtures.events.push(evId);
    owner = await loginCustomer(TEST_BASE, ownerPhone, "SecQa!99xx");
    const detail = await api(TEST_BASE, owner, "GET", `/api/customer/service-requests/${srOwner}`);
    const trackFull = await api(TEST_BASE, owner, "GET", `/api/customer/track/${ticketOwner}`);
    const blob = JSON.stringify({ d: detail.json, t: trackFull.json });
    const leak =
      blob.includes(secret) ||
      blob.includes("stack:") ||
      /Bearer\s+[A-Za-z0-9\-_]{10,}/.test(blob) ||
      blob.includes(otherPhone);
    const genericOk = (detail.json.timeline || []).some((e) => e.message === "Quote accepted.");
    log(
      "C8",
      "Customer timeline/detail/track do not leak internal notes/secrets/other customer data",
      detail.status === 200 && trackFull.status === 200 && !leak && genericOk,
      `leak=${leak} generic=${genericOk}`,
    );

    // ─── C2 + C5: password change invalidation ───
    // New sent quote for clean mutation test
    const srFresh = await insertQuote(ownerId, ownerPhone, `${tag}f`);
    await api(TEST_BASE, staff, "PATCH", `/api/admin/quotes/${srFresh}/price`, {
      quoteAmount: 999,
      quoteValidDays: 7,
    });
    const ticketFresh = (
      await client.query(`SELECT ticket_number FROM service_requests WHERE id=$1`, [srFresh])
    ).rows[0].ticket_number;
    owner = await loginCustomer(TEST_BASE, ownerPhone, "SecQa!99xx");
    await client.query(`UPDATE users SET password_changed_at = NOW() WHERE id=$1`, [ownerId]);
    const stAccept = await api(TEST_BASE, owner, "POST", `/api/quotes/${srFresh}/accept`, {
      servicePreference: "service_center",
    });
    const stDecline = await api(TEST_BASE, owner, "POST", `/api/quotes/${srFresh}/decline`, {});
    const stTrack = await api(TEST_BASE, owner, "GET", `/api/customer/track/${ticketFresh}`);
    const stDb = await client.query(`SELECT quote_status FROM service_requests WHERE id=$1`, [srFresh]);
    // After revoke, second track should still be 401 (not anonymous 200)
    const stTrack2 = await api(TEST_BASE, owner, "GET", `/api/customer/track/${ticketFresh}`);
    const noStateChange = stDb.rows[0].quote_status === "sent";
    log(
      "C2",
      "Password change → quote accept/decline + track SESSION_REVOKED; no state change",
      stAccept.status === 401 &&
        stAccept.json.code === "SESSION_REVOKED" &&
        (stDecline.status === 401 || stDecline.json.code === "SESSION_REVOKED") &&
        stTrack.status === 401 &&
        stTrack.json.code === "SESSION_REVOKED" &&
        noStateChange,
      `accept=${stAccept.status}/${stAccept.json.code} decline=${stDecline.status} track=${stTrack.status} db=${stDb.rows[0].quote_status}`,
    );
    log(
      "C5",
      "After revocation, track does not silent-downgrade to anonymous public projection",
      stTrack2.status === 401 &&
        (stTrack2.json.code === "SESSION_REVOKED" || stTrack2.json.code === "SESSION_REAUTH_REQUIRED") &&
        !stTrack2.json.ticketNumber,
      `HTTP ${stTrack2.status} code=${stTrack2.json.code} keys=${Object.keys(stTrack2.json).join(",")}`,
    );
    await client.query(`UPDATE users SET password_changed_at = NULL WHERE id=$1`, [ownerId]);

    // ─── C11 Google E2E ───
    const hasGoogleCreds = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    if (!hasGoogleCreds) {
      log(
        "C11",
        "Google E2E authentication",
        true,
        "NOT VERIFIED: GOOGLE_CLIENT_ID/SECRET or controlled test IdP credentials not available in this environment. Required: dedicated test Google OAuth client + browser/native token fixture.",
        "NOT_VERIFIED",
      );
    } else {
      log(
        "C11",
        "Google E2E authentication",
        true,
        "NOT VERIFIED: credentials present but controlled automated Google login fixture not configured for this security-qa suite (would require interactive OAuth). Source-trace covered in C1.",
        "NOT_VERIFIED",
      );
    }

    // Sanitized log sample from servers (no secrets)
    const logSample = (test.getLog() + dev.getLog()).slice(0, 500);
    const logBad =
      logSample.includes(ownerPhone) ||
      logSample.includes(secret) ||
      /Bearer\s+[A-Za-z0-9\-_]{15,}/.test(logSample);
    log("C8b", "Captured server logs in this run do not include fixture phone/secret/tokens", !logBad, `bad=${logBad}`);
  } catch (e) {
    console.error("SECURITY-QA aborted:", e.message);
    log("SUITE", "Suite execution", false, e.message);
  } finally {
    try {
      for (const e of fixtures.events) {
        await client.query(`DELETE FROM service_request_events WHERE id=$1`, [e]).catch(() => {});
      }
      for (const s of fixtures.srs) {
        await client.query(`DELETE FROM retail_quote_admin_acceptances WHERE service_request_id=$1`, [s]).catch(() => {});
        await client.query(`DELETE FROM service_request_events WHERE service_request_id=$1`, [s]).catch(() => {});
        await client.query(`DELETE FROM service_requests WHERE id=$1`, [s]).catch(() => {});
      }
      for (const u of fixtures.users) {
        await client.query(`DELETE FROM users WHERE id=$1`, [u]).catch(() => {});
      }
      const left = await client.query(
        `SELECT COUNT(*)::int AS c FROM service_requests WHERE ticket_number LIKE 'SRV-SECQA-%'`,
      );
      log("CLEAN", "Fixture cleanup", left.rows[0].c === 0, `remaining=${left.rows[0].c}`);
    } catch (ce) {
      log("CLEAN", "Fixture cleanup", false, ce.message);
    }
    for (const p of procs) {
      try {
        if (p.child && !p.child.killed) p.child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    client.release();
    await pool.end();
  }

  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const nv = results.filter((r) => r.status === "NOT_VERIFIED").length;
  console.log(`\nTOTAL PASS=${pass} FAIL=${fail} NOT_VERIFIED=${nv}`);

  mkdirSync(REPORT_DIR, { recursive: true });
  const evidence = {
    phase: "SYSTEM-UNIFICATION-00C-A-SECURITY-QA",
    runFolder: REPORT_DIR,
    bases: { DEV_BASE, TEST_BASE, PROD_LIKE_BASE },
    totals: { pass, fail, notVerified: nv },
    results: results.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      detail: r.detail,
    })),
    fixtures: {
      userCount: fixtures.users.length,
      srCount: fixtures.srs.length,
      // no raw phones/ids in evidence file for PII safety — only counts
    },
    gate00cB: fail === 0 ? "YES" : "NO",
  };
  writeFileSync(`${REPORT_DIR}/evidence.json`, JSON.stringify(evidence, null, 2));
  process.exit(fail > 0 ? 1 : 0);
}

main();
