/**
 * Payroll & HR Routes
 * 
 * Handles salary config CRUD, monthly salary sheet generation,
 * bonus calculation, and holiday calendar management.
 * All write operations restrict to Super Admin except "clear/pay" (Manager allowed).
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { settingsRepo, notificationRepo, systemRepo, userRepo, jobRepo, serviceRequestRepo, warrantyRepo, hrRepo, employmentRepo, salaryStructureRepo, offboardingRepo } from '../repositories/index.js';
import { requireAdminAuth, requirePermission } from './middleware/auth.js';
import { payrollService, HR_DEFAULTS } from '../services/payroll.service.js';

const router = Router();

// ============================================
// Salary Configuration CRUD (Super Admin only)
// ============================================

/**
 * GET /api/admin/payroll/salary-config - Get all salary configs
 */
router.get('/api/admin/payroll/salary-config', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const configs = await hrRepo.getAllSalaryConfigs();
        res.json(configs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch salary configurations' });
    }
});

/**
 * GET /api/admin/payroll/salary-config/:userId - Get salary config for a user
 */
router.get('/api/admin/payroll/salary-config/:userId', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin access required' });
        }
        const config = await hrRepo.getSalaryConfig(req.params.userId);
        res.json(config || null);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch salary config' });
    }
});

/**
 * POST /api/admin/payroll/salary-config - Create/update salary config (Super Admin only)
 */
router.post('/api/admin/payroll/salary-config', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin access required' });
        }

        const { userId, basicSalary, houseRentAllowance, medicalAllowance, conveyanceAllowance, otherAllowances, incomeTaxPercent, effectiveFrom } = req.body;

        if (!userId || !basicSalary) {
            return res.status(400).json({ error: 'userId and basicSalary are required' });
        }

        // Check if config already exists for this user
        const existing = await hrRepo.getSalaryConfig(userId);
        if (existing) {
            const updated = await storage.updateSalaryConfig(existing.id, {
                basicSalary,
                houseRentAllowance: houseRentAllowance ?? Math.round(basicSalary * 0.5),
                medicalAllowance: medicalAllowance ?? Math.round(basicSalary * 0.1),
                conveyanceAllowance: conveyanceAllowance ?? Math.round(basicSalary * 0.1),
                otherAllowances: otherAllowances ?? 0,
                incomeTaxPercent: incomeTaxPercent ?? 0,
                effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
            });
            return res.json(updated);
        }

        const config = await storage.createSalaryConfig({
            userId,
            basicSalary,
            houseRentAllowance: houseRentAllowance ?? Math.round(basicSalary * 0.5),
            medicalAllowance: medicalAllowance ?? Math.round(basicSalary * 0.1),
            conveyanceAllowance: conveyanceAllowance ?? Math.round(basicSalary * 0.1),
            otherAllowances: otherAllowances ?? 0,
            incomeTaxPercent: incomeTaxPercent ?? 0,
            effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        });

        res.status(201).json(config);
    } catch (error) {
        console.error('Salary config error:', error);
        res.status(500).json({ error: 'Failed to save salary configuration' });
    }
});

/**
 * DELETE /api/admin/payroll/salary-config/:id - Delete salary config (Super Admin only)
 */
router.delete('/api/admin/payroll/salary-config/:id', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin access required' });
        }
        const deleted = await storage.deleteSalaryConfig(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Salary config not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete salary config' });
    }
});

// ============================================
// Monthly Salary Sheet (Super Admin generates, Manager can view/clear)
// ============================================

/**
 * POST /api/admin/payroll/generate/:month - Generate salary sheet for a month
 */
