/**
 * Register in the portal, then log in with what you just typed.
 *
 * The reported bug is this sentence: "a customer opens an account and then
 * cannot sign in — it says invalid password". Two very different situations get
 * the same message, and telling them apart is the whole question:
 *
 *   the shop made the account   intake row, no password, state 'unclaimed'
 *                               — fixed separately, by a staff-issued code
 *
 *   the customer made it        register, own password, state 'active'
 *                               — must simply work, every time
 *
 * Reading the code says the second case is fine. Reading is not proof: the
 * login lookup is index-first with a legacy fallback, registration writes no
 * phone_normalized, and whether those two agree is a property of live SQL, not
 * of the source. So this runs against a real PostgreSQL, through the real
 * routes, with real bcrypt.
 *
 * Skipped, not failed, where no local PostgreSQL answers — a test that cannot
 * connect must not read as a passing suite.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import express from "express";
import session from "express-session";
import request from "supertest";
import pg from "pg";

const MAINT_URL = process.env.TEST_PG_URL || "postgres://postgres:postgres@localhost:5432/postgres";
const DB_NAME = `promise_regtest_${Date.now().toString(36)}`;
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

describe.skipIf(!LOCAL_PG_AVAILABLE)("register then log in, against real PostgreSQL", () => {
    let admin: pg.Client;
    let db: pg.Client;
    let app: express.Express;
    const originalEnv: Record<string, string | undefined> = {};

    beforeAll(async () => {
        if (!LOCAL_PG_AVAILABLE) return;
        originalEnv.DATABASE_URL = process.env.DATABASE_URL;
        originalEnv.SESSION_SECRET = process.env.SESSION_SECRET;

        admin = new pg.Client({ connectionString: MAINT_URL });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${DB_NAME}`);

        db = new pg.Client({ connectionString: DISPOSABLE_URL });
        await db.connect();

        /**
         * Tables from the Drizzle model, not hand-listed. A hand-written table
         * looks right until the code does select(), which asks for every column
         * the model declares, and the query dies on one nobody created.
         */
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
                if (col.hasDefault && col.default !== undefined) {
                    const d = col.default;
                    bits.push(`DEFAULT ${typeof d === "string" ? `'${d}'` : typeof d === "boolean" ? String(d) : typeof d === "number" ? String(d) : "NULL"}`);
                }
                return bits.join(" ");
            });
            await db.query(`CREATE TABLE IF NOT EXISTS "${cfg.name}" (${cols.join(", ")})`).catch(() => { });
        }
        /**
         * Two gaps between the model and the real database, both filled here
         * rather than papered over:
         *
         * defaultNow() is a SQL default the column builder above cannot render,
         * so every NOT NULL timestamp gets now() — otherwise inserts that rely
         * on the database to stamp the row fail on a not-null violation.
         */
        const stamped = await db.query(`
            SELECT table_name, column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND is_nullable = 'NO'
              AND column_default IS NULL AND data_type LIKE 'timestamp%'
        `);
        for (const row of stamped.rows) {
            await db.query(`ALTER TABLE "${row.table_name}" ALTER COLUMN "${row.column_name}" SET DEFAULT now()`).catch(() => { });
        }

        /**
         * users.password_changed_at exists in production — migration
         * 2026_07_17_password_changed_at added it — but is not declared in
         * shared/schema.ts, and several paths read and write it with raw SQL.
         * The disposable database is built from the model, so without this the
         * test would fail on a column the real system has.
         */
        await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP`);

        process.env.DATABASE_URL = DISPOSABLE_URL;
        process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret-not-used-in-production";

        // Outbound noise only. The database, bcrypt, the lookup, and the guards
        // are all the real ones — mocking any of those would test the mock.
        vi.doMock("../server/services/firebase.js", () => ({ firebaseAdmin: null }));
        vi.doMock("../server/routes/middleware/sse-broker.js", () => ({
            addCustomerSSEClient: vi.fn(),
            removeCustomerSSEClient: vi.fn(),
            notifyAdminUpdate: vi.fn(),
            notifyCustomerUpdate: vi.fn(),
        }));
        vi.doMock("../server/routes/blacklist.routes.js", () => ({
            default: express.Router(),
            isPhoneBlacklisted: async () => false,
        }));

        const { default: router } = await import("../server/routes/customer.routes.js");
        app = express();
        app.use(express.json());
        app.use(session({
            secret: "test-secret",
            resave: false,
            saveUninitialized: false,
        }) as any);
        app.use(router);
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
        await resetDbPool("disposable test teardown").catch(() => { });
        await db?.end().catch(() => { });
        await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`).catch(() => { });
        await admin?.end().catch(() => { });
        if (originalEnv.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = originalEnv.DATABASE_URL;
    });

    it("signs in with the password just chosen at registration", async () => {
        const agent = request.agent(app);
        const phone = "01712340001";

        const reg = await agent.post("/api/customer/register").send({
            name: "Shahin",
            phone,
            password: "correct-horse",
            confirmPassword: "correct-horse",
        });
        expect(reg.status, JSON.stringify(reg.body)).toBe(201);

        const login = await request(app).post("/api/customer/login").send({
            phone,
            password: "correct-horse",
        });
        expect(login.status, JSON.stringify(login.body)).toBe(200);
        expect(login.body.phone).toBeTruthy();
    }, 60_000);

    it("finds the account however the number is typed", async () => {
        // Registration stores whatever the form sent and writes no
        // phone_normalized; login normalises the input and looks the indexed
        // column up first. If those two disagree, a customer who registered as
        // 017… and logs in as +88017… is told their password is wrong.
        const agent = request.agent(app);
        const reg = await agent.post("/api/customer/register").send({
            name: "Nusrat",
            phone: "01712340002",
            password: "another-password",
            confirmPassword: "another-password",
        });
        expect(reg.status, JSON.stringify(reg.body)).toBe(201);

        for (const typed of ["01712340002", "+8801712340002", "8801712340002"]) {
            const login = await request(app).post("/api/customer/login").send({
                phone: typed,
                password: "another-password",
            });
            expect(login.status, `login failed for ${typed}: ${JSON.stringify(login.body)}`).toBe(200);
        }
    }, 60_000);

    it("still refuses the wrong password", async () => {
        // The negative control. Without it, a login route that returned 200 for
        // everything would pass every test above.
        const agent = request.agent(app);
        await agent.post("/api/customer/register").send({
            name: "Kamal",
            phone: "01712340003",
            password: "real-password",
            confirmPassword: "real-password",
        });

        const login = await request(app).post("/api/customer/login").send({
            phone: "01712340003",
            password: "wrong-password",
        });
        expect(login.status).toBe(401);
    }, 60_000);

    it("lets an account the shop created be opened with a staff code, then logged into", async () => {
        /**
         * The other half of the reported bug, end to end: an intake row with no
         * password, a code issued in the admin panel, and a login afterwards
         * that works — the path that used to dead-end at "invalid password".
         */
        const phone = "01712340004";
        await db.query(
            `INSERT INTO users (id, username, name, phone, phone_normalized, password, role, status, customer_account_state, permissions)
       VALUES ('u-intake-1', $1, 'Walk-in Customer', $1, '1712340004', '!no-customer-password!', 'Customer', 'Active', 'unclaimed', '{}')`,
            [phone],
        );

        // Before the code: the door the customer actually hits.
        const blocked = await request(app).post("/api/customer/login").send({
            phone,
            password: "anything-at-all",
        });
        expect(blocked.status).toBe(401);

        const { issueSetupCode, completeActivation } = await import("../server/services/account-activation.service.js");
        const issued = await issueSetupCode("u-intake-1", { id: "u-staff", name: "Counter" });
        expect(issued?.code).toMatch(/^\d{6}$/);

        const wrong = await completeActivation({
            phone,
            code: "000000",
            password: "chosen-by-customer",
        });
        expect(wrong.ok).toBe(false);

        const done = await completeActivation({
            phone,
            code: issued!.code,
            password: "chosen-by-customer",
        });
        expect(done.ok, JSON.stringify(done)).toBe(true);

        const login = await request(app).post("/api/customer/login").send({
            phone,
            password: "chosen-by-customer",
        });
        expect(login.status, JSON.stringify(login.body)).toBe(200);

        // And the code is spent: a second use of the same digits does nothing.
        const replay = await completeActivation({
            phone,
            code: issued!.code,
            password: "someone-elses-password",
        });
        expect(replay.ok).toBe(false);
    }, 60_000);
});
