/**
 * Analytics Repository
 * 
 * Handles reporting, dashboard statistics, and analytics queries.
 * These are typically read-only aggregation queries.
 */

import { db, eq, or, and, gte, lte, lt, count, sum, schema, type JobTicket } from './base.js';

// ============================================
// Dashboard Statistics
// ============================================

export async function getDashboardStats(): Promise<{
    totalRevenue: number;
    revenueChange: number;
    activeJobs: number;
    pendingServiceRequests: number;
    lowStockItems: number;
    jobStatusDistribution: { name: string; value: number }[];
    weeklyRevenue: { name: string; revenue: number }[];
}> {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
        activeJobsResult,
        pendingRequestsResult,
        lowStockResult,
        thisMonthRevenueResult,
        lastMonthRevenueResult,
        jobStatusResult
    ] = await Promise.all([
        // Active Jobs
        db.select({ count: count() })
            .from(schema.jobTickets)
            .where(or(eq(schema.jobTickets.status, "Pending"), eq(schema.jobTickets.status, "In Progress"))),

        // Pending Service Requests
        db.select({ count: count() })
            .from(schema.serviceRequests)
            .where(eq(schema.serviceRequests.status, "Pending")),

        // Low Stock Items
        db.select({ count: count() })
            .from(schema.inventoryItems)
            .where(eq(schema.inventoryItems.status, "Low Stock")),

        // This Month Revenue
        db.select({ revenue: sum(schema.posTransactions.total) })
            .from(schema.posTransactions)
            .where(gte(schema.posTransactions.createdAt, thisMonthStart)),

        // Last Month Revenue
        db.select({ revenue: sum(schema.posTransactions.total) })
            .from(schema.posTransactions)
            .where(and(
                gte(schema.posTransactions.createdAt, lastMonthStart),
                lte(schema.posTransactions.createdAt, lastMonthEnd)
            )),

        // Job Status Distribution
        db.select({ status: schema.jobTickets.status, count: count() })
            .from(schema.jobTickets)
            .groupBy(schema.jobTickets.status),
    ]);

    const activeJobs = Number(activeJobsResult[0]?.count || 0);
    const pendingServiceRequests = Number(pendingRequestsResult[0]?.count || 0);
    const lowStockItems = Number(lowStockResult[0]?.count || 0);
    const thisMonthRevenue = Number(thisMonthRevenueResult[0]?.revenue || 0);
    const lastMonthRevenue = Number(lastMonthRevenueResult[0]?.revenue || 0);

    const revenueChange = lastMonthRevenue > 0
        ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
        : 0;

    const jobStatusDistribution = jobStatusResult.map(r => ({
        name: r.status || "Unknown",
        value: Number(r.count)
    }));

    // Weekly Revenue (last 7 days)
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weeklyRevenuePromises = [];

    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);

        weeklyRevenuePromises.push(
            db.select({ revenue: sum(schema.posTransactions.total) })
                .from(schema.posTransactions)
                .where(and(
                    gte(schema.posTransactions.createdAt, date),
                    lt(schema.posTransactions.createdAt, nextDate)
                ))
                .then(res => ({
                    name: dayNames[date.getDay()],
                    revenue: Math.round(Number(res[0]?.revenue || 0))
                }))
        );
    }

    const weeklyRevenue = await Promise.all(weeklyRevenuePromises);

    return {
        totalRevenue: Math.round(thisMonthRevenue),
        revenueChange: Math.round(revenueChange * 10) / 10,
        activeJobs,
        pendingServiceRequests,
        lowStockItems,
        jobStatusDistribution,
        weeklyRevenue,
    };
}

// ============================================
// Job Overview (Live Stats)
// ============================================

export async function getJobOverview(): Promise<{
    dueToday: JobTicket[];
    dueTomorrow: JobTicket[];
    dueThisWeek: JobTicket[];
    readyForDelivery: JobTicket[];
    technicianWorkloads: { technician: string; jobs: JobTicket[] }[];
    stats: {
        totalDueToday: number;
        totalDueTomorrow: number;
        totalDueThisWeek: number;
        totalReadyForDelivery: number;
        totalInProgress: number;
    };
}> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    const endOfWeek = new Date(today);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const allJobs = await db.select().from(schema.jobTickets);
    const activeJobs = allJobs.filter(j => j.status !== 'Completed' && j.status !== 'Cancelled');

    // Filter jobs by deadline
    const dueToday = activeJobs.filter(j => {
        if (!j.deadline) return false;
        const deadline = new Date(j.deadline);
        return deadline >= today && deadline < tomorrow;
    });

    const dueTomorrow = activeJobs.filter(j => {
        if (!j.deadline) return false;
        const deadline = new Date(j.deadline);
        return deadline >= tomorrow && deadline < dayAfterTomorrow;
    });

    const dueThisWeek = activeJobs.filter(j => {
        if (!j.deadline) return false;
        const deadline = new Date(j.deadline);
        return deadline >= today && deadline < endOfWeek;
    });

    const readyForDelivery = allJobs.filter(j => j.status === 'Completed');

    const inProgress = allJobs.filter(j => j.status === 'In Progress');

    // Group by technician
    const technicianMap = new Map<string, JobTicket[]>();
    activeJobs.forEach(job => {
        const tech = job.technician || 'Unassigned';
        const jobs = technicianMap.get(tech) || [];
        jobs.push(job);
        technicianMap.set(tech, jobs);
    });

    const technicianWorkloads = Array.from(technicianMap.entries()).map(([technician, jobs]) => ({
        technician,
        jobs,
    }));

    return {
        dueToday,
        dueTomorrow,
        dueThisWeek,
        readyForDelivery,
        technicianWorkloads,
        stats: {
            totalDueToday: dueToday.length,
            totalDueTomorrow: dueTomorrow.length,
            totalDueThisWeek: dueThisWeek.length,
            totalReadyForDelivery: readyForDelivery.length,
            totalInProgress: inProgress.length,
        },
    };
}

