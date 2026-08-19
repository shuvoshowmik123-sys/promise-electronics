/**
 * Ends every admin session that predates the account's last password change.
 *
 * This lives at the application level, before any router, because the first
 * attempt at it did not and that was the bug. The check was put inside
 * `requireAdminAuth`, which reads as "the admin auth guard" but is only one of
 * six — `requireSuperAdmin`, `requirePermission`, `requireAnyPermission`,
 * `requireGranularPermission` and `requireAnyGranularPermission` each read
 * `req.session.adminUserId` on their own, and `GET /api/admin/me` has no guard
 * at all, just an inline handler. So a completed reset revoked
 * `/api/admin/notifications` and left `/api/admin/me` answering 200 — and
 * `/me` is what the client asks to decide whether somebody is signed in, so
 * the UI never noticed. Revocation has to be a property of the session, not of
 * one route's middleware, or every route added later gets to opt out of it by
 * accident.
 *
 * Mounted before the attendance gate for a second reason: that gate returns 412
 * ATTENDANCE_CHECK_IN_REQUIRED before authentication is settled, so a revoked
 * technician was told to check in rather than to sign in. Identity first, then
 * eligibility.
 */
import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage.js";

/**
 * Endpoints that must keep working without a valid session stamp.
 *
 * Logging in is the remedy for a revoked session, so revoking the ability to
 * log in would strand the account: the stale cookie would fail the check, and
 * the request that would replace it is the one being refused. Logout must clear
 * a session precisely when it is stale, and the reset endpoints are token
 * -authenticated by design — the person using them is proving who they are with
 * the link, not with a cookie.
 */
const EXEMPT = new Set([
    "/api/admin/login",
    "/api/admin/logout",
    "/api/admin/reset-link/verify",
    "/api/admin/reset-link/complete",
]);

/** The user loaded here, so guards downstream need not query for it again. */
export interface RevocationCheckedRequest extends Request {
    adminSessionUser?: Awaited<ReturnType<typeof storage.getUser>>;
}

export async function adminSessionRevocationMiddleware(
    req: RevocationCheckedRequest,
    res: Response,
    next: NextFunction,
) {
    const adminUserId = req.session?.adminUserId;

    // No admin session: customer routes, public routes, and the login request
    // itself. Nothing to revoke.
    if (!adminUserId) return next();
    if (EXEMPT.has(req.path)) return next();

    let user: Awaited<ReturnType<typeof storage.getUser>>;
    try {
        user = await storage.getUser(adminUserId);
    } catch (error) {
        /**
         * Fail open on a database error rather than logging the whole staff out
         * because one query failed. The guards downstream each load the user
         * too and will refuse the request if it cannot be read; the cost of
         * being wrong here is a stale session surviving a database blip, which
         * is smaller than every signed-in person being ejected by one.
         */
        console.error("[session-revocation] could not load user; passing through", error);
        return next();
    }

    if (!user) {
        req.session.adminUserId = undefined;
        return res.status(401).json({ error: "Admin user not found" });
    }

    const liveStamp = (user as any).passwordChangedAt
        ? new Date((user as any).passwordChangedAt).getTime()
        : 0;
    const sessionStamp = req.session?.passwordChangedAtStamp;

    /**
     * A session with no stamp predates this check and its password history is
     * unknown, so it is asked to sign in again rather than trusted. Everybody
     * is logged out once, on the deploy that adds this. That is the correct
     * cost: the alternative honours exactly the sessions we cannot vouch for.
     */
    if (sessionStamp === undefined) {
        req.session.adminUserId = undefined;
        return res.status(401).json({
            error: "Please sign in again.",
            code: "SESSION_REAUTH_REQUIRED",
        });
    }

    if (sessionStamp !== liveStamp) {
        req.session.adminUserId = undefined;
        return res.status(401).json({
            error: "Your password was changed. Please sign in again.",
            code: "SESSION_REVOKED",
        });
    }

    req.adminSessionUser = user;
    next();
}
