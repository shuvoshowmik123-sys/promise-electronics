import { Request } from 'express';
import { SessionData } from 'express-session';

/**
 * Session Manager Utility
 * 
 * Centralizes the logic for managing different session types (Admin, Corporate, Customer).
 */
export const sessionManager = {
    /**
     * Set the admin user in the session.
     */
    setAdmin: (req: Request, userId: string) => {
        req.session.adminUserId = userId;
        // Ensure other session types are cleared if necessary, 
        // though we allow concurrent sessions, we might want to track the current active view.
    },

    /**
     * Set the corporate user in the session.
     */
    setCorporate: (req: Request, userId: string) => {
        req.session.corporateUserId = userId;
    },

    /**
     * Clear the corporate session only.
     */
    clearCorporate: (req: Request) => {
        req.session.corporateUserId = undefined;
    },

    /**
     * Clear the admin session only.
     */
    clearAdmin: (req: Request) => {
        req.session.adminUserId = undefined;
    },

    /**
     * Check if a session has a corporate user.
     */
    hasCorporate: (session: SessionData) => {
        return !!session.corporateUserId;
    },

    /**
     * Check if a session has an admin user.
     */
    hasAdmin: (session: SessionData) => {
        return !!session.adminUserId;
    }
};
