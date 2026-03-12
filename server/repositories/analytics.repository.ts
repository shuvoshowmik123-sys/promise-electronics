/**
 * Analytics Repository
 * 
 * Handles reporting, dashboard statistics, and analytics queries.
 * These are typically read-only aggregation queries.
 */

import { db, eq, or, and, gte, lte, lt, count, sum, desc, sql, schema, notInArray, type JobTicket } from './base.js';
import * as jobRepo from './job.repository.js';

const ACTIVE_JOB_STATUSES = ['In Progress', 'Diagnosing', 'Repairing'] as const;
const PENDING_JOB_STATUSES = ['Pending', 'Waiting for Parts', 'Approval Requested'] as const;

type DashboardJobSummary = {
    id: string;
    ticketNumber: string;
    deviceModel: string;
    problemDescription: string;
    technician: string | null;
    status: string;
    customerName: string;
    createdAt: Date | null;
    updatedAt: Date | null;
};

function toDashboardJobSummary(job: JobTicket): DashboardJobSummary {
    return {
        id: job.id,
        ticketNumber: job.corporateJobNumber || job.id,
        deviceModel: job.device || '—',
        problemDescription: job.issue || 'No description',
        technician: job.technician || null,
        status: job.status,
        customerName: job.customer || '—',
        createdAt: job.createdAt ?? null,
        // Job tickets do not currently expose a dedicated updatedAt field.
        // Use the most recent known operational timestamp and fall back to creation time.
        updatedAt: job.lastPaymentAt ?? job.paidAt ?? job.completedAt ?? job.createdAt ?? null,
    };
}

function isDateWithinRange(value: Date | null | undefined, startDate: Date, endDate: Date) {
    if (!value) return false;
    const date = value instanceof Date ? value : new Date(value);
    return date >= startDate && date <= endDate;
}

function toDateKey(value: Date) {
    return value.toISOString().slice(0, 10);
}

