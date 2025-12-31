/**
 * Attendance Repository
 * 
 * Handles all database operations for staff attendance records.
 */

import { db, nanoid, eq, desc, schema, type AttendanceRecord, type InsertAttendanceRecord } from './base.js';

// ============================================
// Attendance Queries
// ============================================

export async function getAllAttendanceRecords(): Promise<AttendanceRecord[]> {
    return db.select().from(schema.attendanceRecords).orderBy(desc(schema.attendanceRecords.checkInTime));
}

export async function getAttendanceByUserId(userId: string): Promise<AttendanceRecord[]> {
    return db.select().from(schema.attendanceRecords)
        .where(eq(schema.attendanceRecords.userId, userId))
        .orderBy(desc(schema.attendanceRecords.checkInTime));
}

export async function getAttendanceByDate(date: string): Promise<AttendanceRecord[]> {
    return db.select().from(schema.attendanceRecords)
        .where(eq(schema.attendanceRecords.date, date))
        .orderBy(desc(schema.attendanceRecords.checkInTime));
}

export async function getTodayAttendanceForUser(userId: string, date: string): Promise<AttendanceRecord | undefined> {
    const [record] = await db.select().from(schema.attendanceRecords)
        .where(eq(schema.attendanceRecords.userId, userId))
        .where(eq(schema.attendanceRecords.date, date));
    return record;
}

// ============================================
// Attendance Mutations
// ============================================

export async function createAttendanceRecord(record: InsertAttendanceRecord): Promise<AttendanceRecord> {
    const [newRecord] = await db.insert(schema.attendanceRecords)
        .values({ ...record, id: nanoid() })
        .returning();
    return newRecord;
}

export async function updateAttendanceRecord(id: string, updates: Partial<AttendanceRecord>): Promise<AttendanceRecord | undefined> {
    const [updated] = await db
        .update(schema.attendanceRecords)
        .set(updates)
        .where(eq(schema.attendanceRecords.id, id))
        .returning();
    return updated;
}
