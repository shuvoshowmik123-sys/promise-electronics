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

// ============================================
// Session Type Extensions
// ============================================

declare module 'express-session' {
    interface SessionData {
        customerId?: string;
        adminUserId?: string;
        authMethod?: 'phone' | 'google';
    }
}

// ============================================
// Validation Schemas
// ============================================

// Admin authentication schemas
export const adminLoginSchema = z.object({
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const adminCreateUserSchema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    name: z.string().min(2, 'Name is required'),
    email: z.string().email('Valid email is required'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    role: z.enum(['Super Admin', 'Manager', 'Cashier', 'Technician']),
    permissions: z.string().optional(),
});

export const adminUpdateUserSchema = z.object({
    username: z.string().min(3).optional(),
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    password: z.string().min(6).optional(),
    role: z.enum(['Super Admin', 'Manager', 'Cashier', 'Technician']).optional(),
    status: z.enum(['Active', 'Inactive']).optional(),
    permissions: z.string().optional(),
});

// Customer authentication schemas
export const customerLoginSchema = z.object({
    phone: z.string().min(10, 'Phone number is required'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const customerRegisterSchema = z.object({
    name: z.string().min(2, 'Name is required'),
    phone: z.string().min(10, 'Phone number is required'),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional(),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

// ============================================
// Auth Middleware
// ============================================

/**
 * Middleware to require admin authentication.
 * Returns 401 if no admin session exists.
 */
export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
    if (!req.session?.adminUserId) {
        return res.status(401).json({ error: 'Admin authentication required' });
    }
    next();
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

/**
 * Middleware to require customer authentication.
 * Supports both session-based and Google OAuth authentication.
 */
export function requireCustomerAuth(req: any, res: Response, next: NextFunction) {
    // Check Google Auth (Passport)
    if (req.isAuthenticated && req.isAuthenticated() && req.user?.customerId) {
        req.session.customerId = req.user.customerId;
        return next();
    }
    // Check session-based auth
    if (req.session?.customerId) {
        return next();
    }
    return res.status(401).json({ error: 'Please login to continue' });
}

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
                users: true,
                settings: true,
                canCreate: true,
                canEdit: true,
                canDelete: true,
                canExport: true,
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
                users: false,
                settings: false,
                canCreate: true,
                canEdit: true,
                canDelete: false,
                canExport: true,
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
                users: false,
                settings: false,
                canCreate: true,
                canEdit: false,
                canDelete: false,
                canExport: false,
            };
        case 'Technician':
            return {
                dashboard: true,
                jobs: true,
                inventory: false,
                pos: false,
                challans: true,
                finance: false,
                attendance: true,
                reports: false,
                serviceRequests: true,
                orders: false,
                users: false,
                settings: false,
                canCreate: false,
                canEdit: true,
                canDelete: false,
                canExport: false,
            };
        default:
            return {};
    }
}
