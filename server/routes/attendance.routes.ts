/**
 * Attendance Routes
 * 
 * Handles staff attendance check-in/check-out.
 */

import { Router, Request, Response } from 'express';
import { attendanceRepo, userRepo } from '../repositories/index.js';
import { requireAdminAuth, requireAnyPermission } from './middleware/auth.js';

const router = Router();

// ============================================
// Attendance API
// ============================================

/**
 * GET /api/admin/attendance - Get all attendance records
 */
router.get('/api/admin/attendance', requireAdminAuth, requireAnyPermission(['attendance', 'reports']), async (req: Request, res: Response) => {
    try {
        const records = await attendanceRepo.getAllAttendanceRecords();
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch attendance records' });
    }
});

/**
 * GET /api/admin/attendance/date/:date - Get attendance by date
 */
router.get('/api/admin/attendance/date/:date', requireAdminAuth, requireAnyPermission(['attendance', 'reports']), async (req: Request, res: Response) => {
    try {
        const records = await attendanceRepo.getAttendanceByDate(req.params.date);
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch attendance records' });
    }
});

/**
 * GET /api/admin/attendance/user/:userId - Get attendance by user
 */
router.get('/api/admin/attendance/user/:userId', requireAdminAuth, requireAnyPermission(['attendance', 'reports']), async (req: Request, res: Response) => {
    try {
        const records = await attendanceRepo.getAttendanceByUserId(req.params.userId);
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch attendance records' });
    }
});

/**
 * GET /api/admin/attendance/today - Get today's attendance for current user
 */
router.get('/api/admin/attendance/today', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const record = await attendanceRepo.getTodayAttendanceForUser(req.session.adminUserId!, today);
        res.json(record || null);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch today's attendance" });
    }
});

/**
 * POST /api/admin/attendance/check-in - Check in
 */
router.post('/api/admin/attendance/check-in', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const today = new Date().toISOString().split('T')[0];

        const existing = await attendanceRepo.getTodayAttendanceForUser(user.id, today);
        if (existing) {
            return res.status(400).json({ error: 'Already checked in today', record: existing });
        }

        const record = await attendanceRepo.createAttendanceRecord({
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            date: today,
            notes: req.body.notes || null,
        });

        res.status(201).json(record);
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark attendance' });
    }
});

/**
 * POST /api/admin/attendance/check-out - Check out
 */
router.post('/api/admin/attendance/check-out', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const existing = await attendanceRepo.getTodayAttendanceForUser(req.session.adminUserId!, today);

        if (!existing) {
            return res.status(400).json({ error: 'No check-in record found for today' });
        }

        if (existing.checkOutTime) {
            return res.status(400).json({ error: 'Already checked out today' });
        }

        const updated = await attendanceRepo.updateAttendanceRecord(existing.id, {
            checkOutTime: new Date(),
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark check-out' });
    }
});

export default router;
