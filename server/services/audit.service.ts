import { db } from "../db";
import { auditLogs } from "../../shared/schema";
import { randomUUID } from "crypto";

export type AuditParams = {
    userId: string;
    action: string;
    entity: string;
    entityId: string;
    details?: string;
    metadata?: Record<string, any>;
    changes?: {
        old?: Record<string, any>;
        new?: Record<string, any>;
    };
    severity?: "info" | "warning" | "critical";
    storeId?: string;
};

export class AuditLogger {
    /**
     * Logs an action immutably to the database.
     * This is designed to be fire-and-forget, but it awaits the insertion.
     */
    static async log(params: AuditParams): Promise<boolean> {
        try {
            await db.insert(auditLogs).values({
                id: randomUUID(),
                userId: params.userId,
                action: params.action,
                entity: params.entity,
                entityId: params.entityId,
                details: params.details || null,
                metadata: params.metadata || null,
                changes: params.changes || null,
                severity: params.severity || "info",
                storeId: params.storeId || null,
            });
            return true;
        } catch (error) {
            console.error("[AuditLogger] Critical Failure: Could not write audit log:", error);
            // In a completely strict system, we might throw here to crash the request 
            // if logging fails. For Phase 1, we will swallow the error but log it heavily.
            return false;
        }
    }
}
