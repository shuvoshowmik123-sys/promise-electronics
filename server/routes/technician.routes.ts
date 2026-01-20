/**
 * Technician Routes
 * 
 * Personal dashboard endpoints for logged-in technicians.
 * Returns only data specific to the authenticated technician.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { requireAdminAuth } from './middleware/auth.js';

const router = Router();

// ============================================
// Technician Personal Dashboard API
// ============================================

/**
 * GET /api/technician/stats - Get personal job stats for logged-in technician
 * Returns: { assigned, completed, pending }
 */
router.get('/api/technician/stats', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.session!.adminUserId;
        const user = await storage.getUser(userId!);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get all jobs assigned to this technician (by name or ID)
        const allJobs = await storage.getAllJobTickets();
        const techName = user.name;

        // Filter jobs assigned to this technician
        const myJobs = allJobs.filter((job: any) =>
            job.technician === techName || job.technicianId === userId
        );

        // Calculate stats
        const stats = {
            assigned: myJobs.length,
            completed: myJobs.filter((j: any) => j.status === 'Completed' || j.status === 'Delivered').length,
            pending: myJobs.filter((j: any) =>
                j.status !== 'Completed' && j.status !== 'Delivered' && j.status !== 'Cancelled'
            ).length,
            inProgress: myJobs.filter((j: any) => j.status === 'In Progress').length,
        };

        res.json(stats);
    } catch (error) {
        console.error('Failed to fetch technician stats:', error);
        res.status(500).json({ error: 'Failed to fetch technician stats' });
    }
});

/**
 * GET /api/technician/jobs - Get jobs assigned to logged-in technician
 * Optional query: ?status=pending|completed|all (default: all)
 * Returns: Array of job tickets with pendingDays calculation
 */
router.get('/api/technician/jobs', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.session!.adminUserId;
        const user = await storage.getUser(userId!);
        const statusFilter = req.query.status as string || 'all';

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const allJobs = await storage.getAllJobTickets();
        const techName = user.name;

        // Filter jobs assigned to this technician
        let myJobs = allJobs.filter((job: any) =>
            job.technician === techName || job.technicianId === userId
        );

        // Apply status filter
        if (statusFilter === 'pending') {
            myJobs = myJobs.filter((j: any) =>
                j.status !== 'Completed' && j.status !== 'Delivered' && j.status !== 'Cancelled'
            );
        } else if (statusFilter === 'completed') {
            myJobs = myJobs.filter((j: any) =>
                j.status === 'Completed' || j.status === 'Delivered'
            );
        }

        // Add pendingDays calculation for each job
        const now = new Date();
        const jobsWithPendingDays = myJobs.map((job: any) => {
            const createdAt = new Date(job.createdAt);
            const pendingDays = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
            return {
                ...job,
                pendingDays: job.status === 'Completed' || job.status === 'Delivered' ? 0 : pendingDays,
            };
        });

        // Sort by pendingDays descending (oldest first)
        jobsWithPendingDays.sort((a: any, b: any) => b.pendingDays - a.pendingDays);

        res.json(jobsWithPendingDays);
    } catch (error) {
        console.error('Failed to fetch technician jobs:', error);
        res.status(500).json({ error: 'Failed to fetch technician jobs' });
    }
});

export default router;
