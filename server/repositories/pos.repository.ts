/**
 * POS Repository
 * 
 * Handles Point of Sale transactions.
 */

import { db, nanoid, eq, desc, like, count, schema, type PosTransaction, type InsertPosTransaction } from './base.js';

// ============================================
// POS Transaction Queries
// ============================================

export async function getAllPosTransactions(): Promise<PosTransaction[]> {
    return db.select().from(schema.posTransactions).orderBy(desc(schema.posTransactions.createdAt));
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
