
import { Router } from "express";
import { storage } from "../storage.js";
import { z } from "zod";
import ExcelJS from "exceljs";
import { simpleCache } from "../utils/cache.js";
import { getJobOverview } from "../repositories/analytics.repository.js";

const router = Router();

// GET /analytics/workload — Tech Workload: all active jobs grouped by technician
// Uses admin session auth (NOT corporate portal auth). Returns combined retail + corporate.
router.get("/workload", async (req, res) => {
    try {
        const overview = await getJobOverview();
        // Return a simple array of { name, jobs } for the chart
        const workload = overview.technicianWorkloads
            .map(({ technician, jobs }) => ({ name: technician, jobs: jobs.length }))
            .sort((a, b) => b.jobs - a.jobs);
        res.json(workload);
    } catch (error) {
        console.error("[Analytics] Workload fetch error:", error);
        res.status(500).json({ message: "Failed to fetch technician workload" });
    }
});

// Helper to parse dates
const dateSchema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
});

router.get("/metrics", async (req, res) => {
    try {
        const { startDate: startStr, endDate: endStr } = dateSchema.parse(req.query);
        const endDate = endStr ? new Date(endStr) : new Date();
        const startDate = startStr ? new Date(startStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const [revenueStats, jobStats, customerStats] = await Promise.all([
            storage.getRevenueStats(startDate, endDate),
            storage.getJobStats(startDate, endDate),
            storage.getCustomerStats(startDate, endDate)
        ]);

        // Calculate Totals
        const totalRevenue = revenueStats.reduce((sum, day) => sum + (day.service || 0) + (day.retail || 0) + (day.corporate || 0), 0);

        res.json({
            totalRevenue,
            newCustomers: customerStats.newCustomers,
            jobsCompleted: jobStats.statusDistribution.find((s: any) => s.name === 'Delivered')?.value || 0,
            jobDistribution: jobStats.statusDistribution
        });
    } catch (error) {
        console.error("Analytics Error:", error);
        res.status(500).json({ message: "Failed to fetch metrics" });
    }
});

router.get("/revenue", async (req, res) => {
    try {
        const { startDate: startStr, endDate: endStr } = dateSchema.parse(req.query);
        const endDate = endStr ? new Date(endStr) : new Date();
        const startDate = startStr ? new Date(startStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const revenueStats = await storage.getRevenueStats(startDate, endDate);
        res.json(revenueStats);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch revenue stats" });
    }
});

router.get("/technicians", async (req, res) => {
    try {
        const { startDate: startStr, endDate: endStr } = dateSchema.parse(req.query);
        const endDate = endStr ? new Date(endStr) : new Date();
        const startDate = startStr ? new Date(startStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const techStats = await storage.getTechnicianStats(startDate, endDate);
        res.json(techStats);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch technician stats" });
    }
});

// Aggregated Dashboard Data
router.get("/dashboard", async (req, res) => {
    try {
        const { startDate: startStr, endDate: endStr } = dateSchema.parse(req.query);
        // Default to this month if not specified? Or handle 'period' param
        const endDate = endStr ? new Date(endStr) : new Date();
        const startDate = startStr ? new Date(startStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const cacheKey = `dashboard:${startDate.getTime()}-${endDate.getTime()}`;

        const dashboardData = await simpleCache.getOrFetch(cacheKey, async () => {
            const [revenueStats, techStats, auditLogs, wastageLogs] = await Promise.all([
                storage.getRevenueStats(startDate, endDate),
                storage.getTechnicianStats(startDate, endDate),
                storage.getAuditLogs({ limit: 10 }),
                storage.getWastageLogs(startDate, endDate)
            ]);

            // Calculate Summary
            const totalRevenue = revenueStats.reduce((sum, day) => sum + (day.service || 0) + (day.retail || 0) + (day.corporate || 0), 0);
            const totalRepairs = techStats.reduce((sum, tech) => sum + tech.completedJobs, 0);
            const totalStaff = techStats.length;
            const totalWastageLoss = wastageLogs.reduce((sum, log) => sum + (log.financialLoss || 0), 0);

            // Group by Month-Year for chart
            const monthlyMap = new Map<string, { name: string, income: number, expense: number, repairs: number }>();

            revenueStats.forEach(r => {
                const date = new Date(r.date);
                const monthName = date.toLocaleString('default', { month: 'short' });

                if (!monthlyMap.has(monthName)) {
                    monthlyMap.set(monthName, { name: monthName, income: 0, expense: 0, repairs: 0 });
                }
                const entry = monthlyMap.get(monthName)!;
                entry.income += (r.service || 0) + (r.retail || 0) + (r.corporate || 0);
            });

            const monthlyFinancials = Array.from(monthlyMap.values());

            // Format Activity Logs
            const activityLogs = auditLogs.map(log => ({
                action: `${log.action} - ${log.details || ''}`,
                user: "System",
                time: log.createdAt.toISOString(),
                type: 'system'
            }));

            return {
                summary: {
                    totalRevenue,
                    totalRepairs,
                    totalStaff,
                    totalWastageLoss
                },
                monthlyFinancials,
                technicianPerformance: techStats.map(t => ({
                    name: t.name,
                    tasks: t.completedJobs,
                    efficiency: t.efficiency
                })),
                activityLogs
            };
        });

        res.json(dashboardData);
    } catch (error) {
        console.error("Dashboard Analytics Error:", error);
        res.status(500).json({ message: "Failed to fetch dashboard data" });
    }
});

// Export to Excel
router.get("/export/excel", async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Revenue Report");

        sheet.columns = [
            { header: "Date", key: "date", width: 15 },
            { header: "Service Revenue", key: "service", width: 20 },
            { header: "Retail Revenue", key: "retail", width: 20 },
            { header: "Corporate Revenue", key: "corporate", width: 20 },
            { header: "Total", key: "total", width: 20 }
        ];

        const endDate = new Date();
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const revenueStats = await storage.getRevenueStats(startDate, endDate);

        revenueStats.forEach(r => {
            sheet.addRow({
                date: r.date,
                service: r.service,
                retail: r.retail,
                corporate: r.corporate,
                total: (r.service || 0) + (r.retail || 0) + (r.corporate || 0)
            });
        });

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=revenue-report.xlsx");

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error("Export Error:", error);
        res.status(500).send("Failed to export report");
    }
});

// Quality Analytics
router.get("/defects", async (req, res) => {
    try {
        const { startDate: startStr, endDate: endStr } = dateSchema.parse(req.query);
        const endDate = endStr ? new Date(endStr) : new Date();
        const startDate = startStr ? new Date(startStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const defectStats = await storage.getDefectStats(startDate, endDate);
        res.json(defectStats);
    } catch (error) {
        console.error("Defect Stats Error:", error);
        res.status(500).json({ message: "Failed to fetch defect stats" });
    }
});

router.get("/supplier-defects", async (req, res) => {
    try {
        const { startDate: startStr, endDate: endStr } = dateSchema.parse(req.query);
        const endDate = endStr ? new Date(endStr) : new Date();
        const startDate = startStr ? new Date(startStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const defectStats = await storage.getSupplierDefectStats(startDate, endDate);
        res.json(defectStats);
    } catch (error) {
        console.error("Supplier Defect Stats Error:", error);
        res.status(500).json({ message: "Failed to fetch supplier defect stats" });
    }
});

router.get("/performance", async (req, res) => {
    try {
        const { startDate: startStr, endDate: endStr } = dateSchema.parse(req.query);
        const endDate = endStr ? new Date(endStr) : new Date();
        const startDate = startStr ? new Date(startStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const performanceStats = await storage.getTechnicianPerformanceStats(startDate, endDate);
        res.json(performanceStats);
    } catch (error) {
        console.error("Performance Stats Error:", error);
        res.status(500).json({ message: "Failed to fetch performance stats" });
    }
});

export const analyticsRoutes = router;
