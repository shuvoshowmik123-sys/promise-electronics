/**
 * CUSTOMER-ACCOUNT-ACTIVATION-RECOVERY-01A — disposable PostgreSQL integration proof.
 *
 * Proves the security properties that the vitest suite cannot, because those tests
 * mock the database and therefore cannot exercise real row locking, real constraint
 * behaviour, or real transaction rollback.
 *
 * Fail-closed local-only harness:
 *   1) Create a disposable DB named only `qa_activation01a_<stamp>_<hex>`
 *   2) Apply the two 01A migrations directly (users subset + customer_reset_links)
 *   3) Prove: migration shape, UNIQUE token_hash, one-live-link race under
 *      concurrent transactions, second-use rejection, phone attempt cap,
 *      kill-on-login invalidation, and rollback atomicity
 *   4) Drop only validated-prefix disposable DBs in finally
 *
 * Never touches promise_dev / Aiven / Neon / production. Secrets redacted in output.
 *
 * Host command (requires local PostgreSQL):
 *   BASELINE_PGPASSWORD=<local-postgres-password> node scripts/customer-activation-01a-disposable-proof.mjs
 *
 * Optional: BASELINE_PGHOST BASELINE_PGPORT BASELINE_PGUSER
 */

import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const SAFE_PREFIX = "qa_activation01a_";

const admin = {
    host: process.env.BASELINE_PGHOST || "127.0.0.1",
    port: Number(process.env.BASELINE_PGPORT || 5432),
    user: process.env.BASELINE_PGUSER || "postgres",
    password: process.env.BASELINE_PGPASSWORD || process.env.PGPASSWORD || "",
};

function redact(text) {
    let out = String(text);
    for (const s of [admin.password].filter(Boolean)) out = out.split(s).join("<redacted>");
    return out;
}

function assertSafeDbName(name) {
    if (typeof name !== "string" || !name.startsWith(SAFE_PREFIX) || !/^[a-z0-9_]+$/.test(name)) {
        throw new Error(`REFUSE_UNSAFE_DB_NAME: only ${SAFE_PREFIX}* allowed`);
    }
}

