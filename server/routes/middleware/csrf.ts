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

    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }

    res.cookie('XSRF-TOKEN', req.session.csrfToken, {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        httpOnly: false, // Essential: allows Frontend JS to read the token
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days (match session)
    });

    next();
}

/**
 * Middleware to verify the CSRF token.
 * Should be applied in authentication guards to protect state-changing requests.
 */
export function requireCsrf(req: Request, res: Response, next: NextFunction) {
    // Only check state-changing methods
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
