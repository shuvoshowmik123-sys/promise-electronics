import { storage } from "../storage.js";

type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT" | "VIEW" | "ACTION";

export const auditLogger = {
    log: async (params: {
        userId: string;
        action: string; // Use string to allow custom actions
        entity: string;
        entityId: string;
        details?: string;
        oldValue?: any;
        newValue?: any;
        req?: any; // Express Request for metadata
        severity?: "info" | "warning" | "critical";
    }) => {
        try {
            // Extract Metadata from Request
            const metadata = params.req ? {
                ip: params.req.ip,
                userAgent: params.req.headers['user-agent'],
                location: params.req.headers['x-location'], // Custom header
            } : {};

            // Prepare Changes JSON
            let changes = null;
            if (params.oldValue !== undefined || params.newValue !== undefined) {
                changes = {
                    old: params.oldValue,
                    new: params.newValue,
                };
            }

            await storage.createAuditLog({
                userId: params.userId,
                action: params.action,
                entity: params.entity,
                entityId: params.entityId,
                details: params.details,
                metadata: metadata,
                changes: changes,
                severity: params.severity || "info",
            });
        } catch (error) {
            // Silently fail to not block main thread, but log error
            console.error("Audit Log Error:", error);
        }
    }
};
