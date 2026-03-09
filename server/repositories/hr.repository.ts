import { db } from "../db.js";
import { asc, desc, eq, and, or, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as schema from "../../shared/schema.js";
import type {
    StaffSalaryConfig,
    InsertStaffSalaryConfig,
    LeaveApplication,
    InsertLeaveApplication,
    PayrollRecord,
    InsertPayrollRecord,
    BonusRecord,
    InsertBonusRecord,
    HolidayCalendar,
    InsertHolidayCalendar
} from "../../shared/schema.js";

export class HrRepository {
    async getAttendanceRecordsByMonth(userId: string, month: string): Promise<schema.AttendanceRecord[]> {
        return db.select()
            .from(schema.attendanceRecords)
            .where(
                and(
                    eq(schema.attendanceRecords.userId, userId),
                    like(schema.attendanceRecords.date, `${month}-%`)
                )
            )
            .orderBy(asc(schema.attendanceRecords.date));
    }

    async getAllSalaryConfigs(): Promise<StaffSalaryConfig[]> {
        return db.select().from(schema.staffSalaryConfig).orderBy(asc(schema.staffSalaryConfig.createdAt));
    }

    async getSalaryConfig(userId: string): Promise<StaffSalaryConfig | undefined> {
        const [config] = await db.select().from(schema.staffSalaryConfig).where(eq(schema.staffSalaryConfig.userId, userId));
        return config;
    }

    async createSalaryConfig(config: InsertStaffSalaryConfig): Promise<StaffSalaryConfig> {
        const [created] = await db.insert(schema.staffSalaryConfig).values({ ...config, id: nanoid() }).returning();
        return created;
    }

    async updateSalaryConfig(id: string, updates: Partial<InsertStaffSalaryConfig>): Promise<StaffSalaryConfig | undefined> {
        const [updated] = await db.update(schema.staffSalaryConfig).set({ ...updates, updatedAt: new Date() }).where(eq(schema.staffSalaryConfig.id, id)).returning();
        return updated;
    }

    async deleteSalaryConfig(id: string): Promise<boolean> {
        const result = await db.delete(schema.staffSalaryConfig).where(eq(schema.staffSalaryConfig.id, id));
        return (result.rowCount ?? 0) > 0;
    }

    async getLeaveApplicationsByUser(userId: string): Promise<LeaveApplication[]> {
        return db.select().from(schema.leaveApplications).where(eq(schema.leaveApplications.userId, userId)).orderBy(desc(schema.leaveApplications.createdAt));
    }

    async getAllLeaveApplications(status?: string): Promise<LeaveApplication[]> {
        if (status) {
            return db.select().from(schema.leaveApplications).where(eq(schema.leaveApplications.status, status)).orderBy(desc(schema.leaveApplications.createdAt));
        }
        return db.select().from(schema.leaveApplications).orderBy(desc(schema.leaveApplications.createdAt));
    }

    async createLeaveApplication(app: InsertLeaveApplication): Promise<LeaveApplication> {
        const [created] = await db.insert(schema.leaveApplications).values({ ...app, id: nanoid() }).returning();
        return created;
    }

    async updateLeaveApplication(id: string, updates: Partial<LeaveApplication>): Promise<LeaveApplication | undefined> {
        const [updated] = await db.update(schema.leaveApplications).set(updates).where(eq(schema.leaveApplications.id, id)).returning();
        return updated;
    }

    async getPayrollByMonth(month: string): Promise<PayrollRecord[]> {
        return db.select().from(schema.payrollRecords).where(eq(schema.payrollRecords.month, month)).orderBy(asc(schema.payrollRecords.userName));
    }

    async getPayrollByUser(userId: string): Promise<PayrollRecord[]> {
        return db.select().from(schema.payrollRecords).where(eq(schema.payrollRecords.userId, userId)).orderBy(desc(schema.payrollRecords.month));
    }

    async getPayrollRecord(id: string): Promise<PayrollRecord | undefined> {
        const [record] = await db.select().from(schema.payrollRecords).where(eq(schema.payrollRecords.id, id));
        return record;
    }

    async createPayrollRecord(record: InsertPayrollRecord): Promise<PayrollRecord> {
        const [created] = await db.insert(schema.payrollRecords).values({ ...record, id: nanoid() }).returning();
        return created;
    }

    async updatePayrollRecord(id: string, updates: Partial<PayrollRecord>): Promise<PayrollRecord | undefined> {
        const [updated] = await db.update(schema.payrollRecords).set(updates).where(eq(schema.payrollRecords.id, id)).returning();
        return updated;
    }

    async deletePayrollRecord(id: string): Promise<boolean> {
        const result = await db.delete(schema.payrollRecords).where(eq(schema.payrollRecords.id, id));
        return (result.rowCount ?? 0) > 0;
    }

    async getBonusByYear(year: number): Promise<BonusRecord[]> {
        return db.select().from(schema.bonusRecords).where(eq(schema.bonusRecords.year, year)).orderBy(asc(schema.bonusRecords.userName));
    }

    async createBonusRecord(record: InsertBonusRecord): Promise<BonusRecord> {
        const [created] = await db.insert(schema.bonusRecords).values({ ...record, id: nanoid() }).returning();
        return created;
    }

    async updateBonusRecord(id: string, updates: Partial<BonusRecord>): Promise<BonusRecord | undefined> {
        const [updated] = await db.update(schema.bonusRecords).set(updates).where(eq(schema.bonusRecords.id, id)).returning();
        return updated;
    }

    async getHolidaysByYear(year: number): Promise<HolidayCalendar[]> {
        return db.select().from(schema.holidayCalendar).where(eq(schema.holidayCalendar.year, year)).orderBy(asc(schema.holidayCalendar.date));
    }

    async getActiveHolidaysByYear(year: number): Promise<HolidayCalendar[]> {
        return db.select().from(schema.holidayCalendar)
            .where(and(
                eq(schema.holidayCalendar.year, year),
                or(
                    eq(schema.holidayCalendar.status, 'active'),
                    eq(schema.holidayCalendar.status, 'forced')
                )
            ))
            .orderBy(asc(schema.holidayCalendar.date));
    }

    async createHoliday(holiday: InsertHolidayCalendar): Promise<HolidayCalendar> {
        const [created] = await db.insert(schema.holidayCalendar).values({ ...holiday, id: nanoid() }).returning();
        return created;
    }

    async updateHoliday(id: string, updates: Partial<HolidayCalendar>): Promise<HolidayCalendar | undefined> {
        const [updated] = await db.update(schema.holidayCalendar).set(updates).where(eq(schema.holidayCalendar.id, id)).returning();
        return updated;
    }

    async deleteHoliday(id: string): Promise<boolean> {
        const result = await db.delete(schema.holidayCalendar).where(eq(schema.holidayCalendar.id, id));
        return (result.rowCount ?? 0) > 0;
    }
}

export const hrRepo = new HrRepository();
