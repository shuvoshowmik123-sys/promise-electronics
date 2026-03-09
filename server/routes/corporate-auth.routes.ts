import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { authLimiter } from './middleware/rate-limit.js';
import { db } from '../db.js';
import { eq } from 'drizzle-orm';
import { users, corporateClients } from '../../shared/schema.js';
import { storage } from '../storage.js';
import { userRepo, customerRepo, orderRepo, corporateRepo, notificationRepo } from '../repositories/index.js';
import { authService } from '../services/auth.service.js';

const router = Router();

// GET /api/corporate/csrf-token
router.get('/csrf-token', (req: Request, res: Response) => {
    // The csrfProtection middleware (applied in index.ts) will have already
    // generated the token and set the cookie if it wasn't present.
    // We just need to return it so the frontend can read it if needed,
    // although the cookie is the primary mechanism.
    res.json({ csrfToken: (req.session as any).csrfToken });
});

import { z } from 'zod';
import { validate } from './middleware/validate.js';

const corporateLoginSchema = z.object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(6, 'Password must be at least 6 characters').max(13, 'Password is too long'),
    trustDevice: z.boolean().optional(),
});

// POST /api/corporate/login
router.post('/login', authLimiter, validate(corporateLoginSchema), async (req: Request, res: Response) => {
    try {
        const { username, password, trustDevice } = req.body;


        const result = await authService.authenticateCorporate(username, password);

        if ('error' in result) {
            return res.status(result.status || 401).json({ error: result.error });
        }

        const { user, corporateClient } = result;

        // Separate session for corporate
        req.session.corporateUserId = user.id;

        // Regenerate session to prevent session fixation
        req.session.regenerate((err) => {
            if (err) {
                console.error('Session regenerate error:', err);
                return res.status(500).json({ error: 'Session error' });
            }

            // Restore user ID in new session
            req.session.corporateUserId = user.id;

            // Generate NEW CSRF token for the new session
            const newCsrfToken = Math.random().toString(36).substring(2, 15);
            (req.session as any).csrfToken = newCsrfToken;

            // Set the new CSRF cookie
            res.cookie('XSRF-TOKEN', newCsrfToken, {
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
                httpOnly: false
            });

            // Process Devise Trust Token
            if (trustDevice === true) {
                // Issue robust device token
                authService.issueCorporateTrustedDeviceToken(user.id, req.headers['user-agent']).then((token) => {
                    res.cookie('corp_device_token', token, {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: 'lax',
                        path: '/',
                        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
                    });

                    // Send response with user info and the new token
                    res.json({
                        user: {
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            role: user.role,
                            corporateClientId: user.corporateClientId,
                            corporateClientShortCode: corporateClient?.shortCode,
                            corporateClientName: corporateClient?.companyName
                        },
                        csrfToken: newCsrfToken,
                        trustedDeviceIssued: true
                    });
                }).catch(err => {
                    console.error("Failed to issue trust token", err);
                    // Still log them in if token issuance specifically failed
                    res.json({
                        user: { ...user, corporateClientShortCode: corporateClient?.shortCode, corporateClientName: corporateClient?.companyName },
                        csrfToken: newCsrfToken,
                        trustedDeviceIssued: false
                    });
                });
            } else {
                // User explicitly didn't check the box. Revoke any existing if presented.
                if (req.cookies?.corp_device_token) {
                    authService.revokeCorporateTrustedDeviceToken(req.cookies.corp_device_token, 'explicit_untrust').catch(console.error);
                    res.clearCookie('corp_device_token', { path: '/' });
                }

                // Send response
                res.json({
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        corporateClientId: user.corporateClientId,
                        corporateClientShortCode: corporateClient?.shortCode,
                        corporateClientName: corporateClient?.companyName
                    },
                    csrfToken: newCsrfToken,
                    trustedDeviceIssued: false
                });
            }
        });
    } catch (error) {
        console.error('Corporate login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/corporate/auth/me
router.get('/me', async (req: Request, res: Response) => {
    // 1. Check for standard active session
    if (!req.session.corporateUserId) {
        // 2. No session. Check for Trusted Device Token for automatic recovery
        const deviceToken = req.cookies?.corp_device_token;
        if (deviceToken) {
            const recoveredUserId = await authService.validateCorporateTrustedDeviceToken(deviceToken);
            if (recoveredUserId) {
                // Token is valid! Regenerate full session to recover state
                return new Promise<void>((resolve, reject) => {
                    req.session.regenerate((err) => {
                        if (err) {
                            console.error('Session recovery error:', err);
                            return res.status(500).json({ error: 'Session recovery error' });
                        }

                        req.session.corporateUserId = recoveredUserId;

                        // Need a new CSRF token for this newly revived session
                        const newCsrfToken = Math.random().toString(36).substring(2, 15);
                        (req.session as any).csrfToken = newCsrfToken;

                        res.cookie('XSRF-TOKEN', newCsrfToken, {
                            sameSite: 'lax',
                            secure: process.env.NODE_ENV === 'production',
                            httpOnly: false
                        });

                        // Proceed to fetch the user logic below since session is now restored
                        fetchAndReturnUserFromSession(req, res).then(() => resolve()).catch(reject);
                    });
                });
            } else {
                // Token was present but invalid/expired/revoked. Clear it.
                res.clearCookie('corp_device_token', { path: '/' });
                return res.status(401).json({ error: 'Session expired and trusted device invalid' });
            }
        }

        // No session and no valid device token
        return res.status(401).json({ error: 'Not authenticated' });
    }
    return fetchAndReturnUserFromSession(req, res);
});

// Helper extracted from the original /me route since it's now called from 2 places
async function fetchAndReturnUserFromSession(req: Request, res: Response) {

    try {
        // Get user with corporate client details
        const [user] = await db
            .select({
                id: users.id,
                name: users.name,
                email: users.email,
                username: users.username,
                role: users.role,
                corporateClientId: users.corporateClientId,
                corporateClientShortCode: corporateClients.shortCode,
                corporateClientName: corporateClients.companyName
            })
            .from(users)
            .leftJoin(corporateClients, eq(users.corporateClientId, corporateClients.id))
            .where(eq(users.id, req.session.corporateUserId!)) as any[];

        if (!user || user.role !== 'Corporate') {
            return res.status(401).json({ error: 'Invalid corporate session' });
        }

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            username: user.username,
            role: user.role,
            corporateClientId: user.corporateClientId,
            corporateClientShortCode: user.corporateClientShortCode,
            corporateClientName: user.corporateClientName
        });
    } catch (err) {
        console.error('Get corporate user error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}

// POST /api/corporate/auth/logout
router.post('/logout', async (req: Request, res: Response) => {
    // Revoke trusted device if present
    if (req.cookies?.corp_device_token) {
        await authService.revokeCorporateTrustedDeviceToken(req.cookies.corp_device_token, 'logout_requested').catch(console.error);
        res.clearCookie('corp_device_token', { path: '/' });
    }

    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.clearCookie('connect.sid'); // Ensure the session cookie is also cleared
        res.json({ message: 'Logged out successfully' });
    });
});

export default router;