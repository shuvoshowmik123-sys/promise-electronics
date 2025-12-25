/**
 * Users Routes
 * 
 * Handles admin user management (staff users, not customers).
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { storage } from '../storage.js';
import { insertUserSchema } from '../../shared/schema.js';
import {
    requireAdminAuth,
    requireSuperAdmin,
    adminCreateUserSchema,
    adminUpdateUserSchema,
    getDefaultPermissions
} from './middleware/auth.js';
import { addAdminSSEClient, removeAdminSSEClient } from './middleware/sse-broker.js';

const router = Router();

// ============================================
// Admin Dashboard & SSE
// ============================================

/**
 * GET /api/admin/dashboard - Get dashboard statistics
 */
router.get('/api/admin/dashboard', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const stats = await storage.getDashboardStats();
        res.json(stats);
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to load dashboard data' });
    }
});

/**
 * GET /api/admin/job-overview - Get job overview for live monitoring
 */
router.get('/api/admin/job-overview', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const overview = await storage.getJobOverview();
        res.json(overview);
    } catch (error) {
        console.error('Job overview error:', error);
        res.status(500).json({ error: 'Failed to load job overview data' });
    }
});

/**
 * GET /api/admin/events - SSE endpoint for admin real-time updates
 */
router.get('/api/admin/events', requireAdminAuth, (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    addAdminSSEClient(res);

    const heartbeat = setInterval(() => {
        try {
            res.write(`:heartbeat\n\n`);
        } catch (e) {
            clearInterval(heartbeat);
        }
    }, 30000);

    req.on('close', () => {
        clearInterval(heartbeat);
        removeAdminSSEClient(res);
    });
});

// ============================================
// Staff Users API
// ============================================

/**
 * GET /api/users - Get all users (public, for technician lists etc.)
 */
