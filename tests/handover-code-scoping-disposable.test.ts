import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

/**
 * A customer with two open repairs must be shown each repair's OWN code.
 *
 * GET /api/customer/service-requests/:id/handover-code finds the live OTP row
 * scoped to the requested repair, then reads the plaintext out of the
 * notification that carried it (otp_codes stores only a hash). That second
 * lookup used to filter on user_id and type alone:
 *
 *   SELECT message FROM notifications
 *   WHERE user_id = $1 AND type = 'handover_code'
 *   ORDER BY created_at DESC LIMIT 1
 *
 * so it returned the customer's NEWEST handover notification whichever repair
 * it belonged to. Open repair A while B's code is newer and the screen shows
 * B's code against A's live OTP — the customer reads it to the driver at their
 * door and it fails verification.
 *
 * The query is exercised against real PostgreSQL because the defect and the fix
 * are both entirely in SQL predicates; a mock would prove nothing.
 *
 * Skips when no local PostgreSQL is reachable.
 */

const MAINT_URL = process.env.TEST_LOCAL_PG_URL || "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const DB_NAME = `qa_handover_scope_${process.pid.toString(36)}_${Date.now().toString(36)}`;
const DISPOSABLE_URL = MAINT_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);

const CUSTOMER = "cust-1";
const REQ_A = { id: "sr-a", ticket: "SRV-20260805-0001", code: "111111" };
const REQ_B = { id: "sr-b", ticket: "SRV-20260805-0002", code: "222222" };

const linkFor = (ticket: string) => `/track-order?order=${encodeURIComponent(ticket)}&type=service`;

let client: pg.Client | null = null;
let available = false;

beforeAll(async () => {
    let admin: pg.Client | null = null;
    try {
        admin = new pg.Client({ connectionString: MAINT_URL });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${DB_NAME}`);
        await admin.end();
    } catch {
        if (admin) await admin.end().catch(() => undefined);
        return;
    }

    client = new pg.Client({ connectionString: DISPOSABLE_URL });
    await client.connect();

    await client.query(`
        CREATE TABLE otp_codes (
            id TEXT PRIMARY KEY,
            purpose TEXT NOT NULL,
            verified_at TIMESTAMPTZ,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE notifications (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT NOT NULL,
            link TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    // Both repairs have a live, unverified code. B's notification is NEWER —
    // that ordering is what made the old query return B for A.
    await client.query(
        `INSERT INTO otp_codes (id, purpose, expires_at, created_at) VALUES
           ('otp-a', $1, NOW() + INTERVAL '5 minutes', NOW() - INTERVAL '90 seconds'),
           ('otp-b', $2, NOW() + INTERVAL '5 minutes', NOW() - INTERVAL '10 seconds')`,
        [`custody_receive:${REQ_A.id}`, `custody_receive:${REQ_B.id}`],
    );

    await client.query(
        `INSERT INTO notifications (id, user_id, title, message, type, link, created_at) VALUES
           ('n-a', $1, 'Handover code', $2, 'handover_code', $3, NOW() - INTERVAL '90 seconds'),
           ('n-b', $1, 'Handover code', $4, 'handover_code', $5, NOW() - INTERVAL '10 seconds')`,
        [
            CUSTOMER,
            `Your Promise Electronics collection code is ${REQ_A.code}. Valid for 5 minutes.`,
            linkFor(REQ_A.ticket),
            `Your Promise Electronics collection code is ${REQ_B.code}. Valid for 5 minutes.`,
            linkFor(REQ_B.ticket),
        ],
    );

    available = true;
});

afterAll(async () => {
    if (client) await client.end().catch(() => undefined);
    if (!available) return;
    const admin = new pg.Client({ connectionString: MAINT_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    await admin.end();
});

/** The live-OTP lookup, unchanged by the fix. */
async function liveOtp(serviceRequestId: string) {
    const res = await client!.query(
        `SELECT purpose, expires_at, created_at FROM otp_codes
         WHERE purpose IN ($1, $2) AND verified_at IS NULL AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [`custody_receive:${serviceRequestId}`, `custody_delivery:${serviceRequestId}`],
    );
    return res.rows[0];
}

/** The fixed lookup: scoped by link AND pinned to this issuance. */
async function codeForRequest(ticket: string, otpCreatedAt: string) {
    const floor = new Date(new Date(otpCreatedAt).getTime() - 60_000);
    const res = await client!.query(
        `SELECT message FROM notifications
         WHERE user_id = $1 AND type = 'handover_code'
           AND link = $2 AND created_at >= $3
         ORDER BY created_at DESC LIMIT 1`,
        [CUSTOMER, linkFor(ticket), floor],
    );
    return String(res.rows[0]?.message ?? "").match(/\b(\d{6})\b/)?.[1] ?? null;
}

/** The original lookup, kept to demonstrate the defect it produced. */
async function codeUnscoped() {
    const res = await client!.query(
        `SELECT message FROM notifications
         WHERE user_id = $1 AND type = 'handover_code'
         ORDER BY created_at DESC LIMIT 1`,
        [CUSTOMER],
    );
    return String(res.rows[0]?.message ?? "").match(/\b(\d{6})\b/)?.[1] ?? null;
}

describe("handover code is scoped to the repair being viewed", () => {
    it("returns repair A's own code when A is opened", async () => {
        if (!available) return;
        const otp = await liveOtp(REQ_A.id);
        expect(otp).toBeTruthy();
        await expect(codeForRequest(REQ_A.ticket, otp.created_at)).resolves.toBe(REQ_A.code);
    });

    it("returns repair B's own code when B is opened", async () => {
        if (!available) return;
        const otp = await liveOtp(REQ_B.id);
        await expect(codeForRequest(REQ_B.ticket, otp.created_at)).resolves.toBe(REQ_B.code);
    });

    it("the unscoped query returns B's code for BOTH repairs — the defect", async () => {
        if (!available) return;
        // Proof the test data actually reproduces the bug: without scoping, the
        // newest notification wins regardless of which repair was opened.
        await expect(codeUnscoped()).resolves.toBe(REQ_B.code);
        expect(REQ_B.code).not.toBe(REQ_A.code);
    });

    it("does not fall back to an older code for the same repair", async () => {
        if (!available) return;
        // An expired earlier code for A must not surface once a newer one exists.
        await client!.query(
            `INSERT INTO notifications (id, user_id, title, message, type, link, created_at)
             VALUES ('n-a-old', $1, 'Handover code', $2, 'handover_code', $3, NOW() - INTERVAL '2 hours')`,
            [CUSTOMER, "Your Promise Electronics collection code is 999999. Valid for 5 minutes.", linkFor(REQ_A.ticket)],
        );
        const otp = await liveOtp(REQ_A.id);
        await expect(codeForRequest(REQ_A.ticket, otp.created_at)).resolves.toBe(REQ_A.code);
    });
});
