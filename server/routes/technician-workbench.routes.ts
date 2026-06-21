import { Router, Request, Response } from 'express';
import { requireAdminAuth, requirePermission } from './middleware/auth.js';
import { jobRepo, userRepo } from '../repositories/index.js';
import { auditLogger } from '../utils/auditLogger.js';

const router = Router();

const VALID_INSPECTION_RESULTS = ['pending', 'ok', 'ng', 'rework'] as const;

/**
 * GET /api/technician/workbench/jobs
 * Returns jobs assigned to the logged-in technician.
 * Admins/managers see all jobs.
 */
router.get('/api/technician/workbench/jobs', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.session?.adminUserId;
        if (!userId) return res.status(401).json({ error: 'Not authenticated' });

        const user = await userRepo.getUser(userId);
        if (!user) return res.status(401).json({ error: 'User not found' });

        let jobs: any[];
        if (user.role === 'Technician') {
            jobs = await jobRepo.getJobTicketsByTechnician(user.name);
        } else {
            const allJobs = await jobRepo.getAllJobTickets();
            jobs = allJobs;
        }

        const workbench = jobs.map((j: any) => ({
            id: j.id,
            customer: j.customer,
            customerPhone: j.customerPhone,
            device: j.device,
            issue: j.issue,
            status: j.status,
            priority: j.priority,
            technician: j.technician,
            assignedTechnicianId: j.assignedTechnicianId,
            inspectionResult: j.inspectionResult || 'pending',
            inspectionNote: j.inspectionNote || null,
            inspectedBy: j.inspectedBy || null,
            inspectedAt: j.inspectedAt || null,
            initialStatus: j.initialStatus || null,
            problemFound: j.problemFound || null,
            reportedDefect: j.reportedDefect || null,
            corporateClientId: j.corporateClientId || null,
            batchId: j.batchId || null,
            ticketType: j.ticketType || 'full_device',
            createdAt: j.createdAt,
        }));

        res.json({ items: workbench, total: workbench.length });
    } catch (error: any) {
        console.error('[Workbench] Failed to fetch jobs:', error.message);
        res.status(500).json({ error: 'Failed to fetch workbench jobs' });
    }
});

/**
 * PATCH /api/technician/workbench/jobs/:id/inspection
 * Update inspection result for a job.
 * Technicians can only update assigned jobs.
 */
router.patch('/api/technician/workbench/jobs/:id/inspection', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.session?.adminUserId;
        if (!userId) return res.status(401).json({ error: 'Not authenticated' });

        const user = await userRepo.getUser(userId);
        if (!user) return res.status(401).json({ error: 'User not found' });

        const jobId = req.params.id;
        const job = await jobRepo.getJobTicket(jobId);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        if (user.role === 'Technician' && job.assignedTechnicianId !== userId && job.technician !== user.name) {
            return res.status(403).json({ error: 'You can only update jobs assigned to you' });
        }

        const { inspectionResult, inspectionNote, reason } = req.body;

        if (!inspectionResult || !VALID_INSPECTION_RESULTS.includes(inspectionResult)) {
            return res.status(400).json({ error: 'inspectionResult must be one of: pending, ok, ng, rework' });
        }

        const oldResult = (job as any).inspectionResult || 'pending';
        const oldNote = (job as any).inspectionNote || null;

        if (oldResult !== 'pending' && inspectionResult !== oldResult && !reason) {
            return res.status(400).json({ error: 'reason is required when changing a non-pending inspection result' });
        }

        const updated = await jobRepo.updateJobTicket(jobId, {
            inspectionResult,
            inspectionNote: inspectionNote ?? oldNote,
            inspectedBy: userId,
            inspectedAt: new Date(),
        } as any);

        await auditLogger.log({
            userId,
            action: 'INSPECTION_UPDATE',
            entity: 'JobTicket',
            entityId: jobId,
            details: `Inspection: ${oldResult} → ${inspectionResult}${reason ? ` (reason: ${reason})` : ''}`,
            oldValue: { inspectionResult: oldResult, inspectionNote: oldNote },
            newValue: { inspectionResult, inspectionNote: inspectionNote ?? oldNote },
            req,
        });

        console.log(`[Workbench] Inspection ${jobId}: ${oldResult} → ${inspectionResult} by ${user.name}`);

        res.json({
            id: jobId,
            inspectionResult,
            inspectionNote: inspectionNote ?? oldNote,
            inspectedBy: userId,
            inspectedAt: (updated as any)?.inspectedAt,
            previousResult: oldResult,
        });
    } catch (error: any) {
        console.error('[Workbench] Inspection update failed:', error.message);
        res.status(500).json({ error: 'Failed to update inspection result' });
    }
});

/**
 * GET /api/technician/workbench/batches
 * Groups assigned jobs by corporate client/batch.
 */
router.get('/api/technician/workbench/batches', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.session?.adminUserId;
        if (!userId) return res.status(401).json({ error: 'Not authenticated' });

        const user = await userRepo.getUser(userId);
        if (!user) return res.status(401).json({ error: 'User not found' });

        let jobs: any[];
        if (user.role === 'Technician') {
            jobs = await jobRepo.getJobTicketsByTechnician(user.name);
        } else {
            jobs = await jobRepo.getAllJobTickets();
        }

        const batchMap = new Map<string, { batchId: string; clientId: string | null; jobs: number; pending: number; ok: number; ng: number; rework: number }>();

        for (const j of jobs) {
            const key = (j as any).batchId || (j as any).corporateClientId || 'walk-in';
            if (!batchMap.has(key)) {
                batchMap.set(key, { batchId: key, clientId: (j as any).corporateClientId || null, jobs: 0, pending: 0, ok: 0, ng: 0, rework: 0 });
            }
            const entry = batchMap.get(key)!;
            entry.jobs++;
            const result = ((j as any).inspectionResult || 'pending') as string;
            if (result === 'pending') entry.pending++;
            else if (result === 'ok') entry.ok++;
            else if (result === 'ng') entry.ng++;
            else if (result === 'rework') entry.rework++;
        }

        res.json({ batches: Array.from(batchMap.values()) });
    } catch (error: any) {
        console.error('[Workbench] Batches failed:', error.message);
        res.status(500).json({ error: 'Failed to fetch batch summary' });
    }
});

export default router;