router.post('/api/admin/payroll/generate/:month', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin access required' });
        }

        const { month } = req.params;
        if (!/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM.' });
        }

        // Check if payroll already exists for this month
        const existing = await hrRepo.getPayrollByMonth(month);
        if (existing.length > 0) {
            return res.status(400).json({ error: `Salary sheet for ${month} already exists. Delete it first to regenerate.` });
        }

        // Get active holidays for the month's year
        const year = parseInt(month.split('-')[0]);
        const activeHolidays = await storage.getActiveHolidaysByYear(year);

        // Generate payroll (V2 engine handles saving to DB directly)
        const saved = await payrollService.generateMonthlySalary(month, user.id, activeHolidays);

        // Detect and create Super Admin notifications for issues
        const notifications = await payrollService.detectPayrollNotifications(month);
        const superAdmins = (await userRepo.getAllUsers(1, 100)).items.filter(u => u.role === 'Super Admin');

        for (const notif of notifications) {
            for (const admin of superAdmins) {
                await notificationRepo.createNotification({
                    userId: admin.id,
                    title: notif.title,
                    message: notif.message,
                    type: 'payroll',
                    link: '/admin/salary',
                    contextType: 'admin',
                });
            }
        }

        res.status(201).json({ records: saved, notifications: notifications.length });
    } catch (error: any) {
        console.error('Payroll generation error:', error);
        res.status(500).json({ error: error.message || 'Failed to generate salary sheet' });
    }
});

/**
 * GET /api/admin/payroll/:month - Get salary sheet for a month
 */
router.get('/api/admin/payroll/:month', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const records = await hrRepo.getPayrollByMonth(req.params.month);
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch salary sheet' });
    }
});

/**
 * PATCH /api/admin/payroll/:id/approve-deduction - Approve pending deductions (Super Admin only)
 */
router.patch('/api/admin/payroll/:id/approve-deduction', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin access required' });
        }

        const updated = await hrRepo.updatePayrollRecord(req.params.id, {
            deductionApproved: true,
            deductionApprovedBy: user.id,
            deductionApprovedAt: new Date(),
            status: 'pending_approval' as any, // Move to finalize-ready state
        });

        if (!updated) return res.status(404).json({ error: 'Payroll record not found' });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to approve deduction' });
    }
});

/**
 * PATCH /api/admin/payroll/:id/dismiss-deduction - Dismiss deduction (Super Admin only)
 */
router.patch('/api/admin/payroll/:id/dismiss-deduction', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin access required' });
        }

        const record = await storage.getPayrollRecord(req.params.id);
        if (!record) return res.status(404).json({ error: 'Payroll record not found' });

        // Remove deductions and recalculate net
        const updated = await hrRepo.updatePayrollRecord(req.params.id, {
            absentDeduction: 0,
            lateDeduction: 0,
            totalDeductions: record.incomeTax ?? 0,
            netSalary: record.grossSalary - (record.incomeTax ?? 0),
            deductionApproved: true,
            deductionApprovedBy: user.id,
            deductionApprovedAt: new Date(),
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to dismiss deduction' });
    }
});

/**
 * PATCH /api/admin/payroll/:id/finalize - Finalize payroll record (Super Admin only)
 */
router.patch('/api/admin/payroll/:id/finalize', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin access required' });
        }

        const updated = await hrRepo.updatePayrollRecord(req.params.id, {
            status: 'finalized',
        });

        if (!updated) return res.status(404).json({ error: 'Payroll record not found' });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to finalize payroll' });
    }
});

/**
 * PATCH /api/admin/payroll/:id/clear - Mark as paid (Manager or Super Admin)
 */
router.patch('/api/admin/payroll/:id/clear', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const updated = await hrRepo.updatePayrollRecord(req.params.id, {
            status: 'paid',
            clearedBy: req.session.adminUserId!,
            paidAt: new Date(),
        });

        if (!updated) return res.status(404).json({ error: 'Payroll record not found' });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark payroll as paid' });
    }
});

/**
 * DELETE /api/admin/payroll/:id - Delete payroll record (Super Admin only)
 */
router.delete('/api/admin/payroll/:id', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin access required' });
        }
        const deleted = await storage.deletePayrollRecord(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Payroll record not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete payroll record' });
    }
});

// ============================================
// Bonus Calculation (Super Admin only)
// ============================================

/**
 * POST /api/admin/payroll/bonus/calculate - Calculate biannual bonus
 */
router.post('/api/admin/payroll/bonus/calculate', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin access required' });
        }

        const { bonusType, year, periodStartMonth, periodEndMonth } = req.body;
        if (!bonusType || !year || !periodStartMonth || !periodEndMonth) {
            return res.status(400).json({ error: 'bonusType, year, periodStartMonth, and periodEndMonth are required' });
        }

        const records = await payrollService.calculateBonus(bonusType, year, periodStartMonth, periodEndMonth);

        // Save all bonus records
        const saved = [];
        for (const record of records) {
            const bonus = await storage.createBonusRecord(record);
            saved.push(bonus);
        }

        res.status(201).json(saved);
    } catch (error: any) {
        console.error('Bonus calculation error:', error);
        res.status(500).json({ error: error.message || 'Failed to calculate bonus' });
    }
});

