import { db } from "../db.js";
import { count, desc, eq, and, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as schema from "../../shared/schema.js";
import { PaginationResult } from "./base.js";
import type {
    WarrantyClaim,
    InsertWarrantyClaim,
    Refund,
    InsertRefund
} from "../../shared/schema.js";

export class WarrantyRepository {
    async getAllWarrantyClaims(filters?: { status?: string; phone?: string; page?: number; limit?: number }): Promise<PaginationResult<WarrantyClaim>> {
        const page = filters?.page || 1;
        const limit = filters?.limit || 20;
        const offset = (page - 1) * limit;

        const conditions = [];
        if (filters?.status) {
            conditions.push(eq(schema.warrantyClaims.status, filters.status));
        }
        if (filters?.phone) {
            conditions.push(like(schema.warrantyClaims.customerPhone, `%${filters.phone}%`));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const [claims, countResult] = await Promise.all([
            db.select()
                .from(schema.warrantyClaims)
                .where(whereClause)
                .orderBy(desc(schema.warrantyClaims.claimedAt))
                .limit(limit)
                .offset(offset),
            db.select({ count: count() })
                .from(schema.warrantyClaims)
                .where(whereClause)
        ]);

        const total = Number(countResult[0]?.count || 0);
        return {
            items: claims,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        };
    }

    async getWarrantyClaim(id: string): Promise<WarrantyClaim | undefined> {
        const [claim] = await db.select().from(schema.warrantyClaims).where(eq(schema.warrantyClaims.id, id));
        return claim;
    }

    async createWarrantyClaim(claim: InsertWarrantyClaim): Promise<WarrantyClaim> {
        const [created] = await db.insert(schema.warrantyClaims).values({
            ...claim,
            id: nanoid()
        }).returning();
        return created;
    }

    async updateWarrantyClaim(id: string, updates: Partial<InsertWarrantyClaim>): Promise<WarrantyClaim | undefined> {
        const [updated] = await db.update(schema.warrantyClaims)
            .set(updates)
            .where(eq(schema.warrantyClaims.id, id))
            .returning();
        return updated;
    }

    async getAllRefunds(filters?: { status?: string; page?: number; limit?: number }): Promise<PaginationResult<Refund>> {
        const page = filters?.page || 1;
        const limit = filters?.limit || 20;
        const offset = (page - 1) * limit;

        const conditions = [];
        if (filters?.status) {
            conditions.push(eq(schema.refunds.status, filters.status));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const [refunds, countResult] = await Promise.all([
            db.select()
                .from(schema.refunds)
                .where(whereClause)
                .orderBy(desc(schema.refunds.requestedAt))
                .limit(limit)
                .offset(offset),
            db.select({ count: count() })
                .from(schema.refunds)
                .where(whereClause)
        ]);

        const total = Number(countResult[0]?.count || 0);
        return {
            items: refunds,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        };
    }

    async getRefund(id: string): Promise<Refund | undefined> {
        const [refund] = await db.select().from(schema.refunds).where(eq(schema.refunds.id, id));
        return refund;
    }

    async createRefund(refund: InsertRefund): Promise<Refund> {
        const [created] = await db.insert(schema.refunds).values({
            ...refund,
            id: nanoid()
        }).returning();
        return created;
    }

    async updateRefund(id: string, updates: Partial<InsertRefund>): Promise<Refund | undefined> {
        const [updated] = await db.update(schema.refunds)
            .set(updates)
            .where(eq(schema.refunds.id, id))
            .returning();
        return updated;
    }
}

export const warrantyRepo = new WarrantyRepository();
