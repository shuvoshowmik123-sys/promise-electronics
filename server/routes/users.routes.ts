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
    requireGranularPermission,
    requireAnyPermission,
    getEffectivePermissionsForUser,
    adminCreateUserSchema,
    adminUpdateUserSchema,
    getDefaultPermissions
} from './middleware/auth.js';
import { getNewStaffPermissionMap, findDroppedBaselinePermissions } from '../../shared/permission-catalog.js';

/**
 * Guard a permissions write against silently revoking a role's baseline.
 *
 * Returns an error body to send, or null when the save is safe. Accepts the
 * column in either shape — the API takes a JSON string, some callers pass an
 * object — and ignores writes that do not touch permissions at all.
 *
 * An unparseable value is left alone: schema validation owns that error, and
 * this guard should not turn a malformed payload into a confusing one.
 */
function assertNoSilentBaselineDrop(
    permissions: unknown,
    role: string,
    acknowledged: boolean,
): { error: string; code: string; droppedPermissions: string[] } | null {
    if (permissions === undefined || permissions === null) return null;
    if (acknowledged) return null;

    let parsed: Record<string, any>;
    try {
        parsed = typeof permissions === 'string' ? JSON.parse(permissions) : (permissions as Record<string, any>);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) return null;

    const dropped = findDroppedBaselinePermissions(role, parsed);
    if (dropped.length === 0) return null;

    return {
        error:
            `This would remove ${dropped.length} permission(s) that the ${role} role needs to function: ` +
            `${dropped.join(', ')}. Stored permissions replace the role preset rather than adding to it, ` +
            `so anything not included here is revoked. Re-send with acknowledgeBaselineRemoval: true if that is intended.`,
        code: 'BASELINE_PERMISSION_REMOVAL',
        droppedPermissions: dropped,
    };
}

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
import { normalizePhone } from '../utils/phone.js';
import { upsertPresence, sweepOfflineStaff } from '../services/assignment.service.js';
import { auditLogger } from '../utils/auditLogger.js';
import { AUDIT_ACTIONS } from '../../shared/constants.js';
import { db } from '../db.js';
import { staffPresence as staffPresenceTable, users } from '../../shared/schema.js';
import { eq as drizzleEq, desc as drizzleDesc, sql } from 'drizzle-orm';
import {
    createCorporateSetupToken,
    getCorporateAppBaseUrl,
    invalidateCorporateSetupToken,
    invalidateOtherCorporateSetupTokens,
    removeCorporateUserAndTokens,
} from '../services/corporate-setup-token.service.js';

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
 * GET /api/users/lookup - Limited user lookup for dropdowns.
 * Requires users / canViewUsers / canAssignTechnician (or mapped jobs.assignTechnician).
 * ?role=Technician returns only active Technicians with safe fields (no email).
 */
