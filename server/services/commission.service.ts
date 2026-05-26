/**
 * Commission Engine (Phase 2.4)
 *
 * Two-pool split logic:
 * - Corporate pool: Marketing Manager + Admin roles
 * - Operational pool: Chat Handler + Technician + Pickup agent
 *
 * Fires when job paymentStatus transitions to 'paid'.
 * Reads commission_assignments for the job, applies commission_rules percentages,
 * writes commission_payouts records.
 */
import { db } from "../db.js";
import { eq, and } from "drizzle-orm";
import { commissionRules, commissionAssignments, commissionPayouts } from "../../shared/schema.js";
import { nanoid } from "nanoid";

export type CommissionPool = "operational" | "corporate";

export interface CommissionBreakdown {
    userId: string;
    role: string;
    pool: CommissionPool;
    percentage: number;
    amount: number;
}

/**
 * Calculate and persist commission payouts for a job that just got paid.
 * Idempotent: existing payouts for the job are deleted and recalculated.
 */
export async function processJobCommission(jobId: string, jobTotal: number): Promise<CommissionBreakdown[]> {
    if (jobTotal <= 0) return [];

    // Load assignments for this job
    const assignments = await db
        .select()
        .from(commissionAssignments)
        .where(eq(commissionAssignments.jobId, jobId));

    if (!assignments.length) return [];

    // Load active commission rules
    const rules = await db
        .select()
        .from(commissionRules)
        .where(eq(commissionRules.active, true));

    const ruleMap = new Map(rules.map(r => [`${r.role}:${r.pool}`, r.percentage]));

    // Delete existing payouts for idempotency
    await db.delete(commissionPayouts).where(eq(commissionPayouts.jobId, jobId));

    const breakdowns: CommissionBreakdown[] = [];

    for (const assignment of assignments) {
        const key = `${assignment.role}:${assignment.pool}`;
        const percentage = ruleMap.get(key) ?? 0;
        if (percentage <= 0) continue;

        const amount = parseFloat(((jobTotal * percentage) / 100).toFixed(2));

        await db.insert(commissionPayouts).values({
            id: nanoid(),
            jobId,
            userId: assignment.userId,
            role: assignment.role,
            pool: assignment.pool as CommissionPool,
            amount,
            percentage,
            jobTotal,
            status: "pending",
            createdAt: new Date(),
        });

        breakdowns.push({
            userId: assignment.userId,
            role: assignment.role,
            pool: assignment.pool as CommissionPool,
            percentage,
            amount,
        });
    }

    return breakdowns;
}

/**
 * Assign staff to a job for commission tracking.
 * Call this when a job is created or updated.
 */
export async function setJobCommissionAssignments(
    jobId: string,
    assignments: Array<{ userId: string; role: string; pool: CommissionPool }>
): Promise<void> {
    // Remove existing assignments
    await db.delete(commissionAssignments).where(eq(commissionAssignments.jobId, jobId));

    if (!assignments.length) return;

    await db.insert(commissionAssignments).values(
        assignments.map(a => ({
            id: nanoid(),
            jobId,
            userId: a.userId,
            role: a.role,
            pool: a.pool,
            createdAt: new Date(),
        }))
    );
}

/**
 * Get a user's commission summary: pending + paid totals.
 */
export async function getUserCommissionSummary(userId: string) {
    const payouts = await db
        .select()
        .from(commissionPayouts)
        .where(eq(commissionPayouts.userId, userId));

    const pending = payouts.filter(p => p.status === "pending").reduce((s, p) => s + (p.amount ?? 0), 0);
    const paid = payouts.filter(p => p.status === "paid").reduce((s, p) => s + (p.amount ?? 0), 0);
    const total = pending + paid;

    return { pending, paid, total, count: payouts.length };
}

/**
 * Mark commission payouts as paid (bulk).
 */
export async function markPayoutsAsPaid(payoutIds: string[]): Promise<void> {
    for (const id of payoutIds) {
        await db
            .update(commissionPayouts)
            .set({ status: "paid", paidAt: new Date() })
            .where(eq(commissionPayouts.id, id));
    }
}

/**
 * Seed default commission rules if none exist.
 * Call once on app startup.
 */
export async function seedDefaultCommissionRules(): Promise<void> {
    const existing = await db.select().from(commissionRules);
    if (existing.length > 0) return;

    const defaults = [
        // Operational pool
        { role: "Technician", pool: "operational", percentage: 10, description: "Primary technician - 10% of job total" },
        { role: "ChatHandler", pool: "operational", percentage: 3, description: "Chat/Messenger handler - 3% of job total" },
        { role: "PickupAgent", pool: "operational", percentage: 2, description: "Pickup/delivery agent - 2% of job total" },
        // Corporate pool
        { role: "Manager", pool: "corporate", percentage: 5, description: "Marketing manager - 5% of corporate jobs" },
        { role: "Admin", pool: "corporate", percentage: 2, description: "Admin oversight - 2% of corporate jobs" },
    ];

    await db.insert(commissionRules).values(
        defaults.map(d => ({
            id: nanoid(),
            ...d,
            pool: d.pool as CommissionPool,
            active: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        }))
    );
}
