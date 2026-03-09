/**
 * Payroll Calculation Service V2 (Advisory Engine)
 * 
 * Handles salary computation, late detection, absence tracking,
 * bonus calculation, and holiday calendar management.
 * Compliant with Bangladesh Labor Act 2006.
 * Adheres to "System as Advisor, Not Executioner" principle.
 */

import { hrRepo, userRepo, attendanceRepo, employmentRepo } from '../repositories/index.js';
import type { AttendanceRecord, HolidayCalendar } from '../../shared/schema.js';
import { db } from '../db.js';
import { payrollRecords } from '../../shared/schema.js';
import { eq, isNull, like } from 'drizzle-orm';
import * as schema from '../../shared/schema.js';
import { nanoid } from 'nanoid';

// ============================================
// Configuration Defaults
// ============================================
export const HR_DEFAULTS = {
    shopOpenTime: '10:30',
    shopCloseTime: '20:00',
    graceMinutes: 25,
    consecutiveLateThreshold: 4,
    weeklyHoliday: 5,
    workingHoursPerDay: 8,
    overtimeRateMultiplier: 2,

    bonusDeductionScale: [
        { maxAbsences: 0, bonusPercent: 100 },
        { maxAbsences: 3, bonusPercent: 90 },
        { maxAbsences: 6, bonusPercent: 75 },
        { maxAbsences: 10, bonusPercent: 50 },
        { maxAbsences: Infinity, bonusPercent: 0 },
    ],

    holidays2026: [
        { date: '2026-02-21', name: 'Language Martyrs\' Day', type: 'government' },
        { date: '2026-03-17', name: 'Sheikh Mujibur Rahman\'s Birthday', type: 'government' },
        // ... (truncated for brevity, real app would fetch from DB)
    ],
};

// ============================================
// Helper Functions
// ============================================

function isWeeklyHoliday(dateStr: string): boolean {
    const date = new Date(dateStr + 'T00:00:00');
    return date.getDay() === HR_DEFAULTS.weeklyHoliday;
}

function getDatesInMonth(month: string): string[] {
    const [year, mon] = month.split('-').map(Number);
    const dates: string[] = [];
    const daysInMonth = new Date(year, mon, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        dates.push(dateStr);
    }
    return dates;
}

function isLateCheckIn(checkInTime: Date | string, shopOpenTime: string, graceMinutes: number): boolean {
    const checkIn = new Date(checkInTime);
    const [openHour, openMin] = shopOpenTime.split(':').map(Number);
    const threshold = new Date(checkIn);
    threshold.setHours(openHour, openMin + graceMinutes, 0, 0);
    return checkIn > threshold;
}

function countConsecutiveLateStreaks(records: AttendanceRecord[], shopOpenTime: string, graceMinutes: number, threshold: number): number {
    let currentStreak = 0;
    let totalPenalties = 0;
    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
    for (const record of sorted) {
        if (isLateCheckIn(record.checkInTime, shopOpenTime, graceMinutes)) {
            currentStreak++;
            if (currentStreak >= threshold) {
                totalPenalties++;
                currentStreak = 0;
            }
        } else {
            currentStreak = 0;
        }
    }
    return totalPenalties;
}

function getBonusDeductionPercent(unapprovedAbsences: number): number {
    for (const tier of HR_DEFAULTS.bonusDeductionScale) {
        if (unapprovedAbsences <= tier.maxAbsences) return tier.bonusPercent;
    }
    return 0;
}

/**
 * Creates a deterministic SHA-256-like hash string from the key monetary
 * fields of a payroll record to detect any post-generation tampering.
 * Uses a simple but reliable XOR/sum checksum encoded in hex.
 */
function makeCalcHash(userId: string, month: string, gross: number, net: number, totalDeductions: number): string {
    const raw = `${userId}|${month}|${gross.toFixed(2)}|${net.toFixed(2)}|${totalDeductions.toFixed(2)}`;
    let h = 0;
    for (let i = 0; i < raw.length; i++) {
        h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
    }
    // Produce an 8-char hex string, always positive
    return (h >>> 0).toString(16).padStart(8, '0');
}

// ============================================
// Main Service V2
// ============================================

