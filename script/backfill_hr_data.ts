import { db } from "../server/db";
import {
    employmentProfiles,
    salaryComponents,
    salaryStructures,
    salaryStructureLines,
    employeeSalaryAssignments,
    users,
    staffSalaryConfig
} from "../shared/schema";
import { inArray, eq } from "drizzle-orm";

async function backfillHRData() {
    console.log("Starting HR Re-Architecture Backfill...");

    try {
        // 1. Seed Salary Components
        console.log("Seeding Salary Components...");
        const components = [
            { id: 'comp_basic', code: 'BASIC', name: 'Basic Salary', componentType: 'earning', calcMode: 'fixed', defaultPercent: null, displayOrder: 1 },
            { id: 'comp_hra', code: 'HRA', name: 'House Rent Allowance', componentType: 'earning', calcMode: 'percent_of_basic', defaultPercent: 50, displayOrder: 2 },
            { id: 'comp_medical', code: 'MEDICAL', name: 'Medical Allowance', componentType: 'earning', calcMode: 'percent_of_basic', defaultPercent: 10, displayOrder: 3 },
            { id: 'comp_conveyance', code: 'CONVEYANCE', name: 'Conveyance Allowance', componentType: 'earning', calcMode: 'percent_of_basic', defaultPercent: 10, displayOrder: 4 },
            { id: 'comp_other', code: 'OTHER', name: 'Other Allowances', componentType: 'earning', calcMode: 'fixed', defaultPercent: null, displayOrder: 5 },
            { id: 'comp_tax', code: 'INCOME_TAX', name: 'Income Tax', componentType: 'deduction', calcMode: 'percent_of_gross', defaultPercent: null, displayOrder: 10 },
        ];
        for (const comp of components) {
            await db.insert(salaryComponents).values(comp).onConflictDoNothing({ target: salaryComponents.code });
        }

        // 2. Seed BD Standard Structure
        console.log("Seeding Salary Structure...");
        await db.insert(salaryStructures).values({
            id: 'struct_bd_std', code: 'BD_STANDARD_FIXED', name: 'BD Standard Fixed Salary'
        }).onConflictDoNothing({ target: salaryStructures.code });

        console.log("Seeding Salary Structure Lines...");
        const lines = [
            { id: 'sl_1', structureId: 'struct_bd_std', componentId: 'comp_basic', sequence: 1, isMandatory: true },
            { id: 'sl_2', structureId: 'struct_bd_std', componentId: 'comp_hra', sequence: 2, isMandatory: true },
            { id: 'sl_3', structureId: 'struct_bd_std', componentId: 'comp_medical', sequence: 3, isMandatory: true },
            { id: 'sl_4', structureId: 'struct_bd_std', componentId: 'comp_conveyance', sequence: 4, isMandatory: true },
            { id: 'sl_5', structureId: 'struct_bd_std', componentId: 'comp_other', sequence: 5, isMandatory: false },
            { id: 'sl_6', structureId: 'struct_bd_std', componentId: 'comp_tax', sequence: 6, isMandatory: false },
        ];
        for (const line of lines) {
            await db.insert(salaryStructureLines).values(line).onConflictDoNothing({ target: salaryStructureLines.id });
        }

        // 3. Backfill Employment Profiles
        console.log("Backfilling Employment Profiles...");
        const nonCustomerUsers = await db.select().from(users).where(
            inArray(users.role, ['Super Admin', 'Manager', 'Cashier', 'Technician', 'Corporate'])
        );

        // Fetch existing salary configs to determine status
        const allSalaryConfigs = await db.select().from(staffSalaryConfig);
        const usersWithSalary = new Set(allSalaryConfigs.map(c => c.userId));

        for (let i = 0; i < nonCustomerUsers.length; i++) {
            const u = nonCustomerUsers[i];
            const isPayrollEligible = !['Super Admin', 'Corporate'].includes(u.role);
            let status = 'pending_compensation';
            if (u.role === 'Super Admin' || usersWithSalary.has(u.id)) {
                status = 'active';
            }

            await db.insert(employmentProfiles).values({
                id: `emp_${u.id}`,
                userId: u.id,
                employeeCode: `PE-${i + 1}`,
                employmentStatus: status,
                joinDate: u.joinedAt ? u.joinedAt.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                payrollEligible: isPayrollEligible,
            }).onConflictDoNothing({ target: employmentProfiles.userId });
        }

        // 4. Backfill Salary Assignments
        console.log("Backfilling Salary Assignments from staff_salary_config...");
        for (const ssc of allSalaryConfigs) {
            await db.insert(employeeSalaryAssignments).values({
                id: `assign_${ssc.id}`,
                userId: ssc.userId,
                employmentProfileId: `emp_${ssc.userId}`,
                structureId: 'struct_bd_std',
                baseAmount: ssc.basicSalary,
                hraAmount: ssc.houseRentAllowance,
                medicalAmount: ssc.medicalAllowance,
                conveyanceAmount: ssc.conveyanceAllowance,
                otherAmount: ssc.otherAllowances || 0,
                incomeTaxPercent: ssc.incomeTaxPercent || 0,
                effectiveFrom: (ssc.effectiveFrom || ssc.createdAt).toISOString().split('T')[0],
                changeReason: 'new_hire',
                createdAt: ssc.createdAt
            }).onConflictDoNothing({ target: employeeSalaryAssignments.id });
        }

        console.log("Backfill completed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Backfill failed:", error);
        process.exit(1);
    }
}

backfillHRData();
