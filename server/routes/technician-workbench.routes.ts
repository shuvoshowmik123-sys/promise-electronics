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
 * Any other role with jobs.view: 403.
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

        const workbench = jobs.map((j: any) => ({
            id: j.id,
            customer: j.customer,
            customerPhone: isTeam ? j.customerPhone : null,
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
