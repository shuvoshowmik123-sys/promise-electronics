/**
 * Admin Authentication Routes
 * 
 * Handles admin login, logout, and current user retrieval.
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { userRepo } from '../repositories/index.js';
import { adminLoginSchema, requireAdminAuth, requireSuperAdmin, getEffectivePermissionsForUser } from './middleware/auth.js';
import { authLimiter } from './middleware/rate-limit.js';
import { validate } from './middleware/validate.js';
import { authService } from '../services/auth.service.js';
import { auditLogger } from '../utils/auditLogger.js';
import { AUDIT_ACTIONS } from '../../shared/constants.js';
import { storage } from '../storage.js';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { normalizePhone } from '../utils/phone.js';
import {
    PERMISSION_CATALOG, ROLE_PRESETS, CUSTOM_PACKS,
    COVERAGE_CRITICAL_PERMISSIONS, DEPRECATED_BROAD_PERMISSIONS,
    LEGACY_TO_GRANULAR, getModules, getPermissionsByModule,
} from '../../shared/permission-catalog.js';

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
            req.session.adminUserRole = undefined;
            req.session.adminUserPermissions = undefined;
            return res.status(401).json({ error: 'User not found' });
        }
        req.session.adminUserRole = user.role;
        req.session.adminUserPermissions = user.permissions ?? null;
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
        const { username, password, rememberMe } = req.body;

        const result = await authService.authenticateAdmin(username, password);

        if ('error' in result) {
            console.log(`Admin login failed: ${result.error}`);
            // Log failed attempt — severity warning, userId unknown → use username as entityId
            auditLogger.log({
                userId: 'anonymous',
                action: AUDIT_ACTIONS.LOGIN_FAILED,
                entity: 'Session',
                entityId: username,
                details: `Failed login attempt for "${username}": ${result.error}`,
                req,
                severity: 'warning',
            }).catch(() => {});
            return res.status(result.status || 401).json({ error: result.error });
        }

        console.log('Admin login successful for:', username);
        req.session.adminUserId = result.user.id;
        req.session.adminUserRole = result.user.role;
        req.session.adminUserPermissions = result.user.permissions ?? null;

        // Remember Me: extend this session's cookie lifetime to 30 days.
        // When false/undefined, the global default session lifetime is unchanged.
        if (rememberMe === true && req.session.cookie) {
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        }

        auditLogger.log({
            userId: result.user.id,
            action: AUDIT_ACTIONS.LOGIN_SUCCESS,
            entity: 'Session',
            entityId: req.sessionID || 'unknown',
            details: `${result.user.name} (${result.user.role}) logged in`,
            req,
            severity: 'info',
        }).catch(() => {});

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
    const userId = req.session?.adminUserId || 'unknown';
    // Log before destroy so session context is still available
    auditLogger.log({
        userId,
        action: AUDIT_ACTIONS.LOGOUT,
        entity: 'Session',
        entityId: req.sessionID || 'unknown',
        details: 'Admin logged out',
        req,
        severity: 'info',
    }).catch(() => {});

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
            auditLogger.log({
                userId,
                action: AUDIT_ACTIONS.PIN_FAILED,
                entity: 'Session',
                entityId: userId,
                details: 'Manager PIN verification failed',
                req,
                severity: 'warning',
            }).catch(() => {});
            return res.status(result.status || 401).json({ error: result.error });
        }

        res.json(result);
    } catch (error: any) {
        console.error('[PIN] Error verifying PIN:', error);
        res.status(500).json({ error: error.message });
    }
});

// ── Account Self-Service ────────────────────────────────────────────────────

const ACCOUNT_SAFE_FIELDS = ["id", "username", "name", "email", "phone", "role", "status", "permissions", "preferences", "joinedAt", "profileImageUrl"] as const;

function safeAccountUser(user: any) {
    const safe: Record<string, any> = {};
    for (const key of ACCOUNT_SAFE_FIELDS) {
        if (key in user) safe[key] = user[key];
    }
    return safe;
}

router.get("/api/admin/account", requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = await storage.getUser(req.session.adminUserId!);
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(safeAccountUser(user));
    } catch (error: any) {
        console.error("[Account] Get error:", error?.message);
        res.status(500).json({ error: "Failed to load account" });
    }
});

router.patch("/api/admin/account/profile", requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.session.adminUserId!;
        const { name, email, phone } = req.body;
        const updates: Record<string, any> = {};

        if (name !== undefined) {
            if (typeof name !== "string" || name.trim().length < 2) {
                return res.status(400).json({ error: "Name must be at least 2 characters." });
            }
            updates.name = name.trim();
        }

        if (email !== undefined) {
            if (email && typeof email === "string") {
                const emailLower = email.toLowerCase().trim();
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
                    return res.status(400).json({ error: "Invalid email format." });
                }
                const existing = await db.execute(sql`SELECT id FROM users WHERE LOWER(email) = ${emailLower} AND id != ${userId} AND role != 'Customer' LIMIT 1`);
                if (existing.rows.length > 0) {
                    return res.status(400).json({ error: "This email is already used by another staff account." });
                }
                updates.email = emailLower;
            } else {
                updates.email = null;
            }
        }

        if (phone !== undefined) {
            if (phone && typeof phone === "string") {
                const existing = await db.execute(sql`SELECT id FROM users WHERE phone = ${phone} AND id != ${userId} AND role != 'Customer' LIMIT 1`);
                if (existing.rows.length > 0) {
                    return res.status(400).json({ error: "This phone number is already used by another staff account." });
                }
                updates.phone = phone;
                updates.phoneNormalized = normalizePhone(phone);
            } else {
                updates.phone = null;
                updates.phoneNormalized = null;
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: "No fields to update." });
        }

        const updated = await storage.updateUser(userId, updates as any);
        if (!updated) return res.status(404).json({ error: "User not found" });

        await auditLogger.log({
            userId,
            action: "UPDATE_OWN_PROFILE",
            entity: "User",
            entityId: userId,
            details: `Updated: ${Object.keys(updates).join(", ")}`,
            req,
        }).catch(() => {});

        res.json(safeAccountUser(updated));
    } catch (error: any) {
        console.error("[Account] Profile update error:", error?.message);
        res.status(500).json({ error: "Failed to update profile" });
    }
});

router.post("/api/admin/account/change-password", requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.session.adminUserId!;
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ error: "All password fields are required." });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: "New password must be at least 6 characters." });
        }
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: "New passwords do not match." });
        }

        const user = await storage.getUser(userId);
        if (!user || !user.password) {
            return res.status(404).json({ error: "User not found" });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Current password is incorrect." });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await db.execute(sql`UPDATE users SET password = ${hashedPassword}, password_changed_at = NOW() WHERE id = ${userId}`);

        await auditLogger.log({
            userId,
            action: "CHANGE_OWN_PASSWORD",
            entity: "User",
            entityId: userId,
            details: "Password changed via My Profile",
            req,
        }).catch(() => {});

        res.json({ success: true, message: "Password changed successfully." });
    } catch (error: any) {
        console.error("[Account] Password change error:", error?.message);
        res.status(500).json({ error: "Failed to change password" });
    }
});

router.post("/api/admin/account/onboarding-complete", requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.session.adminUserId!;
        const user = await storage.getUser(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        let prefs: Record<string, any> = {};
        try { prefs = JSON.parse(user.preferences || "{}"); } catch { /* ignore */ }

        prefs.staffOnboarding = {
            version: "staff-v1",
            completed: true,
            completedAt: new Date().toISOString(),
        };

        await storage.updateUser(userId, { preferences: JSON.stringify(prefs) } as any);
        res.json({ success: true });
    } catch (error: any) {
        console.error("[Account] Onboarding complete error:", error?.message);
        res.status(500).json({ error: "Failed to update onboarding status" });
    }
});

