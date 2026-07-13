/**
 * Authentication Middleware & Utilities
 * 
 * This module contains:
 * - Session type extensions
 * - Validation schemas for auth
 * - Auth middleware functions
 * - Permission helpers
 */

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { storage } from '../../storage.js';
import { db } from '../../db.js';
import { requireCsrf } from './csrf.js';
import { getDefaultPermissionsForRole } from '../../../shared/admin-permissions.js';
import { LEGACY_TO_GRANULAR } from '../../../shared/permission-catalog.js';

// ============================================
// Session Type Extensions
// ============================================

declare module 'express-session' {
    interface SessionData {
        customerId?: string;
        adminUserId?: string;
        corporateUserId?: string;
        authMethod?: 'phone' | 'google';
    }
}

// ============================================
// Validation Schemas
// ============================================

// Admin authentication schemas
export const adminLoginSchema = z.object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(6, 'Password must be at least 6 characters').max(13, 'Password is too long'),
    rememberMe: z.boolean().optional(),
});

export const adminCreateUserSchema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    name: z.string().min(2, 'Name is required'),
    email: z.string().email('Valid email is required'),
    password: z.string().min(6, 'Password must be at least 6 characters').max(13, 'Password is too long'),
    role: z.enum(['Super Admin', 'Manager', 'Cashier', 'Technician', 'Driver', 'Corporate']),
    permissions: z.string().optional(),
    // Employment & Salary Optional Fields
    employmentStatus: z.enum(['active', 'inactive', 'on_leave', 'terminated', 'resigned']).optional(),
    joinDate: z.string().optional(),
    assignSalary: z.boolean().optional(),
    salaryStructureId: z.string().optional(),
    baseAmount: z.number().nonnegative().optional(),
    hraAmount: z.number().nonnegative().optional(),
    medicalAmount: z.number().nonnegative().optional(),
    conveyanceAmount: z.number().nonnegative().optional(),
    otherAmount: z.number().nonnegative().optional(),
    incomeTaxPercent: z.number().min(0).max(100).optional(),
});

export const adminUpdateUserSchema = z.object({
    username: z.string().min(3).optional(),
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    password: z.string().min(6).max(13).optional(),
    role: z.enum(['Super Admin', 'Manager', 'Cashier', 'Technician', 'Driver', 'Corporate']).optional(),
    status: z.enum(['Active', 'Inactive']).optional(),
    permissions: z.string().optional(),
});

// Customer authentication schemas
export const customerLoginSchema = z.object({
    phone: z.string().min(10, 'Phone number is required'),
    password: z.string().min(6, 'Password must be at least 6 characters').max(13, 'Password is too long'),
});

export const customerRegisterSchema = z.object({
    name: z.string().min(2, 'Name is required'),
    phone: z.string().min(10, 'Phone number is required'),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional(),
    password: z.string().min(6, 'Password must be at least 6 characters').max(13, 'Password is too long'),
});

// ============================================
// Auth Middleware
// ============================================

/**
 * Middleware to require admin authentication.
 * Returns 401 if no admin session exists.
 * Attaches the user object to req.user.
 */
export async function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
    if (!req.session?.adminUserId) {
        return res.status(401).json({ error: 'Admin authentication required' });
    }

    // Load the user from database and attach to req
    const user = await storage.getUser(req.session.adminUserId);

    if (!user) {
        return res.status(401).json({ error: 'Admin user not found' });
    }

    // Attach user to request
    (req as any).user = user;

    requireCsrf(req, res, next);
}

/**
 * Middleware to require Super Admin role.
 * Returns 401 if not logged in, 403 if not Super Admin.
 */
export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.session?.adminUserId) {
        return res.status(401).json({ error: 'Admin authentication required' });
    }
    const user = await storage.getUser(req.session.adminUserId);
    if (!user || user.role !== 'Super Admin') {
        return res.status(403).json({ error: 'Super Admin access required' });
    }
    next();
}

