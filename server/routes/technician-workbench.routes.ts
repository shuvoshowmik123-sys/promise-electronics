import { Router, Request, Response } from 'express';
import { requireAdminAuth, requireGranularPermission } from './middleware/auth.js';
import { jobRepo } from '../repositories/index.js';
import { auditLogger } from '../utils/auditLogger.js';

const router = Router();

const VALID_INSPECTION_RESULTS = ['pending', 'ok', 'ng', 'rework'] as const;

// Roles that may view the full team workbench and all customer data.
// Any other role (including Cashier/Driver granted jobs.view) is 403.
const WORKBENCH_TEAM_ROLES = ['Super Admin', 'Manager'];

function canSeeFullWorkbench(role: string): boolean {
    return WORKBENCH_TEAM_ROLES.includes(role);
}

/**
 * GET /api/technician/workbench/jobs
 * Super Admin / Manager: all jobs + customerPhone.
 * Technician: assigned jobs only, customerPhone masked.
 * Ranked work-now + separate waiting list metadata (TECHNICIAN-FLOW-01B).
 */
router.get('/api/technician/workbench/jobs', requireAdminAuth, requireGranularPermission('jobs.view'), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const isTeam = canSeeFullWorkbench(user.role);
        const isTech = user.role === 'Technician';

        if (!isTeam && !isTech) {
            return res.status(403).json({ error: 'Workbench access restricted to Technician and Manager/Super Admin' });
        }

        const jobs = isTeam
            ? await jobRepo.getAllJobTickets()
            : await jobRepo.getJobTicketsByTechnicianUser(user.id, user.name);

        const { buildTechnicianQueueResponse } = await import('../services/technician-queue.service.js');
        const queue = buildTechnicianQueueResponse(jobs as any[], {
            includeCustomerPhone: isTeam,
        });

        res.json(queue);
    } catch (error: any) {
        console.error('[Workbench] Failed to fetch jobs:', error.message);
        res.status(500).json({ error: 'Failed to fetch workbench jobs' });
    }
});

/**
 * POST /api/technician/workbench/jobs/:id/hold
 * Generic non-NG hold → Awaiting Quote Approval (jobs.manageWorkHolds).
 */
router.post(
    '/api/technician/workbench/jobs/:id/hold',
    requireAdminAuth,
    requireGranularPermission('jobs.manageWorkHolds'),
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const jobId = req.params.id;
            const { transitionJobStatus } = await import('../services/job-status-transition.service.js');
            const { STATUS_AWAITING_QUOTE_APPROVAL } = await import('../services/technician-queue.service.js');

            const result = await transitionJobStatus({
                jobId,
                toStatus: STATUS_AWAITING_QUOTE_APPROVAL,
                actor: { id: user.id, name: user.name || 'Staff', role: user.role },
                reason: 'work_hold',
            });

            await auditLogger.log({
                userId: user.id,
                action: 'JOB_WORK_HOLD',
                entity: 'JobTicket',
                entityId: jobId,
                details: 'Entered Awaiting Quote Approval (generic hold, no price)',
                req,
            }).catch(() => {});

            res.json({
                id: result.job.id,
                status: result.job.status,
                previousStatus: result.previousStatus,
            });
        } catch (error: any) {
            if (error?.name === 'JobStatusTransitionError') {
                return res.status(error.status).json({ error: error.message, code: error.code });
            }
            console.error('[Workbench] Hold failed:', error.message);
            res.status(500).json({ error: 'Failed to place work hold' });
        }
    },
);

/**
 * POST /api/technician/workbench/jobs/:id/resume
 * Resume from Awaiting Quote Approval → In Progress (default) or body.toStatus if workable.
 */
router.post(
    '/api/technician/workbench/jobs/:id/resume',
    requireAdminAuth,
    requireGranularPermission('jobs.manageWorkHolds'),
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            const jobId = req.params.id;
            const requested =
                typeof req.body?.toStatus === 'string' && req.body.toStatus.trim()
                    ? req.body.toStatus.trim()
                    : 'In Progress';

            const { isWorkableStatus } = await import('../services/technician-queue.service.js');
            if (!isWorkableStatus(requested)) {
                return res.status(400).json({
                    error: 'Resume target must be a workable (non-blocked, non-terminal) status',
                    code: 'INVALID_RESUME_STATUS',
                });
            }

            const { transitionJobStatus } = await import('../services/job-status-transition.service.js');
            const result = await transitionJobStatus({
                jobId,
                toStatus: requested,
                actor: { id: user.id, name: user.name || 'Staff', role: user.role },
                reason: 'work_resume',
            });

            await auditLogger.log({
                userId: user.id,
                action: 'JOB_WORK_RESUME',
                entity: 'JobTicket',
                entityId: jobId,
                details: `Resumed work hold → ${requested}`,
                req,
            }).catch(() => {});

            res.json({
                id: result.job.id,
                status: result.job.status,
                previousStatus: result.previousStatus,
            });
        } catch (error: any) {
            if (error?.name === 'JobStatusTransitionError') {
                return res.status(error.status).json({ error: error.message, code: error.code });
            }
            console.error('[Workbench] Resume failed:', error.message);
            res.status(500).json({ error: 'Failed to resume work hold' });
        }
    },
);

/**
 * PATCH /api/technician/workbench/jobs/:id/inspection
 * Super Admin / Manager: any job.
 * Technician: only assigned jobs.
 * Any other role: 403.
 */
router.patch('/api/technician/workbench/jobs/:id/inspection', requireAdminAuth, requireGranularPermission('jobs.reportOutcome'), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const isTeam = canSeeFullWorkbench(user.role);
        const isTech = user.role === 'Technician';

        if (!isTeam && !isTech) {
            return res.status(403).json({ error: 'Inspection update restricted to Technician and Manager/Super Admin' });
        }

        const jobId = req.params.id;
        const job = await jobRepo.getJobTicket(jobId);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        if (isTech && job.assignedTechnicianId !== user.id && job.technician !== user.name) {
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
            inspectedBy: user.id,
            inspectedAt: new Date(),
        } as any);

        await auditLogger.log({
            userId: user.id,
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
            inspectedBy: user.id,
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
 * Super Admin / Manager: all batches.
 * Technician: assigned jobs only.
 * Any other role: 403.
 */
router.get('/api/technician/workbench/batches', requireAdminAuth, requireGranularPermission('jobs.view'), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const isTeam = canSeeFullWorkbench(user.role);
        const isTech = user.role === 'Technician';

        if (!isTeam && !isTech) {
            return res.status(403).json({ error: 'Workbench access restricted to Technician and Manager/Super Admin' });
        }

        const jobs = isTeam
            ? await jobRepo.getAllJobTickets()
            : await jobRepo.getJobTicketsByTechnicianUser(user.id, user.name);

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