// ── Permission Designer API ─────────────────────────────────────────────────

const VALID_PERMISSION_KEYS = new Set(PERMISSION_CATALOG.map(p => p.key));

function translateLegacyToGranular(stored: Record<string, any>): string[] {
    const granular: Set<string> = new Set();
    for (const [key, val] of Object.entries(stored)) {
        if (!val) continue;
        if (VALID_PERMISSION_KEYS.has(key)) {
            granular.add(key);
        }
        const mapped = LEGACY_TO_GRANULAR[key];
        if (mapped) {
            for (const g of mapped) granular.add(g);
        }
    }
    return Array.from(granular).sort();
}

function computeRiskSummary(keys: string[]): { low: number; medium: number; high: number; critical: number } {
    const summary = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const k of keys) {
        const def = PERMISSION_CATALOG.find(p => p.key === k);
        if (def) summary[def.risk]++;
    }
    return summary;
}

router.get("/api/admin/permissions/catalog", requireAdminAuth, async (_req: Request, res: Response) => {
    const modules = getModules().map(m => ({
        id: m,
        permissions: getPermissionsByModule(m),
    }));
    res.json({
        catalog: PERMISSION_CATALOG,
        modules,
        presets: ROLE_PRESETS,
        packs: CUSTOM_PACKS,
        coverageCritical: COVERAGE_CRITICAL_PERMISSIONS,
        deprecated: DEPRECATED_BROAD_PERMISSIONS,
    });
});

