/**
 * Finance Repository
 * 
 * Handles all database operations for financial records:
 * - Petty Cash
 * - Due Records
 * - Challans
 */

import { db, nanoid, eq, desc, schema, type Challan, type InsertChallan, type PettyCashRecord, type InsertPettyCashRecord, type DueRecord, type InsertDueRecord } from './base.js';

// ============================================
// Petty Cash Operations
// ============================================

export async function getAllPettyCashRecords(): Promise<PettyCashRecord[]> {
    return db.select().from(schema.pettyCashRecords).orderBy(desc(schema.pettyCashRecords.createdAt));
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

export async function getAllDueRecords(): Promise<DueRecord[]> {
    return db.select().from(schema.dueRecords).orderBy(desc(schema.dueRecords.createdAt));
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
