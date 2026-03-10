import { Request, Response, NextFunction } from "express";
import { UserRole, Permission, canPerform } from "../../shared/PermissionsMatrix.js";
import { storage } from "../storage.js";

declare global {
    namespace Express {
        interface User {
            role: UserRole;
            id: string;
        }
        interface CorporateUser {
            role: 'Corporate';
            id: string;
            corporateClientId: string;
        }
    }
}

export const requirePermission = (permission: Permission) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.isAuthenticated() || !req.user) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const { role } = req.user as { role: UserRole };

        if (!canPerform(role, permission)) {
            return res.status(403).json({ message: `Forbidden: Requires ${permission} permission` });
        }

        next();
    };
};

export const requireRole = (allowedRoles: UserRole[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        console.log('[Auth Middleware] Checking role authorization');
        console.log('[Auth Middleware] isAuthenticated:', req.isAuthenticated?.());
        console.log('[Auth Middleware] user:', req.user);
        console.log('[Auth Middleware] session:', req.session);

        if (!req.isAuthenticated() || !req.user) {
            console.log('[Auth Middleware] User not authenticated');
            return res.status(401).json({ message: "Unauthorized" });
        }

        const user = req.user as any;
        const role = user.role;

        if (!role) {
            console.log('[Auth Middleware] User has no role property');
            return res.status(401).json({ message: "Unauthorized: No role" });
        }

        if (!allowedRoles.includes(role)) {
            console.log('[Auth Middleware] User role not allowed:', role, 'Allowed:', allowedRoles);
            return res.status(403).json({ message: "Forbidden: Insufficient Role" });
        }

        console.log('[Auth Middleware] Authorization passed for role:', role);
        next();
    };
};

export const requireCorporate = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.corporateUserId) {
        return res.status(401).json({ message: "Unauthorized corporate session" });
    }

    try {
        const user = await storage.getUser(req.session.corporateUserId);
        if (!user || user.role !== 'Corporate' || !user.corporateClientId) {
            return res.status(403).json({ message: "Forbidden: Corporate access required" });
        }
        (req as any).corporateUser = user;
        next();
    } catch (error) {
        console.error('Corporate auth error:', error);
        res.status(500).json({ message: "Server error" });
    }
};

// Middleware to require admin authentication (Super Admin, Manager)
export const requireAdminAuth = requireRole(['Super Admin', 'Manager']);


