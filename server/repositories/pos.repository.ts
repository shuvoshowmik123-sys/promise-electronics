/**
 * POS Repository
 * 
 * Handles Point of Sale transactions.
 */

import { db, nanoid, eq, desc, asc, and, gte, lte, or, like, count, isNull, isNotNull, sql, schema, type PosTransaction, type InsertPosTransaction, type DrawerSession, type InsertDrawerSession, type PaginationResult } from './base.js';

// ============================================
// POS Transaction Queries
// ============================================

export async function getAllPosTransactions(filters?: {
    page?: number;
    limit?: number;
    search?: string;
    paymentMethod?: string;
    from?: string;
    to?: string;
}): Promise<PaginationResult<PosTransaction>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 25;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (filters?.search) {
        conditions.push(or(
            like(schema.posTransactions.customer, `%${filters.search}%`),
            like(schema.posTransactions.customerPhone, `%${filters.search}%`),
            like(schema.posTransactions.invoiceNumber, `%${filters.search}%`)
        ));
    }

    if (filters?.paymentMethod && filters.paymentMethod !== 'All') {
        conditions.push(eq(schema.posTransactions.paymentMethod, filters.paymentMethod));
    }

    if (filters?.from) {
        const fromDate = new Date(filters.from);
        fromDate.setHours(0, 0, 0, 0);
        conditions.push(gte(schema.posTransactions.createdAt, fromDate));
    }

    if (filters?.to) {
        const toDate = new Date(filters.to);
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(schema.posTransactions.createdAt, toDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ total }] = await db
        .select({ total: count() })
        .from(schema.posTransactions)
        .where(whereClause);

    const items = await db
        .select()
        .from(schema.posTransactions)
        .where(whereClause)
        .orderBy(desc(schema.posTransactions.createdAt))
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

