/**
 * Lets a native app authenticate with a device token instead of a cookie.
 *
 * `req.session.adminUserId` is read in 199 places across 32 files. Teaching all
 * of them about a second kind of caller would be a large and permanently
 * error-prone change — every route added afterwards would have to remember to
 * check both, and the one that forgot would be a hole nobody noticed. So this
 * middleware does the opposite: it satisfies the shape those 199 reads already
 * expect, and every guard, permission check and handler downstream stays
 * exactly as written.
 *
 * The object it installs is a plain one, not a stored session. It is mounted
 * BEFORE express-session, and app.ts skips the session middleware entirely when
 * this has run, because the store is connect-pg-simple: letting express-session
 * see these requests would mean a PostgreSQL write on every call from every
 * phone, against a pool capped at DB_POOL_MAX=5. A device token is already its
 * own durable record in staff_devices; persisting a second row per request to
 * describe the same fact would be pure cost.
 *
 * CSRF is not checked for these requests and does not need to be. CSRF exists
 * because a browser attaches cookies to requests the user did not intend to
 * make; nothing attaches an Authorization header by accident, and the app is
 * not a browsing context an attacker can navigate.
 */
import type { Request, Response, NextFunction } from "express";
import { authenticateDeviceToken, touchDevice } from "../services/staff-device.service.js";

/** Set once a token has been accepted; app.ts and the CSRF guard both read it. */
export interface DeviceAuthedRequest extends Request {
    deviceAuth?: { deviceId: string; userId: string };
}

/** Messages the app shows the user, so each refusal needs its own. */
const REFUSALS: Record<string, { status: number; code: string; error: string }> = {
    NOT_FOUND: { status: 401, code: "DEVICE_TOKEN_INVALID", error: "Please sign in again." },
    EXPIRED: { status: 401, code: "DEVICE_TOKEN_EXPIRED", error: "Please sign in again." },
    REVOKED: {
        status: 401,
        code: "DEVICE_REVOKED",
        error: "This device was removed. Please sign in again.",
    },
    PASSWORD_CHANGED: {
        status: 401,
        code: "SESSION_REVOKED",
        error: "Your password was changed. Please sign in again.",
    },
    USER_GONE: { status: 401, code: "DEVICE_TOKEN_INVALID", error: "Please sign in again." },
    USER_INACTIVE: {
        status: 403,
        code: "ACCOUNT_INACTIVE",
        error: "This account is not active.",
    },
};

function bearerToken(req: Request): string | null {
    const header = req.headers.authorization;
    if (!header || typeof header !== "string") return null;
    const [scheme, value] = header.split(" ");
    if (!value || scheme.toLowerCase() !== "bearer") return null;
    return value.trim() || null;
}

export async function staffDeviceAuthMiddleware(
    req: DeviceAuthedRequest,
    res: Response,
    next: NextFunction,
) {
    const token = bearerToken(req);

    // No token: a browser, or the login request itself. Fall through to the
    // cookie session, which is still how the web admin works.
    if (!token) return next();

    let result: Awaited<ReturnType<typeof authenticateDeviceToken>>;
    try {
        result = await authenticateDeviceToken(token);
    } catch (error) {
        /**
         * Falls through to the cookie path rather than refusing. A database
         * blip here would otherwise sign out every phone at once, and the
         * request still has to pass a real guard downstream — which will refuse
         * it, because no session was installed.
         */
        console.error("[staff-device-auth] token lookup failed; falling through", error);
        return next();
    }

    if (!result.ok) {
        const refusal = REFUSALS[result.reason] ?? REFUSALS.NOT_FOUND;
        return res.status(refusal.status).json({ error: refusal.error, code: refusal.code });
    }

    const { user, deviceId, passwordStamp } = result;

    /**
     * The shape the rest of the codebase reads. passwordChangedAtStamp is set
     * to the live value so adminSessionRevocationMiddleware agrees with the
     * check already made here rather than ejecting the request a moment later.
     */
    (req as unknown as { session: Record<string, unknown> }).session = {
        adminUserId: user.id,
        adminUserRole: user.role,
        adminUserPermissions: user.permissions ?? null,
        passwordChangedAtStamp: passwordStamp,
        // Present so anything reading session.cookie does not throw; nothing
        // about this request is cookie-backed.
        cookie: {},
    };

    req.deviceAuth = { deviceId, userId: user.id };
    touchDevice(deviceId, req.ip);

    next();
}