// ============================================
// Report Data
// ============================================

export async function getReportData(startDate: Date, endDate: Date): Promise<{
    monthlyFinancials: { name: string; income: number; expense: number; repairs: number }[];
    technicianPerformance: { name: string; tasks: number; efficiency: number }[];
    activityLogs: { action: string; user: string; time: Date; type: string }[];
    summary: { totalRevenue: number; totalRepairs: number; totalStaff: number };
}> {
    // Get transactions for the date range
    const transactions = await db
        .select()
        .from(schema.posTransactions)
        .where(and(
            gte(schema.posTransactions.createdAt, startDate),
            lte(schema.posTransactions.createdAt, endDate)
        ));

    // Get petty cash for expenses
    const pettyCash = await db
        .select()
        .from(schema.pettyCashRecords)
        .where(and(
            gte(schema.pettyCashRecords.createdAt, startDate),
            lte(schema.pettyCashRecords.createdAt, endDate)
        ));

    // Get jobs for repairs
    const jobs = await db
        .select()
        .from(schema.jobTickets)
        .where(and(
            gte(schema.jobTickets.createdAt, startDate),
            lte(schema.jobTickets.createdAt, endDate)
        ));

    // Get all users
    const users = await db.select().from(schema.users);
    const technicians = users.filter(u => u.role === "Technician");
    const staff = users.filter(u => u.role !== "Customer");

    // Calculate monthly financials
    const monthlyMap = new Map<string, { income: number; expense: number; repairs: number }>();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    transactions.forEach(t => {
        const date = new Date(t.createdAt);
        const monthKey = months[date.getMonth()];
        const current = monthlyMap.get(monthKey) || { income: 0, expense: 0, repairs: 0 };
        current.income += t.total;
        monthlyMap.set(monthKey, current);
    });

    pettyCash.forEach(p => {
        const date = new Date(p.createdAt);
        const monthKey = months[date.getMonth()];
        const current = monthlyMap.get(monthKey) || { income: 0, expense: 0, repairs: 0 };
        if (p.type === "Expense") {
            current.expense += Math.abs(p.amount);
        } else {
            current.income += p.amount;
        }
        monthlyMap.set(monthKey, current);
    });

    jobs.forEach(j => {
        const date = new Date(j.createdAt);
        const monthKey = months[date.getMonth()];
        const current = monthlyMap.get(monthKey) || { income: 0, expense: 0, repairs: 0 };
        current.repairs += 1;
        monthlyMap.set(monthKey, current);
    });

    const monthlyFinancials = Array.from(monthlyMap.entries()).map(([name, data]) => ({
        name,
        income: Math.round(data.income),
        expense: Math.round(data.expense),
        repairs: data.repairs,
    }));

    // Technician performance
    const techMap = new Map<string, { tasks: number; completed: number }>();
    jobs.forEach(job => {
        const tech = job.technician || 'Unassigned';
        const current = techMap.get(tech) || { tasks: 0, completed: 0 };
        current.tasks += 1;
        if (job.status === 'Completed') current.completed += 1;
        techMap.set(tech, current);
    });

    const technicianPerformance = Array.from(techMap.entries()).map(([name, data]) => ({
        name,
        tasks: data.tasks,
        efficiency: data.tasks > 0 ? Math.round((data.completed / data.tasks) * 100) : 0,
    }));

    // Summary
    const totalRevenue = transactions.reduce((sum, t) => sum + t.total, 0);
    const totalRepairs = jobs.length;
    const totalStaff = staff.length;

    return {
        monthlyFinancials,
        technicianPerformance,
        activityLogs: [], // Would need activity log table
        summary: {
            totalRevenue: Math.round(totalRevenue),
            totalRepairs,
            totalStaff,
        },
    };
}
