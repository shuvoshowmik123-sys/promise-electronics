/**
 * Admin Authentication Routes
 * 
 * Handles admin login, logout, and current user retrieval.
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { storage } from '../storage.js';
import { adminLoginSchema, requireAdminAuth } from './middleware/auth.js';
import { z } from 'zod';

const router = Router();

// ============================================
// Admin Authentication
// ============================================

/**
 * GET /api/admin/me - Get current admin user
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
 * POST /api/admin/login - Admin login
 */
router.post('/api/admin/login', async (req: Request, res: Response) => {
    try {
        console.log('Admin login attempt for:', req.body.username);
        const { username, password } = adminLoginSchema.parse(req.body);
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
        if (error instanceof z.ZodError) {
            console.error('Validation error:', JSON.stringify(error.errors));
            return res.status(400).json({ error: error.errors[0].message, details: error.errors });
        }
        res.status(400).json({ error: 'Invalid login data' });
    }
});

/**
 * POST /api/admin/logout - Admin logout
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
