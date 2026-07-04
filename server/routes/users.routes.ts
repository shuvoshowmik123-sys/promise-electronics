/**
 * Users Routes
 * 
 * Handles admin user management (staff users, not customers).
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { storage } from '../storage.js';
import { userRepo, analyticsRepo, orderRepo, serviceRequestRepo, jobRepo, employmentRepo } from '../repositories/index.js';
import { repairJourneyService } from '../services/customer-repair-journey.service.js';
import { insertUserSchema } from '../../shared/schema.js';
import { getSafeJobDisplayRef } from '../../shared/job-display-utils.js';
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
import { corporatePasswordResetService } from '../services/corporate-password-reset.service.js';
import { z } from 'zod';
import crypto from 'crypto';
import { AuditLogger } from '../services/audit.service.js';
import { handleAdminEventStream } from './admin-stream.js';
import { getCachedDashboard } from '../lib/dashboardCache.js';
import { logRouteError } from '../utils/route-error.js';
import { upsertPresence, sweepOfflineStaff } from '../services/assignment.service.js';
import { auditLogger } from '../utils/auditLogger.js';
import { AUDIT_ACTIONS } from '../../shared/constants.js';
import { db } from '../db.js';
import { staffPresence as staffPresenceTable, users } from '../../shared/schema.js';
import { eq as drizzleEq, desc as drizzleDesc } from 'drizzle-orm';

const router = Router();

const SENSITIVE_USER_FIELDS = ['password', 'passwordHash', 'temporaryPassword', 'resetSecret', 'otpSecret'] as const;

function stripSensitiveFields<T extends Record<string, any>>(user: T): Omit<T, typeof SENSITIVE_USER_FIELDS[number]> {
    const safe = { ...user };
    for (const field of SENSITIVE_USER_FIELDS) {
        delete (safe as any)[field];
    }
    return safe;
}

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
        logRouteError('AdminDashboard.Stats', req, error);
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
        logRouteError('AdminDashboard.JobOverview', req, error);
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
        logRouteError('AdminDashboard.WorkflowKPIs', req, error);
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
        res.json({ ...result, items: result.items.map(stripSensitiveFields) });
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
        console.error('[UsersRoutes] Workload fetch error:', (error as Error).message);
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
        res.json(stripSensitiveFields(user));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

/**
 * POST /api/users - Create user
 */
router.post('/api/users', requireAdminAuth, requirePermission('users'), async (req: Request, res: Response) => {
    try {
        const currentUser = await userRepo.getUser(req.session.adminUserId!);
        const validated = insertUserSchema.parse(req.body);

        // Privilege-escalation guard: only Super Admins may mint Super Admins or
        // set custom permission sets via this route.
        if (currentUser?.role !== 'Super Admin') {
            if ((validated as any).role === 'Super Admin') {
                return res.status(403).json({ error: 'Only Super Admins can create Super Admin users' });
            }
            if ((validated as any).permissions) {
                return res.status(403).json({ error: 'Only Super Admins can set custom permissions' });
            }
        }

        // Never persist a plaintext password (login compares against a bcrypt hash).
        const toCreate: any = { ...validated };
        if (toCreate.password) {
            toCreate.password = await bcrypt.hash(toCreate.password, 12);
        }

        const user = await userRepo.createUser(toCreate);
        const { password: _, ...safeUser } = user;
        res.status(201).json(safeUser);
    } catch (error: any) {
        if (error?.name === 'ZodError') {
            return res.status(400).json({ error: 'Invalid user data', details: error.errors });
        }
        res.status(400).json({ error: 'Invalid user data' });
    }
});

/**
 * PATCH /api/users/:id - Update user
 */
