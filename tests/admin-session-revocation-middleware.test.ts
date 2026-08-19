/**
 * Revocation must be a property of the session, not of one route's guard.
 *
 * The first attempt put the password-stamp check inside `requireAdminAuth`,
 * which sounds like "the admin auth guard" and is one of six. QA proved the
 * gap: after a completed password reset, `GET /api/admin/notifications` (which
 * uses that guard) answered 401 SESSION_REVOKED while `GET /api/admin/me` — an
 * inline handler with no guard — answered 200 on the same cookie. `/me` is what
 * the client asks to decide whether somebody is signed in, so the revoked
 * session stayed usable and the UI never sent anybody to the login page.
 *
 * These tests run the middleware inside a real Express app with a real session
 * cookie rather than reading the source for the right words, because the defect
 * was never a missing line — it was a correct line in a place that not every
 * request goes through. Only actually driving a request over a route with no
 * guard can tell the difference, and that is the case pinned here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";

/** Stands in for the users table; each test sets what the row currently says. */
const getUser = vi.fn();
vi.mock("../server/storage.js", () => ({ storage: { getUser: () => getUser() } }));

const USER_ID = "u-1";
const CHANGED_AT = new Date("2026-08-19T20:15:47.700Z");

/**
 * An app shaped like the real one at the point that matters: session, then the
 * revocation middleware, then routes — including one with no guard of its own,
 * which is the shape `/api/admin/me` has and the shape the first fix missed.
 */
async function buildApp(stampInSession: number | undefined | "none") {
    const { adminSessionRevocationMiddleware } = await import(
        "../server/middleware/admin-session-revocation.js"
    );

    const app = express();
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));

    // Establishes the session the way a login does, without importing the real one.
    app.get("/sign-in", (req: any, res) => {
        req.session.adminUserId = USER_ID;
        if (stampInSession !== "none") req.session.passwordChangedAtStamp = stampInSession;
        res.json({ ok: true });
    });

    app.use(adminSessionRevocationMiddleware as any);

    /**
     * No guard, deliberately — this is the route the earlier fix left open.
     *
     * It mirrors the real handler in auth.routes.ts, which does refuse a
     * request carrying no session id; what it never did was ask whether the
     * session it has is still valid. Stubbing it as unconditionally open would
     * have made the "cleared session stays refused" case assert against a route
     * more permissive than any in the codebase.
     */
    app.get("/api/admin/me", (req: any, res) => {
        if (!req.session?.adminUserId) return res.status(401).json({ error: "Not authenticated" });
        res.json({ id: req.session.adminUserId });
    });
    app.post("/api/admin/login", (_req, res) => res.json({ reached: true }));

    return app;
}

/** Signs in and returns an agent that carries the session cookie onward. */
async function signedIn(stamp: number | undefined | "none") {
    const agent = request.agent(await buildApp(stamp));
    await agent.get("/sign-in").expect(200);
    return agent;
}

beforeEach(() => {
    vi.resetModules();
    getUser.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("a session whose password has since changed", () => {
    beforeEach(() => {
        // The row now says the password changed at CHANGED_AT.
        getUser.mockResolvedValue({ id: USER_ID, passwordChangedAt: CHANGED_AT });
    });

    it("is refused on a route that has no guard of its own", async () => {
        // Signed in before the change, so the session carries the older stamp.
        const agent = await signedIn(CHANGED_AT.getTime() - 60_000);

        const res = await agent.get("/api/admin/me");

        // The exact failure QA reported: this answered 200.
        expect(res.status).toBe(401);
        expect(res.body.code).toBe("SESSION_REVOKED");
    });

    it("does not leak the session id to the handler behind it", async () => {
        const agent = await signedIn(CHANGED_AT.getTime() - 60_000);
        const res = await agent.get("/api/admin/me");
        expect(res.body.id).toBeUndefined();
    });

    it("stays refused on the next request, having cleared the session", async () => {
        const agent = await signedIn(CHANGED_AT.getTime() - 60_000);
        await agent.get("/api/admin/me");

        // Second call: adminUserId was cleared, so this is now simply anonymous
        // and must not have quietly become usable again.
        const res = await agent.get("/api/admin/me");
        expect(res.status).not.toBe(200);
    });
});

describe("a session that matches the current password", () => {
    it("passes through untouched", async () => {
        getUser.mockResolvedValue({ id: USER_ID, passwordChangedAt: CHANGED_AT });
        const agent = await signedIn(CHANGED_AT.getTime());

        const res = await agent.get("/api/admin/me");

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(USER_ID);
    });

    it("treats a password that was never changed as stamp zero", async () => {
        /**
         * "Never changed" is a real state, and null must compare equal to the 0
         * that login records for it. Read as "absent" instead, every account
         * that had never changed its password would be ejected on every request.
         */
        getUser.mockResolvedValue({ id: USER_ID, passwordChangedAt: null });
        const agent = await signedIn(0);

        expect((await agent.get("/api/admin/me")).status).toBe(200);
    });
});

describe("sessions that predate the check", () => {
    it("are asked to sign in again rather than trusted", async () => {
        getUser.mockResolvedValue({ id: USER_ID, passwordChangedAt: null });
        const agent = await signedIn("none");

        const res = await agent.get("/api/admin/me");

        expect(res.status).toBe(401);
        expect(res.body.code).toBe("SESSION_REAUTH_REQUIRED");
    });
});

describe("logging in", () => {
    it("is reachable while carrying a revoked session", async () => {
        /**
         * Signing in is the remedy for a revoked session. Refusing the login
         * request because the stale cookie fails the check would strand the
         * account: the request that replaces the cookie is the one being
         * refused.
         */
        getUser.mockResolvedValue({ id: USER_ID, passwordChangedAt: CHANGED_AT });
        const agent = await signedIn(CHANGED_AT.getTime() - 60_000);

        const res = await agent.post("/api/admin/login");

        expect(res.status).toBe(200);
        expect(res.body.reached).toBe(true);
    });
});

describe("requests with no admin session", () => {
    it("are left alone without a database read", async () => {
        // Customer and public traffic outnumbers admin traffic; making it pay
        // for a users lookup would be a pool cost for nothing.
        const { adminSessionRevocationMiddleware } = await import(
            "../server/middleware/admin-session-revocation.js"
        );
        const app = express();
        app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
        app.use(adminSessionRevocationMiddleware as any);
        app.get("/api/anything", (_req, res) => res.json({ ok: true }));

        await request(app).get("/api/anything").expect(200);
        expect(getUser).not.toHaveBeenCalled();
    });
});

describe("a database failure while checking", () => {
    it("does not eject everybody who is signed in", async () => {
        /**
         * Fails open on purpose. The guards downstream load the user too and
         * refuse the request if the row cannot be read, so the cost of passing
         * through here is a stale session surviving a database blip — smaller
         * than every signed-in person being thrown out by one failed query.
         */
        getUser.mockRejectedValue(new Error("connection terminated"));
        vi.spyOn(console, "error").mockImplementation(() => {});
        const agent = await signedIn(0);

        expect((await agent.get("/api/admin/me")).status).toBe(200);
    });
});
