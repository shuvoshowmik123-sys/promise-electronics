/**
 * Admin Authentication Routes
 * 
 * Handles admin login, logout, and current user retrieval.
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { storage } from '../storage.js';
import { adminLoginSchema, requireAdminAuth } from './middleware/auth.js';
import { authLimiter } from './middleware/rate-limit.js';
import { validateRequest } from './middleware/validation.js';
import { z } from 'zod';

const router = Router();

// ============================================
// Admin Authentication
// ============================================

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
        const user = await storage.getUser(req.session.adminUserId);
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
router.post('/api/admin/login', authLimiter, validateRequest(adminLoginSchema), async (req: Request, res: Response) => {
    try {
        console.log('Admin login attempt for:', req.body.username);
        const { username, password } = req.body;
        const user = await storage.getUserByUsername(username);

        if (!user) {
            console.log('Admin login failed: User not found');
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        if (!user.password) {
            console.log('Admin login failed: User has no password set');
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log('Admin login failed: Password mismatch');
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        if (user.status !== 'Active') {
            console.log('Admin login failed: User inactive');
            return res.status(403).json({ error: 'Account is inactive' });
        }

        // Update last login
        await storage.updateUserLastLogin(user.id);

        console.log('Admin login successful for:', username);
        req.session.adminUserId = user.id;
        const { password: _, ...safeUser } = user;
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

export default router;