router.patch('/api/users/:id', requireAdminAuth, requirePermission('users'), async (req: Request, res: Response) => {
    try {
        const currentUser = await userRepo.getUser(req.session.adminUserId!);
        if (!currentUser) return res.status(401).json({ error: 'User not found' });

        const targetUser = await userRepo.getUser(req.params.id);
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        const updates: any = { ...req.body };

        // Privilege-escalation guard: only Super Admins may change role or
        // permissions. Without this, any admin with 'users' permission could
        // PATCH themselves to Super Admin / grant '*' permissions.
        if (currentUser.role !== 'Super Admin') {
            if (updates.role !== undefined && updates.role !== targetUser.role) {
                return res.status(403).json({ error: 'Only Super Admins can change user roles' });
            }
            if (updates.permissions !== undefined) {
                return res.status(403).json({ error: 'Only Super Admins can change user permissions' });
            }
        }

        // Never persist a plaintext password.
        if (updates.password) {
            updates.password = await bcrypt.hash(updates.password, 12);
        }

        const user = await userRepo.updateUser(req.params.id, updates);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { password: _, ...safeUser } = user;
        res.json(safeUser);
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
            const staffRoles = ['Super Admin', 'Manager', 'Cashier', 'Technician', 'Driver'];
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

const DANGEROUS_PERM_KEYS = new Set([
    '*', 'users', 'settings', 'systemHealth', 'canDelete',
    'users.inviteStaff', 'users.editPermissions', 'users.deactivate', 'settings.manage',
]);

function sanitizePermissions(raw: string | undefined, defaultPerms: Record<string, boolean>): string {
    if (!raw) return JSON.stringify(defaultPerms);
    try {
        const parsed: Record<string, unknown> = JSON.parse(raw);
        DANGEROUS_PERM_KEYS.forEach(key => delete parsed[key]);
        return JSON.stringify(parsed);
    } catch {
        return JSON.stringify(defaultPerms);
    }
}

/**
 * POST /api/admin/users - Emergency direct staff creation (Super Admin only).
 * Prefer the invite flow for normal onboarding.
 */
router.post('/api/admin/users', requireAdminAuth, requireSuperAdmin, async (req: Request, res: Response) => {
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
            permissions: sanitizePermissions(validated.permissions, defaultPermissions),
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
        }).catch(() => {});

        res.status(201).json(safeUser);
    } catch (error: any) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ error: 'Invalid user data', details: error.errors });
        }
        console.error('[UsersRoutes] Create user error:', (error as Error).message);
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
            await authService.revokeAllCorporateTrustedDevicesForUser(targetUserId, 'security_reset_or_role_change').catch(() => {});
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
        }).catch(() => {});

        // Notify the user to refresh their permissions instantly
        notifySpecificAdmin(targetUserId, { type: 'force_refresh_user' });

        res.json(safeUser);
    } catch (error: any) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ error: 'Invalid user data', details: error.errors });
        }
        console.error('[UsersRoutes] Update user error:', (error as Error).message);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

/**
 * DELETE /api/admin/users/:id - Delete staff user (Super Admin only)
 */
router.delete('/api/admin/users/:id', requireAdminAuth, requireSuperAdmin, async (req: Request, res: Response) => {
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
        }).catch(() => {});

        // Revoke trusted devices for the deleted user
        await authService.revokeAllCorporateTrustedDevicesForUser(req.params.id, 'account_deleted').catch(() => {});

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
        console.error('[UsersRoutes] Create corporate user error:', (error as Error).message);
        res.status(500).json({ error: 'Failed to create corporate user' });
    }
});

router.post('/api/admin/corporate-users/:id/reset-password', requirePermission('canEdit'), async (req: Request, res: Response) => {
    try {
        const targetUser = await userRepo.getUser(req.params.id);
        if (!targetUser || targetUser.role !== 'Corporate' || !targetUser.corporateClientId) {
            return res.status(404).json({ error: 'Corporate user not found' });
        }

        const generatedPassword = crypto.randomBytes(8).toString('hex');
        const hashedPassword = await bcrypt.hash(generatedPassword, 12);
        const updatedUser = await userRepo.updateUser(targetUser.id, { password: hashedPassword } as any);

        await authService.revokeAllCorporateTrustedDevicesForUser(targetUser.id, 'corporate_password_reset').catch(() => {});

        AuditLogger.log({
            userId: req.session.adminUserId!,
            action: 'UPDATE',
            entity: 'User',
            entityId: targetUser.id,
            details: `Reset corporate portal password for '${targetUser.name}' (${targetUser.username})`,
            severity: 'warning',
        }).catch(() => {});

        res.json({
            user: {
                id: updatedUser?.id || targetUser.id,
                username: updatedUser?.username || targetUser.username,
                email: updatedUser?.email || targetUser.email,
            },
            temporaryPassword: generatedPassword,
        });
    } catch (error) {
        console.error('[UsersRoutes] Corporate password reset error:', (error as Error).message);
        res.status(500).json({ error: 'Failed to reset corporate user password' });
    }
});

