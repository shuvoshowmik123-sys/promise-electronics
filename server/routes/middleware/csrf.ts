import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

declare module 'express-session' {
    interface SessionData {
        csrfToken?: string;
    }
}

/**
 * Middleware to generate and set the CSRF token cookie.
 * Should be applied globally after the session middleware.
 */
export function setCsrfToken(req: Request, res: Response, next: NextFunction) {
    if (!req.session) {
        return next();
    }

    const shouldCreateToken = req.path === '/api/admin/csrf-token'
        || req.path === '/api/corporate/auth/csrf-token'
        || req.path === '/api/customer/csrf-token'
        // Customer quote accept and other state changes need a session CSRF after login
        || Boolean(req.session.customerId);

    if (!req.session.csrfToken && !shouldCreateToken) {
        return next();
    }

    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }

    /**
     * The CSRF cookie must follow the same policy as the session it protects.
     *
     * This was pinned to "lax" while the session cookie is set from
     * SESSION_COOKIE_SAMESITE, which the deployment has since set to "none" for
     * the staff app — whose WebView origin is https://localhost and therefore
     * cross-site to this API. The result was a split: the session cookie
     * travelled on cross-site requests and the CSRF cookie did not, so the two
     * halves of the same check disagreed about which session was in play.
     *
     * Tying them together means one rule, not two that can drift apart. Secure
     * stays linked to it because sameSite "none" is invalid without it.
     */
    const cookieSameSite =
        (process.env.SESSION_COOKIE_SAMESITE as 'lax' | 'none' | 'strict' | undefined) ?? 'lax';

    res.cookie('XSRF-TOKEN', req.session.csrfToken, {
        secure: process.env.NODE_ENV === 'production' || cookieSameSite === 'none',
        sameSite: cookieSameSite,
        httpOnly: false, // Essential: allows Frontend JS to read the token
        // Tracks the session lifetime. A CSRF cookie that dies first leaves the
        // customer apparently signed in while every mutation is rejected.
        maxAge: Number(process.env.SESSION_MAX_AGE_DAYS || 90) * 24 * 60 * 60 * 1000
    });

    next();
}

/**
 * Middleware to verify the CSRF token.
 * Should be applied in authentication guards to protect state-changing requests.
 */
export function requireCsrf(req: Request, res: Response, next: NextFunction) {
    /**
     * Device-token requests carry no cookie, so there is nothing for CSRF to
     * protect. The attack it exists to stop is a browser attaching credentials
     * to a request the user never intended; nothing attaches an Authorization
     * header by accident, and the native app is not a browsing context an
     * attacker can navigate. Requiring a token the app has no way to obtain
     * would simply break every write it makes.
     */
    if ((req as any).deviceAuth) return next();

    const safeMethods = ['GET', 'HEAD', 'OPTIONS', 'TRACE'];
    if (safeMethods.includes(req.method)) {
        return next();
    }

    const tokenFromHeader = req.headers['x-xsrf-token'] || req.headers['x-csrf-token'];
    const sessionToken = req.session?.csrfToken;

    if (!sessionToken || !tokenFromHeader || sessionToken !== tokenFromHeader) {
        console.warn(`[CSRF] Warning: CSRF check failed for ${req.method} ${req.path}`);
        return res.status(403).json({
            error: 'Session validation failed. Please refresh the page and try again.',
            code: 'CSRF_FAILED'
        });
    }

    next();
}
