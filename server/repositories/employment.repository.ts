import { db } from "../db";
import {
    employmentProfiles,
    employeeSalaryAssignments,
    incrementSuggestions,
    deductionProposals,
    InsertEmploymentProfile,
    InsertSalaryAssignment,
    InsertIncrementSuggestion,
    InsertDeductionProposal,
    EmploymentProfile,
    EmployeeSalaryAssignment,
    IncrementSuggestion,
    DeductionProposal,
    users
} from "../../shared/schema";
import { eq, desc, and, isNull, isNotNull } from "drizzle-orm";

export class EmploymentRepository {
    // Profiles
    async getProfileByUserId(userId: string): Promise<EmploymentProfile | undefined> {
        const [profile] = await db.select().from(employmentProfiles).where(eq(employmentProfiles.userId, userId)).limit(1);
        return profile;
    }

    async updateProfile(userId: string, updates: Partial<InsertEmploymentProfile>): Promise<EmploymentProfile | undefined> {
        // Try update first
        const [updated] = await db.update(employmentProfiles)
            .set({ ...updates, updatedAt: new Date() })
            .where(eq(employmentProfiles.userId, userId))
            .returning();

        if (updated) return updated;

        // No existing row — insert as a new profile (upsert behaviour)
        const insertData: any = {
            ...updates,
            userId,
        };
        const [created] = await db.insert(employmentProfiles).values(insertData).returning();
        return created;
    }

    async getAllProfiles(): Promise<EmploymentProfile[]> {
        return db.select().from(employmentProfiles);
    }

    async createProfile(profile: InsertEmploymentProfile): Promise<EmploymentProfile> {
        const [created] = await db.insert(employmentProfiles).values({ id: `emp_${Date.now()}_${profile.userId}`, ...profile }).returning();
        return created;
    }

    // Active Salary Assignment
    async getActiveAssignment(userId: string): Promise<EmployeeSalaryAssignment | undefined> {
        // Current assignment is the one with no effective_to date (or effective_to > now)
        const [assignment] = await db.select()
            .from(employeeSalaryAssignments)
            .where(
                and(
                    eq(employeeSalaryAssignments.userId, userId),
                    isNull(employeeSalaryAssignments.effectiveTo)
                )
            )
            .limit(1);
        return assignment;
    }

    async createSalaryAssignment(assignment: InsertSalaryAssignment): Promise<EmployeeSalaryAssignment> {
        return await db.transaction(async (tx) => {
            // End-date the previous active assignment first
            await tx.update(employeeSalaryAssignments)
                .set({ effectiveTo: new Date().toISOString().split('T')[0] })
                .where(
                    and(
                        eq(employeeSalaryAssignments.userId, assignment.userId),
                        isNull(employeeSalaryAssignments.effectiveTo)
                    )
                );

            const [newAssign] = await tx.insert(employeeSalaryAssignments).values({ id: `assign_${Date.now()}_${assignment.userId}`, ...assignment }).returning();
            return newAssign;
        });
    }

    // Increment Suggestions (Advisory Workflow)
    async getPendingIncrementSuggestions(): Promise<IncrementSuggestion[]> {
        return db.select()
            .from(incrementSuggestions)
            .where(eq(incrementSuggestions.status, 'pending'))
            .orderBy(desc(incrementSuggestions.createdAt));
    }

    async createIncrementSuggestion(suggestion: InsertIncrementSuggestion): Promise<IncrementSuggestion> {
        const [newSuggestion] = await db.insert(incrementSuggestions).values({ id: `inc_${Date.now()}_${suggestion.userId}`, ...suggestion }).returning();
        return newSuggestion;
    }

