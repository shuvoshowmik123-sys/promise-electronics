/**
 * Finance Repository
 * 
 * Handles all database operations for financial records:
 * - Petty Cash
 * - Due Records
 * - Challans
 */

import { db, nanoid, eq, desc, asc, and, gte, lte, or, like, count, sql, schema, type Challan, type InsertChallan, type PettyCashRecord, type InsertPettyCashRecord, type DueRecord, type InsertDueRecord, type PaginationResult } from './base.js';

// ============================================
// Petty Cash Operations
// ============================================

export async function getAllPettyCashRecords(filters?: {
    page?: number;
    limit?: number;
    search?: string;
    from?: string;
    to?: string;
    type?: string;
}): Promise<PaginationResult<PettyCashRecord>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 25;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (filters?.search) {
        conditions.push(or(
            like(schema.pettyCashRecords.description, `%${filters.search}%`),
            like(schema.pettyCashRecords.category, `%${filters.search}%`)
        ));
    }

    if (filters?.from) {
        // Assume from is a date string YYYY-MM-DD
        const fromDate = new Date(filters.from);
        fromDate.setHours(0, 0, 0, 0);
        conditions.push(gte(schema.pettyCashRecords.createdAt, fromDate));
    }

    if (filters?.to) {
        const toDate = new Date(filters.to);
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(schema.pettyCashRecords.createdAt, toDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db
        .select({ total: count() })
        .from(schema.pettyCashRecords)
        .where(whereClause);

    const items = await db
        .select()
        .from(schema.pettyCashRecords)
        .where(whereClause)
        .orderBy(desc(schema.pettyCashRecords.createdAt))
        .limit(limit)
        .offset(offset);

    return {
        items,
        pagination: {
            total: Number(total),
            page,
            limit,
            pages: Math.ceil(Number(total) / limit),
        },
    };
}

export async function getPettyCashSummary(filters?: {
    from?: string;
    to?: string;
}): Promise<{ totalIncome: number; totalExpense: number; count: number }> {
    const conditions = [];

    if (filters?.from) {
        const fromDate = new Date(filters.from);
        fromDate.setHours(0, 0, 0, 0);
        conditions.push(gte(schema.pettyCashRecords.createdAt, fromDate));
    }

    if (filters?.to) {
        const toDate = new Date(filters.to);
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(schema.pettyCashRecords.createdAt, toDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const records = await db
        .select()
        .from(schema.pettyCashRecords)
        .where(whereClause);

    let totalIncome = 0;
    let totalExpense = 0;

    for (const record of records) {
        if (record.type === 'Income') totalIncome += record.amount;
        if (record.type === 'Expense') totalExpense += record.amount;
    }

    return {
        totalIncome,
        totalExpense,
        count: records.length
    };
}

export async function createPettyCashRecord(record: InsertPettyCashRecord): Promise<PettyCashRecord> {
    const [newRecord] = await db.insert(schema.pettyCashRecords)
        .values({ ...record, id: nanoid() })
        .returning();
    return newRecord;
}

export async function deletePettyCashRecord(id: string): Promise<boolean> {
    const result = await db.delete(schema.pettyCashRecords).where(eq(schema.pettyCashRecords.id, id));
    return (result.rowCount ?? 0) > 0;
}

// ============================================
// Due Records Operations
// ============================================

export async function getAllDueRecords(filters?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    from?: string;
    to?: string;
}): Promise<PaginationResult<DueRecord>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 25;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (filters?.search) {
        conditions.push(or(
            like(schema.dueRecords.customer, `%${filters.search}%`),
            like(schema.dueRecords.invoice, `%${filters.search}%`)
        ));
    }

    if (filters?.status && filters.status !== 'All') {
        conditions.push(eq(schema.dueRecords.status, filters.status));
    }

    if (filters?.from) {
        const fromDate = new Date(filters.from);
        fromDate.setHours(0, 0, 0, 0);
        conditions.push(gte(schema.dueRecords.createdAt, fromDate));
    }

    if (filters?.to) {
        const toDate = new Date(filters.to);
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(schema.dueRecords.createdAt, toDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db
        .select({ total: count() })
        .from(schema.dueRecords)
        .where(whereClause);

    const items = await db
        .select()
        .from(schema.dueRecords)
        .where(whereClause)
        .orderBy(desc(schema.dueRecords.createdAt))
        .limit(limit)
        .offset(offset);

    return {
        items,
        pagination: {
            total: Number(total),
            page,
            limit,
            pages: Math.ceil(Number(total) / limit),
        },
    };
}

export async function getDueSummary(filters?: {
    from?: string;
    to?: string;
}): Promise<{ totalDueAmount: number; overdueCount: number; pendingCount: number }> {
    const conditions = [];

    if (filters?.from) {
        const fromDate = new Date(filters.from);
        fromDate.setHours(0, 0, 0, 0);
        conditions.push(gte(schema.dueRecords.createdAt, fromDate));
    }

    if (filters?.to) {
        const toDate = new Date(filters.to);
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(schema.dueRecords.createdAt, toDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const records = await db
        .select()
        .from(schema.dueRecords)
        .where(whereClause);

    let totalDueAmount = 0;
    let overdueCount = 0;
    let pendingCount = 0;

    for (const record of records) {
        // calculate remaining due (amount - paidAmount)
        const paidAmount = record.paidAmount || 0;
        const remaining = record.amount - paidAmount;
        totalDueAmount += remaining;

        if (record.status === 'Overdue') overdueCount++;
        else if (record.status === 'Pending' || record.status === 'Partial') pendingCount++;
    }

    return {
        totalDueAmount,
        overdueCount,
        pendingCount
    };
}

export async function getDueRecord(id: string): Promise<DueRecord | undefined> {
    const [record] = await db.select().from(schema.dueRecords).where(eq(schema.dueRecords.id, id));
    return record;
}

export async function createDueRecord(record: InsertDueRecord): Promise<DueRecord> {
    const [newRecord] = await db.insert(schema.dueRecords)
        .values({ ...record, id: nanoid() })
        .returning();
    return newRecord;
}

export async function updateDueRecord(id: string, updates: Partial<InsertDueRecord>): Promise<DueRecord | undefined> {
    const [updated] = await db
        .update(schema.dueRecords)
        .set(updates)
        .where(eq(schema.dueRecords.id, id))
        .returning();
    return updated;
}

export async function deleteDueRecord(id: string): Promise<boolean> {
    const result = await db.delete(schema.dueRecords).where(eq(schema.dueRecords.id, id));
    return (result.rowCount ?? 0) > 0;
}

// ============================================
// Challan Operations
// ============================================

export async function getAllChallans(): Promise<Challan[]> {
    return db.select().from(schema.challans).orderBy(desc(schema.challans.createdAt));
}

export async function getChallan(id: string): Promise<Challan | undefined> {
    const [challan] = await db.select().from(schema.challans).where(eq(schema.challans.id, id));
    return challan;
}

export async function createChallan(challan: InsertChallan): Promise<Challan> {
    const [newChallan] = await db.insert(schema.challans)
        .values({ ...challan, id: challan.id || nanoid() })
        .returning();
    return newChallan;
}

export async function updateChallan(id: string, updates: Partial<InsertChallan>): Promise<Challan | undefined> {
    const [updated] = await db
        .update(schema.challans)
        .set(updates)
        .where(eq(schema.challans.id, id))
        .returning();
    return updated;
}

export async function deleteChallan(id: string): Promise<boolean> {
    const result = await db.delete(schema.challans).where(eq(schema.challans.id, id));
    return (result.rowCount ?? 0) > 0;
}
