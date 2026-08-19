/**
 * Device tokens: what they let through, and every way they end.
 *
 * The app signs in once and then holds a secret for weeks, so the interesting
 * cases are all refusals. A token has to stop working when the password
 * changes, when a Super Admin revokes it, when it expires, and when the account
 * is deactivated — and it must stop working without anybody being able to reach
 * the phone, because a lost or resigned-with handset never reports back.
 *
 * Run against a real Express app rather than by reading the source. The claim
 * being tested is that a token produces a request the existing guards accept
 * unchanged, and only actually sending one through a guard can show that.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const execute = vi.fn();
const getUser = vi.fn();

vi.mock("../server/db.js", () => ({ db: { execute: (q: unknown) => execute(q) } }));
vi.mock("../server/storage.js", () => ({ storage: { getUser: (id: string) => getUser(id) } }));

const USER = { id: "u-1", username: "manager1", role: "Manager", status: "Active", passwordChangedAt: null };
const TOKEN = "a-device-token";
const FUTURE = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 1000);

/** One staff_devices row, with only the field under test changed. */
function deviceRow(over: Record<string, unknown> = {}) {
    return {
        rows: [{
            id: "d-1", user_id: USER.id, password_stamp: 0,
            expires_at: FUTURE.toISOString(), revoked_at: null, ...over,
        }],
    };
}

/**
 * An app with the device middleware in front of a route that reads the session
 * the ordinary way — the shape every existing guard uses.
 */
async function buildApp() {
    const { staffDeviceAuthMiddleware } = await import("../server/middleware/staff-device-auth.js");
    const app = express();
    app.use(staffDeviceAuthMiddleware as any);
    app.get("/api/admin/thing", (req: any, res) => {
        if (!req.session?.adminUserId) return res.status(401).json({ error: "no session" });
        res.json({ userId: req.session.adminUserId, role: req.session.adminUserRole });
    });
    return app;
}

const withToken = (app: express.Express) =>
    request(app).get("/api/admin/thing").set("Authorization", `Bearer ${TOKEN}`);

beforeEach(() => {
    vi.resetModules();
    execute.mockReset();
    getUser.mockReset();
    getUser.mockResolvedValue(USER);
    // Default: a live row. Writes (touch/revoke) also land here and resolve.
    execute.mockResolvedValue(deviceRow());
});
afterEach(() => vi.restoreAllMocks());

describe("a valid device token", () => {
    it("is accepted by a route that only knows about sessions", async () => {
        const res = await withToken(await buildApp());

        expect(res.status).toBe(200);
        expect(res.body.userId).toBe(USER.id);
    });

    it("carries the role through, so permission checks still work", async () => {
        // Guards read session.adminUserRole; without it a Manager would be
        // treated as having no role at all rather than as a Manager.
        expect((await withToken(await buildApp())).body.role).toBe("Manager");
    });

    it("marks the request so CSRF and the session store can skip it", async () => {
        const { staffDeviceAuthMiddleware } = await import("../server/middleware/staff-device-auth.js");
        const app = express();
        app.use(staffDeviceAuthMiddleware as any);
        app.get("/api/admin/thing", (req: any, res) => res.json({ flagged: !!req.deviceAuth }));

        const res = await request(app).get("/api/admin/thing").set("Authorization", `Bearer ${TOKEN}`);
        expect(res.body.flagged).toBe(true);
    });
});

describe("a token that must no longer work", () => {
    it("is refused after the password changed", async () => {
        /**
         * The row was written when the password stamp was 0; the account now
         * reports a later one. This is what makes a reset end every install on
         * the account without anybody having to collect the phones.
         */
        getUser.mockResolvedValue({ ...USER, passwordChangedAt: new Date("2026-08-20T10:00:00Z") });

        const res = await withToken(await buildApp());

        expect(res.status).toBe(401);
        expect(res.body.code).toBe("SESSION_REVOKED");
    });

    it("is refused once revoked", async () => {
        execute.mockResolvedValue(deviceRow({ revoked_at: new Date().toISOString() }));

        const res = await withToken(await buildApp());

        expect(res.status).toBe(401);
        expect(res.body.code).toBe("DEVICE_REVOKED");
    });

    it("is refused once expired", async () => {
        // Expiry is the only thing that ends a token on a phone nobody can
        // reach — an uninstall is silent, so without this it would never end.
        execute.mockResolvedValue(deviceRow({ expires_at: PAST.toISOString() }));

        const res = await withToken(await buildApp());

        expect(res.status).toBe(401);
        expect(res.body.code).toBe("DEVICE_TOKEN_EXPIRED");
    });

    it("is refused when the account is deactivated", async () => {
        getUser.mockResolvedValue({ ...USER, status: "Inactive" });

        const res = await withToken(await buildApp());

        expect(res.status).toBe(403);
        expect(res.body.code).toBe("ACCOUNT_INACTIVE");
    });

    it("is refused when it matches no row at all", async () => {
        execute.mockResolvedValue({ rows: [] });

        const res = await withToken(await buildApp());

        expect(res.status).toBe(401);
        expect(res.body.code).toBe("DEVICE_TOKEN_INVALID");
    });

    it("leaves no session behind on any refusal", async () => {
        // A refused token must not reach a handler as a half-authenticated
        // request; the guard downstream would see a session and trust it.
        execute.mockResolvedValue(deviceRow({ revoked_at: new Date().toISOString() }));
        const res = await withToken(await buildApp());
        expect(res.body.userId).toBeUndefined();
    });
});

describe("requests that are not device requests", () => {
    it("are left alone when there is no Authorization header", async () => {
        const res = await request(await buildApp()).get("/api/admin/thing");

        expect(res.status).toBe(401);
        expect(res.body.error).toBe("no session");
        // The cookie session path must not have been disturbed, and no lookup
        // should have been paid for.
        expect(execute).not.toHaveBeenCalled();
    });

    it("are left alone for a non-Bearer scheme", async () => {
        const res = await request(await buildApp())
            .get("/api/admin/thing")
            .set("Authorization", "Basic dXNlcjpwYXNz");

        expect(res.body.error).toBe("no session");
        expect(execute).not.toHaveBeenCalled();
    });
});

describe("a database failure during lookup", () => {
    it("falls through to the cookie path instead of refusing", async () => {
        /**
         * A blip must not sign out every phone at once. Falling through is safe
         * because no session is installed, so the guard downstream still
         * refuses the request — it just refuses it as unauthenticated rather
         * than as a bad token.
         */
        execute.mockRejectedValue(new Error("connection terminated"));
        vi.spyOn(console, "error").mockImplementation(() => {});

        const res = await withToken(await buildApp());

        expect(res.status).toBe(401);
        expect(res.body.error).toBe("no session");
    });
});

describe("the stored token", () => {
    it("is never the plaintext the app holds", async () => {
        // A leaked database must not hand over working tokens.
        await withToken(await buildApp());

        const queried = JSON.stringify(execute.mock.calls[0]?.[0] ?? {});
        expect(queried).not.toContain(TOKEN);
    });
});