/**
 * GET /api/admin/payroll/bonus/:year - Get bonus records for a year
 */
router.get('/api/admin/payroll/bonus/:year', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const records = await storage.getBonusByYear(parseInt(req.params.year));
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch bonus records' });
    }
});

/**
 * PATCH /api/admin/payroll/bonus/:id/approve - Approve bonus (Super Admin only)
 */
router.patch('/api/admin/payroll/bonus/:id/approve', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin access required' });
        }

        const updated = await storage.updateBonusRecord(req.params.id, {
            status: 'approved',
            approvedBy: user.id,
        });

        if (!updated) return res.status(404).json({ error: 'Bonus record not found' });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to approve bonus' });
    }
});

// ============================================
// Holiday Calendar Management (Super Admin only)
// ============================================

/**
 * GET /api/admin/holidays/:year - Get holidays for a year
 */
router.get('/api/admin/holidays/:year', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const holidays = await storage.getHolidaysByYear(parseInt(req.params.year));
        res.json(holidays);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch holidays' });
    }
});

/**
 * POST /api/admin/holidays - Add a holiday (Super Admin only)
 */
router.post('/api/admin/holidays', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin access required' });
        }

        const { year, date, name, type, status, forcedReason } = req.body;
        if (!year || !date || !name || !type) {
            return res.status(400).json({ error: 'year, date, name, and type are required' });
        }

        const holiday = await storage.createHoliday({
            year,
            date,
            name,
            type,
            status: status || 'active',
        });

        // If forced, add the reason
        if (status === 'forced' && forcedReason) {
            await storage.updateHoliday(holiday.id, {
                forcedReason,
                modifiedBy: user.id,
                modifiedAt: new Date(),
            });
        }

        res.status(201).json(holiday);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add holiday' });
    }
});

/**
 * PATCH /api/admin/holidays/:id/dismiss - Dismiss a holiday (Super Admin only)
 */
router.patch('/api/admin/holidays/:id/dismiss', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin access required' });
        }

        const { reason } = req.body;
        if (!reason) {
            return res.status(400).json({ error: 'Reason for dismissal is required' });
        }

        const updated = await storage.updateHoliday(req.params.id, {
            status: 'dismissed',
            dismissedReason: reason,
            modifiedBy: user.id,
            modifiedAt: new Date(),
        });

        if (!updated) return res.status(404).json({ error: 'Holiday not found' });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to dismiss holiday' });
    }
});

/**
 * PATCH /api/admin/holidays/:id/restore - Restore a dismissed holiday (Super Admin only)
 */
router.patch('/api/admin/holidays/:id/restore', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin access required' });
        }

        const updated = await storage.updateHoliday(req.params.id, {
            status: 'active',
            dismissedReason: null,
            modifiedBy: user.id,
            modifiedAt: new Date(),
        });

        if (!updated) return res.status(404).json({ error: 'Holiday not found' });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to restore holiday' });
    }
});

/**
 * DELETE /api/admin/holidays/:id - Delete a holiday (Super Admin only)
 */
router.delete('/api/admin/holidays/:id', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin access required' });
        }
        const deleted = await storage.deleteHoliday(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Holiday not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete holiday' });
    }
});

/**
 * POST /api/admin/holidays/seed/:year - Seed default BD holidays for a year (Super Admin only)
 */
router.post('/api/admin/holidays/seed/:year', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin access required' });
        }

        const year = parseInt(req.params.year);
        const existing = await storage.getHolidaysByYear(year);
        if (existing.length > 0) {
            return res.status(400).json({ error: `Holidays for ${year} already exist. Delete them first to re-seed.` });
        }

        // Seed from the defaults in payroll service
        const seeded = [];
        for (const h of HR_DEFAULTS.holidays2026) {
            // Adjust year in date string
            const dateWithYear = h.date.replace('2026', String(year));
            const holiday = await storage.createHoliday({
                year,
                date: dateWithYear,
                name: h.name,
                type: h.type,
                status: 'active',
            });
            seeded.push(holiday);
        }

        res.status(201).json({ count: seeded.length, holidays: seeded });
    } catch (error) {
        res.status(500).json({ error: 'Failed to seed holidays' });
    }
});

