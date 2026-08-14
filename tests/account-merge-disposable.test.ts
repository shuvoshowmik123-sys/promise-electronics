/**
 * Folding a duplicate customer account into the real one.
 *
 * The duplicate exists because the two sign-in doors identify a customer by
 * different things: phone and password key on the phone number, Google keys on
 * the Google id and falls back to a matching email. Registration does not
 * require an email, so for most customers there is nothing to match on, and
 * "Continue with Google" quietly makes a second, empty account.
 *
 * A merge is the one operation in this system that no later edit can undo: it
 * moves one customer's repair history onto another row. So it is tested against
 * real PostgreSQL, with real rows in real tables, and every guard is checked by
 * making it fire — a guard that has never refused anything is a guard nobody
 * has tested.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import pg from "pg";

const MAINT_URL = process.env.TEST_PG_URL || "postgres://postgres:postgres@localhost:5432/postgres";
const DB_NAME = `promise_mergetest_${Date.now().toString(36)}`;
const DISPOSABLE_URL = MAINT_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);

function probeLocalPostgres(): boolean {
    if (!/localhost|127\.0\.0\.1|::1/i.test(MAINT_URL)) return false;
    const script = `
    const pg = require(${JSON.stringify("pg")});
    const c = new pg.Client({ connectionString: ${JSON.stringify(MAINT_URL)}, connectionTimeoutMillis: 3000 });
    c.connect().then(() => { console.log("PG_OK"); return c.end(); }).catch(() => { process.exit(0); });
  `;
    const res = spawnSync(process.execPath, ["-e", script], { cwd: process.cwd(), timeout: 10_000, encoding: "utf8" });
    return /PG_OK/.test(res.stdout || "");
}

const LOCAL_PG_AVAILABLE = probeLocalPostgres();

describe.skipIf(!LOCAL_PG_AVAILABLE)("merging a duplicate customer, against real PostgreSQL", () => {
    let admin: pg.Client;
    let db: pg.Client;
    let service: typeof import("../server/services/account-merge.service.js");
    const originalEnv: Record<string, string | undefined> = {};

    beforeAll(async () => {
        if (!LOCAL_PG_AVAILABLE) return;
        originalEnv.DATABASE_URL = process.env.DATABASE_URL;

        admin = new pg.Client({ connectionString: MAINT_URL });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${DB_NAME}`);

        db = new pg.Client({ connectionString: DISPOSABLE_URL });
        await db.connect();

        // Tables from the Drizzle model; hand-listing columns rots on the next
        // schema change, and the merge reads information_schema, so the shape
        // has to be the real one.
        const { getTableColumns, is } = await import("drizzle-orm");
        const { PgTable, getTableConfig } = await import("drizzle-orm/pg-core");
        const schema = await import("../shared/schema.js");
        for (const value of Object.values(schema as Record<string, unknown>)) {
            if (!is(value, PgTable)) continue;
            const table = value as any;
            const cfg = getTableConfig(table);
            const cols = Object.values(getTableColumns(table) as Record<string, any>).map((col) => {
                const bits = [`"${col.name}"`, col.getSQLType()];
                if (col.primary) bits.push("PRIMARY KEY");
                if (col.notNull && !col.primary) bits.push("NOT NULL");
                return bits.join(" ");
            });
            await db.query(`CREATE TABLE IF NOT EXISTS "${cfg.name}" (${cols.join(", ")})`).catch(() => { });
        }
        const stamped = await db.query(`
            SELECT table_name, column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND is_nullable = 'NO'
              AND column_default IS NULL AND data_type LIKE 'timestamp%'
        `);
        for (const row of stamped.rows) {
            await db.query(`ALTER TABLE "${row.table_name}" ALTER COLUMN "${row.column_name}" SET DEFAULT now()`).catch(() => { });
        }
        await db.query(`ALTER TABLE users ALTER COLUMN customer_account_state SET DEFAULT 'active'`);
        await db.query(`ALTER TABLE users ALTER COLUMN status SET DEFAULT 'Active'`);
        await db.query(`ALTER TABLE users ALTER COLUMN permissions SET DEFAULT '{}'`);
        await db.query(`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'Customer'`);
        // Created by the migration runner, not the model, and the merge kills
        // live links so it must exist.
        await db.query(`CREATE TABLE IF NOT EXISTS customer_reset_links (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
            expires_at TIMESTAMPTZ NOT NULL, phone_attempts INTEGER NOT NULL DEFAULT 0,
            consumed_at TIMESTAMPTZ, invalidated_at TIMESTAMPTZ, invalidated_reason TEXT,
            created_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);

        process.env.DATABASE_URL = DISPOSABLE_URL;
        service = await import("../server/services/account-merge.service.js");
    }, 120_000);

    afterAll(async () => {
        if (!LOCAL_PG_AVAILABLE) return;
        /**
         * Drain the app's own pool before the database goes away.
         *
         * DROP DATABASE ... WITH (FORCE) terminates whatever is still connected,
         * and the pooled clients this test opened belong to the shared module
         * pool. Killing them under it surfaces as "terminating connection due to
         * administrator command" in whichever test runs next in this worker —
         * a failure with nothing to do with the code under test.
         */
        const { resetDbPool } = await import("../server/db.js");
        /**
         * Bounded, because resetDbPool races its own ten-second drain timeout
         * and this hook does not have ten seconds to give it. Under full-suite
         * parallelism the drain is the slowest thing here, and a teardown that
         * overruns fails the file with every one of its tests already green —
         * which reads as a broken test rather than a slow socket.
         *
         * Three seconds is enough for an idle pool. If it is not, the database
         * is dropped from under it a moment later anyway.
         */
        await Promise.race([
            resetDbPool("disposable test teardown").catch(() => { }),
            new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
        await db?.end().catch(() => { });
        await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`).catch(() => { });
        await admin?.end().catch(() => { });
        if (originalEnv.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = originalEnv.DATABASE_URL;
    }, 60_000);

    /** A phone account with history, and the empty Google duplicate beside it. */
    async function makePair(tag: string, opts: { email?: string | null; sourcePhone?: string | null } = {}) {
        const real = `real-${tag}`;
        const stray = `stray-${tag}`;
        const phone = `+8801700${tag.padStart(5, "0")}`;
        await db.query(
            `INSERT INTO users (id, username, name, phone, phone_normalized, password, role, status, customer_account_state, permissions, email)
             VALUES ($1, $2, 'Shahin Real', $3, $4, 'hashed-password', 'Customer', 'Active', 'active', '{}', $5)`,
            [real, phone, phone, phone.slice(-10), opts.email ?? null],
        );
        await db.query(
            `INSERT INTO users (id, name, password, role, status, customer_account_state, permissions, email, google_sub, firebase_uid, phone, phone_normalized, profile_image_url)
             VALUES ($1, 'Shahin (Google)', '!no-customer-password!', 'Customer', 'Active', 'active', '{}', $2, $3, $4, $5, $6, 'https://pic')`,
            [stray, opts.email ?? null, `gsub-${tag}`, `fuid-${tag}`, opts.sourcePhone ?? null, opts.sourcePhone ? opts.sourcePhone.slice(-10) : null],
        );
        return { real, stray, phone };
    }

    it("moves everything the duplicate owns onto the real account", async () => {
        const { real, stray } = await makePair("1");

        // The duplicate picked up a repair and a notification while they were
        // stuck in it — this is exactly what must not be lost.
        await db.query(
            `INSERT INTO service_requests (id, ticket_number, brand, primary_issue, customer_name, phone, status, tracking_status, customer_id)
             VALUES ('sr-stray-1', 'SRV-X-0001', 'Sony', 'No power', 'Shahin', '+880170000001', 'Pending', 'received', $1)`,
            [stray],
        );
        await db.query(
            `INSERT INTO notifications (id, user_id, title, message, type)
             VALUES ('ntf-stray-1', $1, 'Update', 'Your TV is ready', 'info')`,
            [stray],
        );

        const result = await service.mergeCustomerAccounts({
            sourceId: stray, targetId: real, actorId: "u-staff", reason: "test",
        });
        expect("ok" in result && result.ok, JSON.stringify(result)).toBe(true);

        const sr = await db.query(`SELECT customer_id FROM service_requests WHERE id = 'sr-stray-1'`);
        expect(sr.rows[0].customer_id).toBe(real);
        const ntf = await db.query(`SELECT user_id FROM notifications WHERE id = 'ntf-stray-1'`);
        expect(ntf.rows[0].user_id).toBe(real);
    }, 60_000);

    it("hands the Google keys to the real account and retires the duplicate", async () => {
        const { real, stray } = await makePair("2");

        await service.mergeCustomerAccounts({ sourceId: stray, targetId: real, actorId: "u-staff", reason: "test" });

        const after = await db.query(
            `SELECT id, google_sub, firebase_uid, profile_image_url, customer_account_state, status, password, username
             FROM users WHERE id IN ($1, $2)`,
            [real, stray],
        );
        const target = after.rows.find((r) => r.id === real)!;
        const source = after.rows.find((r) => r.id === stray)!;

        // The keys move, so signing in with Google now lands on the real account.
        expect(target.google_sub).toBe("gsub-2");
        expect(target.firebase_uid).toBe("fuid-2");
        expect(target.profile_image_url).toBe("https://pic");

        // And the duplicate can never be signed into again by any door.
        expect(source.google_sub).toBeNull();
        expect(source.firebase_uid).toBeNull();
        expect(source.customer_account_state).toBe("merged");
        expect(source.password).toBe("!no-customer-password!");
    }, 60_000);

    it("never overwrites what the real account already says", async () => {
        // The name on the repair docket is the shop's, not Google's.
        const { real, stray } = await makePair("3", { email: null });
        await db.query(`UPDATE users SET email = 'shop-knows@example.test' WHERE id = $1`, [real]);
        await db.query(`UPDATE users SET email = 'google-account@example.test' WHERE id = $1`, [stray]);

        await service.mergeCustomerAccounts({ sourceId: stray, targetId: real, actorId: "u-staff", reason: "test" });

        const after = await db.query(`SELECT email, name FROM users WHERE id = $1`, [real]);
        expect(after.rows[0].email).toBe("shop-knows@example.test");
        expect(after.rows[0].name).toBe("Shahin Real");
    }, 60_000);

    it("refuses when both rows carry a phone number", async () => {
        /**
         * The guard that matters most. Two rows with two phone numbers are two
         * identities — a husband and wife on one shared email, say — and no
         * rule here can tell that from one person twice. Merging them would
         * hand one customer the other's repair history, permanently.
         */
        const { real, stray } = await makePair("4", { sourcePhone: "+8801799999999" });

        const result = await service.mergeCustomerAccounts({
            sourceId: stray, targetId: real, actorId: "u-staff", reason: "test",
        });
        expect(result).toEqual({ ok: false, reason: "source_has_phone" });

        // And nothing moved.
        const after = await db.query(`SELECT customer_account_state FROM users WHERE id = $1`, [stray]);
        expect(after.rows[0].customer_account_state).toBe("active");
    }, 60_000);

    it("refuses to merge the same account into itself, or one already merged", async () => {
        const { real, stray } = await makePair("5");
        expect(await service.mergeCustomerAccounts({ sourceId: real, targetId: real, actorId: "s", reason: "t" }))
            .toEqual({ ok: false, reason: "same_account" });

        await service.mergeCustomerAccounts({ sourceId: stray, targetId: real, actorId: "s", reason: "t" });
        // Second time: the duplicate is a tombstone now.
        expect(await service.mergeCustomerAccounts({ sourceId: stray, targetId: real, actorId: "s", reason: "t" }))
            .toEqual({ ok: false, reason: "already_merged" });
    }, 60_000);

    it("writes down every row it moved, so the merge can be undone", async () => {
        const { real, stray } = await makePair("6");
        await db.query(
            `INSERT INTO service_requests (id, ticket_number, brand, primary_issue, customer_name, phone, status, tracking_status, customer_id)
             VALUES ('sr-stray-6', 'SRV-X-0006', 'LG', 'No sound', 'Shahin', '+880170000006', 'Pending', 'received', $1)`,
            [stray],
        );

        const result = await service.mergeCustomerAccounts({ sourceId: stray, targetId: real, actorId: "u-staff", reason: "test" });
        expect("ok" in result && result.ok).toBe(true);

        const log = await db.query(
            `SELECT entity, entity_id, changes, severity FROM audit_logs WHERE entity = 'CustomerAccountMerge' AND entity_id = $1`,
            [real],
        );
        expect(log.rows).toHaveLength(1);
        const changes = log.rows[0].changes;
        expect(changes.old.sourceId).toBe(stray);
        const moved = changes.new.moves.find((m: any) => m.table === "service_requests");
        // The ids, not just a count: a count cannot be reversed.
        expect(moved.ids).toContain("sr-stray-6");
        expect(log.rows[0].severity).toBe("warning");
    }, 60_000);

    it("kills any live reset link on either account", async () => {
        const { real, stray } = await makePair("7");
        await db.query(
            `INSERT INTO customer_reset_links (id, user_id, token_hash, expires_at, phone_attempts)
             VALUES ('crl-7', $1, 'hash-7', now() + interval '1 day', 0)`,
            [real],
        );

        await service.mergeCustomerAccounts({ sourceId: stray, targetId: real, actorId: "s", reason: "t" });

        const link = await db.query(`SELECT invalidated_at, invalidated_reason FROM customer_reset_links WHERE id = 'crl-7'`);
        expect(link.rows[0].invalidated_at).not.toBeNull();
        expect(link.rows[0].invalidated_reason).toBe("account_merged");
    }, 60_000);

    it("does not rewrite history", async () => {
        // audit_logs says what an account did at the time. Moving those rows
        // would make the record lie about who acted.
        const { real, stray } = await makePair("8");
        await db.query(
            `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, details)
             VALUES ('al-8', $1, 'LOGIN', 'Customer', $1, 'signed in')`,
            [stray],
        );

        await service.mergeCustomerAccounts({ sourceId: stray, targetId: real, actorId: "s", reason: "t" });

        const log = await db.query(`SELECT user_id FROM audit_logs WHERE id = 'al-8'`);
        expect(log.rows[0].user_id).toBe(stray);
    }, 60_000);

    it("only pairs duplicates automatically where exactly one account matches", async () => {
        /**
         * The honest limit of the automatic sweep. These duplicates exist
         * BECAUSE nothing matched — a shared email would have made the login
         * link the accounts instead of making a new one. So the sweep can only
         * catch the pairs where an email was added afterwards, and it must
         * refuse anything with more than one candidate on either side.
         */
        await makePair("9", { email: "one-match@example.test" });
        await makePair("10", { email: "two-matches@example.test" });
        // A second real account on the same address makes the pairing a guess.
        await db.query(
            `INSERT INTO users (id, username, name, phone, phone_normalized, password, role, status, customer_account_state, permissions, email)
             VALUES ('real-10b', '+8801711111111', 'Someone Else', '+8801711111111', '1711111111', 'hash', 'Customer', 'Active', 'active', '{}', 'two-matches@example.test')`,
        );

        const found = await service.findAutoMergeableDuplicates();
        const emails = found.map((f) => f.email);
        expect(emails).toContain("one-match@example.test");
        expect(emails).not.toContain("two-matches@example.test");
    }, 60_000);
});