router.get("/api/admin/users/:id/permission-profile", requireAdminAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const target = await storage.getUser(req.params.id);
        if (!target) return res.status(404).json({ error: "User not found" });

        let storedRaw: Record<string, any> = {};
        try { storedRaw = JSON.parse(target.permissions || "{}"); } catch { /* empty */ }

        const granularDirect: string[] = Object.keys(storedRaw).filter(k => VALID_PERMISSION_KEYS.has(k) && storedRaw[k]);
        const granularFromLegacy = translateLegacyToGranular(storedRaw);
        const legacyKeys = Object.keys(storedRaw).filter(k => !VALID_PERMISSION_KEYS.has(k) && storedRaw[k]);
        const deprecatedPresent = legacyKeys.filter(k => (DEPRECATED_BROAD_PERMISSIONS as readonly string[]).includes(k));

        const effectiveKeys = target.role === "Super Admin"
            ? PERMISSION_CATALOG.map(p => p.key)
            : granularFromLegacy;

        const riskSummary = computeRiskSummary(effectiveKeys);

        let suggestedPreset: string | null = null;
        for (const [presetName, presetKeys] of Object.entries(ROLE_PRESETS)) {
            if (presetName === "Super Admin") continue;
            if (presetKeys.length === effectiveKeys.length && presetKeys.every(k => effectiveKeys.includes(k))) {
                suggestedPreset = presetName;
                break;
            }
        }

        res.json({
            id: target.id,
            name: target.name,
            role: target.role,
            storedPermissions: storedRaw,
            legacyKeys,
            granularDirect,
            granularFromLegacy,
            effectiveGranular: effectiveKeys,
            riskSummary,
            deprecatedPresent,
            suggestedPreset,
        });
    } catch (error: any) {
        console.error("[Permissions] Profile error:", error?.message);
        res.status(500).json({ error: "Failed to load permission profile" });
    }
});

router.patch("/api/admin/users/:id/permission-profile", requireAdminAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const actorId = req.session.adminUserId!;
        const targetId = req.params.id;

        if (actorId === targetId) {
            return res.status(400).json({ error: "Cannot edit your own permissions." });
        }

        const target = await storage.getUser(targetId);
        if (!target) return res.status(404).json({ error: "User not found" });
        if (target.role === "Super Admin") {
            return res.status(400).json({ error: "Cannot modify Super Admin permissions." });
        }

        const { permissions } = req.body;
        if (!permissions || typeof permissions !== "object") {
            return res.status(400).json({ error: "permissions object required" });
        }

        const permKeys = Object.keys(permissions).filter(k => permissions[k]);
        const invalid = permKeys.filter(k => !VALID_PERMISSION_KEYS.has(k) && k !== "*");
        if (invalid.length > 0) {
            return res.status(400).json({ error: `Invalid permission keys: ${invalid.join(", ")}` });
        }
        if (permKeys.includes("*")) {
            return res.status(400).json({ error: "Wildcard permission cannot be assigned via this endpoint." });
        }

        const cleanPerms: Record<string, boolean> = {};
        for (const k of permKeys) cleanPerms[k] = true;

        await storage.updateUser(targetId, { permissions: JSON.stringify(cleanPerms) } as any);

        await auditLogger.log({
            userId: actorId,
            action: "UPDATE_USER_PERMISSIONS",
            entity: "User",
            entityId: targetId,
            details: `Set ${permKeys.length} granular permissions: ${permKeys.slice(0, 10).join(", ")}${permKeys.length > 10 ? "..." : ""}`,
            req,
        }).catch(() => {});

        res.json({ success: true, permissionCount: permKeys.length });
    } catch (error: any) {
        console.error("[Permissions] Save error:", error?.message);
        res.status(500).json({ error: "Failed to save permissions" });
    }
});