/**
 * GET /api/admin/payroll/hr-defaults - Get HR configuration defaults
 */
router.get('/api/admin/payroll/hr-defaults', requireAdminAuth, requirePermission('salary'), async (req: Request, res: Response) => {
    try {
        res.json({
            shopOpenTime: HR_DEFAULTS.shopOpenTime,
            shopCloseTime: HR_DEFAULTS.shopCloseTime,
            graceMinutes: HR_DEFAULTS.graceMinutes,
            consecutiveLateThreshold: HR_DEFAULTS.consecutiveLateThreshold,
            weeklyHoliday: HR_DEFAULTS.weeklyHoliday,
            bonusDeductionScale: HR_DEFAULTS.bonusDeductionScale,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch HR defaults' });
    }
});


// ============================================
// V2 HR Setup: Salary Components & Structures
// ============================================

router.get('/api/admin/hr/salary-components', requireAdminAuth, requirePermission('salary'), async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const data = await salaryStructureRepo.getAllComponents();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch salary components' });
    }
});

router.post('/api/admin/hr/salary-components', requireAdminAuth, requirePermission('salary'), async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const data = await salaryStructureRepo.createComponent(req.body);
        res.status(201).json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to create salary component' });
    }
});

router.get('/api/admin/hr/salary-structures', requireAdminAuth, requirePermission('salary'), async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const data = await salaryStructureRepo.getAllStructures();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch salary structures' });
    }
});

router.post('/api/admin/hr/salary-structures', requireAdminAuth, requirePermission('salary'), async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });

        const { code, name, lines } = req.body;
        const structId = `struct_${Date.now()}`;
        const mappedLines = lines.map((l: any, idx: number) => ({
            id: `sl_${Date.now()}_${idx}`,
            componentId: l.componentId,
            sequence: l.sequence ?? idx + 1,
            isMandatory: l.isMandatory ?? true
        }));

        const data = await salaryStructureRepo.createStructure({ code, name }, mappedLines);
        res.status(201).json(data);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to create salary structure' });
    }
});

// ============================================
// V2 HR Setup: Salary Assignments & Profiles
// ============================================

router.get('/api/admin/hr/salary-assignments/:userId', requireAdminAuth, requirePermission('salary'), async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });

        const profile = await employmentRepo.getProfileByUserId(req.params.userId);
        const assignment = await employmentRepo.getActiveAssignment(req.params.userId);
        res.json({ profile, assignment });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch salary assignment' });
    }
});

router.post('/api/admin/hr/salary-assignments', requireAdminAuth, requirePermission('salary'), async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });

        const { userId, structureId, baseAmount, hraAmount, medicalAmount, conveyanceAmount, otherAmount, incomeTaxPercent, effectiveFrom, changeReason } = req.body;

        let profile = await employmentRepo.getProfileByUserId(userId);
        if (!profile) {
            const targetUser = await userRepo.getUser(userId);
            profile = await employmentRepo.updateProfile(userId, {
                userId,
                employeeCode: `PE-${Date.now()}`,
                employmentStatus: 'active',
                joinDate: targetUser?.joinedAt ? targetUser.joinedAt.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
            }) as any;
        }

        const data = await employmentRepo.createSalaryAssignment({
            userId,
            employmentProfileId: profile!.id,
            structureId: structureId || 'none',   // 'none' = no formal structure assigned yet
            baseAmount,
            hraAmount,
            medicalAmount,
            conveyanceAmount,
            otherAmount,
            incomeTaxPercent,
            effectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            changeReason: changeReason || 'new_hire',
            approvedBy: user.id,
            approvedAt: new Date(),
            createdBy: user.id
        });

        res.status(201).json(data);
    } catch (e) {
        console.error('Salary assignment error:', e);
        res.status(500).json({ error: 'Failed to create salary assignment' });
    }
});

// ============================================
// V2 HR Offboarding
// ============================================

router.get('/api/admin/hr/offboarding', requireAdminAuth, requirePermission('salary'), async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const data = await offboardingRepo.getAllCases();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch offboarding cases' });
    }
});

