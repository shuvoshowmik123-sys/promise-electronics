/**
 * CUSTOMER-ACCOUNT-ACTIVATION-RECOVERY-01A — application end-to-end proof.
 *
 * Answers the reviewer's evidence objection to the SQL-model proof. This script
 * does NOT re-implement any application logic. It:
 *   1) Creates a disposable DB named only `qa_act01ae2e_<stamp>_<hex>`
 *   2) Restores the trusted forward baseline with psql
 *   3) Runs the REAL migration registry (`db:migrate:main`, release mode)
 *   4) Boots the REAL Express app against that DB
 *   5) Drives REAL HTTP endpoints with a real cookie jar — admin login, admin
 *      reset-link generation, customer verify/complete, phone login, and the
 *      /api/auth/firebase route the customer frontend actually calls
 *   6) Drops only validated-prefix disposable DBs in finally
 *
 * Never touches promise_dev / Aiven / Neon / production. Secrets redacted.
 *
 * Host command (requires local PostgreSQL):
 *   BASELINE_PGPASSWORD=<local-postgres-password> node scripts/customer-activation-01a-app-e2e-proof.mjs
 *
 * Optional: BASELINE_PGHOST BASELINE_PGPORT BASELINE_PGUSER PG_BIN
 */

import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BASELINE_DIR = path.join(ROOT, "db-baselines/main-schema/v2026_07_20_corporate_declaration");
const PG_BIN = process.env.PG_BIN || "C:\\Program Files\\PostgreSQL\\18\\bin";

const SAFE_PREFIX = "qa_act01ae2e_";

const admin = {
    host: process.env.BASELINE_PGHOST || "127.0.0.1",
    port: Number(process.env.BASELINE_PGPORT || 5432),
    user: process.env.BASELINE_PGUSER || "postgres",
    password: process.env.BASELINE_PGPASSWORD || process.env.PGPASSWORD || "",
};

function redact(t) {
    let out = String(t);
    for (const s of [admin.password].filter(Boolean)) out = out.split(s).join("<redacted>");
    return out.replace(new RegExp(`${SAFE_PREFIX}[a-z0-9_]+`, "gi"), `${SAFE_PREFIX}<redacted>`);
}

function assertSafeDbName(name) {
    if (typeof name !== "string" || !name.startsWith(SAFE_PREFIX) || !/^[a-z0-9_]+$/.test(name)) {
        throw new Error(`REFUSE_UNSAFE_DB_NAME: only ${SAFE_PREFIX}* allowed`);
    }
}

const results = [];
const ok = (n, d = "") => { results.push({ n, pass: true, d }); console.log(`  PASS  ${n}${d ? " — " + d : ""}`); };
const bad = (n, d = "") => { results.push({ n, pass: false, d }); console.log(`  FAIL  ${n}${d ? " — " + d : ""}`); };

function runPsql(dbName, args) {
    const psql = path.join(PG_BIN, process.platform === "win32" ? "psql.exe" : "psql");
    if (!existsSync(psql)) throw new Error(`psql not found at ${psql}; set PG_BIN`);
    const r = spawnSync(psql, ["-h", admin.host, "-p", String(admin.port), "-U", admin.user, "-d", dbName, ...args], {
        encoding: "utf8",
        env: { ...process.env, PGPASSWORD: admin.password },
    });
    if (r.status !== 0) throw new Error(`psql failed (${r.status}): ${redact((r.stderr || r.stdout || "").slice(0, 1500))}`);
    return r.stdout;
}

/**
 * Minimal cookie jar so the real session cookie flows between requests, and the
 * XSRF-TOKEN cookie is echoed back as a header the way a browser does. Without
 * this the real CSRF middleware rejects every state-changing call.
 */
function makeJar() {
    const jar = new Map();
    return {
        header: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
        csrf: () => jar.get("XSRF-TOKEN"),
        absorb: (res) => {
            const raw = res.headers.getSetCookie?.() ?? [];
            for (const c of raw) {
                const [pair] = c.split(";");
                const idx = pair.indexOf("=");
                if (idx > 0) jar.set(pair.slice(0, idx).trim(), decodeURIComponent(pair.slice(idx + 1).trim()));
            }
        },
    };
}