router.get('/api/users/lookup', requireAnyPermission(['users', 'canViewUsers', 'canAssignTechnician']), async (req: Request, res: Response) => {
    try {
        const result = await userRepo.getAllUsers(1, 1000);
        const roleFilter = typeof req.query.role === 'string' ? req.query.role.trim() : '';
        let items = result.items;
        if (roleFilter === 'Technician') {
            items = items.filter((u) => u.role === 'Technician' && (!u.status || u.status === 'Active'));
            res.setHeader('Cache-Control', 'private, no-store');
            return res.json({
                items: items.map((u) => ({
                    id: u.id,
                    name: u.name,
                    role: u.role,
                    skills: u.skills ?? null,
                    status: u.status,
                })),
            });
        }
        // Only return non-sensitive fields
        const safeUsers = items.map(u => ({
            id: u.id,
            name: u.name,
            role: u.role,
            email: u.email,
            skills: u.skills ?? null,
            status: u.status,
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
router.post('/api/users', requireAdminAuth, requireGranularPermission('users.inviteStaff'), async (req: Request, res: Response) => {
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

        // New staff always get an explicit stored profile. Managers → Manager Basic (corporate-free).
        // Do not leave null/empty so they never fall through to legacy dynamic defaults.
        if (!toCreate.permissions || toCreate.permissions === '{}' || toCreate.permissions === 'null') {
            const explicit = getNewStaffPermissionMap(toCreate.role || 'Technician');
            if (Object.keys(explicit).length > 0) {
                toCreate.permissions = JSON.stringify(explicit);
            }
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
router.patch('/api/users/:id', requireAdminAuth, requireGranularPermission('users.editStaff'), async (req: Request, res: Response) => {
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

        /**
         * Refuse to silently drop a role's baseline permissions.
         *
         * Stored permissions REPLACE the preset, so saving a set that omits a
         * baseline key revokes it without anyone intending to. That is how a
         * Driver lost `pickup.confirmHandover` while gaining four other pickup
         * permissions — the loss was invisible until "Access denied" appeared
         * at a customer's door.
         *
         * Enforced here rather than only in the editor because the column is
         * also reachable from the API, bulk import and scripts. Removing a
         * baseline permission stays possible; it just has to be deliberate.
         */
        const baselineCheck = assertNoSilentBaselineDrop(
            updates.permissions,
            (updates.role as string) ?? targetUser.role,
            req.body?.acknowledgeBaselineRemoval === true,
        );
        if (baselineCheck) {
            return res.status(400).json(baselineCheck);
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
        // Empty object → explicit role preset (e.g. Manager Basic), not legacy null-fallback.
        if (Object.keys(parsed).length === 0) return JSON.stringify(defaultPerms);
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
        // Prefer explicit role preset (Manager Basic = corporate-free) over legacy dynamic defaults.
        const presetPermissions = getNewStaffPermissionMap(validated.role);
        const defaultPermissions =
            Object.keys(presetPermissions).length > 0
                ? presetPermissions
                : getDefaultPermissions(validated.role);

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

        const isSuperAdmin = currentUser.role === 'Super Admin';

        // Non-SA: cannot touch any other user
        if (!isSuperAdmin && currentUser.id !== targetUserId) {
            return res.status(403).json({ error: 'Not authorized to update other users' });
        }

        // Non-SA self-edit: only password allowed
        if (!isSuperAdmin && currentUser.id === targetUserId) {
            const { password, ...otherFields } = req.body;
            if (Object.keys(otherFields).length > 0) {
                return res.status(403).json({ error: 'You can only update your own password' });
            }
            if (!password) {
                return res.status(400).json({ error: 'Password is required' });
            }
        }

        const validated = adminUpdateUserSchema.parse(req.body);

        // Only Super Admin can change role or permissions
        if (!isSuperAdmin) {
            if (validated.role && validated.role !== targetUser.role) {
                return res.status(403).json({ error: 'Only Super Admins can change user roles' });
            }
            if (validated.permissions) {
                return res.status(403).json({ error: 'Only Super Admins can change user permissions' });
            }
        }

        // Same baseline guard as PATCH /api/users/:id — the Super Admin route
        // must not be the way round it.
        const adminBaselineCheck = assertNoSilentBaselineDrop(
            (validated as any).permissions,
            (validated.role as string) ?? targetUser.role,
            req.body?.acknowledgeBaselineRemoval === true,
        );
        if (adminBaselineCheck) {
            return res.status(400).json(adminBaselineCheck);
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
 * Validation for PATCH /api/admin/customers/:id.
 *
 * PATCH semantics: every field is optional, but a field that IS supplied must be
 * valid. `.min(1)` on name is the specific guard for DR-01 — an empty string
 * satisfies the NOT NULL column and previously wiped the record with a 200.
 * `.strict()` rejects unknown keys so a caller cannot smuggle in columns the
 * route never intended to expose (role, permissions, passwordHash).
 */
const adminCustomerUpdateSchema = z.object({
    name: z.string().trim().min(1, "Name cannot be empty").max(120, "Name is too long").optional(),
    email: z.union([z.string().trim().email("Invalid email address"), z.literal("")]).optional(),
    phone: z.string().trim().min(10, "Phone number is too short").max(20, "Phone number is too long").optional(),
    address: z.string().trim().max(500, "Address is too long").optional(),
    isVerified: z.boolean().optional(),
}).strict();

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

router.post('/api/admin/corporate-users', requireAdminAuth, requirePermission('canCreate'), async (req: Request, res: Response) => {
    try {
        const validated = createCorporateUserSchema.parse(req.body);

        if (await userRepo.getUserByUsername(validated.username)) {
            return res.status(400).json({ error: 'Username already taken' });
        }
        if (await userRepo.getUserByEmail(validated.email)) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Locked unusable password — never returned, never emailed
        const appUrl = getCorporateAppBaseUrl();
        if (!appUrl) {
            return res.status(503).json({ error: 'Corporate setup is temporarily unavailable. Configure APP_BASE_URL.' });
        }

        const lockedHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);

        const user = await userRepo.createUser({
            username: validated.username,
            name: validated.name,
            email: validated.email,
            password: lockedHash,
            role: 'Corporate',
            corporateClientId: validated.corporateClientId,
            permissions: JSON.stringify({ corporate: true }),
            status: 'Pending',
        } as any);

        const rawToken = await createCorporateSetupToken(user.id, 'setup');
        const setupUrl = `${appUrl}/corporate/setup/${rawToken}`;

        const emailSent = await MailerService.sendCorporateSetupLink(
            validated.email,
            validated.name,
            setupUrl,
        );

        if (!emailSent) {
            try {
                await removeCorporateUserAndTokens(user.id);
            } catch (cleanupError) {
                console.error('[UsersRoutes] Corporate setup cleanup failed:', (cleanupError as Error).message);
                return res.status(500).json({ error: 'Setup email failed and account cleanup could not be confirmed.' });
            }
            return res.status(500).json({ error: 'Failed to send setup link. User was not created. Please try again.' });
        }
        await invalidateOtherCorporateSetupTokens(user.id, 'setup', rawToken).catch((error) => {
            console.error('[UsersRoutes] Previous setup-token invalidation failed:', (error as Error).message);
        });

        AuditLogger.log({
            userId: req.session.adminUserId!,
            action: 'CREATE',
            entity: 'User',
            entityId: user.id,
            details: `Created corporate user '${validated.username}' (client: ${validated.corporateClientId}), setup link sent`,
            severity: 'info',
        }).catch(() => {});

        res.status(201).json({
            user: { id: user.id, username: user.username, email: user.email },
            emailSent: true,
        });

    } catch (error: any) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ error: 'Invalid data', details: error.errors });
        }
        console.error('[UsersRoutes] Create corporate user error:', (error as Error).message);
        res.status(500).json({ error: 'Failed to create corporate user' });
    }
});

router.post('/api/admin/corporate-users/:id/reset-password', requireAdminAuth, requirePermission('canEdit'), async (req: Request, res: Response) => {
    try {
        const targetUser = await userRepo.getUser(req.params.id);
        if (!targetUser || targetUser.role !== 'Corporate' || !targetUser.corporateClientId) {
            return res.status(404).json({ error: 'Corporate user not found' });
        }
        if ((targetUser as any).status !== 'Active') {
            return res.status(400).json({ error: 'User is not active. Use resend setup link instead.' });
        }

        // Generate reset token WITHOUT touching the existing password
        const appUrl = getCorporateAppBaseUrl();
        if (!appUrl) {
            return res.status(503).json({ error: 'Password reset is temporarily unavailable. Configure APP_BASE_URL.' });
        }
        const rawToken = await createCorporateSetupToken(targetUser.id, 'reset');
        const resetUrl = `${appUrl}/corporate/setup/${rawToken}`;

        const emailSent = await MailerService.sendCorporateResetLink(
            targetUser.email ?? '',
            targetUser.name ?? targetUser.username ?? '',
            resetUrl,
        );

        if (!emailSent) {
            try {
                await invalidateCorporateSetupToken(rawToken);
            } catch (cleanupError) {
                console.error('[UsersRoutes] Reset-token cleanup failed:', (cleanupError as Error).message);
                return res.status(500).json({ error: 'Reset email failed and link cleanup could not be confirmed.' });
            }
            return res.status(500).json({ error: 'Failed to send reset link. Your current password is unchanged.' });
        }
        await invalidateOtherCorporateSetupTokens(targetUser.id, 'reset', rawToken).catch((error) => {
            console.error('[UsersRoutes] Previous reset-token invalidation failed:', (error as Error).message);
        });

        AuditLogger.log({
            userId: req.session.adminUserId!,
            action: 'UPDATE',
            entity: 'User',
            entityId: targetUser.id,
            details: `Sent password reset link to corporate user '${targetUser.username}'`,
            severity: 'warning',
        }).catch(() => {});

        res.json({
            user: {
                id: targetUser.id,
                username: targetUser.username,
                email: targetUser.email,
            },
            emailSent: true,
        });
    } catch (error) {
        console.error('[UsersRoutes] Corporate password reset error:', (error as Error).message);
        res.status(500).json({ error: 'Failed to send reset link' });
    }
});

router.post('/api/admin/corporate-users/:id/reset-otp', requireAdminAuth, requirePermission('canEdit'), async (req: Request, res: Response) => {
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

router.post('/api/admin/corporate-users/:id/resend-setup', requireAdminAuth, requirePermission('canEdit'), async (req: Request, res: Response) => {
    try {
        const targetUser = await userRepo.getUser(req.params.id);
        if (!targetUser || targetUser.role !== 'Corporate' || !targetUser.corporateClientId) {
            return res.status(404).json({ error: 'Corporate user not found' });
        }

        const userStatus = (targetUser as any).status;
        if (userStatus !== 'Pending' && userStatus !== 'Active') {
            return res.status(400).json({ error: 'Cannot resend link for this user status' });
        }

        const type: 'setup' | 'reset' = userStatus === 'Pending' ? 'setup' : 'reset';
        const appUrl = getCorporateAppBaseUrl();
        if (!appUrl) {
            return res.status(503).json({ error: 'Corporate setup is temporarily unavailable. Configure APP_BASE_URL.' });
        }
        const rawToken = await createCorporateSetupToken(targetUser.id, type);
        const linkUrl = `${appUrl}/corporate/setup/${rawToken}`;

        const emailSent = type === 'setup'
            ? await MailerService.sendCorporateSetupLink(targetUser.email ?? '', targetUser.name ?? targetUser.username ?? '', linkUrl)
            : await MailerService.sendCorporateResetLink(targetUser.email ?? '', targetUser.name ?? targetUser.username ?? '', linkUrl);

        if (!emailSent) {
            try {
                await invalidateCorporateSetupToken(rawToken);
            } catch (cleanupError) {
                console.error('[UsersRoutes] Resend-token cleanup failed:', (cleanupError as Error).message);
                return res.status(500).json({ error: 'Resend email failed and link cleanup could not be confirmed.' });
            }
            return res.status(500).json({ error: 'Failed to resend link. Please try again.' });
        }
        await invalidateOtherCorporateSetupTokens(targetUser.id, type, rawToken).catch((error) => {
            console.error('[UsersRoutes] Previous setup-token invalidation failed:', (error as Error).message);
        });

        AuditLogger.log({
            userId: req.session.adminUserId!,
            action: 'UPDATE',
            entity: 'User',
            entityId: targetUser.id,
            details: `Resent ${type} link to corporate user '${targetUser.username}'`,
            severity: 'info',
        }).catch(() => {});

        res.json({
            user: { id: targetUser.id, username: targetUser.username, email: targetUser.email },
            emailSent: true,
        });
    } catch (error) {
        console.error('[UsersRoutes] Resend setup error:', (error as Error).message);
        res.status(500).json({ error: 'Failed to resend setup link' });
    }
});

router.get('/api/admin/corporate-users/reset-requests', requireAdminAuth, requirePermission('canEdit'), async (req: Request, res: Response) => {
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
router.post('/api/admin/customers', requireAdminAuth, requireGranularPermission('customers.create'), async (req: Request, res: Response) => {
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
 * GET /api/admin/customers/:id/lifecycle — retail financial + warranty read model (SERVICE-LIFECYCLE-R1).
 * Requires users permission (same as customer detail). No UI change in this phase.
 */
router.get('/api/admin/customers/:id/lifecycle', requireAdminAuth, requirePermission('users'), async (req: Request, res: Response) => {
    try {
        const { buildCustomerLifecycle } = await import('../services/customer-lifecycle.service.js');
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
        const offset = Math.max(0, Number(req.query.offset) || 0);
        const model = await buildCustomerLifecycle(req.params.id, { limit, offset });
        if (!model) return res.status(404).json({ error: 'Customer not found' });

        auditLogger.log({
            userId: (req as any).session?.adminUserId || 'unknown',
            action: AUDIT_ACTIONS.VIEW_CUSTOMER_PII,
            entity: 'CustomerLifecycle',
            entityId: req.params.id,
            details: 'Admin viewed customer retail lifecycle summary',
            req,
            severity: 'info',
        }).catch(() => {});

        res.json(model);
    } catch (error) {
        console.error('[UsersRoutes] lifecycle failed:', (error as Error).message);
        res.status(500).json({ error: 'Failed to build customer lifecycle' });
    }
});

/**
 * PATCH /api/admin/customers/:id - Update customer
 */
router.patch('/api/admin/customers/:id', requireAdminAuth, requireGranularPermission('customers.edit'), async (req: Request, res: Response) => {
    try {
        // This route previously wrote req.body straight through with no schema, so
        // { name: "" } returned 200 and silently wiped the customer's name (DR-01).
        // Every field is optional (PATCH), but any field that IS present must be valid.
        const parsed = adminCustomerUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                error: parsed.error.issues[0]?.message ?? 'Invalid customer data',
            });
        }
        const { name, email, phone, address, isVerified } = parsed.data;
        const updates: any = {};

        if (name !== undefined) updates.name = name;
        if (email !== undefined) updates.email = email;
        if (phone !== undefined) {
            updates.phone = phone;
            updates.phoneNormalized = normalizePhone(phone);
        }
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
router.delete('/api/admin/customers/:id', requireAdminAuth, requireGranularPermission('customers.delete'), async (req: Request, res: Response) => {
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
 * POST /api/admin/customers/:id/reset-link - Generate a one-time password reset link
 *
 * Super Admin only. Staff verify the customer's identity out of band, hand over
 * the link, and the customer sets their own password. Staff never see or choose
 * the password. The token is returned exactly once and is never retrievable
 * again — only its SHA-256 is stored.
 */
router.post('/api/admin/customers/:id/reset-link', requireAdminAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const customer = await userRepo.getUser(req.params.id);
        if (!customer || customer.role !== 'Customer') {
            return res.status(404).json({ error: 'Customer not found' });
        }

        // The link must be built from a configured canonical origin. Deriving it
        // from the Host header would let a spoofed header mint a link pointing at
        // an attacker's domain, which staff would then hand to a customer. Reuses
        // the same hardened helper (and APP_BASE_URL) as corporate setup links.
        const origin = getCorporateAppBaseUrl();
        if (!origin) {
            console.error('[ResetLink] APP_BASE_URL is not configured — refusing to generate a link');
            return res.status(500).json({
                error: 'Reset links are not configured on this server. Set APP_BASE_URL and try again.',
            });
        }

        const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {};
        const deliver = body.deliver === 'sms' ? 'sms' as const : undefined;
        const inquiryId = typeof body.inquiryId === 'string' && body.inquiryId.trim()
            ? body.inquiryId.trim()
            : undefined;

        // ITEM 3: optional inquiry close-loop — validate before minting so we never
        // attach a link action to a non-recovery inquiry.
        if (inquiryId) {
            const { getInquiry } = await import('../repositories/customer.repository.js');
            const { isAccountRecoveryInquiryMessage } = await import('../../shared/account-recovery.js');
            const inquiry = await getInquiry(inquiryId);
            if (!inquiry) {
                return res.status(404).json({ error: 'Inquiry not found' });
            }
            if (!isAccountRecoveryInquiryMessage(inquiry.message)) {
                return res.status(400).json({
                    error: 'inquiryId must reference an account recovery request',
                    code: 'NOT_RECOVERY_INQUIRY',
                });
            }
        }

        const adminId = req.session.adminUserId || 'unknown';
        const { sql } = await import('drizzle-orm');
        const { randomBytes, createHash } = await import('crypto');

        // 256 bits of entropy. Stored as SHA-256: a fast hash is correct because
        // a token this large cannot be brute-forced at any hash speed.
        const token = randomBytes(32).toString('base64url');
        const tokenHash = createHash('sha256').update(token).digest('hex');
        const id = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        // "One live link per customer" is only true if supersede-then-insert is
        // atomic. Locking the customer row first serialises two admins clicking
        // at the same moment — otherwise both invalidate (each a no-op against
        // the other) and both insert, leaving two usable links.
        await db.transaction(async (tx) => {
            await tx.execute(sql`SELECT id FROM users WHERE id = ${customer.id} FOR UPDATE`);

            await tx.execute(sql`
                UPDATE customer_reset_links
                SET invalidated_at = NOW(), invalidated_reason = 'superseded_by_new_link'
                WHERE user_id = ${customer.id}
                  AND consumed_at IS NULL
                  AND invalidated_at IS NULL
            `);

            await tx.execute(sql`
                INSERT INTO customer_reset_links (id, user_id, token_hash, expires_at, created_by, created_at)
                VALUES (${id}, ${customer.id}, ${tokenHash}, ${expiresAt.toISOString()}, ${adminId}, NOW())
            `);
        });

        auditLogger.log({
            userId: adminId,
            action: 'CREATE',
            entity: 'CustomerResetLink',
            entityId: customer.id,
            details: `One-time password reset link generated for customer ${customer.id}`,
            req,
            severity: 'warning',
        }).catch(() => {});

        // Never log token or full URL
        console.log(`[ResetLink] Link created for customer ${customer.id} by admin ${adminId}`);

        // Token travels in the URL fragment so it is never sent to a server in a
        // request line and cannot land in access logs, Referer headers, or proxies.
        const url = `${origin}/reset#t=${token}`;

        // ITEM 2 — opt-in SMS only; always use phone on the customer record (never body).
        let delivery: {
            channel: 'sms';
            status: 'sent' | 'failed' | 'skipped';
            error?: string;
        } | undefined;

        if (deliver === 'sms') {
            const recordPhone = customer.phone;
            if (!recordPhone) {
                delivery = {
                    channel: 'sms',
                    status: 'failed',
                    error: 'Customer has no phone number on file',
                };
            } else {
                const { smsService } = await import('../services/sms.service.js');
                const smsResult = await smsService.sendSms({
                    to: recordPhone,
                    message:
                        `Promise Electronics: Use this one-time link to set your password (expires in 24h): ${url}`,
                });
                // Do not log message/url/token
                if (smsResult.success) {
                    delivery = { channel: 'sms', status: 'sent' };
                    console.log(`[ResetLink] SMS delivery reported success for customer ${customer.id}`);
                } else {
                    delivery = {
                        channel: 'sms',
                        status: 'failed',
                        error: smsResult.error || 'SMS delivery failed',
                    };
                    console.log(`[ResetLink] SMS delivery failed for customer ${customer.id}`);
                }
            }
        }

        // ITEM 3 — mark recovery inquiry Replied with internal note (no token/URL).
        if (inquiryId) {
            const noteParts = [
                '[RESET_LINK_ISSUED]',
                `by:${adminId}`,
                `at:${new Date().toISOString()}`,
                `delivery:${delivery?.status ?? 'none'}`,
            ];
            if (delivery?.error) {
                noteParts.push(`deliveryError:${delivery.error.slice(0, 80)}`);
            }
            await storage.updateInquiry(inquiryId, {
                status: 'Replied',
                reply: noteParts.join(' '),
            });
        }

        res.json({
            url,
            expiresAt: expiresAt.toISOString(),
            expiresInHours: 24,
            customerName: customer.name,
            customerPhoneTail: (customer.phone || '').replace(/\D/g, '').slice(-4),
            message: 'Give this link to the verified customer. It works once and expires in 24 hours. It will not be shown again.',
            delivery: delivery ?? null,
        });
    } catch (error: any) {
        console.error('[ResetLink] Failed to create reset link:', (error as Error).message);
        res.status(500).json({ error: 'Failed to create reset link' });
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
