/**
 * Admin Authentication Routes
 * 
 * Handles admin login, logout, and current user retrieval.
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { userRepo } from '../repositories/index.js';
import { adminLoginSchema, requireAdminAuth } from './middleware/auth.js';
import { authLimiter } from './middleware/rate-limit.js';
import { validate } from './middleware/validate.js';
import { authService } from '../services/auth.service.js';

const router = Router();

// ============================================
// Admin Authentication
// ============================================

/**
 * @openapi
 * /api/admin/csrf-token:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Get CSRF token for authenticated mobile/web writes
 *     description: Returns the current session CSRF token and ensures the XSRF-TOKEN cookie is available
 *     responses:
 *       200:
 *         description: CSRF token
 */
router.get('/api/admin/csrf-token', async (req: Request, res: Response) => {
    if (!req.session) {
        return res.status(500).json({ error: 'Session is not available' });
    }

    if (!req.session.csrfToken) {
        return res.status(500).json({ error: 'CSRF token is not available' });
    }

    res.json({ csrfToken: req.session.csrfToken });
});

/**
 * @openapi
 * /api/admin/me:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Get current admin user
 *     description: Returns the currently authenticated admin user's profile
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Current admin user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/api/admin/me', async (req: Request, res: Response) => {
    if (!req.session?.adminUserId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const user = await userRepo.getUser(req.session.adminUserId);
        if (!user) {
            req.session.adminUserId = undefined;
            return res.status(401).json({ error: 'User not found' });
        }
        const { password: _, ...safeUser } = user;
        res.json(safeUser);
    } catch (error) {
        console.error('Error fetching admin user:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

/**
 * @openapi
 * /api/admin/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Admin login
 *     description: Authenticate an admin user and create a session
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: Admin username
 *                 example: admin
 *               password:
 *                 type: string
 *                 description: Admin password
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Account inactive
 *       429:
 *         description: Too many login attempts
 */
router.post('/api/admin/login', authLimiter, validate(adminLoginSchema), async (req: Request, res: Response) => {
    try {
        console.log('Admin login attempt for:', req.body.username);
        const { username, password } = req.body;

        const result = await authService.authenticateAdmin(username, password);

        if ('error' in result) {
            console.log(`Admin login failed: ${result.error}`);
            return res.status(result.status || 401).json({ error: result.error });
        }

        console.log('Admin login successful for:', username);
        req.session.adminUserId = result.user.id;
        const { password: _, ...safeUser } = result.user;
        res.json(safeUser);
    } catch (error: any) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @openapi
 * /api/admin/logout:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Admin logout
 *     description: Destroy the current admin session
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 *       500:
 *         description: Logout failed
 */
router.post('/api/admin/logout', (req: Request, res: Response) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.clearCookie('connect.sid');
        res.json({ message: 'Logged out successfully' });
    });
});

// ── Phase G: Manager PIN endpoints ───────────────────────────────────────────

/**
 * POST /api/admin/pin/set
 * Set a 4-digit Manager PIN for the current user (Super Admin only).
 * Body: { pin: "1234" }
 */
router.post('/api/admin/pin/set', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.session!.adminUserId!;
        const actor = await userRepo.getUser(userId);
        if (!actor || actor.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Only Super Admin can set Manager PINs' });
        }

        const { pin, targetUserId } = req.body;
        const targetId = targetUserId || userId;

        const result = await authService.setManagerPin(userId, targetId, pin);

        if (result.error) {
            return res.status(result.status || 400).json({ error: result.error });
        }

        res.json({ success: true, message: 'Manager PIN set successfully' });
    } catch (error: any) {
        console.error('[PIN] Error setting PIN:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/admin/pin/verify
 * Verify the current user's Manager PIN.
 * Body: { pin: "1234" }
 * Returns: { valid: true | false }
 */
router.post('/api/admin/pin/verify', requireAdminAuth, authLimiter, async (req: Request, res: Response) => {
    try {
        const userId = req.session!.adminUserId!;
        const { pin } = req.body;

        const result = await authService.verifyManagerPin(userId, pin);

        if (result.error) {
            return res.status(result.status || 401).json({ error: result.error });
        }

        res.json(result);
    } catch (error: any) {
        console.error('[PIN] Error verifying PIN:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;