export async function getPosTransactionSummary(filters?: {
    from?: string;
    to?: string;
}): Promise<{ totalSales: number; count: number; byMethod: Record<string, number> }> {
    const conditions = [];

    if (filters?.from) {
        const fromDate = new Date(filters.from);
        fromDate.setHours(0, 0, 0, 0);
        conditions.push(gte(schema.posTransactions.createdAt, fromDate));
    }

    if (filters?.to) {
        const toDate = new Date(filters.to);
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(schema.posTransactions.createdAt, toDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const records = await db
        .select()
        .from(schema.posTransactions)
        .where(whereClause);

    let totalSales = 0;
    const byMethod: Record<string, number> = {};

    for (const record of records) {
        totalSales += record.total;

        const method = record.paymentMethod || 'Unknown';
        if (!byMethod[method]) {
            byMethod[method] = 0;
        }
        byMethod[method] += record.total;
    }

    return {
        totalSales,
        count: records.length,
        byMethod
    };
}

export async function getPosTransaction(id: string): Promise<PosTransaction | undefined> {
    const [transaction] = await db.select().from(schema.posTransactions)
        .where(eq(schema.posTransactions.id, id));
    return transaction;
}

export async function getPosTransactionByInvoice(invoiceNumber: string): Promise<PosTransaction | undefined> {
    const [transaction] = await db.select().from(schema.posTransactions)
        .where(eq(schema.posTransactions.invoiceNumber, invoiceNumber));
    return transaction;
}

/**
 * Get next invoice number in format INV-YYYYMMDD-XXXX
 */
export async function getNextInvoiceNumber(): Promise<string> {
    const now = new Date();
    const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, "");

    const [result] = await db
        .select({ count: count() })
        .from(schema.posTransactions)
        .where(like(schema.posTransactions.invoiceNumber, `INV-${datePrefix}%`));

    const sequence = (Number(result.count) + 1).toString().padStart(4, "0");
    return `INV-${datePrefix}-${sequence}`;
}

// ============================================
// POS Transaction Mutations
// ============================================

export async function createPosTransaction(transaction: InsertPosTransaction): Promise<PosTransaction> {
    const invoiceNumber = await getNextInvoiceNumber();

    const [newTransaction] = await db
        .insert(schema.posTransactions)
        .values({
            ...transaction,
            invoiceNumber,
            id: transaction.id || nanoid()
        })
        .returning();

    return newTransaction;
}

export async function updatePosTransactionStatus(invoiceNumber: string, status: string): Promise<void> {
    await db
        .update(schema.posTransactions)
        .set({ paymentStatus: status })
        .where(eq(schema.posTransactions.invoiceNumber, invoiceNumber));
}

/**
 * Get transactions for a specific date range
 */
export async function getPosTransactionsByDateRange(
    startDate: Date,
    endDate: Date
): Promise<PosTransaction[]> {
    const transactions = await db.select().from(schema.posTransactions)
        .orderBy(desc(schema.posTransactions.createdAt));

    return transactions.filter(t => {
        const created = new Date(t.createdAt);
        return created >= startDate && created <= endDate;
    });
}

// ============================================
// Drawer Sessions
// ============================================

export async function createDrawerSession(session: InsertDrawerSession): Promise<DrawerSession> {
    const [newSession] = await db.insert(schema.drawerSessions)
        .values({ ...session, id: nanoid() })
        .returning();
    return newSession;
}
export async function getDrawerSession(id: string): Promise<DrawerSession | undefined> {
    const [session] = await db.select().from(schema.drawerSessions)
        .where(eq(schema.drawerSessions.id, id));
    return session;
}
export async function updateDrawerSession(id: string, updates: Partial<InsertDrawerSession>): Promise<DrawerSession | undefined> {
    const [updated] = await db.update(schema.drawerSessions)
        .set(updates)
        .where(eq(schema.drawerSessions.id, id))
        .returning();
    return updated;
}
export async function getActiveDrawerSession(userId: string): Promise<DrawerSession | undefined> {
    const [session] = await db.select().from(schema.drawerSessions)
        .where(and(eq(schema.drawerSessions.openedBy, userId), isNull(schema.drawerSessions.closedAt)));
    return session;
}
export async function getClosedDrawerSessions(date: Date): Promise<DrawerSession[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const sessions = await db.select().from(schema.drawerSessions)
        .where(isNotNull(schema.drawerSessions.closedAt))
        .orderBy(desc(schema.drawerSessions.closedAt));

    return sessions.filter(s => {
        if (!s.closedAt) return false;
        const closed = new Date(s.closedAt);
        return closed >= startOfDay && closed <= endOfDay;
    });
}

/**
 * Get the latest closed drawer session (regardless of status).
 * Used as baseline for next opening-float variance checks.
 */
export async function getLatestClosedDrawerSession(): Promise<DrawerSession | undefined> {
    const [session] = await db.select().from(schema.drawerSessions)
        .where(isNotNull(schema.drawerSessions.closedAt))
        .orderBy(desc(schema.drawerSessions.closedAt))
        .limit(1);
    return session;
}

// ============================================
// Drawer Methods (IStorage interface names)
// These are the names that drawer.routes.ts calls
// via the storage Proxy.
// ============================================

/**
 * Open a new register / drawer session.
 * Maps to IStorage.openDrawer
 */
export async function openDrawer(session: InsertDrawerSession): Promise<DrawerSession> {
    const [newSession] = await db.insert(schema.drawerSessions)
        .values({
            ...session,
            id: nanoid(),
            expectedCash: session.startingFloat, // Initialize expected = float
        })
        .returning();
    return newSession;
}

/**
 * Atomically update the expectedCash on the active drawer.
 * Positive delta = cash in (sale), negative delta = cash out (petty/refund).
 */
export async function updateDrawerExpectedCash(drawerId: string, delta: number): Promise<DrawerSession | undefined> {
    const [updated] = await db.update(schema.drawerSessions)
        .set({
            expectedCash: sql`COALESCE(${schema.drawerSessions.expectedCash}, ${schema.drawerSessions.startingFloat}) + ${delta}`,
        })
        .where(eq(schema.drawerSessions.id, drawerId))
        .returning();
    return updated;
}

/**
 * Get the currently active (open) drawer session.
 * Maps to IStorage.getActiveDrawer
 * Unlike getActiveDrawerSession(userId), this finds ANY open session globally.
 */
export async function getActiveDrawer(): Promise<DrawerSession | undefined> {
    const [session] = await db.select().from(schema.drawerSessions)
        .where(and(
            eq(schema.drawerSessions.status, 'open'),
            isNull(schema.drawerSessions.closedAt)
        ))
        .orderBy(desc(schema.drawerSessions.openedAt))
        .limit(1);
    return session;
}

/**
 * Get the most recent unresolved drawer session visible to the POS UI.
 * Includes both fully open and post-drop counting sessions.
 */
export async function getCurrentDrawerSession(): Promise<DrawerSession | undefined> {
    const [session] = await db.select().from(schema.drawerSessions)
        .where(and(
            isNull(schema.drawerSessions.closedAt),
            or(
                eq(schema.drawerSessions.status, 'open'),
                eq(schema.drawerSessions.status, 'counting')
            )
        ))
        .orderBy(desc(schema.drawerSessions.openedAt))
        .limit(1);
    return session;
}

/**
 * Get paginated drawer history (all sessions, newest first).
 * Maps to IStorage.getDrawerHistory
 */
export async function getDrawerHistory(page: number = 1, limit: number = 10) {
    const offset = (page - 1) * limit;

    const [{ total }] = await db.select({ total: count() }).from(schema.drawerSessions);

    const items = await db.select().from(schema.drawerSessions)
        .orderBy(desc(schema.drawerSessions.openedAt))
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

/**
 * Record a cashier's blind drop (declared cash count).
 * Maps to IStorage.logBlindDrop
 */
export async function logBlindDrop(id: string, declaredCash: number): Promise<DrawerSession | undefined> {
    // Fetch the current session to calculate discrepancy
    const [session] = await db.select().from(schema.drawerSessions)
        .where(eq(schema.drawerSessions.id, id));

    if (!session) return undefined;

    const expectedCash = session.expectedCash ?? session.startingFloat;
    const discrepancy = declaredCash - expectedCash;

    const [updated] = await db.update(schema.drawerSessions)
        .set({
            declaredCash,
            discrepancy,
            status: 'counting',
        })
        .where(eq(schema.drawerSessions.id, id))
        .returning();

    return updated;
}

/**
 * Manager reconciles (closes) a drawer session.
 * Maps to IStorage.reconcileDrawer
 */
export async function reconcileDrawer(
    id: string,
    data: { status: string; notes?: string; closedBy: string; closedByName: string }
): Promise<DrawerSession | undefined> {
    const [updated] = await db.update(schema.drawerSessions)
        .set({
            status: data.status,
            notes: data.notes,
            closedBy: data.closedBy,
            closedByName: data.closedByName,
            closedAt: new Date(),
        })
        .where(eq(schema.drawerSessions.id, id))
        .returning();

    return updated;
}