router.post('/api/admin/corporate-users/:id/reset-otp', requirePermission('canEdit'), async (req: Request, res: Response) => {
    try {
        const result = await corporatePasswordResetService.issueAdminCode(req.params.id, req.session.adminUserId!);

        AuditLogger.log({
            userId: req.session.adminUserId!,
            action: 'CREATE',
            entity: 'CorporatePasswordReset',
            entityId: result.request.id,
            details: `Issued corporate portal OTP reset code for '${result.request.name}' (${result.request.username})`,
            severity: 'warning',
        }).catch(() => {});

        res.json(result);
    } catch (error: any) {
        res.status(error.message === 'Corporate user not found' ? 404 : 500).json({ error: error.message || 'Failed to generate reset code' });
    }
});

router.get('/api/admin/corporate-users/reset-requests', requirePermission('canEdit'), async (req: Request, res: Response) => {
    try {
        const corporateClientId = String(req.query.corporateClientId || '');
        if (!corporateClientId) {
            return res.status(400).json({ error: 'Corporate client ID is required' });
        }

        const requests = await corporatePasswordResetService.getClientResetRequests(corporateClientId);
        res.json(requests);
    } catch (error) {
        console.error('[UsersRoutes] Corporate reset requests error:', (error as Error).message);
        res.status(500).json({ error: 'Failed to load reset requests' });
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

        // Hoist full-table loads before the per-customer loop: 3 total DB reads instead of N x 2 full-table scans
        const [allOrders, allServiceRequests, allJobTickets] = await Promise.all([
            orderRepo.getAllOrders(),
            serviceRequestRepo.getAllServiceRequests(),
            jobRepo.getAllJobTickets(),
        ]);

        // Index for O(1) per-customer lookup
        const ordersByCid = new Map<string, any[]>();
        for (const o of allOrders) {
            if (o.customerId) {
                if (!ordersByCid.has(o.customerId)) ordersByCid.set(o.customerId, []);
                ordersByCid.get(o.customerId)!.push(o);
            }
        }
        const srByCid = new Map<string, any[]>();
        for (const sr of allServiceRequests) {
            if (sr.customerId) {
                if (!srByCid.has(sr.customerId)) srByCid.set(sr.customerId, []);
                srByCid.get(sr.customerId)!.push(sr);
            }
        }
        const jobByPhone = new Map<string, any[]>();
        for (const j of allJobTickets) {
            if (j.customerPhone) {
                const key = j.customerPhone.replace(/\D/g, '').slice(-10);
                if (!jobByPhone.has(key)) jobByPhone.set(key, []);
                jobByPhone.get(key)!.push(j);
            }
        }

        const customersWithStats = customers.map((customer) => {
            const normalizedPhone = (customer.phone || '').replace(/\D/g, '').slice(-10);
            const orders: any[] = ordersByCid.get(customer.id) ?? [];
            const serviceRequests: any[] = srByCid.get(customer.id) ?? [];
            const jobTickets: any[] = jobByPhone.get(normalizedPhone) ?? [];

            const shopTotal = orders.reduce((sum: number, order: any) => sum + (order.total || 0), 0);
            const serviceTotal = serviceRequests.reduce((sum: number, sr: any) => sum + ((sr.totalAmount || sr.quoteAmount) || 0), 0);
            const jobTotal = jobTickets.reduce((sum: number, j: any) => sum + (j.estimatedCost || 0), 0);
            const lifetimeValue = shopTotal + serviceTotal + jobTotal;

            let lastInteractionDate = customer.joinedAt;
            orders.forEach((o: any) => {
                if (o.createdAt && new Date(o.createdAt) > new Date(lastInteractionDate)) lastInteractionDate = o.createdAt;
            });
            serviceRequests.forEach((sr: any) => {
                if (sr.createdAt && new Date(sr.createdAt) > new Date(lastInteractionDate)) lastInteractionDate = sr.createdAt;
            });
            jobTickets.forEach((j: any) => {
                if (j.createdAt && new Date(j.createdAt) > new Date(lastInteractionDate)) lastInteractionDate = j.createdAt;
            });

            const recentOrders = orders.map((o: any) => ({
                id: o.id,
                type: 'Shop Order',
                reference: o.orderNumber || o.id,
                status: o.status,
                date: o.createdAt,
                amount: o.total
            }));
            const recentServices = serviceRequests.map((sr: any) => ({
                id: sr.id,
                type: 'Service Request',
                reference: sr.ticketNumber || sr.id,
                status: sr.status,
                date: sr.createdAt,
                amount: sr.totalAmount || sr.quoteAmount || 0
            }));
            const recentJobs = jobTickets.map((j: any) => ({
                id: j.id,
                type: j.billingStatus === 'invoiced' ? 'Invoice' : 'Job Ticket',
                reference: getSafeJobDisplayRef(j),
                status: j.status,
                date: j.createdAt,
                amount: j.estimatedCost || 0
            }));

            const interactionTimeline = [...recentOrders, ...recentServices, ...recentJobs]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 10);

            return {
                ...stripSensitiveFields(customer),
                totalOrders: orders.length,
                totalServiceRequests: serviceRequests.length,
                totalJobTickets: jobTickets.length,
                lifetimeValue,
                lastInteractionDate,
                interactionTimeline
            };
        });

        res.json(customersWithStats);
    } catch (error) {
        console.error('[UsersRoutes] Failed to fetch customers:', (error as Error).message);
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
        console.error('[UsersRoutes] Failed to create customer:', (error as Error).message);
        res.status(500).json({ error: 'Failed to create customer' });
    }
});