export function getEffectivePermissionsForUser(user: { role: string; permissions?: string | null }) {
    if (user.role === 'Super Admin') {
        return { '*': true };
    }

    try {
        const parsed = user.permissions ? JSON.parse(user.permissions) : {};
        if (parsed && Object.keys(parsed).length > 0) {
            return parsed;
        }
    } catch (error) {
        console.warn('[Auth] Failed to parse user permissions, using role defaults:', (error as Error).message);
    }

    return getDefaultPermissions(user.role);
}

/**
 * Middleware to require a specific permission.
 * Returns 403 if user does not have the required permission.
 */
export const requirePermission = (permission: string) => async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.adminUserId) {
        return res.status(401).json({ error: 'Admin authentication required' });
    }

    try {
        const user = (req as any).user || await storage.getUser(req.session.adminUserId);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        const effectivePermissions = getEffectivePermissionsForUser(user);

        if (!hasLegacyOrMappedPermission(effectivePermissions, permission)) {
            return res.status(403).json({ error: 'Access denied: Insufficient permissions' });
        }
        (req as any).user = user;
        next();
    } catch (error) {
        console.error('[Auth] Permission check error:', (error as Error).message);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Middleware to require ANY of the specified permissions.
 * Returns 403 if user has NONE of the required permissions.
 */
export const requireAnyPermission = (permissionsToCheck: string[]) => async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.adminUserId) {
        return res.status(401).json({ error: 'Admin authentication required' });
    }

    try {
        const user = (req as any).user || await storage.getUser(req.session.adminUserId);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        const effectivePermissions = getEffectivePermissionsForUser(user);

        const hasPermission = permissionsToCheck.some(p => hasLegacyOrMappedPermission(effectivePermissions, p));

        if (!hasPermission) {
            return res.status(403).json({ error: 'Access denied: Insufficient permissions' });
        }
        (req as any).user = user;
        next();
    } catch (error) {
        console.error('[Auth] Permission check error:', (error as Error).message);
        res.status(500).json({ error: 'Internal server error' });
    }
};


/**
 * Check if a user satisfies a legacy flat permission key by direct match or via
 * LEGACY_TO_GRANULAR: if the user has any granular key that maps to this legacy key, they pass.
 * This bridges invite-created accounts (granular-only) with older routes that still call
 * requirePermission("pos"), requirePermission("dashboard"), etc.
 */
function hasLegacyOrMappedPermission(effectivePermissions: Record<string, any>, legacyKey: string): boolean {
    if (effectivePermissions['*']) return true;
    if (effectivePermissions[legacyKey]) return true;
    const mappedKeys = LEGACY_TO_GRANULAR[legacyKey];
    if (mappedKeys) {
        return mappedKeys.some(k => effectivePermissions[k] === true);
    }
    return false;
}

/**
 * Check if a user has a granular permission (e.g. "jobs.writeOff").
 * Resolution order:
 * 1. Wildcard `*` (Super Admin) → always allowed
 * 2. Direct granular key in user permissions → allowed
 * 3. Legacy broad permission that maps to the granular key via LEGACY_TO_GRANULAR → allowed
 */
function hasGranularPerm(effectivePermissions: Record<string, any>, granularKey: string): boolean {
    if (effectivePermissions['*']) return true;
    if (effectivePermissions[granularKey]) return true;
    for (const [legacyKey, granularKeys] of Object.entries(LEGACY_TO_GRANULAR)) {
        if (granularKeys.includes(granularKey) && effectivePermissions[legacyKey]) return true;
    }
    return false;
}

/** Shared helper for routes that need granular checks after auth (e.g. assignment rules). */
export function userHasGranularPermission(
    user: { role: string; permissions?: string | null },
    granularKey: string,
): boolean {
    return hasGranularPerm(getEffectivePermissionsForUser(user), granularKey);
}

