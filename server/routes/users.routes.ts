/**
 * Users Routes
 * 
 * Handles admin user management (staff users, not customers).
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { storage } from '../storage.js';
import { userRepo, analyticsRepo, orderRepo, serviceRequestRepo, jobRepo, employmentRepo } from '../repositories/index.js';
import { insertUserSchema } from '../../shared/schema.js';
import {
    requireAdminAuth,
    requireSuperAdmin,
    requirePermission,
    requireAnyPermission,
    getEffectivePermissionsForUser,
    adminCreateUserSchema,
    adminUpdateUserSchema,
    getDefaultPermissions
} from './middleware/auth.js';

import { notifySpecificAdmin } from './middleware/sse-broker.js';
import { MailerService } from '../services/mailer.js';
import { authService } from '../services/auth.service.js';
import { z } from 'zod';
import crypto from 'crypto';
import { AuditLogger } from '../services/audit.service.js';
import { handleAdminEventStream } from './admin-stream.js';
import { getCachedDashboard } from '../lib/dashboardCache.js';

const router = Router();

// ============================================
// Admin Dashboard & SSE
// ============================================

/**
 * GET /api/admin/dashboard - Get dashboard statistics
 */
router.get('/api/admin/dashboard', requireAdminAuth, requirePermission('dashboard'), async (req: Request, res: Response) => {
    try {
        const { data: rawStats, cacheStatus } = await getCachedDashboard();
        res.set('X-Admin-Dashboard-Cache', cacheStatus);

        // Deep clone to prevent modifying the shared cache in memory
        const stats = structuredClone(rawStats);

        // Check permissions to mask financial data
        if (req.session.adminUserId) {
            const user = await userRepo.getUser(req.session.adminUserId);
            if (user) {
                const effectivePermissions = getEffectivePermissionsForUser(user);

                if (!effectivePermissions['*'] && !effectivePermissions.finance) {
                    // Mask financial data for non-finance users (e.g. Technicians)
                    stats.totalRevenue = 0;
                    stats.posRevenueThisMonth = 0;
                    stats.corporateRevenueThisMonth = 0;
                    stats.totalWastageLoss = 0;
                    stats.revenueData = stats.revenueData.map((d: any) => ({ ...d, value: 0 }));
                }
            }
        }

        res.json(stats);
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to load dashboard data' });
    }
});

/**
 * GET /api/admin/job-overview - Get job overview for live monitoring
 */
router.get('/api/admin/job-overview', requireAdminAuth, requirePermission('dashboard'), async (req: Request, res: Response) => {
    try {
        const overview = await analyticsRepo.getJobOverview();
        res.json(overview);
    } catch (error) {
        console.error('Job overview error:', error);
        res.status(500).json({ error: 'Failed to load job overview data' });
    }
});

/**
 * GET /api/admin/workflow-kpis - Get workflow KPIs for Manager Dashboard
 * Returns: Pending triage, jobs ready for billing, payment status breakdowns, technician workloads, stage distribution
 */
router.get('/api/admin/workflow-kpis', requireAdminAuth, requirePermission('dashboard'), async (req: Request, res: Response) => {
    try {
        const kpis = await storage.getWorkflowKPIs();
        res.json(kpis);
    } catch (error) {
        console.error('Workflow KPIs error:', error);
        res.status(500).json({ error: 'Failed to load workflow KPIs' });
    }
});

/**
 * GET /api/admin/events - SSE endpoint for admin real-time updates
 */
router.get('/api/admin/events', requireAdminAuth, (req: Request, res: Response) => {
    handleAdminEventStream(req, res);
});

// ============================================
// Staff Users API
// ============================================

/**
 * GET /api/users/lookup - Limited user lookup for dropdowns
 */
