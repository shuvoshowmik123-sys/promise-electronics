import { db } from "../db";
import {
    offboardingCases,
    finalSettlementRecords,
    InsertOffboardingCase,
    OffboardingCase,
    FinalSettlementRecord,
    employeeSalaryAssignments,
    employmentProfiles
} from "../../shared/schema";
import { eq, desc } from "drizzle-orm";

export class OffboardingRepository {
    async getAllCases(): Promise<OffboardingCase[]> {
        return db.select().from(offboardingCases).orderBy(desc(offboardingCases.createdAt));
    }

    async getCaseByUserId(userId: string): Promise<OffboardingCase | undefined> {
        const [c] = await db.select().from(offboardingCases).where(eq(offboardingCases.userId, userId)).orderBy(desc(offboardingCases.createdAt)).limit(1);
        return c;
    }

    async createCase(data: InsertOffboardingCase): Promise<OffboardingCase> {
        const [newCase] = await db.insert(offboardingCases).values({ id: `case_${Date.now()}_${data.userId}`, ...data }).returning();

        // Auto-update employment profile status to 'on_notice' or 'terminated'
        const status = data.offboardingType === 'termination' ? 'terminated' : 'on_notice';
        await db.update(employmentProfiles)
            .set({
                employmentStatus: status,
                resignationDate: data.offboardingType === 'resignation' ? new Date().toISOString().split('T')[0] : undefined,
                lastWorkingDate: data.lastWorkingDate,
                separationReason: data.offboardingType,
                updatedAt: new Date()
            })
            .where(eq(employmentProfiles.userId, data.userId));

        return newCase;
    }

    async updateCaseStatus(id: string, status: string, approverId?: string): Promise<OffboardingCase | undefined> {
        const [updated] = await db.update(offboardingCases)
            .set({
                status,
                approvedBy: approverId,
                approvedAt: approverId ? new Date() : undefined,
                updatedAt: new Date()
            })
            .where(eq(offboardingCases.id, id))
            .returning();

        // If closed or paid, mark profile as resigned
        if (updated && (status === 'closed' || status === 'paid')) {
            await db.update(employmentProfiles)
                .set({ employmentStatus: updated.offboardingType === 'termination' ? 'terminated' : 'resigned' })
                .where(eq(employmentProfiles.userId, updated.userId));

            // End-date the active salary assignment via effectiveTo = lastWorkingDate
            if (updated.lastWorkingDate) {
                await db.update(employeeSalaryAssignments)
                    .set({ effectiveTo: updated.lastWorkingDate })
                    .where(eq(employeeSalaryAssignments.userId, updated.userId));
            }
        }

        return updated;
    }

    // Final Settlement
    async getFinalSettlementForCase(caseId: string): Promise<FinalSettlementRecord | undefined> {
        const [record] = await db.select().from(finalSettlementRecords).where(eq(finalSettlementRecords.offboardingCaseId, caseId)).limit(1);
        return record;
    }

    async saveFinalSettlement(record: any): Promise<FinalSettlementRecord> {
        const [newRec] = await db.insert(finalSettlementRecords).values(record).returning();
        await db.update(offboardingCases)
            .set({ status: 'settlement_generated', updatedAt: new Date() })
            .where(eq(offboardingCases.id, record.offboardingCaseId));
        return newRec;
    }
}

export const offboardingRepo = new OffboardingRepository();
