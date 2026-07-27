/**
 * Attendance Repository
 * 
 * Handles all database operations for staff attendance records.
 */

import { db, nanoid, eq, desc, schema, type AttendanceRecord, type InsertAttendanceRecord } from './base.js';
import { and, gte, lte } from 'drizzle-orm';

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

export async function getAttendanceByUserAndDateRange(
    userId: string,
    startDate: string,
    endDate: string,
): Promise<AttendanceRecord[]> {
    return db.select().from(schema.attendanceRecords)
        .where(and(
            eq(schema.attendanceRecords.userId, userId),
            gte(schema.attendanceRecords.date, startDate),
            lte(schema.attendanceRecords.date, endDate),
        ))
        .orderBy(desc(schema.attendanceRecords.date));
}

export async function getTodayAttendanceForUser(userId: string, date: string): Promise<AttendanceRecord | undefined> {
    const [record] = await db.select().from(schema.attendanceRecords)
        .where(and(
            eq(schema.attendanceRecords.userId, userId),
            eq(schema.attendanceRecords.date, date)
        ));
    return record;
}

export async function getAttendanceById(id: string): Promise<AttendanceRecord | undefined> {
    const [record] = await db.select().from(schema.attendanceRecords)
        .where(eq(schema.attendanceRecords.id, id));
    return record;
}

// ============================================
// Attendance Mutations
// ============================================

export class AttendanceDuplicateDayError extends Error {
    code = "ALREADY_CHECKED_IN" as const;
    status = 409;
    constructor(message = "Already checked in today") {
        super(message);
        this.name = "AttendanceDuplicateDayError";
    }
}

export async function createAttendanceRecord(record: InsertAttendanceRecord): Promise<AttendanceRecord> {
    try {
        const [newRecord] = await db.insert(schema.attendanceRecords)
            .values({ ...record, id: nanoid() })
            .returning();
        return newRecord;
    } catch (e: unknown) {
        const msg = String((e as { message?: string })?.message || e);
        // Race-safe one-user-per-day: concurrent check-ins collide on uidx_attendance_user_date
        if (
            msg.includes("uidx_attendance_user_date") ||
            msg.includes("duplicate key") ||
            (msg.includes("unique") && msg.includes("attendance"))
        ) {
            throw new AttendanceDuplicateDayError();
        }
        throw e;
    }
}

export async function updateAttendanceRecord(id: string, updates: Partial<AttendanceRecord>): Promise<AttendanceRecord | undefined> {
    const [updated] = await db
        .update(schema.attendanceRecords)
        .set(updates)
        .where(eq(schema.attendanceRecords.id, id))
        .returning();
    return updated;
}