router.get('/api/users/lookup', requireAnyPermission(['users', 'canViewUsers', 'canAssignTechnician']), async (req: Request, res: Response) => {
    try {
        const result = await userRepo.getAllUsers(1, 1000);
        // Only return non-sensitive fields
        const safeUsers = result.items.map(u => ({
            id: u.id,
            name: u.name,
            role: u.role,
            email: u.email
        }));
        res.json({ items: safeUsers });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

/**
 * GET /api/users - Get all users (full profiles, requires users permission)
 */
router.get('/api/users', requirePermission('users'), async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const result = await userRepo.getAllUsers(page, limit);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

/**
 * GET /api/users/technicians/workload - Get technicians with workload stats
 */
router.get('/api/users/technicians/workload', requireAdminAuth, requireAnyPermission(['users', 'jobs', 'reports']), async (req: Request, res: Response) => {
    try {
        // 1. Get all users
        const result = await userRepo.getAllUsers(1, 1000);
        const allUsers = result.items;

        // 2. Filter for technicians
        const technicians = allUsers.filter(u =>
            ['Technician', 'Super Admin', 'Manager'].includes(u.role)
        );

        // 3. Get workload stats
        const workloadStats = await storage.getTechnicianWorkload();

        // 4. Merge data
        const response = technicians.map(tech => {
            // Match by ID first, then Name
            const stats = workloadStats.find(w => w.technicianId === tech.id) ||
                workloadStats.find(w => w.technicianName === tech.name);

            return {
                id: tech.id,
                name: tech.name,
                role: tech.role,
                skills: tech.skills, // already text or JSON string
                seniorityLevel: tech.seniorityLevel,
                performanceScore: tech.performanceScore,
                activeJobs: stats?.activeJobs || 0,
                completedToday: stats?.completedToday || 0,
            };
        });

        res.json(response);
    } catch (error) {
        console.error('Workload fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch technician workload' });
    }
});

/**
 * GET /api/users/:id - Get user by ID
 */
router.get('/api/users/:id', requireAdminAuth, requirePermission('users'), async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.params.id);
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
router.post('/api/users', requireAdminAuth, requirePermission('users'), async (req: Request, res: Response) => {
    try {
        const validated = insertUserSchema.parse(req.body);
        const user = await userRepo.createUser(validated);
        res.status(201).json(user);
    } catch (error) {
        res.status(400).json({ error: 'Invalid user data' });
    }
});

/**
 * PATCH /api/users/:id - Update user
 */
router.patch('/api/users/:id', requireAdminAuth, requirePermission('users'), async (req: Request, res: Response) => {
    try {
        const user = await userRepo.updateUser(req.params.id, req.body);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

/**
 * GET /api/admin/users - Get all staff users (admin only) or corporate users for a specific client
 */
router.get('/api/admin/users', requireAnyPermission(['users', 'canAssignTechnician', 'canAddAssistedBy']), async (req: Request, res: Response) => {
    try {
        const corporateClientId = req.query.corporateClientId as string;
        const result = await userRepo.getAllUsers(1, 10000); // Fetch all for filtering
        const users = result.items;

        let filteredUsers = users;
        if (corporateClientId) {
            filteredUsers = users.filter(user => user.corporateClientId === corporateClientId && user.role === 'Corporate');
        } else {
            const staffRoles = ['Super Admin', 'Manager', 'Cashier', 'Technician'];
            filteredUsers = users.filter(user => staffRoles.includes(user.role));
        }

        const safeUsers = filteredUsers.map(({ password: _, ...user }) => user);

        // Fetch all profiles and attach employment status
        const profiles = await employmentRepo.getAllProfiles();
        const profileMap = new Map(profiles.map(p => [p.userId, p]));

        const enrichedUsers = safeUsers.map(u => {
            const profile = profileMap.get(u.id);
            if (profile) {
                return { ...u, employmentStatus: profile.employmentStatus };
            }
            return u;
        });

        res.json(enrichedUsers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

/**
 * POST /api/admin/users - Create staff user (Super Admin only)
 */
router.post('/api/admin/users', requirePermission('canCreate'), async (req: Request, res: Response) => {
    try {
        const validated = adminCreateUserSchema.parse(req.body);

        const existingUsername = await userRepo.getUserByUsername(validated.username);
        if (existingUsername) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        const existingEmail = await userRepo.getUserByEmail(validated.email);
        if (existingEmail) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(validated.password, 12);
        const defaultPermissions = getDefaultPermissions(validated.role);

        const user = await userRepo.createUser({
            username: validated.username,
            name: validated.name,
            email: validated.email,
            password: hashedPassword,
            role: validated.role,
            permissions: validated.permissions || JSON.stringify(defaultPermissions),
        });

        if (validated.assignSalary) {
            const now = new Date();
            const profile = await employmentRepo.updateProfile(user.id, {
                userId: user.id,
                employeeCode: `PE-${Date.now()}`,
                employmentStatus: validated.employmentStatus || 'active',
                joinDate: validated.joinDate || now.toISOString().split('T')[0]
            } as any);

            await employmentRepo.createSalaryAssignment({
                userId: user.id,
                employmentProfileId: profile!.id,
                structureId: validated.salaryStructureId || '',
                baseAmount: validated.baseAmount || 0,
                hraAmount: validated.hraAmount || 0,
                medicalAmount: validated.medicalAmount || 0,
                conveyanceAmount: validated.conveyanceAmount || 0,
                otherAmount: validated.otherAmount || 0,
                incomeTaxPercent: validated.incomeTaxPercent || 0,
                effectiveFrom: validated.joinDate || now.toISOString().split('T')[0],
                changeReason: 'new_hire',
                approvedBy: req.session.adminUserId!,
                approvedAt: now,
                createdBy: req.session.adminUserId!
            });
        }

        const { password: _, ...safeUser } = user;

        // Audit log — user creation
        AuditLogger.log({
            userId: req.session.adminUserId!,
            action: 'CREATE',
            entity: 'User',
            entityId: user.id,
            details: `Created staff user '${user.name}' (${user.role}) - new: ${JSON.stringify({ name: user.name, email: user.email, role: user.role })}`,
            severity: 'info',
        }).catch(console.error);

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
        const currentUser = await userRepo.getUser(req.session.adminUserId!);
        if (!currentUser) return res.status(401).json({ error: 'User not found' });

        const targetUserId = req.params.id;

        // Fetch target user for validation
        const targetUser = await userRepo.getUser(targetUserId);
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Determine permissions
        const permissions = currentUser.permissions ? JSON.parse(currentUser.permissions) : {};
        const effectivePermissions = Object.keys(permissions).length > 0 ? permissions : getDefaultPermissions(currentUser.role);
        const canEdit = effectivePermissions.canEdit;

        // Logic:
        // 1. If it's your own account, you can update it (subject to restrictions below).
        // 2. If it's NOT your own account, you need 'canEdit' permission.
        if (currentUser.id !== targetUserId && !canEdit) {
            return res.status(403).json({ error: 'Not authorized to update other users' });
        }

        // Restriction: If you are NOT Super Admin, but updating YOURSELF, you can ONLY update password.
        if (currentUser.role !== 'Super Admin' && currentUser.id === targetUserId) {
            const { password, ...otherFields } = req.body;
            // Allow only password update for self-edit if not Super Admin?
            // Wait, what if a Manager wants to update their name/email?
            // The previous logic RESTRICTED this:
            // "if (currentUser?.role !== 'Super Admin' && currentUser?.id === targetUserId) { ... error if otherFields > 0 ... }"

            // I will maintain this restrictiveness for self-edits to be safe, 
            // OR relax it if 'canEdit' is true?
            // If I have 'canEdit', I can edit OTHERS. Should I be able to edit MYSELF fully?
            // Usually yes.

            // New Logic: 
            // If I have 'canEdit', I can edit myself fully (except Role maybe?).
            // If I DON'T have 'canEdit', I can only edit password.

            if (!canEdit && Object.keys(otherFields).length > 0) {
                return res.status(403).json({ error: 'You can only update your password' });
            }
        }

        const validated = adminUpdateUserSchema.parse(req.body);

        // Security Check: Prevent privilege escalation
        // Only Super Admins can change 'role' or 'permissions'
        if (currentUser.role !== 'Super Admin') {
            if (validated.role && validated.role !== targetUser.role) {
                return res.status(403).json({ error: 'Only Super Admins can change user roles' });
            }
            if (validated.permissions) {
                // Ideally, check if permissions changed. For now, block any permission update by non-super admin.
                return res.status(403).json({ error: 'Only Super Admins can change user permissions' });
            }
        }

        let updates: any = { ...validated };
        if (validated.password) {
            updates.password = await bcrypt.hash(validated.password, 12);
        }

        const updatedUser = await userRepo.updateUser(targetUserId, updates);
        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // If credentials, role, or status changed, revoke existing trusted devices
        if (validated.password || (validated.role && validated.role !== targetUser.role)) {
            await authService.revokeAllCorporateTrustedDevicesForUser(targetUserId, 'security_reset_or_role_change').catch(console.error);
        }

        const { password: _, ...safeUser } = updatedUser;

        // Audit log — user update
        const changedFields = Object.keys(validated).filter(k => k !== 'password');
        AuditLogger.log({
            userId: req.session.adminUserId!,
            action: 'UPDATE',
            entity: 'User',
            entityId: targetUserId,
            details: `Updated user '${targetUser.name}': [${changedFields.join(', ')}] - old: ${JSON.stringify({ name: targetUser.name, role: targetUser.role, status: targetUser.status })} new: ${JSON.stringify({ name: safeUser.name, role: safeUser.role, status: safeUser.status })}`,
            severity: validated.role && validated.role !== targetUser.role ? 'warning' : 'info',
        }).catch(console.error);

        // Notify the user to refresh their permissions instantly
        notifySpecificAdmin(targetUserId, { type: 'force_refresh_user' });

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
router.delete('/api/admin/users/:id', requirePermission('canDelete'), async (req: Request, res: Response) => {
    try {
        const currentUser = await userRepo.getUser(req.session.adminUserId!);

        if (currentUser?.id === req.params.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        const targetUser = await userRepo.getUser(req.params.id);

        const success = await userRepo.deleteUser(req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Audit log — user deletion (critical severity)
        AuditLogger.log({
            userId: req.session.adminUserId!,
            action: 'DELETE',
            entity: 'User',
            entityId: req.params.id,
            details: `Deleted staff user '${targetUser?.name || req.params.id}' (${targetUser?.role || 'unknown role'})`,
            severity: 'critical',
        }).catch(console.error);

        // Revoke trusted devices for the deleted user
        await authService.revokeAllCorporateTrustedDevicesForUser(req.params.id, 'account_deleted').catch(console.error);

        // Notify the user (if they are online) that they are deleted
        notifySpecificAdmin(req.params.id, { type: 'force_logout', reason: 'Account deleted' });

        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }

});

/**
 * POST /api/admin/corporate-users - Create corporate user (Admin only)
 * Generates password and emails it to the user.
 */
const createCorporateUserSchema = z.object({
    corporateClientId: z.string().min(1, "Corporate Client ID is required"),
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email"),
    username: z.string().min(3, "Username must be at least 3 characters"),
});

router.post('/api/admin/corporate-users', requirePermission('canCreate'), async (req: Request, res: Response) => {
    try {
        const validated = createCorporateUserSchema.parse(req.body);

        // Check if user exists
        if (await userRepo.getUserByUsername(validated.username)) {
            return res.status(400).json({ error: 'Username already taken' });
        }
        if (await userRepo.getUserByEmail(validated.email)) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Generate secure random password
        const generatedPassword = crypto.randomBytes(8).toString('hex');
        const hashedPassword = await bcrypt.hash(generatedPassword, 12);

        // Create user
        const user = await userRepo.createUser({
            username: validated.username,
            name: validated.name,
            email: validated.email,
            password: hashedPassword,
            role: 'Corporate', // Special role
            corporateClientId: validated.corporateClientId,
            permissions: JSON.stringify({ corporate: true }), // Basic corporate permission
        } as any);

        // Send Email
        const emailSent = await MailerService.sendWelcomeEmail(
            validated.email,
            validated.name,
            validated.username,
            generatedPassword
        );

        res.status(201).json({
            message: 'Corporate user created successfully',
            user: { id: user.id, username: user.username, email: user.email },
            emailSent,
            // We return the password here strictly for the Admin to copy manually if email fails
            // In a stricter environment, we wouldn't return this.
            temporaryPassword: generatedPassword
        });

    } catch (error: any) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ error: 'Invalid data', details: error.errors });
        }
        console.error('Create corporate user error:', error);
        res.status(500).json({ error: 'Failed to create corporate user' });
    }
});

// ============================================
// Admin Customers API
// ============================================

/**
 * GET /api/admin/customers - Get all customers
 */
router.get('/api/admin/customers', requireAdminAuth, requirePermission('users'), async (req: Request, res: Response) => {
    try {
        const result = await userRepo.getAllUsers(1, 10000);
        const allUsers = result.items;
        const customers = allUsers.filter(u => u.role === 'Customer');

        const customersWithStats = await Promise.all(
            customers.map(async (customer) => {
                const orders = await orderRepo.getOrdersByCustomerId(customer.id);
                const serviceRequests = await serviceRequestRepo.getServiceRequestsByCustomerId(customer.id);
                const jobTickets = await jobRepo.getJobTicketsByCustomerPhone(customer.phone || '');

                // Calculate LTV
                const shopTotal = orders.reduce((sum, order) => sum + (order.total || 0), 0);
                const serviceTotal = serviceRequests.reduce((sum, sr) => sum + ((sr.totalAmount || sr.quoteAmount) || 0), 0);
                const jobTotal = jobTickets.reduce((sum, j) => sum + (j.estimatedCost || 0), 0);
                const lifetimeValue = shopTotal + serviceTotal + jobTotal;

                // Find Latest Interaction Date
                let lastInteractionDate = customer.joinedAt;
                orders.forEach(o => {
                    if (o.createdAt && new Date(o.createdAt) > new Date(lastInteractionDate)) lastInteractionDate = o.createdAt;
                });
                serviceRequests.forEach(sr => {
                    if (sr.createdAt && new Date(sr.createdAt) > new Date(lastInteractionDate)) lastInteractionDate = sr.createdAt;
                });
                jobTickets.forEach(j => {
                    if (j.createdAt && new Date(j.createdAt) > new Date(lastInteractionDate)) lastInteractionDate = j.createdAt;
                });

                // Get job tickets similarly 
                // Since this section comes from getAll routing, we might not have jobs attached here initially without extra joins,
                // but we DO have it on the getOne route line 585. Let's fix the timeline assembly on the map. 
                // Wait, it turns out lines 480-520 are for the 'getAll' method! I should check the exact lines.

                // Attach simplified timelines for the Activity Popup
                const recentOrders = orders.map(o => ({
                    id: o.id,
                    type: 'Shop Order',
                    reference: o.orderNumber || o.id,
                    status: o.status,
                    date: o.createdAt,
                    amount: o.total
                }));

                const recentServices = serviceRequests.map(sr => ({
                    id: sr.id,
                    type: 'Service Request',
                    reference: sr.ticketNumber || sr.id,
                    status: sr.status,
                    date: sr.createdAt,
                    amount: sr.totalAmount || sr.quoteAmount || 0
                }));

                const recentJobs = jobTickets.map(j => ({
                    id: j.id,
                    type: j.billingStatus === 'invoiced' ? 'Invoice' : 'Job Ticket',
                    reference: j.id,
                    status: j.status,
                    date: j.createdAt,
                    amount: j.estimatedCost || 0
                }));

                // Combine and sort interaction timeline
                const interactionTimeline = [...recentOrders, ...recentServices, ...recentJobs]
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                return {
                    ...customer,
                    password: undefined,
                    totalOrders: orders.length,
                    totalServiceRequests: serviceRequests.length,
                    totalJobTickets: jobTickets.length,
                    lifetimeValue,
                    lastInteractionDate,
                    interactionTimeline
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
 * POST /api/admin/customers - Create a customer
 */
router.post('/api/admin/customers', requireAdminAuth, requirePermission('users'), async (req: Request, res: Response) => {
    try {
        const { name, email, phone, address } = req.body;

        if (!phone) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        const existingUser = await userRepo.getUserByPhoneNormalized(phone);
        if (existingUser) {
            return res.status(400).json({ error: 'Customer with this phone number already exists' });
        }

        // Generate a random password since admin is creating the account
        // The customer can reset it later if they log in via phone OTP in the future,
        // or the system might not even need them to login depending on the use case.
        const generatedPassword = crypto.randomBytes(8).toString('hex');
        const hashedPassword = await bcrypt.hash(generatedPassword, 12);

        const newCustomer = await userRepo.createUser({
            username: phone,
            name,
            phone,
            email: email || null,
            address: address || null,
            password: hashedPassword,
            role: 'Customer',
            status: 'Active',
            permissions: '{}',
        });

        // Link existing service requests if any
        await serviceRequestRepo.linkServiceRequestsByPhone(phone, newCustomer.id);

        const { password: _, ...safeCustomer } = newCustomer;
        res.status(201).json(safeCustomer);
    } catch (error) {
        console.error('Failed to create customer:', error);
        res.status(500).json({ error: 'Failed to create customer' });
    }
});

/**
 * GET /api/admin/customers/:id - Get customer details
 */
router.get('/api/admin/customers/:id', requireAdminAuth, requirePermission('users'), async (req: Request, res: Response) => {
    try {
        const user = await storage.getUser(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const orders = await orderRepo.getOrdersByCustomerId(user.id);
        const serviceRequests = await serviceRequestRepo.getServiceRequestsByCustomerId(user.id);
        const jobTickets = await jobRepo.getJobTicketsByCustomerPhone(user.phone || '');

        const ordersWithItems = await Promise.all(
            orders.map(async (order) => {
                const items = await orderRepo.getOrderItems(order.id);
                return { ...order, items };
            })
        );

        res.json({
            ...user,
            password: undefined,
            orders: ordersWithItems,
            serviceRequests,
            jobTickets,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch customer details' });
    }
});

/**
 * PATCH /api/admin/customers/:id - Update customer
 */
router.patch('/api/admin/customers/:id', requireAdminAuth, requirePermission('users'), async (req: Request, res: Response) => {
    try {
        const { name, email, phone, address, isVerified } = req.body;
        const updates: any = {};

        if (name !== undefined) updates.name = name;
        if (email !== undefined) updates.email = email;
        if (phone !== undefined) updates.phone = phone;
        if (address !== undefined) updates.address = address;
        if (isVerified !== undefined) updates.isVerified = isVerified;

        const updated = await userRepo.updateUser(req.params.id, updates);
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
router.delete('/api/admin/customers/:id', requireAdminAuth, requirePermission('users'), async (req: Request, res: Response) => {
    try {
        const success = await userRepo.deleteUser(req.params.id);
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
router.get('/api/admin/jobs/technician/:name', requireAdminAuth, requireAnyPermission(['users', 'jobs', 'reports']), async (req: Request, res: Response) => {
    try {
        const jobs = await jobRepo.getJobTicketsByTechnician(req.params.name);
        res.json(jobs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch technician jobs' });
    }
});

/**
 * GET /api/admin/reports - Get report data
 */
router.get('/api/admin/reports', requireAdminAuth, requirePermission('reports'), async (req: Request, res: Response) => {
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

        const reportData = await analyticsRepo.getReportData(startDate, endDate);
        res.json(reportData);
    } catch (error) {
        console.error('Failed to fetch report data:', error);
        res.status(500).json({ error: 'Failed to fetch report data' });
    }
});

export default router;