router.post('/api/admin/hr/offboarding', requireAdminAuth, requirePermission('salary'), async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });

        const { userId, offboardingType, noticeServedDays, lastWorkingDate, settlementDueDate } = req.body;
        const profile = await employmentRepo.getProfileByUserId(userId);
        if (!profile) return res.status(400).json({ error: 'Employment profile not found' });

        const data = await offboardingRepo.createCase({
            userId,
            employmentProfileId: profile.id,
            offboardingType,
            noticeServedDays: noticeServedDays || 0,
            lastWorkingDate,
            settlementDueDate
        });
        res.status(201).json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to initiate offboarding' });
    }
});


export default router;

// ============================================
// V2 Advisory: Increment Suggestions (Super Admin ONLY)
// ============================================

router.get('/api/admin/hr/increment-suggestions', requireAdminAuth, requirePermission('salary'), async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const data = await employmentRepo.getPendingIncrementSuggestions();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch increment suggestions' });
    }
});

router.post('/api/admin/hr/increment-suggestions/generate', requireAdminAuth, requirePermission('salary'), async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const data = await payrollService.generateIncrementSuggestions();
        res.status(201).json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to generate increment suggestions' });
    }
});

router.patch('/api/admin/hr/increment-suggestions/:id', requireAdminAuth, requirePermission('salary'), async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const { status, adminDecisionAmount, adminNotes, effectiveFrom } = req.body;
        const result = await employmentRepo.processIncrementSuggestion(
            req.params.id, status, user.id, adminNotes, adminDecisionAmount, effectiveFrom ? new Date(effectiveFrom) : undefined
        );

        // ── AUDIT LOG ──
        console.log(JSON.stringify({
            audit: 'INCREMENT_SUGGESTION_DECISION',
            actorId: user.id,
            actorName: user.name,
            role: 'Super Admin',
            suggestionId: req.params.id,
            decision: status,
            adminDecisionAmount: adminDecisionAmount ?? null,
            adminNotes: adminNotes ?? null,
            effectiveFrom: effectiveFrom ?? null,
            ts: new Date().toISOString()
        }));

        res.json(result);
    } catch (e) {
        res.status(500).json({ error: 'Failed to process increment suggestion' });
    }
});

// ============================================
// V2 Advisory: Deduction Proposals (Super Admin ONLY)
// ============================================

router.get('/api/admin/payroll/deduction-proposals', requireAdminAuth, requirePermission('salary'), async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const data = await employmentRepo.getPendingDeductionProposals(req.query.month as string);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch deduction proposals' });
    }
});

router.get('/api/admin/payroll/deduction-proposals/:payrollId', requireAdminAuth, requirePermission('salary'), async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const data = await employmentRepo.getDeductionProposalsForPayroll(req.params.payrollId);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch proposals for payroll' });
    }
});

router.patch('/api/admin/payroll/deduction-proposals/:id', requireAdminAuth, requirePermission('salary'), async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const { status, approvedAmount, adminNotes } = req.body;
        const result = await employmentRepo.decideDeductionProposal(req.params.id, status, user.id, adminNotes, approvedAmount);

        // ── AUDIT LOG ──
        console.log(JSON.stringify({
            audit: 'DEDUCTION_PROPOSAL_DECISION',
            actorId: user.id,
            actorName: user.name,
            role: 'Super Admin',
            proposalId: req.params.id,
            decision: status,
            approvedAmount: approvedAmount ?? null,
            adminNotes: adminNotes ?? null,
            ts: new Date().toISOString()
        }));

        res.json(result);
    } catch (e) {
        res.status(500).json({ error: 'Failed to process deduction proposal' });
    }
});

router.post('/api/admin/payroll/deduction-proposals/:payrollId/apply', requireAdminAuth, requirePermission('salary'), async (req, res) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin access required' });
        const result = await payrollService.applyApprovedDeductions(req.params.payrollId, user.id);

        // ── AUDIT LOG ──
        console.log(JSON.stringify({
            audit: 'DEDUCTIONS_APPLIED_TO_PAYROLL',
            actorId: user.id,
            actorName: user.name,
            role: 'Super Admin',
            payrollRecordId: req.params.payrollId,
            ts: new Date().toISOString()
        }));

        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to apply approved deductions' });
    }
});