export const requireGranularPermission = (granularKey: string) => async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.adminUserId) {
        return res.status(401).json({ error: 'Admin authentication required' });
    }
    try {
        const user = (req as any).user || await storage.getUser(req.session.adminUserId);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const effectivePermissions = getEffectivePermissionsForUser(user);
        if (!hasGranularPerm(effectivePermissions, granularKey)) {
            return res.status(403).json({ error: `Access denied: Missing permission ${granularKey}` });
        }
        (req as any).user = user;
        next();
    } catch (error) {
        console.error('[Auth] Granular permission check error:', (error as Error).message);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const requireAnyGranularPermission = (granularKeys: string[]) => async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.adminUserId) {
        return res.status(401).json({ error: 'Admin authentication required' });
    }
    try {
        const user = (req as any).user || await storage.getUser(req.session.adminUserId);
        if (!user) return res.status(401).json({ error: 'User not found' });
        const effectivePermissions = getEffectivePermissionsForUser(user);
        if (!granularKeys.some(k => hasGranularPerm(effectivePermissions, k))) {
            return res.status(403).json({ error: `Access denied: Missing one of ${granularKeys.join(', ')}` });
        }
        (req as any).user = user;
        next();
    } catch (error) {
        console.error('[Auth] Granular permission check error:', (error as Error).message);
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Middleware to require customer authentication.
 * Supports both session-based and Google OAuth authentication.
 * Rejects sessions that were created before the customer's last password change.
 */
export function requireCustomerAuth(req: any, res: Response, next: NextFunction) {
    let customerId: string | undefined;

    if (req.isAuthenticated && req.isAuthenticated() && req.user?.customerId) {
        customerId = req.user.customerId;
        req.session.customerId = customerId;
    } else if (req.session?.customerId) {
        customerId = req.session.customerId;
    }

    if (!customerId) {
        return res.status(401).json({
            error: 'Please login to continue',
            code: 'NOT_AUTHENTICATED'
        });
    }

    const authenticatedAt = req.session?.authenticatedAt as number | undefined;
    if (authenticatedAt) {
        db.execute(sql`SELECT password_changed_at FROM users WHERE id = ${customerId}`)
            .then((rows) => {
                const pca = (rows.rows[0] as any)?.password_changed_at;
                if (pca && new Date(pca).getTime() > authenticatedAt) {
                    console.log(`[CustomerAuth] Stale session rejected for user ${customerId}`);
                    req.session.destroy(() => {});
                    res.clearCookie('customer.sid');
                    res.clearCookie('connect.sid');
                    return res.status(401).json({
                        error: 'Your password was changed. Please sign in again.',
                        code: 'SESSION_REVOKED'
                    });
                }
                return requireCsrf(req, res, next);
            })
            .catch((err: Error) => {
                console.error('[CustomerAuth] Password change check failed:', err.message);
                return res.status(503).json({
                    error: 'Please try again shortly',
                    code: 'AUTH_CHECK_UNAVAILABLE'
                });
            });
    } else {
        return requireCsrf(req, res, next);
    }
}

/**
 * Middleware to require corporate authentication.
 * Returns 401 if no corporate session exists.
 */
export async function requireCorporateAuth(req: Request, res: Response, next: NextFunction) {
    if (!req.session?.corporateUserId) {
        return res.status(401).json({ error: 'Corporate authentication required' });
    }

    try {
        const user = await storage.getUser(req.session.corporateUserId);
        if (!user || user.role !== 'Corporate') {
            // Role mismatch or user not found
            req.session.corporateUserId = undefined;
            return res.status(403).json({ error: 'Access denied: Corporate account required' });
        }
        (req as any).user = user;
        requireCsrf(req, res, next);
    } catch (error) {
        console.error('[Auth] Corporate auth check error:', (error as Error).message);
        res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Simple CSRF protection middleware.
 * Generates a token if not present, and validates it on state-changing requests.
 */


// ============================================
// Helper Functions
// ============================================

/**
 * Get customer ID from request.
 * Supports both session-based and Google OAuth authentication.
 */
export function getCustomerId(req: any): string | undefined {
    if (req.isAuthenticated && req.isAuthenticated() && req.user?.customerId) {
        return req.user.customerId;
    }
    return req.session?.customerId;
}

/**
 * Get default permissions based on role.
 */
export function getDefaultPermissions(role: string): Record<string, boolean> {
    return getDefaultPermissionsForRole(role);
}
