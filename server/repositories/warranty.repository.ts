import { db } from "../db.js";
import { sql, count, desc, eq, and, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as schema from "../../shared/schema.js";
import { PaginationResult } from "./base.js";
import type {
    WarrantyClaim,
    InsertWarrantyClaim,
    Refund,
    InsertRefund
} from "../../shared/schema.js";

export type WarrantyClaimWithRefs = WarrantyClaim & {
    originalJobSafeRef: string;
    newJobSafeRef: string | null;
};

export class WarrantyRepository {
    async getAllWarrantyClaims(filters?: { status?: string; phone?: string; page?: number; limit?: number }): Promise<PaginationResult<WarrantyClaimWithRefs>> {
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

        const [countResult, rawRows] = await Promise.all([
            db.select({ count: count() })
                .from(schema.warrantyClaims)
                .where(whereClause),

            // LEFT JOIN job_tickets twice to get human-safe job references.
            // Prefer corporateJobNumber when the job is a corporate job; fall back to
            // the last 6 chars of the nanoid (e.g. "B-MYT") which is short but unique enough
            // for display purposes and matches what the admin sees in the job list.
            db.execute(sql`
                SELECT
                    wc.id,
                    wc.original_job_id         AS "originalJobId",
                    wc.new_job_id              AS "newJobId",
                    wc.customer,
                    wc.customer_phone          AS "customerPhone",
                    wc.device,
                    wc.claim_type              AS "claimType",
                    wc.claim_reason            AS "claimReason",
                    wc.warranty_valid          AS "warrantyValid",
                    wc.warranty_expiry_date    AS "warrantyExpiryDate",
                    wc.claimed_by              AS "claimedBy",
                    wc.claimed_by_name         AS "claimedByName",
                    wc.claimed_by_role         AS "claimedByRole",
                    wc.claimed_at              AS "claimedAt",
                    wc.approved_by             AS "approvedBy",
                    wc.approved_by_name        AS "approvedByName",
                    wc.approved_by_role        AS "approvedByRole",
                    wc.approved_at             AS "approvedAt",
                    wc.status,
                    wc.rejection_reason        AS "rejectionReason",
                    wc.notes,
                    wc.created_at              AS "createdAt",
                    wc.updated_at              AS "updatedAt",
                    COALESCE(
                        NULLIF(jt_orig.corporate_job_number, ''),
                        UPPER(RIGHT(wc.original_job_id, 6))
                    )                          AS "originalJobSafeRef",
                    CASE
                        WHEN wc.new_job_id IS NOT NULL
                        THEN COALESCE(
                            NULLIF(jt_new.corporate_job_number, ''),
                            UPPER(RIGHT(wc.new_job_id, 6))
                        )
                        ELSE NULL
                    END                        AS "newJobSafeRef"
                FROM warranty_claims wc
                LEFT JOIN job_tickets jt_orig ON jt_orig.id = wc.original_job_id
                LEFT JOIN job_tickets jt_new  ON jt_new.id  = wc.new_job_id
                WHERE 1=1
                    ${filters?.status ? sql`AND wc.status = ${filters.status}` : sql``}
                    ${filters?.phone  ? sql`AND wc.customer_phone LIKE ${'%' + filters.phone + '%'}` : sql``}
                ORDER BY wc.claimed_at DESC
                LIMIT ${limit} OFFSET ${offset}
            `),
        ]);

        const total = Number(countResult[0]?.count || 0);
        const items = ((rawRows as any).rows ?? rawRows) as WarrantyClaimWithRefs[];

        return {
            items,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        };
    }

    async getWarrantyClaim(id: string): Promise<WarrantyClaim | undefined> {
        const [claim] = await db.select().from(schema.warrantyClaims).where(eq(schema.warrantyClaims.id, id));
        return claim;
    }

    async getWarrantyClaimWithRefs(id: string): Promise<WarrantyClaimWithRefs | undefined> {
        const rows = await db.execute(sql`
            SELECT
                wc.id,
                wc.original_job_id         AS "originalJobId",
                wc.new_job_id              AS "newJobId",
                wc.customer,
                wc.customer_phone          AS "customerPhone",
                wc.device,
                wc.claim_type              AS "claimType",
                wc.claim_reason            AS "claimReason",
                wc.warranty_valid          AS "warrantyValid",
                wc.warranty_expiry_date    AS "warrantyExpiryDate",
                wc.claimed_by              AS "claimedBy",
                wc.claimed_by_name         AS "claimedByName",
                wc.claimed_by_role         AS "claimedByRole",
                wc.claimed_at              AS "claimedAt",
                wc.approved_by             AS "approvedBy",
                wc.approved_by_name        AS "approvedByName",
                wc.approved_by_role        AS "approvedByRole",
                wc.approved_at             AS "approvedAt",
                wc.status,
                wc.rejection_reason        AS "rejectionReason",
                wc.notes,
                wc.created_at              AS "createdAt",
                wc.updated_at              AS "updatedAt",
                COALESCE(
                    NULLIF(jt_orig.corporate_job_number, ''),
                    UPPER(RIGHT(wc.original_job_id, 6))
                )                          AS "originalJobSafeRef",
                CASE
                    WHEN wc.new_job_id IS NOT NULL
                    THEN COALESCE(
                        NULLIF(jt_new.corporate_job_number, ''),
                        UPPER(RIGHT(wc.new_job_id, 6))
                    )
                    ELSE NULL
                END                        AS "newJobSafeRef"
            FROM warranty_claims wc
            LEFT JOIN job_tickets jt_orig ON jt_orig.id = wc.original_job_id
            LEFT JOIN job_tickets jt_new  ON jt_new.id  = wc.new_job_id
            WHERE wc.id = ${id}
            LIMIT 1
        `);
        const list = ((rows as any).rows ?? rows) as WarrantyClaimWithRefs[];
        return list[0];
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
