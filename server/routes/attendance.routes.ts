/**
 * Attendance Routes
 * 
 * Handles staff attendance check-in/check-out.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { requireAdminAuth } from './middleware/auth.js';

const router = Router();

// ============================================
// Attendance API
// ============================================

/**
 * GET /api/admin/attendance - Get all attendance records
 */
router.get('/api/admin/attendance', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const records = await storage.getAllAttendanceRecords();
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch attendance records' });
    }
});

/**
 * GET /api/admin/attendance/date/:date - Get attendance by date
 */
router.get('/api/admin/attendance/date/:date', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const records = await storage.getAttendanceByDate(req.params.date);
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch attendance records' });
    }
});

/**
 * GET /api/admin/attendance/user/:userId - Get attendance by user
 */
router.get('/api/admin/attendance/user/:userId', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const records = await storage.getAttendanceByUserId(req.params.userId);
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
        const record = await storage.getTodayAttendanceForUser(req.session.adminUserId!, today);
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
        const user = await storage.getUser(req.session.adminUserId!);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const today = new Date().toISOString().split('T')[0];

        const existing = await storage.getTodayAttendanceForUser(user.id, today);
        if (existing) {
            return res.status(400).json({ error: 'Already checked in today', record: existing });
        }

        const record = await storage.createAttendanceRecord({
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
        const existing = await storage.getTodayAttendanceForUser(req.session.adminUserId!, today);

        if (!existing) {
            return res.status(400).json({ error: 'No check-in record found for today' });
        }

        if (existing.checkOutTime) {
            return res.status(400).json({ error: 'Already checked out today' });
        }

        const updated = await storage.updateAttendanceRecord(existing.id, {
            checkOutTime: new Date(),
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark check-out' });
    }
});

export default router;
