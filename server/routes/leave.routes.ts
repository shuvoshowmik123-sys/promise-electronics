/**
 * Leave Application Routes
 * 
 * Handles staff leave applications and Super Admin approvals.
 * Leave types: casual (10/yr), sick (14/yr), earned (accumulates).
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { settingsRepo, notificationRepo, systemRepo, userRepo, jobRepo, serviceRequestRepo, warrantyRepo, hrRepo } from '../repositories/index.js';
import { requireAdminAuth, requireSuperAdmin } from './middleware/auth.js';

const router = Router();

// ============================================
// Staff Leave API
// ============================================

/**
 * POST /api/admin/leave/apply - Submit a leave application (any staff)
 */
router.post('/api/admin/leave/apply', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const { leaveType, startDate, endDate, totalDays, reason, medicalCertificateUrl } = req.body;

        // Validate leave type
        if (!['casual', 'sick', 'earned'].includes(leaveType)) {
            return res.status(400).json({ error: 'Invalid leave type. Must be casual, sick, or earned.' });
        }

        // Validate required fields
        if (!startDate || !endDate || !totalDays || !reason) {
            return res.status(400).json({ error: 'Start date, end date, total days, and reason are required.' });
        }

        // Sick leave requires medical certificate
        if (leaveType === 'sick' && !medicalCertificateUrl) {
            // Allow without cert but flag it
        }

        // Check leave balance
        const salaryConfig = await hrRepo.getSalaryConfig(user.id);
        if (salaryConfig) {
            const balanceField = leaveType === 'casual' ? 'casualLeaveBalance' :
                leaveType === 'sick' ? 'sickLeaveBalance' : 'earnedLeaveBalance';
            const balance = salaryConfig[balanceField] ?? 0;
            if (totalDays > balance) {
                return res.status(400).json({
                    error: `Insufficient ${leaveType} leave balance. Available: ${balance} days, Requested: ${totalDays} days.`
                });
            }
        }

        const application = await hrRepo.createLeaveApplication({
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            leaveType,
            startDate,
            endDate,
            totalDays,
            reason,
            medicalCertificateUrl: medicalCertificateUrl || null,
        });

        // Create notification for Super Admin
        const superAdmins = (await userRepo.getAllUsers(1, 100)).items.filter(u => u.role === 'Super Admin');
        for (const admin of superAdmins) {
            await notificationRepo.createNotification({
                userId: admin.id,
                title: '📋 Leave Application',
                message: `${user.name} (${user.role}) has applied for ${totalDays} day(s) of ${leaveType} leave from ${startDate} to ${endDate}. Reason: ${reason}`,
                type: 'payroll',
                link: '/admin/attendance',
                contextType: 'admin',
            });
        }

        res.status(201).json(application);
    } catch (error) {
        console.error('Leave application error:', error);
        res.status(500).json({ error: 'Failed to submit leave application' });
    }
});

/**
 * GET /api/admin/leave/my - Get my leave applications (any staff)
 */
router.get('/api/admin/leave/my', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const applications = await hrRepo.getLeaveApplicationsByUser(req.session.adminUserId!);
        res.json(applications);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch leave applications' });
    }
});

/**
 * GET /api/admin/leave/pending - Get all pending leave applications (Super Admin only)
 */
router.get('/api/admin/leave/pending', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin access required' });
        }
        const applications = await hrRepo.getAllLeaveApplications('pending');
        res.json(applications);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pending applications' });
    }
});

/**
 * GET /api/admin/leave/all - Get all leave applications (Super Admin only)
 */
router.get('/api/admin/leave/all', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin access required' });
        }
        const applications = await hrRepo.getAllLeaveApplications();
        res.json(applications);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch all applications' });
    }
});

/**
 * PATCH /api/admin/leave/:id/approve - Approve leave application (Super Admin only)
 */
router.patch('/api/admin/leave/:id/approve', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin access required' });
        }

        const updated = await storage.updateLeaveApplication(req.params.id, {
            status: 'approved',
            reviewedBy: user.id,
            reviewedAt: new Date(),
        });

        if (!updated) return res.status(404).json({ error: 'Leave application not found' });

        // Deduct from leave balance
        const salaryConfig = await hrRepo.getSalaryConfig(updated.userId);
        if (salaryConfig) {
            const balanceField = updated.leaveType === 'casual' ? 'casualLeaveBalance' :
                updated.leaveType === 'sick' ? 'sickLeaveBalance' : 'earnedLeaveBalance';
            const currentBalance = (salaryConfig[balanceField] ?? 0) as number;
            const newBalance = Math.max(0, currentBalance - updated.totalDays);
            await storage.updateSalaryConfig(salaryConfig.id, { [balanceField]: newBalance } as any);
        }

        // Notify the applicant
        await notificationRepo.createNotification({
            userId: updated.userId,
            title: '✅ Leave Approved',
            message: `Your ${updated.leaveType} leave from ${updated.startDate} to ${updated.endDate} has been approved.`,
            type: 'payroll',
            link: '/admin/attendance',
            contextType: 'admin',
        });

        res.json(updated);
    } catch (error) {
        console.error('Leave approval error:', error);
        res.status(500).json({ error: 'Failed to approve leave' });
    }
});

/**
 * PATCH /api/admin/leave/:id/reject - Reject leave application (Super Admin only)
 */
router.patch('/api/admin/leave/:id/reject', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user || user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Super Admin access required' });
        }

        const { rejectionReason } = req.body;
        if (!rejectionReason) {
            return res.status(400).json({ error: 'Rejection reason is required' });
        }

        const updated = await storage.updateLeaveApplication(req.params.id, {
            status: 'rejected',
            reviewedBy: user.id,
            reviewedAt: new Date(),
            rejectionReason,
        });

        if (!updated) return res.status(404).json({ error: 'Leave application not found' });

        // Notify the applicant
        await notificationRepo.createNotification({
            userId: updated.userId,
            title: '❌ Leave Rejected',
            message: `Your ${updated.leaveType} leave from ${updated.startDate} to ${updated.endDate} was rejected. Reason: ${rejectionReason}`,
            type: 'payroll',
            link: '/admin/attendance',
            contextType: 'admin',
        });

        res.json(updated);
    } catch (error) {
        console.error('Leave rejection error:', error);
        res.status(500).json({ error: 'Failed to reject leave' });
    }
});

/**
 * GET /api/admin/leave/balance/:userId - Get leave balance (self or Super Admin)
 */
router.get('/api/admin/leave/balance/:userId', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const currentUser = await userRepo.getUser(req.session.adminUserId!);
        if (!currentUser) return res.status(401).json({ error: 'User not found' });

        // Only self or Super Admin can view balances
        if (req.params.userId !== currentUser.id && currentUser.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const config = await hrRepo.getSalaryConfig(req.params.userId);
        if (!config) {
            return res.json({ casualLeaveBalance: 10, sickLeaveBalance: 14, earnedLeaveBalance: 0, configured: false });
        }

        res.json({
            casualLeaveBalance: config.casualLeaveBalance ?? 10,
            sickLeaveBalance: config.sickLeaveBalance ?? 14,
            earnedLeaveBalance: config.earnedLeaveBalance ?? 0,
            configured: true,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch leave balance' });
    }
});

export default router;