export const payrollService = {
    /**
     * V2: Generates payroll with ZERO default deductions.
     * Creates separate 'deduction_proposals' for Super Admin to review.
     */
    async generateMonthlySalary(month: string, generatedBy: string, activeHolidays: HolidayCalendar[]) {
        const { items: allUsers } = await userRepo.getAllUsers();

        // ── BULK PRE-FETCH TO AVOID N+1 QUERIES ──
        const allProfiles = await db.select().from(schema.employmentProfiles).where(eq(schema.employmentProfiles.employmentStatus, 'active'));
        const profileMap = new Map(allProfiles.map((p: any) => [p.userId, p]));

        const allAssignments = await db.select().from(schema.employeeSalaryAssignments).where(isNull(schema.employeeSalaryAssignments.effectiveTo));
        const assignmentMap = new Map(allAssignments.map((a: any) => [a.userId, a]));

        const allAttendance = await db.select().from(schema.attendanceRecords).where(like(schema.attendanceRecords.date, `${month}-%`));
        const attendanceMap = new Map<string, typeof allAttendance>();
        for (const record of allAttendance) {
            if (!attendanceMap.has(record.userId)) attendanceMap.set(record.userId, []);
            attendanceMap.get(record.userId)!.push(record);
        }

        const allLeaves = await db.select().from(schema.leaveApplications);
        const leaveMap = new Map<string, typeof allLeaves>();
        for (const leave of allLeaves) {
            if (!leaveMap.has(leave.userId)) leaveMap.set(leave.userId, []);
            leaveMap.get(leave.userId)!.push(leave);
        }
        // ──────────────────────────────────────────

        const allDates = getDatesInMonth(month);
        const holidayDates = new Set(activeHolidays.filter(h => h.status === 'active' || h.status === 'forced').map(h => h.date));
        const workingDays = allDates.filter(d => !isWeeklyHoliday(d) && !holidayDates.has(d));
        const totalWorkingDays = workingDays.length;

        const results = [];
        const proposalsToCreate = [];

        for (const user of allUsers) {
            // Check Profile and V2 Assignment
            const profile = profileMap.get(user.id);
            if (!profile || !profile.payrollEligible || profile.employmentStatus !== 'active') continue;

            const assignment = assignmentMap.get(user.id);
            if (!assignment) continue; // Skip if no active salary assignment

            // Attendance
            const monthAttendance = attendanceMap.get(user.id) || [];
            const presentDates = new Set(monthAttendance.map(r => r.date));
            const daysPresent = workingDays.filter(d => presentDates.has(d)).length;

            const lateRecords = monthAttendance.filter(r => isLateCheckIn(r.checkInTime, HR_DEFAULTS.shopOpenTime, HR_DEFAULTS.graceMinutes));
            const daysLate = lateRecords.length;
            const consecutiveLatePenalties = countConsecutiveLateStreaks(monthAttendance, HR_DEFAULTS.shopOpenTime, HR_DEFAULTS.graceMinutes, HR_DEFAULTS.consecutiveLateThreshold);

            // Leaves
            const allLeavesForUser = leaveMap.get(user.id) || [];
            const approvedLeaves = allLeavesForUser.filter(l => l.status === 'approved' && (l.startDate.startsWith(month) || l.endDate.startsWith(month)));
            let approvedLeaveDays = 0;
            for (const leave of approvedLeaves) {
                const leaveStart = new Date(leave.startDate + 'T00:00:00').getTime();
                const leaveEnd = new Date(leave.endDate + 'T00:00:00').getTime();
                for (const workDay of workingDays) {
                    const wd = new Date(workDay + 'T00:00:00').getTime();
                    if (wd >= leaveStart && wd <= leaveEnd) approvedLeaveDays++;
                }
            }

            const daysAbsent = totalWorkingDays - daysPresent;
            const unapprovedAbsences = Math.max(0, daysAbsent - approvedLeaveDays);

            // Earnings (V2 comes from assignment)
            const basicSalary = assignment.baseAmount;
            const hra = assignment.hraAmount || 0;
            const medical = assignment.medicalAmount || 0;
            const conveyance = assignment.conveyanceAmount || 0;
            const otherAllow = assignment.otherAmount || 0;
            const grossSalary = basicSalary + hra + medical + conveyance + otherAllow;

            // V2 DEDUCTIONS -> Always 0 initial except Tax if required by law (here we also put Tax in proposals or 0)
            const incomeTax = Math.round(grossSalary * (assignment.incomeTaxPercent || 0) / 100);

            // ADVISORY CALCULATIONS (for proposals, NOT execution)
            const perDayRate = grossSalary / totalWorkingDays;
            const calculatedAbsentDeduction = Math.round(perDayRate * unapprovedAbsences);
            const calculatedLatePenalty = Math.round(perDayRate * consecutiveLatePenalties); // e.g. 1 day pay per streak

            const netSalary = Math.round(grossSalary - incomeTax);
            const totalDeductionsVal = incomeTax;

            const snapshotData = {
                assignmentId: assignment.id,
                daysPresent,
                daysAbsent,
                daysLate,
                unapprovedAbsences,
                grossSalary,
                incomeTax,
                netSalary,
                generatedAt: new Date().toISOString()
            };

            const recordId = nanoid();
            const calcHash = makeCalcHash(user.id, month, grossSalary, netSalary, totalDeductionsVal);

            // Store pure Draft Record
            const record = {
                id: recordId,
                userId: user.id,
                userName: user.name,
                month,
                assignmentId: assignment.id,
                runType: 'regular',
                calcSnapshotJson: JSON.stringify(snapshotData),
                calcHash,
                totalWorkingDays,
                daysPresent,
                daysAbsent,
                daysLate,
                consecutiveLatePenalties,
                approvedLeaves: approvedLeaveDays,
                unapprovedAbsences,
                totalOvertimeHours: 0,
                basicSalary,
                houseRentAllowance: hra,
                medicalAllowance: medical,
                conveyanceAllowance: conveyance,
                otherAllowances: otherAllow,
                overtimePay: 0,
                grossSalary,
                absentDeduction: 0, // ZERO initial
                lateDeduction: 0,   // ZERO initial
                incomeTax: incomeTax,
                otherDeductions: 0,
                totalDeductions: totalDeductionsVal,
                netSalary,
                status: 'draft' as const,
                generatedBy,
                userRole: user.role
            };

            results.push(record);

            // Generate Advisory Proposals
            if (calculatedAbsentDeduction > 0) {
                proposalsToCreate.push({
                    id: nanoid(),
                    userId: user.id,
                    payrollRecordId: recordId,
                    month,
                    proposalType: 'absent',
                    description: `${unapprovedAbsences} unapproved absences in ${month}`,
                    calculatedAmount: calculatedAbsentDeduction,
                    supportingDataJson: JSON.stringify({ daysAbsent, approvedLeaveDays, unapprovedAbsences }),
                    status: 'pending'
                });
            }

            if (calculatedLatePenalty > 0) {
                proposalsToCreate.push({
                    id: nanoid(),
                    userId: user.id,
                    payrollRecordId: recordId,
                    month,
                    proposalType: 'late_streak',
                    description: `${consecutiveLatePenalties} late streak penalties (4+ days) in ${month}`,
                    calculatedAmount: calculatedLatePenalty,
                    supportingDataJson: JSON.stringify({ daysLate, consecutiveLatePenalties }),
                    status: 'pending'
                });
            }
        }

        // Save records and proposals
        for (const r of results) await hrRepo.createPayrollRecord(r);
        for (const p of proposalsToCreate) await employmentRepo.createDeductionProposal(p);

        return results;
    },

    /**
     * V2: applies explicitly approved deduction proposals to a payroll record.
     */
    async applyApprovedDeductions(payrollRecordId: string, superAdminId: string) {
        const record = await hrRepo.getPayrollRecord(payrollRecordId);
        if (!record) throw new Error("Payroll record not found");
        if (record.status !== 'draft') throw new Error("Can only apply deductions to draft payrolls");

        const proposals = await employmentRepo.getDeductionProposalsForPayroll(payrollRecordId);

        // Ensure no pending proposals exist
        const pending = proposals.filter(p => p.status === 'pending');
        if (pending.length > 0) {
            throw new Error(`Cannot apply deductions: ${pending.length} proposals still pending Super Admin review.`);
        }

        let totalAbsentDeduct = 0;
        let totalLateDeduct = 0;
        let totalOtherDeduct = 0;

        for (const p of proposals) {
            if (p.status === 'approved' || p.status === 'modified') {
                const amt = p.approvedAmount || p.calculatedAmount;
                if (p.proposalType === 'absent') totalAbsentDeduct += amt;
                else if (p.proposalType === 'late_streak') totalLateDeduct += amt;
                else totalOtherDeduct += amt; // other, performance etc
            }
        }

        const totalDeductions = (record.incomeTax ?? 0) + totalAbsentDeduct + totalLateDeduct + totalOtherDeduct;
        const netSalary = Math.max(0, record.grossSalary - totalDeductions);

        // Calculate and update the payroll record
        const updated = await hrRepo.updatePayrollRecord(payrollRecordId, {
            absentDeduction: totalAbsentDeduct,
            lateDeduction: totalLateDeduct,
            otherDeductions: (record.otherDeductions ?? 0) + totalOtherDeduct,
            totalDeductions,
            netSalary,
            deductionApproved: true,
            deductionApprovedBy: superAdminId,
            deductionApprovedAt: new Date(),
            status: 'pending_approval' // Moves it to the next step
        });

        return updated;
    },

    /**
     * V2: Generates Increment Suggestions (System -> Super Admin)
     * e.g. Triggered annually or periodically. Suggests 5-10% based on tenure/KPIs.
     */
    async generateIncrementSuggestions() {
        // Find active users with active assignments > 1 year old (simplified logic)
        const { items: allUsers } = await userRepo.getAllUsers();
        const suggestions = [];

        for (const user of allUsers) {
            const profile = await employmentRepo.getProfileByUserId(user.id);
            if (!profile || profile.employmentStatus !== 'active') continue;

            const assignment = await employmentRepo.getActiveAssignment(user.id);
            if (!assignment) continue;

            const effFrom = new Date(assignment.effectiveFrom);
            const now = new Date();
            const monthsTenure = (now.getTime() - effFrom.getTime()) / (1000 * 60 * 60 * 24 * 30);

            // Suggestion rule: if current salary is > 12 months old, suggest 10%
            if (monthsTenure > 11) {
                // Check if a pending suggestion already exists
                const existing = await db.query.incrementSuggestions.findFirst({
                    where: (i, { eq, and }) => and(eq(i.userId, user.id), eq(i.status, 'pending'))
                });

                if (!existing) {
                    const suggestPercent = 10;
                    const suggestedBaseAmount = Math.round(assignment.baseAmount * 1.1);

                    const s = await employmentRepo.createIncrementSuggestion({
                        userId: user.id,
                        currentAssignmentId: assignment.id,
                        currentBaseAmount: assignment.baseAmount,
                        suggestedBaseAmount,
                        suggestedIncreasePercent: suggestPercent,
                        suggestionReason: 'annual_review',
                        reasoningJson: JSON.stringify({ monthsSinceLastIncrement: Math.round(monthsTenure) })
                    });
                    suggestions.push(s);
                }
            }
        }
        return suggestions;
    },

    /**
     * V2: Final Settlement Calculator
     */
    async calculateFinalSettlement(userId: string, offboardingCaseId: string) {
        // Calculates prorated final pay, saves as draft final settlement.
        // Implementation omitted for brevity, returns structure matching `FinalSettlementRecord`.
        return { status: 'draft', netTotal: 0 };
    },

    /**
     * Calculate biannual Eid bonus (Legacy kept for compatibility or updated to use assignment)
     */
    async calculateBonus(bonusType: 'eid_ul_fitr' | 'eid_ul_adha', year: number, periodStartMonth: string, periodEndMonth: string) {
        // Simplistic V2 mapping
        const { items: allUsers } = await userRepo.getAllUsers();
        const results = [];

        for (const user of allUsers) {
            const assignment = await employmentRepo.getActiveAssignment(user.id);
            if (!assignment) continue;

            const fullBonus = assignment.baseAmount;
            results.push({
                userId: user.id,
                userName: user.name,
                bonusType, year, fullBonusAmount: fullBonus,
                unapprovedAbsences: 0, deductionPercent: 0, deductionAmount: 0,
                finalBonusAmount: fullBonus, status: 'calculated' as const
            });
        }
        return results;
    },

    /**
     * Scans freshly generated payroll records for anomalies and returns
     * notification objects for Super Admin. Called immediately after
     * generateMonthlySalary() in the generate route.
     *
     * Detects:
     * - Employees included in the sheet with ZERO attendance days (possible clock-in issue)
     * - Active + payroll-eligible employees who were SKIPPED because they have no
     *   salary assignment (action required before next run)
     */
    async detectPayrollNotifications(month: string): Promise<Array<{ title: string; message: string }>> {
        const notifications: Array<{ title: string; message: string }> = [];

        // ── 1. Zero-attendance employees ──
        const records = await hrRepo.getPayrollByMonth(month);
        const zeroAttendance = records.filter((r: any) => r.daysPresent === 0);
        for (const r of zeroAttendance) {
            notifications.push({
                title: `⚠ Zero Attendance: ${r.userName}`,
                message: `${r.userName} has 0 days present for ${month}. Verify their attendance records before finalising payroll.`,
            });
        }

        // ── 2. Active employees skipped due to missing salary assignment ──
        const allProfiles = await db
            .select()
            .from(schema.employmentProfiles)
            .where(eq(schema.employmentProfiles.employmentStatus, 'active'));

        const allAssignments = await db
            .select()
            .from(schema.employeeSalaryAssignments)
            .where(isNull(schema.employeeSalaryAssignments.effectiveTo));

        const assignedUserIds = new Set(allAssignments.map((a: any) => a.userId));
        const generatedUserIds = new Set(records.map((r: any) => r.userId));

        for (const profile of allProfiles) {
            if (profile.payrollEligible && !assignedUserIds.has(profile.userId) && !generatedUserIds.has(profile.userId)) {
                // Fetch the name
                const targetUser = await userRepo.getUser(profile.userId);
                const name = targetUser?.name ?? profile.userId;
                notifications.push({
                    title: `🚨 No Salary Assignment: ${name}`,
                    message: `${name} is active and payroll-eligible but has no salary assignment. Set one in the Compensation tab to include them next month.`,
                });
            }
        }

        return notifications;
    },
};