const results = [];
function ok(name, detail = "") { results.push({ name, pass: true, detail }); console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
function fail(name, detail = "") { results.push({ name, pass: false, detail }); console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }

function sha256(v) { return createHash("sha256").update(v).digest("hex"); }

async function connect(database) {
    const c = new pg.Client({ ...admin, database });
    await c.connect();
    return c;
}

/** Mirrors migrations 2026_07_30_customer_account_state + _customer_reset_links. */
async function applySchema(c) {
    await c.query(`CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT,
        phone TEXT,
        phone_normalized TEXT,
        password TEXT,
        role TEXT NOT NULL DEFAULT 'Customer',
        password_changed_at TIMESTAMPTZ
    )`);
    // The two statements under proof, copied verbatim from the migration bodies.
    await c.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS customer_account_state TEXT NOT NULL DEFAULT 'active'`);
    await c.query(`CREATE TABLE IF NOT EXISTS customer_reset_links (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        phone_attempts INTEGER NOT NULL DEFAULT 0,
        consumed_at TIMESTAMPTZ,
        invalidated_at TIMESTAMPTZ,
        invalidated_reason TEXT,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_customer_reset_links_user_id ON customer_reset_links (user_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_customer_reset_links_expires ON customer_reset_links (expires_at)`);
}

/** Server-side supersede-then-insert, as implemented in users.routes.ts. */
async function issueLink(client, userId, token, { lock = true } = {}) {
    await client.query("BEGIN");
    if (lock) await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    await client.query(
        `UPDATE customer_reset_links SET invalidated_at = NOW(), invalidated_reason = 'superseded_by_new_link'
         WHERE user_id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL`, [userId]);
    await client.query(
        `INSERT INTO customer_reset_links (id, user_id, token_hash, expires_at, created_by, created_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours', 'admin-1', NOW())`,
        [randomBytes(8).toString("hex"), userId, sha256(token)]);
    await client.query("COMMIT");
}

async function liveLinkCount(c, userId) {
    const r = await c.query(
        `SELECT COUNT(*)::int AS n FROM customer_reset_links
         WHERE user_id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > NOW()`, [userId]);
    return r.rows[0].n;
}

/** Mirrors the claim transaction in customer.routes.ts reset-link/complete. */
async function claim(client, token, suppliedPhoneNorm) {
    await client.query("BEGIN");
    try {
        const linkRes = await client.query(
            `SELECT id, user_id, phone_attempts FROM customer_reset_links
             WHERE token_hash = $1 AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > NOW()
             FOR UPDATE`, [sha256(token)]);
        const link = linkRes.rows[0];
        if (!link) { await client.query("ROLLBACK"); return { ok: false, reason: "no_live_link" }; }

        if (link.phone_attempts >= 5) {
            await client.query(`UPDATE customer_reset_links SET invalidated_at = NOW(), invalidated_reason = 'max_phone_attempts' WHERE id = $1`, [link.id]);
            await client.query("COMMIT");
            return { ok: false, reason: "max_attempts" };
        }

        const userRes = await client.query("SELECT id, phone, phone_normalized FROM users WHERE id = $1", [link.user_id]);
        const user = userRes.rows[0];
        if (!user || user.phone_normalized !== suppliedPhoneNorm) {
            await client.query("UPDATE customer_reset_links SET phone_attempts = phone_attempts + 1 WHERE id = $1", [link.id]);
            await client.query("COMMIT");
            return { ok: false, reason: "phone_mismatch" };
        }

        await client.query(
            `UPDATE users SET password = $2, customer_account_state = 'active', password_changed_at = NOW() WHERE id = $1`,
            [user.id, "$2a$12$fakehashforproof"]);
        await client.query("UPDATE customer_reset_links SET consumed_at = NOW() WHERE id = $1", [link.id]);
        await client.query(
            `UPDATE customer_reset_links SET invalidated_at = NOW(), invalidated_reason = 'superseded_by_use'
             WHERE user_id = $1 AND id <> $2 AND consumed_at IS NULL AND invalidated_at IS NULL`, [user.id, link.id]);
        await client.query("COMMIT");
        return { ok: true, userId: user.id };
    } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        return { ok: false, reason: "error", error: e.message };
    }
}

async function main() {
    if (!admin.password) {
        console.error("BLOCKED: set BASELINE_PGPASSWORD (or PGPASSWORD) — refusing to run without explicit local credentials.");
        process.exit(2);
    }

    const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const dbName = `${SAFE_PREFIX}${stamp}_${randomBytes(2).toString("hex")}`;
    assertSafeDbName(dbName);

    const root = await connect("postgres");
    let created = false;
    try {
        await root.query(`CREATE DATABASE ${dbName}`);
        created = true;
        console.log(`\nDisposable DB: ${SAFE_PREFIX}<redacted>\n`);

        const c = await connect(dbName);
        const c2 = await connect(dbName);
        try {
            await applySchema(c);
            ok("migration_applies", "users.customer_account_state + customer_reset_links");

            // --- migration shape ---
            const cols = await c.query(
                `SELECT column_name, is_nullable, column_default FROM information_schema.columns
                 WHERE table_name = 'customer_reset_links' ORDER BY column_name`);
            const names = cols.rows.map(r => r.column_name);
            const expected = ["consumed_at","created_at","created_by","expires_at","id","invalidated_at","invalidated_reason","phone_attempts","token_hash","user_id"];
            expected.every(e => names.includes(e))
                ? ok("table_shape", `${names.length} columns`)
                : fail("table_shape", `missing: ${expected.filter(e => !names.includes(e))}`);

            const stateDefault = await c.query(
                `SELECT column_default FROM information_schema.columns WHERE table_name='users' AND column_name='customer_account_state'`);
            const defaultExpr = stateDefault.rows[0]?.column_default || "";
            if (defaultExpr.includes("'active'")) ok("existing_accounts_preserved", "customer_account_state DEFAULT 'active'");
            else fail("existing_accounts_preserved", defaultExpr);

            // --- seed an unclaimed customer ---
            await c.query(
                `INSERT INTO users (id, name, phone, phone_normalized, role, customer_account_state)
                 VALUES ('u1','Test Customer','01710000001','1710000001','Customer','unclaimed')`);

            // --- token_hash uniqueness ---
            const dupToken = "dup-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
            await c.query(`INSERT INTO customer_reset_links (id,user_id,token_hash,expires_at) VALUES ('dup1','u1',$1,NOW()+INTERVAL '1 hour')`, [sha256(dupToken)]);
            try {
                await c.query(`INSERT INTO customer_reset_links (id,user_id,token_hash,expires_at) VALUES ('dup2','u1',$1,NOW()+INTERVAL '1 hour')`, [sha256(dupToken)]);
                fail("token_hash_unique", "duplicate insert was accepted");
            } catch {
                ok("token_hash_unique", "duplicate token_hash rejected");
            }
            await c.query("DELETE FROM customer_reset_links");

            // --- F1: concurrent issue must leave exactly one live link ---
            const tA = "tok-A-" + randomBytes(24).toString("base64url");
            const tB = "tok-B-" + randomBytes(24).toString("base64url");
            await Promise.all([issueLink(c, "u1", tA), issueLink(c2, "u1", tB)]);
            const live = await liveLinkCount(c, "u1");
            live === 1
                ? ok("one_live_link_under_concurrency", "exactly 1 live link after 2 concurrent issues")
                : fail("one_live_link_under_concurrency", `${live} live links — supersede+insert is not atomic`);

            // --- negative control -------------------------------------------------
            // A passing concurrency check is only meaningful if the same harness can
            // still catch the unlocked version. Without FOR UPDATE the two writers
            // must be able to leave two live links; if this never reproduces, the
            // positive result above proves nothing.
            await c.query("DELETE FROM customer_reset_links");
            let racedRuns = 0;
            for (let i = 0; i < 12; i++) {
                await c.query("DELETE FROM customer_reset_links");
                await Promise.all([
                    issueLink(c, "u1", "nc-a-" + i + randomBytes(12).toString("base64url"), { lock: false }),
                    issueLink(c2, "u1", "nc-b-" + i + randomBytes(12).toString("base64url"), { lock: false }),
                ]);
                if ((await liveLinkCount(c, "u1")) > 1) racedRuns++;
            }
            await c.query("DELETE FROM customer_reset_links");
            racedRuns > 0
                ? ok("negative_control_unlocked_races", `${racedRuns}/12 unlocked runs produced 2 live links`)
                : fail("negative_control_unlocked_races", "unlocked path never raced — concurrency check may be vacuous");

            // re-establish a single live link for the remaining checks
            await Promise.all([issueLink(c, "u1", tA), issueLink(c2, "u1", tB)]);

            // --- which token survived; the superseded one must be dead ---
            const winner = (await c.query(
                `SELECT token_hash FROM customer_reset_links WHERE consumed_at IS NULL AND invalidated_at IS NULL`)).rows[0]?.token_hash;
            const loser = winner === sha256(tA) ? tB : tA;
            const winTok = winner === sha256(tA) ? tA : tB;

            const loserClaim = await claim(c, loser, "1710000001");
            loserClaim.ok === false
                ? ok("superseded_link_rejected", loserClaim.reason)
                : fail("superseded_link_rejected", "superseded link still worked");

            // --- phone mismatch increments attempts, does not consume ---
            const bad = await claim(c, winTok, "9999999999");
            const attempts = (await c.query(
                `SELECT phone_attempts FROM customer_reset_links WHERE token_hash=$1`, [sha256(winTok)])).rows[0].phone_attempts;
            bad.ok === false && attempts === 1
                ? ok("phone_mismatch_increments", `reason=${bad.reason} attempts=${attempts}`)
                : fail("phone_mismatch_increments", `ok=${bad.ok} attempts=${attempts}`);

            const stillUnclaimed = (await c.query("SELECT customer_account_state FROM users WHERE id='u1'")).rows[0].customer_account_state;
            stillUnclaimed === "unclaimed"
                ? ok("failed_claim_no_state_change", "still unclaimed")
                : fail("failed_claim_no_state_change", stillUnclaimed);

            // --- attempt cap burns the link ---
            for (let i = 0; i < 4; i++) await claim(c, winTok, "9999999999");
            const capped = await claim(c, winTok, "1710000001"); // correct phone, but cap already hit
            const burned = (await c.query(
                `SELECT invalidated_reason FROM customer_reset_links WHERE token_hash=$1`, [sha256(winTok)])).rows[0].invalidated_reason;
            capped.ok === false && burned === "max_phone_attempts"
                ? ok("attempt_cap_burns_link", `reason=${burned}`)
                : fail("attempt_cap_burns_link", `ok=${capped.ok} reason=${burned}`);

            // --- happy path on a fresh link ---
            const tC = "tok-C-" + randomBytes(24).toString("base64url");
            await issueLink(c, "u1", tC);
            const good = await claim(c, tC, "1710000001");
            const state = (await c.query("SELECT customer_account_state, password FROM users WHERE id='u1'")).rows[0];
            good.ok && state.customer_account_state === "active" && state.password
                ? ok("claim_activates_account", "state=active, password set")
                : fail("claim_activates_account", JSON.stringify(state));

            // --- second use of the same token must fail ---
            const second = await claim(c, tC, "1710000001");
            second.ok === false
                ? ok("second_use_rejected", second.reason)
                : fail("second_use_rejected", "token was consumed twice");

            // --- concurrent claim of one link: exactly one winner ---
            await c.query("UPDATE users SET customer_account_state='unclaimed', password=NULL WHERE id='u1'");
            const tD = "tok-D-" + randomBytes(24).toString("base64url");
            await issueLink(c, "u1", tD);
            const [r1, r2] = await Promise.all([claim(c, tD, "1710000001"), claim(c2, tD, "1710000001")]);
            const winners = [r1, r2].filter(r => r.ok).length;
            winners === 1
                ? ok("concurrent_claim_single_winner", "FOR UPDATE serialised the two claims")
                : fail("concurrent_claim_single_winner", `${winners} winners — race is live`);

            // --- kill-on-login invalidates live links ---
            const tE = "tok-E-" + randomBytes(24).toString("base64url");
            await issueLink(c, "u1", tE);
            await c.query(
                `UPDATE customer_reset_links SET invalidated_at = NOW(), invalidated_reason = 'login'
                 WHERE user_id = 'u1' AND consumed_at IS NULL AND invalidated_at IS NULL`);
            const afterLogin = await claim(c, tE, "1710000001");
            afterLogin.ok === false && (await liveLinkCount(c, "u1")) === 0
                ? ok("kill_on_login", "live links invalidated by login")
                : fail("kill_on_login", `claim.ok=${afterLogin.ok}`);

            // --- rollback atomicity: a failure mid-transaction must leave nothing behind ---
            await c.query("UPDATE users SET customer_account_state='unclaimed', password=NULL WHERE id='u1'");
            const tF = "tok-F-" + randomBytes(24).toString("base64url");
            await issueLink(c, "u1", tF);
            await c.query("BEGIN");
            await c.query(`SELECT id FROM customer_reset_links WHERE token_hash=$1 FOR UPDATE`, [sha256(tF)]);
            await c.query(`UPDATE users SET password='x', customer_account_state='active' WHERE id='u1'`);
            await c.query("ROLLBACK");
            const rolled = (await c.query("SELECT customer_account_state FROM users WHERE id='u1'")).rows[0].customer_account_state;
            const stillLive = await liveLinkCount(c, "u1");
            rolled === "unclaimed" && stillLive === 1
                ? ok("rollback_atomicity", "aborted claim left no partial state")
                : fail("rollback_atomicity", `state=${rolled} live=${stillLive}`);

        } finally {
            await c.end().catch(() => {});
            await c2.end().catch(() => {});
        }
    } finally {
        if (created) {
            assertSafeDbName(dbName);
            await root.query(
                `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [dbName]);
            await root.query(`DROP DATABASE IF EXISTS ${dbName}`);
            console.log(`\nDropped disposable DB ${SAFE_PREFIX}<redacted>`);
        }
        await root.end().catch(() => {});
    }

    const failed = results.filter(r => !r.pass);
    console.log(`\n${"=".repeat(60)}`);
    console.log(`RESULT: ${results.length - failed.length}/${results.length} checks passed`);
    console.log("=".repeat(60));
    if (failed.length) {
        for (const f of failed) console.log(`  FAILED: ${f.name} — ${f.detail}`);
        process.exit(1);
    }
}

main().catch((e) => { console.error("PROOF ERROR:", redact(e.stack || e.message)); process.exit(1); });