router.get('/api/users', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const users = await storage.getAllUsers();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

/**
 * GET /api/users/:id - Get user by ID
 */
router.get('/api/users/:id', async (req: Request, res: Response) => {
    try {
        const user = await storage.getUser(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

/**
 * POST /api/users - Create user
 */
router.post('/api/users', async (req: Request, res: Response) => {
    try {
        const validated = insertUserSchema.parse(req.body);
        const user = await storage.createUser(validated);
        res.status(201).json(user);
    } catch (error) {
        res.status(400).json({ error: 'Invalid user data' });
    }
});

/**
 * PATCH /api/users/:id - Update user
 */
router.patch('/api/users/:id', async (req: Request, res: Response) => {
    try {
        const user = await storage.updateUser(req.params.id, req.body);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

/**
 * GET /api/admin/users - Get all staff users (admin only)
 */
router.get('/api/admin/users', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const users = await storage.getAllUsers();
        const staffRoles = ['Super Admin', 'Manager', 'Cashier', 'Technician'];
        const staffUsers = users.filter(user => staffRoles.includes(user.role));
        const safeUsers = staffUsers.map(({ password: _, ...user }) => user);
        res.json(safeUsers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

/**
 * POST /api/admin/users - Create staff user (Super Admin only)
 */
router.post('/api/admin/users', requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const validated = adminCreateUserSchema.parse(req.body);

        const existingUsername = await storage.getUserByUsername(validated.username);
        if (existingUsername) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        const existingEmail = await storage.getUserByEmail(validated.email);
        if (existingEmail) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(validated.password, 12);
        const defaultPermissions = getDefaultPermissions(validated.role);

        const user = await storage.createUser({
            username: validated.username,
            name: validated.name,
            email: validated.email,
            password: hashedPassword,
            role: validated.role,
            permissions: validated.permissions || JSON.stringify(defaultPermissions),
        });

        const { password: _, ...safeUser } = user;
        res.status(201).json(safeUser);
    } catch (error: any) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ error: 'Invalid user data', details: error.errors });
        }
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

/**
 * PATCH /api/admin/users/:id - Update staff user
 */
router.patch('/api/admin/users/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const currentUser = await storage.getUser(req.session.adminUserId!);
        const targetUserId = req.params.id;

        if (currentUser?.role !== 'Super Admin' && currentUser?.id !== targetUserId) {
            return res.status(403).json({ error: 'Not authorized to update this user' });
        }

        if (currentUser?.role !== 'Super Admin' && currentUser?.id === targetUserId) {
            const { password, ...otherFields } = req.body;
            if (Object.keys(otherFields).length > 0) {
                return res.status(403).json({ error: 'You can only update your password' });
            }
        }

        const validated = adminUpdateUserSchema.parse(req.body);

        let updates: any = { ...validated };
        if (validated.password) {
            updates.password = await bcrypt.hash(validated.password, 12);
        }

        const user = await storage.updateUser(targetUserId, updates);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { password: _, ...safeUser } = user;
        res.json(safeUser);
    } catch (error: any) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ error: 'Invalid user data', details: error.errors });
        }
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

/**
 * DELETE /api/admin/users/:id - Delete staff user (Super Admin only)
 */
router.delete('/api/admin/users/:id', requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const currentUser = await storage.getUser(req.session.adminUserId!);

        if (currentUser?.id === req.params.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        const success = await storage.deleteUser(req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// ============================================
// Admin Customers API
// ============================================

/**
 * GET /api/admin/customers - Get all customers
 */
router.get('/api/admin/customers', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const allUsers = await storage.getAllUsers();
        const customers = allUsers.filter(u => u.role === 'Customer');

        const customersWithStats = await Promise.all(
            customers.map(async (customer) => {
                const orders = await storage.getOrdersByCustomerId(customer.id);
                const serviceRequests = await storage.getServiceRequestsByCustomerId(customer.id);
                return {
                    ...customer,
                    password: undefined,
                    totalOrders: orders.length,
                    totalServiceRequests: serviceRequests.length,
                };
            })
        );
        res.json(customersWithStats);
    } catch (error) {
        console.error('Failed to fetch customers:', error);
        res.status(500).json({ error: 'Failed to fetch customers' });
    }
});

/**
 * GET /api/admin/customers/:id - Get customer details
 */
router.get('/api/admin/customers/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = await storage.getUser(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const orders = await storage.getOrdersByCustomerId(user.id);
        const serviceRequests = await storage.getServiceRequestsByCustomerId(user.id);

        const ordersWithItems = await Promise.all(
            orders.map(async (order) => {
                const items = await storage.getOrderItems(order.id);
                return { ...order, items };
            })
        );

        res.json({
            ...user,
            password: undefined,
            orders: ordersWithItems,
            serviceRequests,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch customer details' });
    }
});

/**
 * PATCH /api/admin/customers/:id - Update customer
 */
router.patch('/api/admin/customers/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { name, email, phone, address, isVerified } = req.body;
        const updates: any = {};

        if (name !== undefined) updates.name = name;
        if (email !== undefined) updates.email = email;
        if (phone !== undefined) updates.phone = phone;
        if (address !== undefined) updates.address = address;
        if (isVerified !== undefined) updates.isVerified = isVerified;

        const updated = await storage.updateUser(req.params.id, updates);
        if (!updated) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ ...updated, password: undefined });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update customer' });
    }
});

/**
 * DELETE /api/admin/customers/:id - Delete customer
 */
router.delete('/api/admin/customers/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const success = await storage.deleteUser(req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete customer' });
    }
});

/**
 * GET /api/admin/jobs/technician/:name - Get jobs by technician
 */
router.get('/api/admin/jobs/technician/:name', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const jobs = await storage.getJobTicketsByTechnician(req.params.name);
        res.json(jobs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch technician jobs' });
    }
});

/**
 * GET /api/admin/reports - Get report data
 */
router.get('/api/admin/reports', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const period = req.query.period as string || 'this_month';
        const now = new Date();
        let startDate: Date;
        let endDate: Date = now;

        switch (period) {
            case 'this_week':
                startDate = new Date(now);
                startDate.setDate(now.getDate() - now.getDay());
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'last_month':
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                endDate = new Date(now.getFullYear(), now.getMonth(), 0);
                break;
            case 'this_year':
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
            case 'this_month':
            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
        }

        const reportData = await storage.getReportData(startDate, endDate);
        res.json(reportData);
    } catch (error) {
        console.error('Failed to fetch report data:', error);
        res.status(500).json({ error: 'Failed to fetch report data' });
    }
});

export default router;