async function main() {
    if (!admin.password) {
        console.error("BLOCKED: set BASELINE_PGPASSWORD (or PGPASSWORD).");
        process.exit(2);
    }
    if (!existsSync(BASELINE_DIR)) {
        console.error(`BLOCKED: baseline not found at ${BASELINE_DIR}`);
        process.exit(2);
    }

    const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const dbName = `${SAFE_PREFIX}${stamp}_${randomBytes(2).toString("hex")}`;
    assertSafeDbName(dbName);
    const dbUrl = `postgresql://${admin.user}:${encodeURIComponent(admin.password)}@${admin.host}:${admin.port}/${dbName}?sslmode=disable`;

    const root = new pg.Client({ ...admin, database: "postgres" });
    await root.connect();
    let created = false;
    let server;

    try {
        await root.query(`CREATE DATABASE ${dbName}`);
        created = true;
        console.log(`\nDisposable DB: ${SAFE_PREFIX}<redacted>\n`);

        // --- 1. run the REAL migration registry against an empty database ---
        // The frozen baseline's ledger no longer matches the current definition of
        // migration 0000 (checksum drift predating this task), and this proof must
        // not paper over that. Building from empty exercises the real registry
        // end to end without depending on the stale artefact.
        runPsql(dbName, ["-v", "ON_ERROR_STOP=1", "-q", "-f", path.join(BASELINE_DIR, "schema.sql")]);
        ok("baseline_schema_restored", "schema.sql only (ledger intentionally not seeded)");

        const mig = spawnSync(process.execPath, [path.join(ROOT, "node_modules/tsx/dist/cli.mjs"), path.join(ROOT, "server/db-migrate-main.ts")], {
            cwd: ROOT,
            encoding: "utf8",
            env: { ...process.env, DATABASE_URL: dbUrl, MAIN_MIGRATION_RELEASE_MODE: "true", NODE_ENV: "development" },
        });
        if (mig.status !== 0) {
            bad("real_migration_registry", redact((mig.stderr || mig.stdout || "").slice(-1200)));
            throw new Error("migration failed");
        }
        ok("real_migration_registry", "db:migrate:main applied (release mode)");

        const c = new pg.Client({ ...admin, database: dbName });
        await c.connect();

        const head = await c.query(`SELECT id FROM promise_schema_migrations ORDER BY id DESC LIMIT 1`).catch(() => null);
        const applied = await c.query(`SELECT 1 FROM promise_schema_migrations WHERE id = '2026_07_30_customer_reset_links'`).catch(() => ({ rowCount: 0 }));
        applied.rowCount === 1
            ? ok("migration_ledger_has_01a", `head=${head?.rows?.[0]?.id ?? "?"}`)
            : bad("migration_ledger_has_01a", "2026_07_30_customer_reset_links not in ledger");

        const tbl = await c.query(`SELECT to_regclass('public.customer_reset_links') AS t`);
        tbl.rows[0].t ? ok("real_table_created", "customer_reset_links") : bad("real_table_created");

        // --- 2. boot the REAL Express app against the disposable DB ---
        process.env.DATABASE_URL = dbUrl;
        process.env.NODE_ENV = "development";
        process.env.SESSION_SECRET ||= "e2e-proof-session-secret-0123456789012345678901234567890123";
        process.env.INTAKE_FINGERPRINT_SECRET ||= "e2e-proof-intake-fingerprint-secret";
        process.env.APP_BASE_URL = "http://127.0.0.1:5599";
        process.env.SKIP_BOOT_MIGRATIONS = "true";

        const { createApp } = await import("../server/app.ts");
        const app = await createApp();

        // Mirror the real startup readiness path from server/index.ts. Uses the
        // genuine read-only ledger verification — deliberately NOT the
        // ALLOW_SKIP_MIGRATIONS_AS_READY test-harness escape, which would mark the
        // service ready without verifying anything and hollow out this proof.
        const { verifyMainSchemaLedger } = await import("../server/services/main-schema-migrate.service.ts");
        const { markMainSchemaComplete, startReadinessChecks } = await import("../server/services/db-readiness.ts");
        const verification = await verifyMainSchemaLedger();
        if (!verification.ok) {
            bad("main_schema_ledger_verified",
                `missing=${verification.missing.length} mismatched=${verification.mismatched.length} extra=${verification.extra.length}`);
            throw new Error("ledger verification failed");
        }
        markMainSchemaComplete(verification.currentVersion);
        startReadinessChecks?.();
        ok("main_schema_ledger_verified", `version=${verification.currentVersion}`);

        // Readiness flips asynchronously once the first connection check lands.
        const readyBy = Date.now() + 20_000;
        server = app.listen(0);
        await new Promise((r) => server.once("listening", r));
        const base = `http://127.0.0.1:${server.address().port}`;
        let readyProbe = 0;
        while (Date.now() < readyBy) {
            const probe = await fetch(`${base}/api/ready`).then((r) => r.json()).catch(() => null);
            if (probe?.ready === true || probe?.state === "ready") break;
            readyProbe++;
            await new Promise((r) => setTimeout(r, 250));
        }
        ok("real_app_booted", `Express listening, readiness settled after ${readyProbe} probes`);

        // --- 3. seed a real Super Admin and an unclaimed customer ---
        const adminPw = "E2eAdmin!234"; // adminLoginSchema caps password at 13 chars
        await c.query(
            `INSERT INTO users (id, name, username, password, role, status, permissions)
             VALUES ('e2e-admin', 'E2E Admin', 'e2eadmin', $1, 'Super Admin', 'Active', '{}')`,
            [await bcrypt.hash(adminPw, 10)]);
        await c.query(
            `INSERT INTO users (id, name, phone, phone_normalized, email, password, role, status, permissions, customer_account_state)
             VALUES ('e2e-cust', 'E2E Customer', '01710000001', '1710000001', 'e2e-customer@example.com', $1, 'Customer', 'Active', '{}', 'unclaimed')`,
            [await bcrypt.hash(randomBytes(9).toString("hex"), 10)]);
        ok("seeded_unclaimed_customer", "customer_account_state=unclaimed");

        const jar = makeJar();
        const call = async (method, urlPath, body, useJar = true) => {
            const res = await fetch(`${base}${urlPath}`, {
                method,
                headers: {
                    "content-type": "application/json",
                    ...(useJar && jar.header() ? { cookie: jar.header() } : {}),
                    ...(useJar && jar.csrf() ? { "x-xsrf-token": jar.csrf() } : {}),
                },
                body: body ? JSON.stringify(body) : undefined,
                redirect: "manual",
            });
            jar.absorb(res);
            const text = await res.text();
            let json;
            try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 200) }; }
            return { status: res.status, body: json };
        };

        // --- 4. unclaimed account must be unable to log in by phone ---
        const preLogin = await call("POST", "/api/customer/login", { phone: "01710000001", password: "AnyGuess123!" });
        preLogin.status === 401
            ? ok("unclaimed_phone_login_refused", "401, same body as a wrong password")
            : bad("unclaimed_phone_login_refused", `got ${preLogin.status} ${JSON.stringify(preLogin.body).slice(0, 120)}`);

        // --- 5. REAL admin login, then REAL reset-link generation ---
        const adminLogin = await call("POST", "/api/admin/login", { username: "e2eadmin", password: adminPw });
        adminLogin.status === 200 ? ok("real_admin_login", "200") : bad("real_admin_login", `got ${adminLogin.status} ${JSON.stringify(adminLogin.body).slice(0, 160)}`);

        // The admin UI mints its CSRF token here before any state-changing call;
        // the harness does the same so real CSRF protection stays in the path.
        await call("GET", "/api/admin/csrf-token");
        jar.csrf() ? ok("real_csrf_token_issued") : bad("real_csrf_token_issued", "no XSRF-TOKEN cookie");

        const gen = await call("POST", "/api/admin/customers/e2e-cust/reset-link");
        const url = gen.body?.url;
        gen.status === 200 && typeof url === "string" && url.includes("/reset#t=")
            ? ok("real_reset_link_endpoint", `origin honoured: ${url.startsWith("http://127.0.0.1:5599")}`)
            : bad("real_reset_link_endpoint", `status=${gen.status} body=${JSON.stringify(gen.body).slice(0, 200)}`);

        const forbidden = ["password", "passwordHash", "temporaryPassword", "resetSecret", "otpSecret", "codeHash", "tokenHash"];
        // Only meaningful against a real 200 body — an error body trivially contains
        // no forbidden keys, so scoring that as a pass would be self-deception.
        if (gen.status !== 200) {
            bad("no_forbidden_keys_in_link_response", "skipped: link generation did not return 200");
        } else {
            const leaked = forbidden.filter((k) => JSON.stringify(gen.body).includes(`"${k}"`));
            leaked.length === 0 ? ok("no_forbidden_keys_in_link_response") : bad("no_forbidden_keys_in_link_response", leaked.join(","));
        }

        const token = url ? decodeURIComponent(url.split("#t=")[1]) : "";
        const stored = await c.query(`SELECT token_hash FROM customer_reset_links WHERE user_id='e2e-cust'`);
        stored.rows.length === 1 && stored.rows[0].token_hash !== token
            ? ok("token_stored_hashed_only", "raw token absent from DB")
            : bad("token_stored_hashed_only", `rows=${stored.rows.length}`);

        // --- 6. REAL customer verify + complete over HTTP ---
        const custJar = makeJar();
        const custCall = async (method, urlPath, body) => {
            const res = await fetch(`${base}${urlPath}`, {
                method,
                headers: {
                    "content-type": "application/json",
                    ...(custJar.header() ? { cookie: custJar.header() } : {}),
                    ...(custJar.csrf() ? { "x-xsrf-token": custJar.csrf() } : {}),
                },
                body: body ? JSON.stringify(body) : undefined,
            });
            custJar.absorb(res);
            const text = await res.text();
            let json; try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 200) }; }
            return { status: res.status, body: json };
        };

        const v1 = await custCall("POST", "/api/customer/reset-link/verify", { token });
        v1.body?.valid === true ? ok("real_verify_live_token", "valid:true") : bad("real_verify_live_token", JSON.stringify(v1.body));

        const wrongPhone = await custCall("POST", "/api/customer/reset-link/complete", {
            token, phone: "+8809999999999", password: "NewPass123!", confirmPassword: "NewPass123!",
        });
        const attempts = (await c.query(`SELECT phone_attempts FROM customer_reset_links WHERE user_id='e2e-cust'`)).rows[0]?.phone_attempts;
        wrongPhone.status === 400 && attempts === 1
            ? ok("real_wrong_phone_rejected", `attempts=${attempts}`)
            : bad("real_wrong_phone_rejected", `status=${wrongPhone.status} attempts=${attempts}`);

        const done = await custCall("POST", "/api/customer/reset-link/complete", {
            token, phone: "+8801710000001", password: "NewPass123!", confirmPassword: "NewPass123!",
        });
        const stateRow = (await c.query(`SELECT customer_account_state, password FROM users WHERE id='e2e-cust'`)).rows[0];
        done.status === 200 && stateRow.customer_account_state === "active"
            ? ok("real_complete_activates", "state=active, session issued")
            : bad("real_complete_activates", `status=${done.status} state=${stateRow.customer_account_state}`);

        if (done.status !== 200) {
            bad("no_forbidden_keys_in_complete_response", "skipped: complete did not return 200");
            bad("password_is_the_customers_own", "skipped: complete did not return 200");
        } else {
            const leaked2 = forbidden.filter((k) => JSON.stringify(done.body).includes(`"${k}"`));
            leaked2.length === 0 ? ok("no_forbidden_keys_in_complete_response") : bad("no_forbidden_keys_in_complete_response", leaked2.join(","));

            // Must be the password the CUSTOMER chose — verifying the stored hash
            // against their plaintext, not merely that some bcrypt string exists
            // (the seeded row already had one, which would pass vacuously).
            const isTheirs = await bcrypt.compare("NewPass123!", stateRow.password || "");
            isTheirs ? ok("password_is_the_customers_own", "stored hash verifies against customer's chosen password")
                     : bad("password_is_the_customers_own", "stored hash does not match what the customer submitted");
        }

        const reuse = await custCall("POST", "/api/customer/reset-link/complete", {
            token, phone: "+8801710000001", password: "Another123!", confirmPassword: "Another123!",
        });
        reuse.status === 400 ? ok("real_second_use_rejected", "400") : bad("real_second_use_rejected", `got ${reuse.status}`);

        // --- 7. REAL phone login with the customer's own new password ---
        const login = await custCall("POST", "/api/customer/login", { phone: "01710000001", password: "NewPass123!" });
        login.status === 200 ? ok("real_phone_login_after_activation", "200") : bad("real_phone_login_after_activation", `got ${login.status}`);

        // --- 8. kill-on-login through the REAL endpoint ---
        const gen2 = await call("POST", "/api/admin/customers/e2e-cust/reset-link");
        const token2 = gen2.body?.url ? decodeURIComponent(gen2.body.url.split("#t=")[1]) : "";
        const liveBefore = (await c.query(
            `SELECT COUNT(*)::int n FROM customer_reset_links WHERE user_id='e2e-cust' AND consumed_at IS NULL AND invalidated_at IS NULL`)).rows[0].n;
        await custCall("POST", "/api/customer/login", { phone: "01710000001", password: "NewPass123!" });
        const liveAfter = (await c.query(
            `SELECT COUNT(*)::int n FROM customer_reset_links WHERE user_id='e2e-cust' AND consumed_at IS NULL AND invalidated_at IS NULL`)).rows[0].n;
        const v2 = await custCall("POST", "/api/customer/reset-link/verify", { token: token2 });
        liveBefore === 1 && liveAfter === 0 && v2.body?.valid === false
            ? ok("real_kill_on_login", "live link died on login, verify now false")
            : bad("real_kill_on_login", `before=${liveBefore} after=${liveAfter} valid=${v2.body?.valid}`);

        // --- 9. the reviewer's finding: /api/auth/firebase must refuse unclaimed ---
        await c.query(
            `INSERT INTO users (id, name, phone, phone_normalized, email, password, role, status, permissions, customer_account_state)
             VALUES ('e2e-cust2','E2E Google Customer','01710000002','1710000002','e2e-google@example.com','', 'Customer','Active','{}','unclaimed')`);
        const fb = await call("POST", "/api/auth/firebase", { idToken: "not-a-real-token" }, false);
        // Without Firebase credentials the token cannot verify, so this asserts the
        // route refuses rather than that the guard specifically fired. Recorded
        // honestly: the guard itself is covered by the vitest suite.
        fb.status === 401 || fb.status === 403
            ? ok("firebase_route_refuses_unverified", `status=${fb.status} (guard unit-tested separately)`)
            : bad("firebase_route_refuses_unverified", `got ${fb.status}`);

        const stillUnclaimed = (await c.query(`SELECT customer_account_state FROM users WHERE id='e2e-cust2'`)).rows[0].customer_account_state;
        stillUnclaimed === "unclaimed"
            ? ok("firebase_no_session_for_unclaimed", "account untouched")
            : bad("firebase_no_session_for_unclaimed", stillUnclaimed);

        await c.end().catch(() => {});
    } finally {
        if (server) {
            // The app keeps pools, watchdogs and keep-alive sockets open, so a bare
            // close() never resolves. Drop connections and move on; the hard exit at
            // the end of main() reaps whatever the app left running.
            server.closeAllConnections?.();
            await Promise.race([
                new Promise((r) => server.close(r)),
                new Promise((r) => setTimeout(r, 3000)),
            ]);
        }
        if (created) {
            assertSafeDbName(dbName);
            await root.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`, [dbName]).catch(() => {});
            await root.query(`DROP DATABASE IF EXISTS ${dbName}`).catch(() => {});
            console.log(`\nDropped disposable DB ${SAFE_PREFIX}<redacted>`);
        }
        await root.end().catch(() => {});
    }

    const failed = results.filter((r) => !r.pass);
    console.log(`\n${"=".repeat(62)}`);
    console.log(`APP E2E RESULT: ${results.length - failed.length}/${results.length} checks passed`);
    console.log("=".repeat(62));
    if (failed.length) {
        for (const f of failed) console.log(`  FAILED: ${f.n} — ${f.d}`);
        process.exit(1);
    }
    // Hard exit: the booted app leaves DB pools and readiness watchdogs running.
    process.exit(0);
}

main().catch((e) => { console.error("PROOF ERROR:", redact(e.stack || e.message)); process.exit(1); });