router.get("/api/admin/permissions/coverage", requireAdminAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
        const allUsers = await storage.getAllUsers(1, 200);
        const activeStaff = allUsers.items.filter((u: any) => u.status === "Active" && u.role !== "Customer");

        const coverage: Record<string, { permission: string; users: { id: string; name: string; role: string }[] }> = {};
        for (const critPerm of COVERAGE_CRITICAL_PERMISSIONS) {
            coverage[critPerm] = { permission: critPerm, users: [] };
        }

        for (const user of activeStaff) {
            const effective = getEffectivePermissionsForUser(user);
            for (const critPerm of COVERAGE_CRITICAL_PERMISSIONS) {
                let has = false;
                if (effective["*"]) has = true;
                else if (effective[critPerm]) has = true;
                else {
                    for (const [legacyKey, granularKeys] of Object.entries(LEGACY_TO_GRANULAR)) {
                        if (granularKeys.includes(critPerm) && effective[legacyKey]) { has = true; break; }
                    }
                }
                if (has) {
                    coverage[critPerm].users.push({ id: user.id, name: user.name, role: user.role });
                }
            }
        }

        const missing = Object.values(coverage).filter(c => c.users.length === 0).map(c => c.permission);
        const singlePerson = Object.values(coverage).filter(c => c.users.length === 1).map(c => c.permission);
        const covered = Object.values(coverage).filter(c => c.users.length >= 2).map(c => c.permission);

        const deprecatedUsers = activeStaff
            .filter((u: any) => {
                try {
                    const perms = JSON.parse(u.permissions || "{}");
                    return Object.keys(perms).some(k => (DEPRECATED_BROAD_PERMISSIONS as readonly string[]).includes(k) && perms[k]);
                } catch { return false; }
            })
            .map((u: any) => ({ id: u.id, name: u.name, role: u.role }));

        const total = COVERAGE_CRITICAL_PERMISSIONS.length;
        const healthPct = Math.round(((total - missing.length) / total) * 100);

        res.json({ coverage, missing, singlePerson, covered, deprecatedUsers, healthPercentage: healthPct, totalCritical: total });
    } catch (error: any) {
        console.error("[Permissions] Coverage error:", error?.message);
        res.status(500).json({ error: "Failed to compute coverage" });
    }
});

router.post("/api/admin/permissions/preview", requireAdminAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const { basePreset, customPacks, manualPermissions } = req.body;
        const finalKeys = new Set<string>();

        if (basePreset && ROLE_PRESETS[basePreset]) {
            const presetKeys = ROLE_PRESETS[basePreset];
            if (presetKeys.includes("*")) {
                return res.json({
                    permissions: PERMISSION_CATALOG.map(p => p.key),
                    riskSummary: computeRiskSummary(PERMISSION_CATALOG.map(p => p.key)),
                    consequences: [],
                    criticalConfirmations: [],
                    summary: "Super Admin has full access to all permissions.",
                });
            }
            for (const k of presetKeys) finalKeys.add(k);
        }

        if (Array.isArray(customPacks)) {
            for (const packId of customPacks) {
                const pack = CUSTOM_PACKS[packId];
                if (pack) for (const k of pack.permissions) finalKeys.add(k);
            }
        }

        if (Array.isArray(manualPermissions)) {
            for (const k of manualPermissions) {
                if (VALID_PERMISSION_KEYS.has(k)) finalKeys.add(k);
            }
        }

        const keys = Array.from(finalKeys).sort();
        const riskSummary = computeRiskSummary(keys);

        const consequences = keys
            .map(k => PERMISSION_CATALOG.find(p => p.key === k))
            .filter(p => p && (p.risk === "high" || p.risk === "critical"))
            .map(p => ({ key: p!.key, risk: p!.risk, consequence: p!.consequence }));

        const criticalConfirmations = consequences.filter(c => c.risk === "critical");

        const moduleNames = Array.from(new Set(keys.map(k => k.split(".")[0])));
        const summary = `Can access ${moduleNames.length} modules with ${keys.length} permissions (${riskSummary.critical} critical).`;

        res.json({ permissions: keys, riskSummary, consequences, criticalConfirmations, summary });
    } catch (error: any) {
        console.error("[Permissions] Preview error:", error?.message);
        res.status(500).json({ error: "Failed to generate preview" });
    }
});

export default router;