/**
 * GET /api/admin/customers/:id - Get customer details
 */
router.get('/api/admin/customers/:id', requireAdminAuth, requirePermission('users'), async (req: Request, res: Response) => {
    // PII access log — phone/address visible in response
    auditLogger.log({
        userId: (req as any).session?.adminUserId || 'unknown',
        action: AUDIT_ACTIONS.VIEW_CUSTOMER_PII,
        entity: 'Customer',
        entityId: req.params.id,
        details: `Admin viewed customer PII for ID ${req.params.id}`,
        req,
        severity: 'info',
    }).catch(() => {});

    try {
        const user = await storage.getUser(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const [orders, serviceRequests, jobTickets, journeys] = await Promise.all([
            orderRepo.getOrdersByCustomerId(user.id),
            serviceRequestRepo.getServiceRequestsByCustomerId(user.id),
            jobRepo.getJobTicketsByCustomerPhone(user.phone || ''),
            repairJourneyService.getAdminJourneysByCustomer(user.id),
        ]);

        const ordersWithItems = await Promise.all(
            orders.map(async (order) => {
                const items = await orderRepo.getOrderItems(order.id);
                return { ...order, items };
            })
        );

        res.json({
            ...stripSensitiveFields(user),
            orders: ordersWithItems,
            serviceRequests,
            jobTickets,
            journeys,
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

        res.json(stripSensitiveFields(updated));
    } catch (error: any) {
        // Duplicate phone hits a DB unique violation — surface a friendly 409
        // instead of a generic 500 (mirrors the customer profile route).
        if (error?.code === '23505') {
            return res.status(409).json({ error: 'This phone number is already in use by another user.', code: 'PHONE_EXISTS' });
        }
        res.status(500).json({ error: 'Failed to update customer' });
    }
});

/**
 * DELETE /api/admin/customers/:id - Delete customer
 */
router.delete('/api/admin/customers/:id', requireAdminAuth, requirePermission('users'), async (req: Request, res: Response) => {
    try {
        const customer = await userRepo.getUser(req.params.id);
        if (!customer || customer.role !== 'Customer') {
            return res.status(404).json({ error: 'Customer not found' });
        }

        // Reference guard: deleting a customer with linked orders/service requests
        // would orphan those rows (customerId points at a deleted user). Block and
        // report the counts so staff can reassign/close history first.
        const [orders, serviceRequests] = await Promise.all([
            orderRepo.getOrdersByCustomerId(req.params.id),
            serviceRequestRepo.getServiceRequestsByCustomerId(req.params.id),
        ]);
        if (orders.length > 0 || serviceRequests.length > 0) {
            return res.status(409).json({
                error: 'Cannot delete: customer has linked orders or service requests',
                orders: orders.length,
                serviceRequests: serviceRequests.length,
            });
        }

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
 * POST /api/admin/customers/:id/reset-code - Generate a staff-assisted reset code
 * Super Admin only. Verifies customer identity manually, then creates a one-time code
 * the customer can use at POST /api/customer/password-reset/complete.
 */
router.post('/api/admin/customers/:id/reset-code', requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const customer = await userRepo.getUser(req.params.id);
        if (!customer || customer.role !== 'Customer') {
            return res.status(404).json({ error: 'Customer not found' });
        }

        const adminId = req.session.adminUserId || 'unknown';
        const code = String(100000 + Math.floor(Math.random() * 900000));
        const codeHash = await bcrypt.hash(code, 10);
        const id = crypto.randomUUID();

        const { sql } = await import('drizzle-orm');

        await db.execute(sql`UPDATE staff_reset_codes SET used = TRUE WHERE user_id = ${customer.id} AND used = FALSE`);

        await db.execute(sql`
            INSERT INTO staff_reset_codes (id, user_id, code_hash, expires_at, created_by, created_at)
            VALUES (${id}, ${customer.id}, ${codeHash}, ${new Date(Date.now() + 10 * 60 * 1000).toISOString()}::timestamp, ${adminId}, NOW())
        `);

        auditLogger.log({
            userId: adminId,
            action: 'CREATE',
            entity: 'StaffResetCode',
            entityId: customer.id,
            details: `Staff-assisted password reset code generated for customer ${customer.id}`,
            req,
            severity: 'warning',
        }).catch(() => {});

        console.log(`[StaffReset] Reset code created for customer ${customer.id} by admin ${adminId}`);

        res.json({
            code,
            expiresInMinutes: 10,
            customerPhone: customer.phone?.slice(-4) ? `****${customer.phone.slice(-4)}` : 'no phone',
            message: 'Give this code to the customer. It expires in 10 minutes and can only be used once.',
        });
    } catch (error: any) {
        console.error('[StaffReset] Failed to create reset code:', (error as Error).message);
        res.status(500).json({ error: 'Failed to create reset code' });
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
        console.error('[UsersRoutes] Failed to fetch report data:', (error as Error).message);
        res.status(500).json({ error: 'Failed to fetch report data' });
    }
});

// ─── Staff presence list (for inbox UI) ──────────────────────────────────────
// NOTE: path is /api/staff-presence (NOT /api/users/...) to avoid collision
// with the GET /api/users/:id route which would capture "staff-presence" as :id.
router.get('/api/staff-presence', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const rows = await db.select({
            staffId: staffPresenceTable.staffId,
            name: users.name,
            status: staffPresenceTable.status,
            lastSeenAt: staffPresenceTable.lastSeenAt,
        })
        .from(staffPresenceTable)
        .leftJoin(users, drizzleEq(staffPresenceTable.staffId, users.id))
        .orderBy(drizzleDesc(staffPresenceTable.lastSeenAt));

        res.json({ data: rows });
    } catch (err) {
        res.status(500).json({ data: [] });
    }
});

// ─── Staff presence heartbeat (Phase B) ────────────────────────────────────────
// Frontend pings every 30s while admin tab focused. Sets status to 'online'.
// Sweeps stale presences (staff with heartbeat >5min ago → mark offline).
router.post('/api/users/presence', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const staffId = (req as any).admin?.id;
        if (!staffId) return res.status(401).json({ message: 'Unauthorized' });
        const channels: string[] = req.body?.channels ?? ['messenger', 'whatsapp'];
        const status: 'online' | 'away' = req.body?.status === 'away' ? 'away' : 'online';
        await upsertPresence(staffId, status, channels);
        await sweepOfflineStaff(); // sweep on each heartbeat (cheap, ~1-2ms)
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update presence' });
    }
});

// Mark self offline (tab close / logout)
router.delete('/api/users/presence', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const staffId = (req as any).admin?.id;
        if (!staffId) return res.status(401).json({ message: 'Unauthorized' });
        await upsertPresence(staffId, 'offline', []);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update presence' });
    }
});

export default router;
