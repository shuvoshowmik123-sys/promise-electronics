import { db } from "../db.js";
import { count, desc, eq, and, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as schema from "../../shared/schema.js";
import type {
    ApprovalRequest,
    InsertApprovalRequest,
    SystemModule,
    InsertSystemModule,
    AuditLog,
    InsertAuditLog,
    RollbackRequest,
    InsertRollbackRequest
} from "../../shared/schema.js";

export class SystemRepository {
    async createApprovalRequest(data: Omit<schema.InsertApprovalRequest, 'id'>): Promise<schema.ApprovalRequest> {
        const [request] = await db.insert(schema.approvalRequests).values({
            ...data,
            id: nanoid(),
        }).returning();
        return request;
    }

    async getPendingApprovals(): Promise<schema.ApprovalRequest[]> {
        return db.select()
            .from(schema.approvalRequests)
            .where(eq(schema.approvalRequests.status, 'pending'))
            .orderBy(desc(schema.approvalRequests.createdAt));
    }

    async getPendingApprovalCount(): Promise<number> {
        const [result] = await db.select({ count: count() })
            .from(schema.approvalRequests)
            .where(eq(schema.approvalRequests.status, 'pending'));
        return Number(result?.count || 0);
    }

    async approveRequest(id: string, reviewedBy: string): Promise<schema.ApprovalRequest | undefined> {
        const [request] = await db.select()
            .from(schema.approvalRequests)
            .where(eq(schema.approvalRequests.id, id));

        if (!request) return undefined;

        if (request.type === 'company_claim_change' && request.jobId && request.newValue) {
            await db.update(schema.jobTickets)
                .set({ reportedDefect: request.newValue })
                .where(eq(schema.jobTickets.id, request.jobId));
        }

        const [updated] = await db.update(schema.approvalRequests)
            .set({
                status: 'approved',
                reviewedBy,
                reviewedAt: new Date(),
            })
            .where(eq(schema.approvalRequests.id, id))
            .returning();

        return updated;
    }

    async rejectRequest(id: string, reviewedBy: string, reason?: string): Promise<schema.ApprovalRequest | undefined> {
        const [updated] = await db.update(schema.approvalRequests)
            .set({
                status: 'rejected',
                reviewedBy,
                reviewedAt: new Date(),
                rejectionReason: reason,
            })
            .where(eq(schema.approvalRequests.id, id))
            .returning();

        return updated;
    }

    async getUserApprovalRequests(userId: string): Promise<schema.ApprovalRequest[]> {
        return db.select()
            .from(schema.approvalRequests)
            .where(
                and(
                    eq(schema.approvalRequests.requestedBy, userId),
                    eq(schema.approvalRequests.status, 'rejected')
                )
            )
            .orderBy(desc(schema.approvalRequests.reviewedAt));
    }

    async getAllModules(): Promise<schema.SystemModule[]> {
        return await db.select().from(schema.systemModules).orderBy(asc(schema.systemModules.displayOrder));
    }

    async getModule(id: string): Promise<schema.SystemModule | undefined> {
        const [module] = await db.select().from(schema.systemModules).where(eq(schema.systemModules.id, id));
        return module;
    }

    async upsertModule(module: schema.InsertSystemModule): Promise<schema.SystemModule> {
        const existing = await this.getModule(module.id as string);
        if (existing) {
            const [updated] = await db
                .update(schema.systemModules)
                .set(module)
                .where(eq(schema.systemModules.id, module.id as string))
                .returning();
            return updated;
        }
        const [newModule] = await db.insert(schema.systemModules).values(module).returning();
        return newModule;
    }

    async toggleModule(id: string, portal: "admin" | "customer" | "corporate" | "technician", enabled: boolean, userId: string): Promise<schema.SystemModule | undefined> {
        const updateData: any = {
            toggledBy: userId,
            toggledAt: new Date()
        };

        if (portal === "admin") updateData.enabledAdmin = enabled;
        else if (portal === "customer") updateData.enabledCustomer = enabled;
        else if (portal === "corporate") updateData.enabledCorporate = enabled;
        else if (portal === "technician") updateData.enabledTechnician = enabled;

        const [updated] = await db
            .update(schema.systemModules)
            .set(updateData)
            .where(eq(schema.systemModules.id, id))
            .returning();

        return updated;
    }

    async seedDefaultModules(modules: schema.InsertSystemModule[]): Promise<void> {
        for (const mod of modules) {
            await this.upsertModule(mod);
        }
    }

    async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
        const [newLog] = await db.insert(schema.auditLogs).values({
            ...log,
            id: nanoid()
        }).returning();
        return newLog;
    }

    async getAuditLogs(filters?: { userId?: string, entity?: string, entityId?: string, limit?: number }): Promise<AuditLog[]> {
        if (!filters) {
            return db.select().from(schema.auditLogs)
                .orderBy(desc(schema.auditLogs.createdAt))
                .limit(100);
        }

        const conditions = [];
        if (filters.userId) conditions.push(eq(schema.auditLogs.userId, filters.userId));
        if (filters.entity) conditions.push(eq(schema.auditLogs.entity, filters.entity));
        if (filters.entityId) conditions.push(eq(schema.auditLogs.entityId, filters.entityId));

        return db.select().from(schema.auditLogs)
            .where(and(...conditions))
            .orderBy(desc(schema.auditLogs.createdAt))
            .limit(filters.limit || 100);
    }

    // Rollback Requests
    async createRollbackRequest(request: InsertRollbackRequest): Promise<RollbackRequest> {
        const [newRequest] = await db.insert(schema.rollbackRequests).values(request).returning();
        return newRequest;
    }

    async updateRollbackRequest(id: number, updates: Partial<RollbackRequest>): Promise<RollbackRequest | undefined> {
        const [updated] = await db
            .update(schema.rollbackRequests)
            .set(updates)
            .where(eq(schema.rollbackRequests.id, id))
            .returning();
        return updated;
    }

    async getPendingRollbackRequests(): Promise<RollbackRequest[]> {
        return db.select()
            .from(schema.rollbackRequests)
            .where(eq(schema.rollbackRequests.status, "pending"))
            .orderBy(desc(schema.rollbackRequests.createdAt));
    }
}

export const systemRepo = new SystemRepository();
