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
import { storage } from '../../storage.js';
import { requireCsrf } from './csrf.js';

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
});

export const adminCreateUserSchema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    name: z.string().min(2, 'Name is required'),
    email: z.string().email('Valid email is required'),
    password: z.string().min(6, 'Password must be at least 6 characters').max(13, 'Password is too long'),
    role: z.enum(['Super Admin', 'Manager', 'Cashier', 'Technician', 'Corporate']),
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
    role: z.enum(['Super Admin', 'Manager', 'Cashier', 'Technician', 'Corporate']).optional(),
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
        console.warn('Failed to parse user permissions, falling back to role defaults:', error);
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
        const user = await storage.getUser(req.session.adminUserId);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        const effectivePermissions = getEffectivePermissionsForUser(user);

        if (!effectivePermissions['*'] && !effectivePermissions[permission]) {
            return res.status(403).json({ error: 'Access denied: Insufficient permissions' });
        }
        next();
    } catch (error) {
        console.error('Permission check error:', error);
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
        const user = await storage.getUser(req.session.adminUserId);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        const effectivePermissions = getEffectivePermissionsForUser(user);

        const hasPermission = effectivePermissions['*'] || permissionsToCheck.some(permission => effectivePermissions[permission]);

        if (!hasPermission) {
            return res.status(403).json({ error: 'Access denied: Insufficient permissions' });
        }
        next();
    } catch (error) {
        console.error('Permission check error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};


/**
 * Middleware to require customer authentication.
 * Supports both session-based and Google OAuth authentication.
 */
export function requireCustomerAuth(req: any, res: Response, next: NextFunction) {
    // Check Google Auth (Passport)
    if (req.isAuthenticated && req.isAuthenticated() && req.user?.customerId) {
        req.session.customerId = req.user.customerId;
        return requireCsrf(req, res, next);
    }
    // Check session-based auth
    if (req.session?.customerId) {
        return requireCsrf(req, res, next);
    }
    return res.status(401).json({
        error: 'Please login to continue',
        code: 'NOT_AUTHENTICATED'
    });
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
        console.error('Corporate auth check error:', error);
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
    switch (role) {
        case 'Super Admin':
            return {
                dashboard: true,
                jobs: true,
                inventory: true,
                pos: true,
                challans: true,
                finance: true,
                attendance: true,
                reports: true,
                serviceRequests: true,
                orders: true,
                technician: true,
                inquiries: true,
                systemHealth: true,
                users: true,
                settings: true,
                corporate: true,
                canCreate: true,
                canEdit: true,
                canDelete: true,
                canExport: true,
                process_payment: true, // Super Admin can process payments
                view_financials: true, // Super Admin can view financials
            };
        case 'Manager':
            return {
                dashboard: true,
                jobs: true,
                inventory: true,
                pos: true,
                challans: true,
                finance: true,
                attendance: true,
                reports: true,
                serviceRequests: true,
                orders: true,
                technician: false,
                inquiries: true,
                systemHealth: false,
                users: false,
                settings: false,
                corporate: true,
                canCreate: true,
                canEdit: true,
                canDelete: false,
                canExport: true,
                process_payment: true, // Manager can process payments
                view_financials: true, // Manager can view financials
            };
        case 'Cashier':
            return {
                dashboard: true,
                jobs: false,
                inventory: true,
                pos: true,
                challans: false,
                finance: false,
                attendance: true,
                reports: false,
                serviceRequests: false,
                orders: true,
                technician: false,
                inquiries: false,
                systemHealth: false,
                users: false,
                settings: false,
                canCreate: true,
                canEdit: false,
                canDelete: false,
                canExport: false,
                process_payment: true, // Cashier can process payments
                view_financials: true, // Cashier can view financials
            };
        case 'Technician':
            return {
                dashboard: false,  // Technicians see Technician View, not Admin Dashboard
                jobs: true,
                inventory: false,
                pos: false,
                challans: true,
                finance: false,
                attendance: true,
                reports: false,
                serviceRequests: true,
                orders: false,
                technician: true,  // Technician View enabled by default
                inquiries: false,
                systemHealth: false,
                users: false,
                settings: false,
                canCreate: false,
                canEdit: true,
                canDelete: false,
                canExport: false,
            };
        case 'Corporate':
            return {
                dashboard: true, // Specific corporate dashboard
                jobs: true,      // See their jobs
                finance: true,   // See their bills
                serviceRequests: true, // Request services
                reports: true,
                users: false,
                settings: true,  // Profile settings
                // ... others false
                inventory: false,
                pos: false,
                challans: true,
                attendance: false,
                orders: false,
                technician: false,
                inquiries: true,
                systemHealth: false,
                canCreate: true, // Can create service requests
                canEdit: true,   // Can edit profile
                canDelete: false,
                canExport: true, // Can export reports
                process_payment: false,
                view_financials: true,
            };
        default:
            return {};
    }
}