function safelyParseJsonArray(raw: string | null | undefined) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

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
        allJobs,
        pendingRequestsResult,
        lowStockResult,
        thisMonthRevenueResult,
        lastMonthRevenueResult
    ] = await Promise.all([
        jobRepo.getAllJobTickets(),
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
    ]);

    const activeJobs = allJobs.filter((job) => job.status === "Pending" || job.status === "In Progress").length;
    const pendingServiceRequests = Number(pendingRequestsResult[0]?.count || 0);
    const lowStockItems = Number(lowStockResult[0]?.count || 0);
    const thisMonthRevenue = Number(thisMonthRevenueResult[0]?.revenue || 0);
    const lastMonthRevenue = Number(lastMonthRevenueResult[0]?.revenue || 0);

    const revenueChange = lastMonthRevenue > 0
        ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
        : 0;

    const jobStatusCounts = new Map<string, number>();
    allJobs.forEach((job) => {
        const status = job.status || "Unknown";
        jobStatusCounts.set(status, (jobStatusCounts.get(status) || 0) + 1);
    });

    const jobStatusDistribution = Array.from(jobStatusCounts.entries()).map(([name, value]) => ({
        name,
        value,
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
// Comprehensive Full-Scale Dashboard
// ============================================

export async function getComprehensiveDashboard() {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthLabels = Array.from({ length: 6 }, (_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
        return {
            key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
            name: date.toLocaleString('default', { month: 'short' }),
        };
    });

    const [
        allJobs,
        lowStockItemsList,
        monthlyRevenueRows,
        currentMonthRevenueResult,
        currentMonthCorporateRevenueResult,
        currentMonthWastageSummary,
    ] = await Promise.all([
        jobRepo.getAllJobTickets(),
        db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.status, "Low Stock")),
        db.select({
            month: sql<string>`to_char(date_trunc('month', ${schema.posTransactions.createdAt}), 'YYYY-MM')`,
            total: sql<string>`coalesce(sum(${schema.posTransactions.total}), 0)`,
        })
            .from(schema.posTransactions)
            .where(gte(schema.posTransactions.createdAt, sixMonthsAgo))
            .groupBy(sql`date_trunc('month', ${schema.posTransactions.createdAt})`)
            .orderBy(sql`date_trunc('month', ${schema.posTransactions.createdAt})`),
        db.select({
            total: sql<string>`coalesce(sum(${schema.posTransactions.total}), 0)`,
        })
            .from(schema.posTransactions)
            .where(gte(schema.posTransactions.createdAt, thisMonthStart)),
        db.select({
            total: sql<string>`coalesce(sum(${schema.posTransactions.total}), 0)`,
        })
            .from(schema.posTransactions)
            .where(and(
                gte(schema.posTransactions.createdAt, thisMonthStart),
                eq(schema.posTransactions.paymentMethod, 'Corporate'),
            )),
        db.select({
            count: count(),
            totalLoss: sql<string>`coalesce(sum(${schema.wastageLogs.financialLoss}), 0)`,
        })
            .from(schema.wastageLogs)
            .where(gte(schema.wastageLogs.createdAt, thisMonthStart)),
    ]);
    const activeJobs = allJobs
        .filter((job) => ACTIVE_JOB_STATUSES.includes(job.status as (typeof ACTIVE_JOB_STATUSES)[number]))
        .slice(0, 5);
    const recentJobs = allJobs.slice(0, 6);
    const pendingRequests = allJobs
        .filter((job) => PENDING_JOB_STATUSES.includes(job.status as (typeof PENDING_JOB_STATUSES)[number]))
        .slice(0, 5);

    const activeJobsAll = allJobs.filter((job) => ACTIVE_JOB_STATUSES.includes(job.status as (typeof ACTIVE_JOB_STATUSES)[number]));
    const activeCount = activeJobsAll.length;
    const pendingCount = allJobs.filter((job) => PENDING_JOB_STATUSES.includes(job.status as (typeof PENDING_JOB_STATUSES)[number])).length;

    const jobStatusCounts = new Map<string, number>();
    const technicianWorkloadCounts = new Map<string, number>();

    allJobs.forEach((job) => {
        const status = job.status || "Unknown";
        jobStatusCounts.set(status, (jobStatusCounts.get(status) || 0) + 1);

        if (ACTIVE_JOB_STATUSES.includes(status as (typeof ACTIVE_JOB_STATUSES)[number])) {
            const technician = job.technician || "Unassigned";
            technicianWorkloadCounts.set(technician, (technicianWorkloadCounts.get(technician) || 0) + 1);
        }
    });

    const revenueByMonth = new Map(monthlyRevenueRows.map((row) => [row.month, Number(row.total || 0)]));
    const revenueData = monthLabels.map(({ key, name }) => ({
        name,
        value: revenueByMonth.get(key) || 0,
    }));
    const totalRevenue = Number(currentMonthRevenueResult[0]?.total || 0);
    const corporateRevenueThisMonth = Number(currentMonthCorporateRevenueResult[0]?.total || 0);
    const posRevenueThisMonth = totalRevenue - corporateRevenueThisMonth;
    const totalWastageLoss = Number(currentMonthWastageSummary[0]?.totalLoss || 0);
    const wastageCount = Number(currentMonthWastageSummary[0]?.count || 0);
    const jobStatusData = Array.from(jobStatusCounts.entries()).map(([name, value]) => ({
        name,
        value,
    }));
    const techData = Array.from(technicianWorkloadCounts.entries())
        .map(([name, jobs]) => ({ name, jobs }))
        .sort((a, b) => b.jobs - a.jobs)
        .slice(0, 8);

    return {
        revenueData,
        jobStatusData,
        techData,
        lowStockItems: lowStockItemsList,
        activeJobsList: activeJobs.map(toDashboardJobSummary),
        pendingJobsList: pendingRequests.map(toDashboardJobSummary),
        recentJobs: recentJobs.map(toDashboardJobSummary),
        totalRevenue,
        posRevenueThisMonth,
        corporateRevenueThisMonth,
        totalWastageLoss,
        activeCount,
        pendingCount,
        lowStockCount: lowStockItemsList.length,
        wastageCount
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

    const allJobs = await jobRepo.getAllJobTickets();
    const activeJobs = allJobs.filter((job) => !['Completed', 'Cancelled'].includes(job.status));

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

    const readyForDelivery = allJobs.filter((job) => job.status === 'Completed').slice(0, 25);
    const totalReadyForDelivery = allJobs.filter((job) => job.status === 'Completed').length;

    const inProgress = activeJobs.filter(j => j.status === 'In Progress');

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
            totalReadyForDelivery: totalReadyForDelivery,
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
    const jobs = (await jobRepo.getAllJobTickets()).filter((job) => (
        isDateWithinRange(job.createdAt, startDate, endDate)
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

export async function getRevenueStats(startDate: Date, endDate: Date): Promise<{
    date: string;
    service: number;
    retail: number;
    corporate: number;
}[]> {
    const transactions = await db.select().from(schema.posTransactions).where(and(
        gte(schema.posTransactions.createdAt, startDate),
        lte(schema.posTransactions.createdAt, endDate)
    ));

    const revenueMap = new Map<string, { date: string; service: number; retail: number; corporate: number }>();

    for (const transaction of transactions) {
        const date = toDateKey(new Date(transaction.createdAt));
        const current = revenueMap.get(date) || { date, service: 0, retail: 0, corporate: 0 };
        const linkedJobs = safelyParseJsonArray(transaction.linkedJobs);
        const amount = Number(transaction.total || 0);

        if (linkedJobs.length > 0) {
            current.service += amount;
        } else if (transaction.paymentMethod === 'Corporate') {
            current.corporate += amount;
        } else {
            current.retail += amount;
        }

        revenueMap.set(date, current);
    }

    return Array.from(revenueMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getJobStats(startDate: Date, endDate: Date): Promise<{
    totalJobs: number;
    completedJobs: number;
    statusDistribution: { name: string; value: number }[];
}> {
    const jobs = (await jobRepo.getAllJobTickets()).filter((job) => (
        isDateWithinRange(job.createdAt, startDate, endDate)
        || isDateWithinRange(job.completedAt, startDate, endDate)
    ));

    const statusCounts = new Map<string, number>();
    let completedJobs = 0;

    for (const job of jobs) {
        const status = job.status || 'Unknown';
        statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
        if (status === 'Completed' || isDateWithinRange(job.completedAt, startDate, endDate)) {
            completedJobs += 1;
        }
    }

    return {
        totalJobs: jobs.length,
        completedJobs,
        statusDistribution: Array.from(statusCounts.entries()).map(([name, value]) => ({ name, value })),
    };
}

export async function getTechnicianStats(startDate: Date, endDate: Date): Promise<{
    name: string;
    completedJobs: number;
    efficiency: number;
}[]> {
    const jobs = await jobRepo.getAllJobTickets();
    const technicianMap = new Map<string, { assignedJobs: number; completedJobs: number }>();

    for (const job of jobs) {
        const technician = job.technician?.trim();
        if (!technician) continue;

        const isRelevant = isDateWithinRange(job.createdAt, startDate, endDate)
            || isDateWithinRange(job.completedAt, startDate, endDate);
        if (!isRelevant) continue;

        const current = technicianMap.get(technician) || { assignedJobs: 0, completedJobs: 0 };
        current.assignedJobs += 1;
        if (job.status === 'Completed' || isDateWithinRange(job.completedAt, startDate, endDate)) {
            current.completedJobs += 1;
        }
        technicianMap.set(technician, current);
    }

    return Array.from(technicianMap.entries())
        .map(([name, data]) => ({
            name,
            completedJobs: data.completedJobs,
            efficiency: data.assignedJobs > 0
                ? Math.round((data.completedJobs / data.assignedJobs) * 100)
                : 0,
        }))
        .sort((a, b) => b.completedJobs - a.completedJobs);
}

export async function getCustomerStats(startDate: Date, endDate: Date): Promise<{
    newCustomers: number;
}> {
    const result = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM users
        WHERE role = 'Customer'
          AND joined_at >= ${startDate}
          AND joined_at <= ${endDate}
    `);

    const countValue = Number((result as any)?.rows?.[0]?.count || 0);

    return {
        newCustomers: countValue,
    };
}

export async function getDefectStats(startDate: Date, endDate: Date): Promise<{
    name: string;
    value: number;
}[]> {
    const logs = await db.select().from(schema.wastageLogs).where(and(
        gte(schema.wastageLogs.createdAt, startDate),
        lte(schema.wastageLogs.createdAt, endDate)
    ));

    const defectMap = new Map<string, number>();

    for (const log of logs) {
        const reason = log.reason || 'Other';
        defectMap.set(reason, (defectMap.get(reason) || 0) + Number(log.quantity || 1));
    }

    return Array.from(defectMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
}

export async function getSupplierDefectStats(startDate: Date, endDate: Date): Promise<{
    supplier: string;
    defectCount: number;
    financialLoss: number;
}[]> {
    const [logs, inventoryItems] = await Promise.all([
        db.select().from(schema.wastageLogs).where(and(
            gte(schema.wastageLogs.createdAt, startDate),
            lte(schema.wastageLogs.createdAt, endDate)
        )),
        db.select({
            id: schema.inventoryItems.id,
            preferredSupplier: schema.inventoryItems.preferredSupplier,
        }).from(schema.inventoryItems),
    ]);

    const supplierByInventoryItem = new Map(inventoryItems.map((item) => [
        item.id,
        item.preferredSupplier || 'Unknown Supplier'
    ]));
    const supplierMap = new Map<string, { supplier: string; defectCount: number; financialLoss: number }>();

    for (const log of logs) {
        if (!/factory defect|doa/i.test(log.reason || '')) continue;

        const supplier = supplierByInventoryItem.get(log.inventoryItemId) || 'Unknown Supplier';
        const current = supplierMap.get(supplier) || {
            supplier,
            defectCount: 0,
            financialLoss: 0,
        };

        current.defectCount += Number(log.quantity || 1);
        current.financialLoss += Number(log.financialLoss || 0);
        supplierMap.set(supplier, current);
    }

    return Array.from(supplierMap.values()).sort((a, b) => b.defectCount - a.defectCount);
}

export async function getTechnicianPerformanceStats(startDate: Date, endDate: Date): Promise<{
    technician: string;
    jobs: number;
    avgTimeHours: number;
}[]> {
    const jobs = await jobRepo.getAllJobTickets();
    const technicianMap = new Map<string, { jobs: number; totalHours: number }>();

    for (const job of jobs) {
        const technician = job.technician?.trim();
        if (!technician) continue;

        const isCompletedInRange = isDateWithinRange(job.completedAt, startDate, endDate)
            || (job.status === 'Completed' && isDateWithinRange(job.createdAt, startDate, endDate));
        if (!isCompletedInRange) continue;

        const current = technicianMap.get(technician) || { jobs: 0, totalHours: 0 };
        current.jobs += 1;

        if (job.createdAt && job.completedAt) {
            const hours = Math.max(0, (job.completedAt.getTime() - job.createdAt.getTime()) / (1000 * 60 * 60));
            current.totalHours += hours;
        }

        technicianMap.set(technician, current);
    }

    return Array.from(technicianMap.entries())
        .map(([technician, data]) => ({
            technician,
            jobs: data.jobs,
            avgTimeHours: data.jobs > 0
                ? Math.round((data.totalHours / data.jobs) * 10) / 10
                : 0,
        }))
        .sort((a, b) => b.jobs - a.jobs);
}