    async processIncrementSuggestion(
        id: string,
        status: 'approved' | 'modified' | 'dismissed',
        decidedBy: string,
        adminNotes?: string,
        adminDecisionAmount?: number,
        effectiveFrom?: Date
    ): Promise<IncrementSuggestion | undefined> {
        return await db.transaction(async (tx) => {
            const [updated] = await tx.update(incrementSuggestions)
                .set({
                    status,
                    decidedBy,
                    adminNotes,
                    adminDecisionAmount,
                    effectiveFrom: effectiveFrom ? effectiveFrom.toISOString().split('T')[0] : undefined,
                    decidedAt: new Date()
                })
                .where(eq(incrementSuggestions.id, id))
                .returning();

            if ((status === 'approved' || status === 'modified') && updated) {
                // Also create the new salary assignment automatically
                const oldAssign = await tx.select().from(employeeSalaryAssignments).where(eq(employeeSalaryAssignments.id, updated.currentAssignmentId)).limit(1);

                if (oldAssign[0]) {
                    const finalAmount = status === 'modified' && adminDecisionAmount ? adminDecisionAmount : updated.suggestedBaseAmount;

                    // End-date the old
                    await tx.update(employeeSalaryAssignments)
                        .set({ effectiveTo: effectiveFrom ? effectiveFrom.toISOString().split('T')[0] : new Date().toISOString().split('T')[0] })
                        .where(eq(employeeSalaryAssignments.id, updated.currentAssignmentId));

                    // Create the new
                    await tx.insert(employeeSalaryAssignments).values({
                        id: `assign_${Date.now()}_${updated.userId}`,
                        userId: updated.userId,
                        employmentProfileId: oldAssign[0].employmentProfileId,
                        structureId: oldAssign[0].structureId,
                        baseAmount: finalAmount,
                        hraAmount: oldAssign[0].hraAmount ? (finalAmount * 0.5) : 0, // BD Standard ratio
                        medicalAmount: oldAssign[0].medicalAmount ? (finalAmount * 0.1) : 0,
                        conveyanceAmount: oldAssign[0].conveyanceAmount ? (finalAmount * 0.1) : 0,
                        otherAmount: oldAssign[0].otherAmount,
                        incomeTaxPercent: oldAssign[0].incomeTaxPercent,
                        effectiveFrom: updated.effectiveFrom || new Date().toISOString().split('T')[0],
                        changeReason: 'increment',
                        approvedBy: decidedBy,
                        approvedAt: new Date(),
                        createdBy: decidedBy
                    });
                }
            }
            return updated;
        });
    }

    // Deduction Proposals (Advisory Workflow)
    async getPendingDeductionProposals(month?: string): Promise<DeductionProposal[]> {
        let q = db.select().from(deductionProposals).where(eq(deductionProposals.status, 'pending'));
        if (month) {
            q = db.select().from(deductionProposals).where(and(eq(deductionProposals.status, 'pending'), eq(deductionProposals.month, month)));
        }
        return q.orderBy(desc(deductionProposals.createdAt));
    }

    async getDeductionProposalsForPayroll(payrollRecordId: string): Promise<DeductionProposal[]> {
        return db.select()
            .from(deductionProposals)
            .where(eq(deductionProposals.payrollRecordId, payrollRecordId));
    }

    async createDeductionProposal(proposal: InsertDeductionProposal): Promise<DeductionProposal> {
        const [newProposal] = await db.insert(deductionProposals).values({ id: `ded_${Date.now()}_${proposal.userId}`, ...proposal }).returning();
        return newProposal;
    }

    async decideDeductionProposal(
        id: string,
        status: 'approved' | 'modified' | 'dismissed',
        decidedBy: string,
        adminNotes?: string,
        approvedAmount?: number
    ): Promise<DeductionProposal | undefined> {
        const [updated] = await db.update(deductionProposals)
            .set({
                status,
                decidedBy,
                adminNotes,
                approvedAmount: status === 'modified' ? approvedAmount : undefined,
                decidedAt: new Date()
            })
            .where(eq(deductionProposals.id, id))
            .returning();

        // Applying to payroll is done in a separate explicit step by Super Admin (`applyApprovedDeductions`)
        return updated;
    }
}

export const employmentRepo = new EmploymentRepository();
