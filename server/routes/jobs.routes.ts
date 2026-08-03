/**
 * Job Tickets Routes
 * 
 * Handles job ticket CRUD operations and tracking.
 */
import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { jobRepo, serviceRequestRepo, userRepo, attendanceRepo, systemRepo, settingsRepo, notificationRepo } from '../repositories/index.js';
import { insertJobTicketSchema } from '../../shared/schema.js';

import { notifyAdminUpdate, notifyCustomerUpdate } from './middleware/sse-broker.js';
import { auditLogger } from '../utils/auditLogger.js';
import { requireAdminAuth, requirePermission, requireGranularPermission, userHasGranularPermission } from './middleware/auth.js';
import { pushService } from '../pushService.js';
import { jobService } from '../services/job.service.js';
import { publishAdminNotificationEvent, publishJobTicketEvent } from '../services/admin-realtime.service.js';
import { logModelCase } from '../brain/kg.service.js';
import { bindCustomerToJob, recordJobClosed } from '../services/canonical-customer.service.js';
import { db } from '../db.js';
import { localPurchases } from '../../shared/schema.js';
import { eq, sql } from 'drizzle-orm';
import {
    transitionJobStatus,
    nextLinearStatus,
    statusForRepairOutcome,
    JobStatusTransitionError,
    isCanonicalJobStatus,
    isExplicitTestingConfirmed,
} from '../services/job-status-transition.service.js';
import { repairJourneyService } from '../services/customer-repair-journey.service.js';
import { loadRepairCaseByJobTicket } from '../services/repair-case.service.js';
import { normalizePhone } from '../utils/phone.js';
import { getActiveServiceAreaById } from '../repositories/service-area.repository.js';
import {
    submitNgReport,
    reviewNgReport,
    getActiveNgReport,
    getLatestNgReport,
    assertCanViewNgReport,
    NgReportServiceError,
} from '../services/job-ng-report.service.js';
import {
    recordNgCustomerDecision,
    getActiveNgCustomerDecision,
    assertCanViewNgCustomerDecision,
    NgCustomerDecisionServiceError,
} from '../services/job-ng-customer-decision.service.js';
import {
    assertJobPatchNotProtected,
    assertNgCurrentStateAllowsMutation,
    assertJobNotNgProtected,
    isNgProtectedStatus,
    ProtectedJobFieldError,
    NgWorkflowLockedError,
    isNgWorkflowError,
} from '../services/job-ng-protected.js';

const router = Router();
const JOB_REALTIME_TAGS = ["jobTickets", "jobOverview", "dashboardStats"] as const;
const JOB_CREATE_REALTIME_TAGS = [...JOB_REALTIME_TAGS, "adminNotifications", "adminNotificationCount"] as const;
const ROLLBACK_REALTIME_TAGS = ["pendingRollbacks", "adminNotifications", "adminNotificationCount"] as const;

type CustomerLookupCard = {
    id: string;
    name: string;
    phone: string;
    shortAddress: string | null;
};

async function searchCustomerLookup(qRaw: unknown): Promise<CustomerLookupCard[]> {
    if (typeof qRaw !== 'string') return [];
    const q = qRaw.trim().replace(/\s+/g, ' ');
    if (q.length < 2) return [];

    const digits = q.replace(/\D/g, '').slice(-10);
    const escaped = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    const namePattern = `%${escaped}%`;
    const rows = await db.execute(sql`
        SELECT id, name, primary_phone AS phone, address AS short_address
        FROM customers
        WHERE name ILIKE ${namePattern} ESCAPE '\\'
           OR (${digits.length >= 3} AND right(regexp_replace(primary_phone, '[^0-9]', '', 'g'), 10) LIKE ${digits + '%'} )
        ORDER BY updated_at DESC NULLS LAST, last_job_at DESC NULLS LAST, name ASC NULLS LAST
        LIMIT 20
    `);

    return (((rows as any).rows ?? rows) as Array<Record<string, unknown>>)
        .filter((row) => typeof row.id === 'string' && typeof row.name === 'string' && typeof row.phone === 'string')
        .map((row) => ({
            id: row.id as string,
            name: row.name as string,
            phone: row.phone as string,
            shortAddress: typeof row.short_address === 'string' && row.short_address.trim() ? row.short_address : null,
        }));
}

function techCanViewAllJobs(user: { role: string; permissions?: string | null }) {
    return userHasGranularPermission(user, 'jobs.viewAll');
}

function techCanAccessJob(
    user: { id: string; name: string; role: string; permissions?: string | null },
    job: { assignedTechnicianId?: string | null; technician?: string | null; createdByUserId?: string | null },
): boolean {
    if (user.role !== 'Technician') return true;
    if (techCanViewAllJobs(user)) return true;
    if (jobRepo.isJobAssignedToUser(job as any, user.id, user.name)) return true;
    if (jobRepo.isJobCreatedByUser(job as any, user.id)) return true;
    return false;
}

function techCanMutateJob(
    user: { id: string; name: string; role: string; permissions?: string | null },
    job: { assignedTechnicianId?: string | null; technician?: string | null },
): boolean {
    if (user.role !== 'Technician') return true;
    // Lead tech with viewAll still needs assignment to edit work — only assignee (or managers) mutate
    return jobRepo.isJobAssignedToUser(job as any, user.id, user.name);
}

// ============================================
// Job Tickets API
// ============================================

/**
 * GET /api/job-tickets/list - Lightweight list for tables (no heavy logs)
 */
router.get('/api/job-tickets/list', requireAdminAuth, requireGranularPermission('jobs.view'), async (req: Request, res: Response) => {
    try {
        const pageRaw = parseInt(String(req.query.page ?? "1"), 10);
        const limitRaw = parseInt(String(req.query.limit ?? "50"), 10);
        const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, limitRaw) : 50;

        const user = (req as any).user;
        if (user?.role === 'Technician') {
            const result = await jobRepo.listJobTicketsPaginated({
                page,
                limit,
                type: "all",
                technicianScope: techCanViewAllJobs(user)
                    ? undefined
                    : { userId: user.id, technicianName: user.name },
            });
            return res.json(result);
        }

        const result = await jobRepo.getJobTicketsList(page, limit);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch job list' });
    }
});

/**
 * GET /api/job-tickets - Get all job tickets
 */
router.get('/api/job-tickets', requireAdminAuth, requireGranularPermission('jobs.view'), async (req: Request, res: Response) => {
    try {
        const pageRaw = parseInt(String(req.query.page ?? "1"), 10);
        const limitRaw = parseInt(String(req.query.limit ?? "50"), 10);
        const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, limitRaw) : 50;
        const typeRaw = String(req.query.type ?? "walk-in");
        const type = (typeRaw === "all" || typeRaw === "corporate" || typeRaw === "walk-in"
            ? typeRaw
            : "walk-in") as "all" | "walk-in" | "corporate";
        const search = typeof req.query.search === "string" ? req.query.search : undefined;
        const status = typeof req.query.status === "string" ? req.query.status : undefined;
        const statusesRaw = typeof req.query.statuses === "string" ? req.query.statuses : undefined;
        const statuses = statusesRaw
            ? statusesRaw.split(",").map((s) => s.trim()).filter(Boolean)
            : undefined;
        const priority = typeof req.query.priority === "string" ? req.query.priority : undefined;
        const technician = typeof req.query.technician === "string" ? req.query.technician : undefined;

        const user = (req as any).user;
        try {
            if (user?.role === 'Technician') {
                const result = await jobRepo.listJobTicketsPaginated({
                    page,
                    limit,
                    type,
                    search,
                    status,
                    statuses,
                    priority,
                    technician,
                    technicianScope: techCanViewAllJobs(user)
                        ? undefined
                        : { userId: user.id, technicianName: user.name },
                });
                return res.json(result);
            }

            const result = await jobRepo.listJobTicketsPaginated({
                page,
                limit,
                type,
                search,
                status,
                statuses,
                priority,
                technician,
            });
            res.json(result);
        } catch (error: any) {
            if (error?.code === "JOB_LIST_UNAVAILABLE" || error?.statusCode === 503) {
                return res.status(503).json({ error: error.message, code: "JOB_LIST_UNAVAILABLE" });
            }
            throw error;
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch job tickets' });
    }
});

/**
 * GET /api/job-tickets/next-number — preview of the next JOB-YYYY-NNNN display value.
 * Preview only: not reserved, not write authority. Real ID is allocated at insert.
 */
router.get('/api/job-tickets/next-number', requireAdminAuth, requireGranularPermission('jobs.create'), async (req: Request, res: Response) => {
    try {
        const nextNumber = await jobRepo.getNextJobNumber();
        res.json({ nextNumber, preview: true, reserved: false });
    } catch (error) {
        res.status(500).json({ error: 'Failed to preview next job number' });
    }
});

router.get('/api/admin/job-intake/customer-lookup', requireAdminAuth, requireGranularPermission('jobs.create'), async (req: Request, res: Response) => {
    try {
        const items = await searchCustomerLookup(req.query.q);
        return res.json({ items });
    } catch (error: any) {
        const code = typeof error?.code === 'string' ? error.code : 'LOOKUP_FAILED';
        console.error(`[JobIntake] customer lookup failed code=${code}`);
        return res.status(500).json({ error: 'Customer lookup is unavailable' });
    }
});

/**
 * GET /api/job-tickets/ready-for-billing - Get jobs ready for billing
 */
router.get('/api/job-tickets/ready-for-billing', requireAdminAuth, requireGranularPermission('jobs.view'), async (req: Request, res: Response) => {
    try {
        const allJobs = jobRepo.filterJobTicketsByLane(await jobRepo.getAllJobTickets(), "walk-in");
        // Filter for jobs that are completed but not yet delivered/closed
        const readyJobs = allJobs.filter(j =>
            j.status === 'Completed' || j.status === 'Ready'
        );
        res.json(readyJobs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch billable jobs' });
    }
});

/**
 * GET /api/job-tickets/pending-rollbacks
 */
router.get('/api/job-tickets/pending-rollbacks', requireAdminAuth, requirePermission('settings'), async (req: Request, res: Response) => {
    try {
        const rollbacks = await systemRepo.getPendingRollbackRequests();
        res.json(rollbacks);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch pending rollbacks', details: error.message });
    }
});

/**
 * GET /api/job-tickets/:id - Get job ticket by ID
 */
router.get('/api/job-tickets/:id', requireAdminAuth, requireGranularPermission('jobs.view'), async (req: Request, res: Response) => {
    try {
        const job = await jobRepo.getJobTicket(req.params.id);
        if (!job) {
            return res.status(404).json({ error: 'Job ticket not found' });
        }
        const user = (req as any).user;
        if (user?.role === 'Technician' && !techCanAccessJob(user, job as any)) {
            return res.status(403).json({ error: 'Access denied: not assigned to this job' });
        }
        const canMutate = user?.role !== 'Technician' || techCanMutateJob(user, job as any);
        res.json({
            ...job,
            // Client hint: creator-only (or other non-assignee) techs get read-only UI
            viewerAccess: canMutate ? 'full' : 'read_only',
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch job ticket' });
    }
});

/**
 * GET /api/job-tickets/:id/history - Get job audit history
 */
router.get('/api/job-tickets/:id/history', requireAdminAuth, requireGranularPermission('jobs.view'), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (user?.role === 'Technician') {
            const job = await jobRepo.getJobTicket(req.params.id);
            if (!job || !techCanAccessJob(user, job as any)) {
                return res.status(403).json({ error: 'Access denied: not assigned to this job' });
            }
        }
        const logs = await systemRepo.getAuditLogs({
            entity: 'JobTicket',
            entityId: req.params.id
        });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch job history' });
    }
});

/**
 * POST /api/job-tickets - Create new job ticket
 * Assignment rules (jobs.assignTechnician):
 * - Technician without assign: forced self-assign; ignore client assignee fields
 * - With assign: validate active Technician role; name derived server-side
 * - Create-only non-Technician: unassigned; strip client assignee fields
 */
router.post('/api/job-tickets', requireAdminAuth, requireGranularPermission('jobs.create'), async (req: Request, res: Response) => {
    try {
        const creator = (req as any).user;
        if (!creator?.id) {
            return res.status(401).json({ error: 'Admin authentication required' });
        }

        // job_tickets.id is server-owned. Client must not choose it.
        let jobData = { ...req.body };
        if (jobData.id !== undefined && jobData.id !== null && String(jobData.id).trim() !== '') {
            return res.status(400).json({
                error: 'Job ID is assigned by the server. Do not supply id.',
                code: 'JOB_ID_SERVER_ASSIGNED',
            });
        }
        delete jobData.id;

        if (jobData.corporateClientId || jobData.corporateChallanId || jobData.corporateJobNumber || jobData.batchId || jobData.source === 'corporate_portal' || jobData.source === 'challan_in' || jobData.source === 'b2b_account_intake') {
            return res.status(400).json({ error: 'Corporate and batch jobs must be created from the dedicated B2B intake path.' });
        }

        // Convert deadline string to Date if present
        if (jobData.deadline && typeof jobData.deadline === 'string') {
            jobData.deadline = new Date(jobData.deadline);
        }

        if (jobData.customerPhone) {
            jobData.customerPhoneNormalized = normalizePhone(jobData.customerPhone);
        }

        if (!jobData.source && !jobData.corporateClientId && !jobData.corporateChallanId) {
            jobData.source = 'walk_in';
        }

        if (jobData.serviceAreaId && !await getActiveServiceAreaById(jobData.serviceAreaId)) {
            return res.status(400).json({ error: 'Selected service area is not active or does not exist.' });
        }

        // Product: default create is Unassigned; manager (or assign-capable user) assigns later.
        // Technician creators never pick peers unless they have jobs.assignTechnician.
        const canAssignOthers = userHasGranularPermission(creator, 'jobs.assignTechnician');
        const requestedAssigneeId = typeof jobData.assignedTechnicianId === 'string' && jobData.assignedTechnicianId.trim()
            ? jobData.assignedTechnicianId.trim()
            : null;

        // Never trust client-supplied technician display name / assist lists without assign rights.
        delete jobData.assistedByIds;
        delete jobData.assistedByNames;
        delete jobData.assistedBy;

        // Always stamp creator for intake visibility
        jobData.createdByUserId = creator.id;
        jobData.createdByName = creator.name;

        if (!canAssignOthers) {
            // Create-only tech or create-only manager: always unassigned
            jobData.assignedTechnicianId = null;
            jobData.technician = 'Unassigned';
        } else if (requestedAssigneeId) {
            const assignee = await userRepo.getUser(requestedAssigneeId);
            if (!assignee) {
                return res.status(400).json({ error: 'Assigned technician not found' });
            }
            if (assignee.status && assignee.status !== 'Active') {
                return res.status(400).json({ error: 'Assigned technician is not active' });
            }
            if (assignee.role !== 'Technician') {
                return res.status(400).json({ error: 'Assignee must have the Technician role' });
            }
            jobData.assignedTechnicianId = assignee.id;
            jobData.technician = assignee.name;

            // Optional assist team: only when assigner has permission (already true)
            if (req.body.assistedByIds) {
                let assistIds: string[] = [];
                try {
                    assistIds = typeof req.body.assistedByIds === 'string'
                        ? JSON.parse(req.body.assistedByIds)
                        : Array.isArray(req.body.assistedByIds) ? req.body.assistedByIds : [];
                } catch {
                    assistIds = [];
                }
                const validAssists: { id: string; name: string }[] = [];
                for (const aid of assistIds) {
                    if (typeof aid !== 'string' || aid === assignee.id) continue;
                    const a = await userRepo.getUser(aid);
                    if (a && a.role === 'Technician' && (!a.status || a.status === 'Active')) {
                        validAssists.push({ id: a.id, name: a.name });
                    }
                }
                if (validAssists.length > 0) {
                    jobData.assistedByIds = JSON.stringify(validAssists.map((a) => a.id));
                    jobData.assistedByNames = validAssists.map((a) => a.name).join(', ');
                }
            }
        } else {
            // canAssignOthers but no assignee chosen
            jobData.assignedTechnicianId = null;
            jobData.technician = 'Unassigned';
        }

        // id is server-owned; omit from client body schema (createJobTicket allocates)
        const validated = insertJobTicketSchema.omit({ id: true }).parse(jobData);
        const job = await jobRepo.createJobTicket(validated);

        // Phase C: bind canonical customer record (fire-and-forget — don't block response)
        bindCustomerToJob(
            (job as any).customerPhone ?? null,
            (job as any).customer ?? null,
            (job as any).customerAddress ?? null
        ).catch(() => {});

        publishJobTicketEvent({
            action: 'created',
            entityId: job.id,
            invalidate: [...JOB_CREATE_REALTIME_TAGS],
            permissions: ['jobs'],
            payload: {
                jobId: job.id,
                ticketNumber: job.id,
                status: job.status,
            },
            toast: {
                level: 'success',
                title: 'New job ticket created',
                message: `Job ${job.id} is ready for processing.`,
                sound: true,
            },
        });

        // Audit Log
        await auditLogger.log({
            userId: req.session?.adminUserId || 'system',
            action: 'CREATE_JOB',
            entity: 'JobTicket',
            entityId: job.id,
            details: `Created new job ticket ${job.id}`,
            newValue: job,
            req: req
        });

        // Auto-create repair journey for walk-in jobs when customer has an account
        if (job.customerPhone) {
            const norm = normalizePhone(job.customerPhone);
            if (norm) {
                db.execute(sql`SELECT id FROM users WHERE role = 'Customer' AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = ${norm} LIMIT 1`)
                    .then(async (rows) => {
                        const customerId = (rows.rows[0] as any)?.id;
                        if (!customerId) return;
                        const existingJourney = await db.execute(sql`SELECT id FROM customer_repair_journeys WHERE job_ticket_id = ${job.id} LIMIT 1`);
                        if (existingJourney.rows.length > 0) return;
                        const { nanoid } = await import('nanoid');
                        const journeyId = nanoid();
                        await db.execute(sql`
                            INSERT INTO customer_repair_journeys (id, customer_id, job_ticket_id, current_stage, current_status,
                                customer_friendly_status, service_mode, pickup_required, dropoff_required, created_at, updated_at)
                            VALUES (${journeyId}, ${customerId}, ${job.id}, 'device_received', 'active',
                                'Your device has been received and a work order has been created.', 'drop_off', false, false, NOW(), NOW())
                        `);
                        await repairJourneyService.addJourneyEvent({
                            journeyId,
                            eventType: 'walk_in_created',
                            title: 'Walk-in Repair Started',
                            message: 'Your device has been received at our service center.',
                            actorType: 'system',
                            isCustomerVisible: true,
                        });
                    })
                    .catch((err) => console.error('[RepairJourney] Walk-in auto-create failed:', (err as Error).message));
            }
        }

        res.status(201).json(job);
    } catch (error: any) {
        console.error('Job ticket validation error:', error.message);
        res.status(400).json({ error: 'Invalid job ticket data', details: error.message });
    }
});

/**
 * POST /api/job-tickets/:id/advance-status - Enforces strict linear progression
 */
router.post('/api/job-tickets/:id/advance-status', requireAdminAuth, requireGranularPermission('jobs.advanceStatus'), async (req: Request, res: Response) => {
    try {
        const jobId = req.params.id;
        const job = await jobRepo.getJobTicket(jobId);
        if (!job) return res.status(404).json({ error: 'Job ticket not found' });
        const user = (req as any).user;
        if (user?.role === 'Technician' && !techCanMutateJob(user, job as any)) {
            return res.status(403).json({ error: 'Read-only: this job is not assigned to you yet' });
        }

        const currentStatus = job.status;
        try {
            assertJobNotNgProtected(currentStatus, "advance-status");
        } catch (err) {
            if (isNgWorkflowError(err)) {
                return res.status(err.status).json({ error: err.message, code: err.code });
            }
            throw err;
        }

        if (['In Progress', 'On Workbench', 'Diagnosing'].includes(currentStatus)) {
            return res.status(400).json({ error: 'Jobs in repair/diagnosis must use set-outcome to report repair result (OK, needs parts, not repairable, etc.) instead of blind advance.' });
        }

        const nextStatus = nextLinearStatus(currentStatus);
        if (!nextStatus) {
            return res.status(400).json({ error: `Cannot mathematically advance from terminal status: ${currentStatus}` });
        }

        if (nextStatus === 'Completed') {
            const purchases = await db.select().from(localPurchases).where(eq(localPurchases.jobTicketId, jobId));
            const dirty = purchases.filter(p => !p.receiptImageUrl || p.status !== 'Consumed');
            if (dirty.length > 0) {
                return res.status(400).json({
                    error: 'Cannot complete job: outside purchases need receipt/status fix',
                    purchases: dirty.map(p => ({ id: p.id, part: p.partName, issue: !p.receiptImageUrl ? 'Missing receipt' : `Status is "${p.status}"` })),
                });
            }
        }

        const testingConfirmed = isExplicitTestingConfirmed(req.body?.testingConfirmed);
        const extraPatch: Record<string, unknown> = {};
        if (nextStatus === 'Completed') {
            extraPatch.completedAt = new Date();
            const warrantyDays = (job as any).warrantyDays ?? 30;
            if (warrantyDays > 0 && !(job as any).warrantyExpiryDate) {
                const expiry = new Date();
                expiry.setDate(expiry.getDate() + warrantyDays);
                extraPatch.warrantyExpiryDate = expiry;
            }
        }

        if (!user?.id || !user?.role) {
            return res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
        }

        const transition = await transitionJobStatus({
            jobId,
            toStatus: nextStatus,
            actor: {
                id: user.id,
                name: user.name || 'Staff',
                role: user.role,
            },
            reason: nextStatus === 'Ready' ? 'confirm_testing' : 'advance',
            testingConfirmed: nextStatus === 'Ready' ? testingConfirmed : undefined,
            extraPatch,
        });
        const updatedJob = transition.job;

        await auditLogger.log({
            userId: req.session?.adminUserId || 'system',
            action: 'FORWARD_PROGRESSED_STATUS',
            entity: 'JobTicket',
            entityId: jobId,
            details: `Advanced Job from [${currentStatus}] -> [${nextStatus}]`,
            oldValue: { status: currentStatus },
            newValue: { status: nextStatus },
            req: req
        });

        publishJobTicketEvent({
            action: 'status_changed',
            entityId: updatedJob.id,
            invalidate: [...JOB_REALTIME_TAGS],
            permissions: ['jobs'],
            payload: {
                jobId: updatedJob.id,
                ticketNumber: updatedJob.id,
                status: nextStatus,
            },
        });

        notifyAdminUpdate({
            type: 'smart_sync_needed',
            jobId: updatedJob?.id,
            jobDisplayId: updatedJob?.id?.slice(-6).toUpperCase(),
            device: updatedJob?.device,
            newStatus: nextStatus,
            customerId: (updatedJob as any)?.customerId,
        });

        if (nextStatus === 'Completed' && updatedJob) {
            logModelCase({
                device:       (updatedJob as any).device,
                issue:        (updatedJob as any).issue,
                problemFound: (updatedJob as any).problemFound,
                notes:        (updatedJob as any).notes,
                screenSize:   (updatedJob as any).screenSize,
                charges:      (updatedJob as any).charges,
                status:       nextStatus,
                jobId:        updatedJob.id,
            }).catch(() => {});

            const totalCharge = ((updatedJob as any).charges as any[] ?? [])
                .reduce((s: number, c: any) => s + (parseFloat(c.amount) || 0), 0);
            recordJobClosed((updatedJob as any).customerPhone ?? null, totalCharge).catch(() => {});
        }

        if (transition.srChanged && transition.serviceRequestId) {
            const sr = await serviceRequestRepo.getServiceRequest(transition.serviceRequestId);
            if (sr?.customerId) {
                notifyCustomerUpdate(sr.customerId, {
                    type: 'order_update',
                    orderId: sr.id,
                    trackingStatus: transition.trackingStatus,
                    status: transition.requestStatus,
                    updatedAt: new Date().toISOString()
                });
            }
        }

        res.json(updatedJob);
    } catch (error: any) {
        if (error instanceof JobStatusTransitionError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        res.status(500).json({ error: 'Failed to advance job status', details: error.message });
    }
});

/**
 * POST /api/job-tickets/:id/set-outcome - Set repair outcome with branching status
 * Used when a job is In Progress / On Workbench and technician reports result.
 * JOBS-NG-02A: not_repairable / customer_declined no longer go through this path.
 */
router.post('/api/job-tickets/:id/set-outcome', requireAdminAuth, requireGranularPermission('jobs.reportOutcome'), async (req: Request, res: Response) => {
    try {
        const jobId = req.params.id;
        const { outcome, reason, notes } = req.body;

        if (outcome === 'not_repairable') {
            return res.status(400).json({
                error: 'not_repairable is no longer accepted via set-outcome. Submit an NG report instead.',
                code: 'USE_NG_REPORT',
                contract: {
                    method: 'POST',
                    path: `/api/job-tickets/${jobId}/ng-report`,
                    required: ['submissionId', 'failedRepairType', 'diagnosis', 'technicalNotes', 'evidenceAttachments'],
                },
            });
        }

        if (outcome === 'customer_declined') {
            return res.status(400).json({
                error: 'customer_declined cannot be recorded as an unaudited technician outcome. Use the customer decision workflow (after manager-verified NG) or manager-audited decision tools.',
                code: 'CUSTOMER_DECLINED_NOT_VIA_SET_OUTCOME',
            });
        }

        if (outcome === 'cancelled') {
            return res.status(400).json({
                error: 'Cancellation is not available via set-outcome. Unrepairable cases require an NG report; other cancellations need an authorized manager workflow.',
                code: 'CANCEL_REQUIRES_MANAGER_WORKFLOW',
            });
        }

        const validOutcomes = ['repair_ok', 'needs_parts'];
        if (!outcome || !validOutcomes.includes(outcome)) {
            return res.status(400).json({ error: `outcome must be one of: ${validOutcomes.join(', ')} (use POST .../ng-report for not-good / not repairable)` });
        }

        const job = await jobRepo.getJobTicket(jobId);
        if (!job) return res.status(404).json({ error: 'Job ticket not found' });
        const user = (req as any).user;
        if (user?.role === 'Technician' && !techCanMutateJob(user, job as any)) {
            return res.status(403).json({ error: 'Read-only: this job is not assigned to you yet' });
        }

        const workStatuses = ['In Progress', 'On Workbench', 'Diagnosing'];
        if (!workStatuses.includes(job.status)) {
            return res.status(400).json({ error: `set-outcome only applies to jobs In Progress/On Workbench/Diagnosing, current: ${job.status}` });
        }

        const nextStatus = statusForRepairOutcome(outcome as 'repair_ok' | 'needs_parts');
        const extraPatch: Record<string, unknown> = { repairOutcome: outcome };
        if (reason) extraPatch.closureReason = reason;
        if (notes) extraPatch.notes = ((job.notes || '') + '\n' + notes).trim();

        if (!user?.id || !user?.role) {
            return res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
        }
        const transition = await transitionJobStatus({
            jobId,
            toStatus: nextStatus,
            actor: {
                id: user.id,
                name: user.name || 'Staff',
                role: user.role,
            },
            reason: outcome === 'repair_ok' ? 'set_outcome_repair_ok' : 'set_outcome_needs_parts',
            extraPatch,
        });
        const updatedJob = transition.job;

        await auditLogger.log({
            userId: req.session?.adminUserId || 'system',
            action: 'SET_REPAIR_OUTCOME',
            entity: 'JobTicket',
            entityId: jobId,
            details: `Outcome: ${outcome}${reason ? ` — ${reason}` : ''}`,
            oldValue: { status: job.status },
            newValue: { status: nextStatus, repairOutcome: outcome },
            req,
        });

        publishJobTicketEvent({
            action: 'status_changed',
            entityId: updatedJob.id,
            invalidate: [...JOB_REALTIME_TAGS],
            permissions: ['jobs'],
            payload: { jobId: updatedJob.id, status: nextStatus },
        });

        res.json(updatedJob);
    } catch (error: any) {
        if (error instanceof JobStatusTransitionError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        res.status(500).json({ error: 'Failed to set outcome', details: error.message });
    }
});

/**
 * POST /api/job-tickets/:id/final-test-runs — record durable final-test evidence (Testing only).
 * JOB-QUALITY-GATE-01B. Staff-only; never projected to customers.
 */
router.post(
  "/api/job-tickets/:id/final-test-runs",
  requireAdminAuth,
  requireGranularPermission("jobs.advanceStatus"),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user?.id || !user?.role) {
        return res.status(401).json({ error: "Unauthorized", code: "AUTH_REQUIRED" });
      }
      const { recordFinalTestRun, FinalTestServiceError } = await import(
        "../services/job-final-test.service.js"
      );
      const outcome = req.body?.outcome === "fail" ? "fail" : req.body?.outcome === "pass" ? "pass" : null;
      if (!outcome) {
        return res.status(400).json({ error: "outcome must be pass or fail", code: "INVALID_OUTCOME" });
      }
      const run = await recordFinalTestRun({
        jobId: req.params.id,
        outcome,
        checkCodes: req.body?.checkCodes,
        reinspectionReason: req.body?.reinspectionReason,
        actor: {
          id: user.id,
          name: user.name || "Staff",
          role: user.role,
        },
      });
      await auditLogger.log({
        userId: user.id,
        action: "FINAL_TEST_RECORDED",
        entity: "JobTicket",
        entityId: req.params.id,
        details: `Final test ${outcome}`,
        newValue: { runId: run.id, outcome },
        req,
      });
      return res.status(201).json(run);
    } catch (error: any) {
      if (error?.name === "FinalTestServiceError") {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      console.error("[Jobs] final-test-runs failed:", error?.message);
      return res.status(500).json({ error: "Failed to record final test" });
    }
  },
);

/**
 * GET /api/job-tickets/:id/final-test-runs — authorized staff only (not customer).
 */
router.get(
  "/api/job-tickets/:id/final-test-runs",
  requireAdminAuth,
  requireGranularPermission("jobs.view"),
  async (req: Request, res: Response) => {
    try {
      const { listFinalTestRunsForJob } = await import("../services/job-final-test.service.js");
      const items = await listFinalTestRunsForJob(req.params.id);
      return res.json({ items });
    } catch (error: any) {
      console.error("[Jobs] list final-test-runs failed:", error?.message);
      return res.status(500).json({ error: "Failed to list final tests" });
    }
  },
);

/**
 * POST /api/job-tickets/:id/return-to-inspection
 * Manager/Super Admin (or assigned tech from Testing) returns job to In Progress with one calm public update.
 */
router.post('/api/job-tickets/:id/return-to-inspection', requireAdminAuth, requireGranularPermission('jobs.advanceStatus'), async (req: Request, res: Response) => {
    try {
        const jobId = req.params.id;
        const job = await jobRepo.getJobTicket(jobId);
        if (!job) return res.status(404).json({ error: 'Job ticket not found' });
        const user = (req as any).user;

        if (!['Testing', 'Ready'].includes(job.status)) {
            return res.status(400).json({
                error: `return-to-inspection only applies from Testing or Ready, current: ${job.status}`,
                code: 'INVALID_RETURN_SOURCE',
            });
        }

        try {
            assertJobNotNgProtected(job.status, "return-to-inspection");
        } catch (err) {
            if (isNgWorkflowError(err)) {
                return res.status(err.status).json({ error: err.message, code: err.code });
            }
            throw err;
        }

        const transition = await transitionJobStatus({
            jobId,
            toStatus: 'In Progress',
            actor: {
                id: user?.id || req.session?.adminUserId || 'system',
                name: user?.name || 'System',
                role: user?.role || 'Manager',
            },
            reason: 'return_to_inspection',
            extraPatch: { repairOutcome: null },
            suppressReadyNotify: true,
        });

        await auditLogger.log({
            userId: req.session?.adminUserId || 'system',
            action: 'RETURN_TO_INSPECTION',
            entity: 'JobTicket',
            entityId: jobId,
            details: `Returned from ${job.status} to In Progress`,
            oldValue: { status: job.status },
            newValue: { status: 'In Progress' },
            req,
        });

        publishJobTicketEvent({
            action: 'status_changed',
            entityId: transition.job.id,
            invalidate: [...JOB_REALTIME_TAGS],
            permissions: ['jobs'],
            payload: { jobId: transition.job.id, status: 'In Progress' },
        });

        res.json(transition.job);
    } catch (error: any) {
        if (error instanceof JobStatusTransitionError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        res.status(500).json({ error: 'Failed to return to inspection', details: error.message });
    }
});

/**
 * POST /api/job-tickets/:id/ng-report — Technician NG evidence (JOBS-NG-02A)
 * Sets job to "NG Review Pending" — never Cancelled. No replacement / invoice / warranty.
 */
router.post('/api/job-tickets/:id/ng-report', requireAdminAuth, requireGranularPermission('jobs.reportOutcome'), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

        const { submissionId, failedRepairType, diagnosis, technicalNotes, evidenceAttachments } = req.body || {};
        const result = await submitNgReport(
            req.params.id,
            { id: user.id, name: user.name || 'Unknown', role: user.role || 'Technician' },
            { submissionId, failedRepairType, diagnosis, technicalNotes, evidenceAttachments },
            req,
        );

        res.status(result.idempotent ? 200 : 201).json({
            report: result.report,
            job: result.job,
            idempotent: result.idempotent,
        });
    } catch (error: any) {
        if (error instanceof NgReportServiceError) {
            return res.status(error.statusCode).json({ error: error.message, code: error.code });
        }
        console.error('[NgReport] submit failed:', error?.message || error);
        res.status(500).json({ error: 'Failed to submit NG report' });
    }
});

/**
 * POST /api/job-tickets/:id/ng-report/review — Manager verify / return (JOBS-NG-02A)
 */
router.post('/api/job-tickets/:id/ng-report/review', requireAdminAuth, requireGranularPermission('jobs.reviewOutcome'), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

        const { action, reviewNotes } = req.body || {};
        const result = await reviewNgReport(
            req.params.id,
            { id: user.id, name: user.name || 'Unknown', role: user.role || 'Manager' },
            { action, reviewNotes },
            req,
        );

        res.json({
            report: result.report,
            job: result.job,
            idempotent: result.idempotent,
        });
    } catch (error: any) {
        if (error instanceof NgReportServiceError) {
            return res.status(error.statusCode).json({ error: error.message, code: error.code });
        }
        console.error('[NgReport] review failed:', error?.message || error);
        res.status(500).json({ error: 'Failed to review NG report' });
    }
});

/**
 * GET /api/job-tickets/:id/ng-report — Active NG report (staff)
 * Query: ?scope=latest — latest pending/verified/returned (JOBS-NG-02G)
 */
router.get('/api/job-tickets/:id/ng-report', requireAdminAuth, requireGranularPermission('jobs.view'), async (req: Request, res: Response) => {
    try {
        const job = await jobRepo.getJobTicket(req.params.id);
        if (!job) return res.status(404).json({ error: 'Job ticket not found' });
        const user = (req as any).user;
        if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });
        try {
            await assertCanViewNgReport(
                { id: user.id, name: user.name || 'Unknown', role: user.role || 'Technician' },
                job as any,
            );
        } catch (err) {
            if (err instanceof NgReportServiceError) {
                return res.status(err.statusCode).json({ error: err.message, code: err.code });
            }
            throw err;
        }
        const scope = String(req.query.scope || '').toLowerCase();
        const report = scope === 'latest'
            ? await getLatestNgReport(req.params.id)
            : await getActiveNgReport(req.params.id);
        if (!report) {
            return res.status(404).json({
                error: scope === 'latest' ? 'No NG report found for this job' : 'No active NG report',
            });
        }
        res.json({ report, job });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to load NG report' });
    }
});

/**
 * GET /api/job-tickets/:id/ng-report/latest — latest report including returned
 */
router.get('/api/job-tickets/:id/ng-report/latest', requireAdminAuth, requireGranularPermission('jobs.view'), async (req: Request, res: Response) => {
    try {
        const job = await jobRepo.getJobTicket(req.params.id);
        if (!job) return res.status(404).json({ error: 'Job ticket not found' });
        const user = (req as any).user;
        if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });
        try {
            await assertCanViewNgReport(
                { id: user.id, name: user.name || 'Unknown', role: user.role || 'Technician' },
                job as any,
            );
        } catch (err) {
            if (err instanceof NgReportServiceError) {
                return res.status(err.statusCode).json({ error: err.message, code: err.code });
            }
            throw err;
        }
        const report = await getLatestNgReport(req.params.id);
        if (!report) return res.status(404).json({ error: 'No NG report found for this job' });
        res.json({ report, job });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to load NG report' });
    }
});

/**
 * POST /api/job-tickets/:id/ng-customer-decision — Manager records customer decision (SYSTEM-UNIFICATION-00C-C)
 * Requires verified NG report. decline → repairOutcome=customer_declined + status=Cancelled.
 * Other decision types keep Awaiting Customer Decision status (no new ad-hoc statuses).
 */
router.post('/api/job-tickets/:id/ng-customer-decision', requireAdminAuth, requireGranularPermission('jobs.reviewOutcome'), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

        const { submissionId, decisionType, contactChannel, decisionNotes } = req.body || {};
        const result = await recordNgCustomerDecision(
            req.params.id,
            { id: user.id, name: user.name || 'Unknown', role: user.role || 'Manager' },
            { submissionId, decisionType, contactChannel, decisionNotes },
            req,
        );

        res.status(result.idempotent ? 200 : 201).json({
            decision: result.decision,
            job: result.job,
            idempotent: result.idempotent,
        });
    } catch (error: any) {
        if (error instanceof NgCustomerDecisionServiceError) {
            return res.status(error.statusCode).json({ error: error.message, code: error.code });
        }
        console.error('[NgCustomerDecision] record failed:', error?.message || error);
        res.status(500).json({ error: 'Failed to record customer decision' });
    }
});

/**
 * GET /api/job-tickets/:id/ng-customer-decision — Active customer decision (staff)
 * Applies the same job/NG visibility policy as GET NG report.
 */
router.get('/api/job-tickets/:id/ng-customer-decision', requireAdminAuth, requireGranularPermission('jobs.view'), async (req: Request, res: Response) => {
    try {
        const job = await jobRepo.getJobTicket(req.params.id);
        if (!job) return res.status(404).json({ error: 'Job ticket not found' });
        const user = (req as any).user;
        if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });
        try {
            await assertCanViewNgCustomerDecision(
                { id: user.id, name: user.name || 'Unknown', role: user.role || 'Technician' },
                job as any,
            );
        } catch (err) {
            if (err instanceof NgCustomerDecisionServiceError) {
                return res.status(err.statusCode).json({ error: err.message, code: err.code });
            }
            throw err;
        }
        const decision = await getActiveNgCustomerDecision(req.params.id);
        if (!decision) {
            return res.status(404).json({ error: 'No customer decision recorded for this job' });
        }
        res.json({ decision, job });
    } catch (error: any) {
        if (error instanceof NgCustomerDecisionServiceError) {
            return res.status(error.statusCode).json({ error: error.message, code: error.code });
        }
        res.status(500).json({ error: 'Failed to load customer decision' });
    }
});

/**
 * POST /api/job-tickets/bulk-update - Mass update jobs
 */
router.post('/api/job-tickets/bulk-update', requireAdminAuth, requireGranularPermission('jobs.edit'), async (req: Request, res: Response) => {
    try {
        const { jobIds, updates } = req.body;
        if (!Array.isArray(jobIds) || jobIds.length === 0) {
            return res.status(400).json({ error: 'Array of jobIds is required' });
        }

        try {
            assertJobPatchNotProtected(updates || {});
        } catch (guardErr) {
            if (guardErr instanceof ProtectedJobFieldError) {
                return res.status(400).json({ error: guardErr.message, code: guardErr.code });
            }
            throw guardErr;
        }

        // Preflight ALL jobs — no partial updates if any is NG-locked
        for (const id of jobIds) {
            const job = await jobRepo.getJobTicket(id);
            if (!job) continue;
            try {
                assertNgCurrentStateAllowsMutation(job.status, updates || {});
            } catch (guardErr) {
                if (guardErr instanceof NgWorkflowLockedError) {
                    return res.status(409).json({
                        error: guardErr.message,
                        code: guardErr.code,
                        jobId: id,
                    });
                }
                throw guardErr;
            }
        }

        const user = (req as any).user;
        if (!user?.id || !user?.role) {
            return res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
        }
        if (updates?.status === 'Ready') {
            return res.status(409).json({
                error: 'Cannot bulk-set Ready. Confirm testing on each job individually with testingConfirmed: true.',
                code: 'BULK_READY_FORBIDDEN',
            });
        }
        const results: any[] = [];
        for (const id of jobIds) {
            const job = await jobRepo.getJobTicket(id);
            if (!job) continue;

            let updatedJob;
            if (updates.status && updates.status !== job.status) {
                if (!isCanonicalJobStatus(updates.status)) {
                    return res.status(400).json({ error: `Unknown job status: ${updates.status}`, code: 'INVALID_JOB_STATUS', jobId: id });
                }
                const bulkPatch = { ...updates };
                delete bulkPatch.status;
                if (updates.status === 'Completed') {
                    if (!bulkPatch.completedAt) bulkPatch.completedAt = new Date();
                    const warrantyDays = (job as any).warrantyDays ?? 30;
                    if (warrantyDays > 0 && !(job as any).warrantyExpiryDate && !bulkPatch.warrantyExpiryDate) {
                        const expiry = new Date();
                        expiry.setDate(expiry.getDate() + warrantyDays);
                        bulkPatch.warrantyExpiryDate = expiry;
                    }
                }
                const transition = await transitionJobStatus({
                    jobId: id,
                    toStatus: updates.status,
                    actor: {
                        id: user.id,
                        name: user.name || 'Staff',
                        role: user.role,
                    },
                    reason: 'bulk',
                    extraPatch: bulkPatch,
                });
                updatedJob = transition.job;
            } else {
                const bulkPatch = { ...updates };
                delete bulkPatch.status;
                updatedJob = Object.keys(bulkPatch).length
                    ? await jobRepo.updateJobTicket(id, bulkPatch)
                    : job;
            }

            await auditLogger.log({
                userId: req.session?.adminUserId || 'system',
                action: 'BULK_UPDATE_JOB',
                entity: 'JobTicket',
                entityId: id,
                details: `Bulk updated fields: ${Object.keys(updates).join(', ')}`,
                newValue: updates,
                req: req
            });

            results.push(updatedJob);
        }

        const successfulUpdates = results.filter(Boolean);
        if (successfulUpdates.length > 0) {
            publishJobTicketEvent({
                action: updates.status ? 'status_changed' : 'updated',
                entityId: successfulUpdates[0]!.id,
                invalidate: [...JOB_REALTIME_TAGS],
                permissions: ['jobs'],
                payload: {
                    jobId: successfulUpdates[0]!.id,
                    ticketNumber: successfulUpdates[0]!.id,
                    status: updates.status,
                },
            });
        }

        res.json({ success: true, count: successfulUpdates.length, updated: successfulUpdates });
    } catch (error: any) {
        if (isNgWorkflowError(error)) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        res.status(500).json({ error: 'Failed to perform bulk update', details: error.message });
    }
});

/**
 * POST /api/job-tickets/:id/request-rollback
 */
router.post('/api/job-tickets/:id/request-rollback', requireAdminAuth, requireGranularPermission('jobs.rollback'), async (req: Request, res: Response) => {
    try {
        const jobId = req.params.id;
        const job = await jobRepo.getJobTicket(jobId);
        if (!job) return res.status(404).json({ error: 'Job ticket not found' });

        const { reason, targetStatus } = req.body;
        if (!reason || !targetStatus) return res.status(400).json({ error: 'Reason and target status required' });

        const rollback = await systemRepo.createRollbackRequest({
            jobTicketId: jobId,
            requestedBy: req.session?.adminUserId || 'unknown',
            reason,
            targetStatus,
            status: 'pending'
        });

        // Audit Logging Request
        await auditLogger.log({
            userId: req.session?.adminUserId || 'system',
            action: 'ROLLBACK_REQUESTED',
            entity: 'JobTicket',
            entityId: jobId,
            details: `Requested rollback to ${targetStatus} for reason: ${reason}`,
            req: req
        });

        publishAdminNotificationEvent({
            action: 'count_changed',
            entityId: String(rollback.id),
            invalidate: [...ROLLBACK_REALTIME_TAGS],
            permissions: ['settings'],
            toast: {
                level: 'warning',
                title: 'Rollback approval requested',
                message: `Job ${job.id} requires approval to move back to ${targetStatus}.`,
                sound: true,
            },
            payload: {
                jobId,
                ticketNumber: job.id,
                status: targetStatus,
            },
        });

        res.json(rollback);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to request rollback', details: error.message });
    }
});

/**
 * POST /api/job-tickets/:id/verify-rollback
 */
router.post('/api/job-tickets/:id/verify-rollback', requireAdminAuth, requirePermission('settings'), async (req: Request, res: Response) => { // Requires high permission
    try {
        const { rollbackId, approved, rejectionReason } = req.body;

        const updates: any = {
            status: approved ? 'approved' : 'rejected',
            resolvedBy: req.session?.adminUserId
        };
        const rollback = await systemRepo.updateRollbackRequest(rollbackId, updates);

        if (!rollback) return res.status(404).json({ error: 'Rollback request not found' });

        if (approved && rollback.jobTicketId) {
            const targetJob = await jobRepo.getJobTicket(rollback.jobTicketId);
            if (targetJob) {
                try {
                    assertJobNotNgProtected(targetJob.status, "rollback");
                    if (isNgProtectedStatus(rollback.targetStatus)) {
                        throw new ProtectedJobFieldError(
                            `Cannot rollback into protected NG status "${rollback.targetStatus}".`,
                        );
                    }
                } catch (err) {
                    if (isNgWorkflowError(err)) {
                        return res.status(err.status).json({ error: err.message, code: err.code });
                    }
                    throw err;
                }
            }
            if (!isCanonicalJobStatus(rollback.targetStatus)) {
                return res.status(400).json({ error: `Unknown rollback target status: ${rollback.targetStatus}`, code: 'INVALID_JOB_STATUS' });
            }
            const user = (req as any).user;
            if (!user?.id || !user?.role) {
                return res.status(401).json({ error: 'Authenticated actor required for rollback apply', code: 'AUTH_REQUIRED' });
            }
            if (rollback.targetStatus === 'Ready') {
                if (user.role !== 'Super Admin' && user.role !== 'Manager') {
                    return res.status(403).json({
                        error: 'Only Manager or Super Admin may approve a rollback to Ready',
                        code: 'READY_OVERRIDE_FORBIDDEN',
                    });
                }
                if (!isExplicitTestingConfirmed(req.body?.testingConfirmed)) {
                    return res.status(400).json({
                        error: 'Explicit testingConfirmed: true is required to rollback to Ready',
                        code: 'TESTING_CONFIRMATION_REQUIRED',
                    });
                }
            }
            await transitionJobStatus({
                jobId: rollback.jobTicketId,
                toStatus: rollback.targetStatus,
                actor: {
                    id: user.id,
                    name: user.name || 'Staff',
                    role: user.role,
                },
                reason: 'rollback',
                testingConfirmed: rollback.targetStatus === 'Ready'
                    ? isExplicitTestingConfirmed(req.body?.testingConfirmed)
                    : undefined,
                suppressReadyNotify: rollback.targetStatus !== 'Ready',
            });

            await auditLogger.log({
                userId: req.session?.adminUserId || 'system',
                action: 'ROLLBACK_APPROVED',
                entity: 'JobTicket',
                entityId: rollback.jobTicketId,
                details: `Super Admin approved rollback to ${rollback.targetStatus}`,
                newValue: { status: rollback.targetStatus },
                req: req
            });
            publishJobTicketEvent({
                action: 'status_changed',
                entityId: rollback.jobTicketId,
                invalidate: [...JOB_REALTIME_TAGS],
                permissions: ['jobs'],
                payload: {
                    jobId: rollback.jobTicketId,
                    ticketNumber: rollback.jobTicketId,
                    status: rollback.targetStatus,
                },
            });
        } else {
            await auditLogger.log({
                userId: req.session?.adminUserId || 'system',
                action: 'ROLLBACK_REJECTED',
                entity: 'JobTicket',
                entityId: rollback.jobTicketId || '',
                details: `Super Admin rejected rollback. Reason: ${rejectionReason}`,
                req: req
            });
        }

        publishAdminNotificationEvent({
            action: 'count_changed',
            entityId: String(rollback.id),
            invalidate: [...ROLLBACK_REALTIME_TAGS],
            permissions: ['settings'],
            payload: {
                jobId: rollback.jobTicketId || undefined,
                ticketNumber: rollback.jobTicketId || undefined,
                status: rollback.status,
            },
        });

        res.json(rollback);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to verify rollback', details: error.message });
    }
});

/**
 * PATCH /api/job-tickets/:id - Update job ticket
 */
router.patch('/api/job-tickets/:id', requireAdminAuth, requireGranularPermission('jobs.edit'), async (req: Request, res: Response) => {
    try {
        let updateData = { ...req.body };

        // Resolve the actual DB ID — old records may have a trailing space
        const rawId = req.params.id.trim();
        const existingForAccess = await jobRepo.getJobTicket(rawId) || await jobRepo.getJobTicket(rawId + ' ');
        const user = (req as any).user;
        if (user?.role === 'Technician') {
            if (!existingForAccess || !techCanAccessJob(user, existingForAccess as any)) {
                return res.status(403).json({ error: 'Access denied: not assigned to this job' });
            }
            if (!techCanMutateJob(user, existingForAccess as any)) {
                return res.status(403).json({ error: 'Read-only: this job is not assigned to you yet' });
            }
        }
        const resolvedId = existingForAccess
            ? existingForAccess.id
            : rawId;

        // Defensive: never allow updating the primary key even if sent in payload
        delete updateData.id;

        // JOBS-NG-02G: block forged protected targets and locked current-state mutations
        try {
            if (existingForAccess) {
                assertNgCurrentStateAllowsMutation(existingForAccess.status, updateData);
            }
            assertJobPatchNotProtected(updateData);
        } catch (guardErr) {
            if (isNgWorkflowError(guardErr)) {
                return res.status(guardErr.status).json({ error: guardErr.message, code: guardErr.code });
            }
            throw guardErr;
        }

        // --- PHASE 1.2: Enforce Strict Linear Progression ---
        // Strip out status updates from generic patch. State must be advanced via /advance-status
        if (updateData.status) {
            const tempJob = await jobRepo.getJobTicket(resolvedId);
            if (tempJob && tempJob.status !== updateData.status) {
                // Deny arbitrary status changing
                delete updateData.status;
            }
        }

        // Date conversion logic
        const dateFields = ['deadline', 'createdAt', 'completedAt', 'serviceExpiryDate', 'partsExpiryDate'];
        for (const field of dateFields) {
            if (updateData[field] && typeof updateData[field] === 'string') {
                updateData[field] = new Date(updateData[field]);
            }
        }

        const existingJob = await jobRepo.getJobTicket(resolvedId);
        if (!existingJob) {
            return res.status(404).json({ error: 'Job ticket not found' });
        }

        if ('serviceAreaId' in updateData) {
            if (existingJob.corporateClientId || existingJob.corporateChallanId) {
                return res.status(400).json({ error: 'Corporate jobs cannot be attributed to retail service areas.' });
            }
            if (updateData.serviceAreaId && !await getActiveServiceAreaById(updateData.serviceAreaId)) {
                return res.status(400).json({ error: 'Selected service area is not active or does not exist.' });
            }
        }

        // Phase P — Warranty cost lock: zero out costs on warranty repairs
        const isWarrantyJob = updateData.jobType === 'warranty_claim'
            || existingJob.jobType === 'warranty_claim';
        if (isWarrantyJob) {
            updateData.partsCost = 0;
            updateData.laborCost = 0;
            if (!updateData.paymentStatus) {
                updateData.paymentStatus = 'Warranty';
            }
        }

        const job = await jobRepo.updateJobTicket(resolvedId, updateData);
        if (!job) {
            return res.status(404).json({ error: 'Job ticket not found' });
        }

        // --- PHASE 4.2: Strict Serialized Consumption Workflow ---
        // Sync inventory stock and serial numbers if product lists changed
        if (updateData.productLines !== undefined && existingJob.productLines !== updateData.productLines) {
            await jobService.syncJobParts(job.id, existingJob.productLines, updateData.productLines);
        }

        // Determine specific audit action based on what changed
        let auditAction = 'UPDATE_JOB';
        let auditDetails = `Updated job ticket ${job.id}`;

        if (updateData.status && updateData.status !== existingJob.status) {
            // Status change - use specific action
            auditAction = `STATUS_CHANGE_TO_${updateData.status.toUpperCase().replace(/\s+/g, '_')}`;
            auditDetails = `Job status changed from "${existingJob.status}" to "${updateData.status}"`;
        } else if (updateData.assignedTechnicianId && updateData.assignedTechnicianId !== existingJob.assignedTechnicianId) {
            // Technician assignment change
            auditAction = 'ASSIGN_TECHNICIAN';
            const oldTech = existingJob.technician || 'Unassigned';
            const newTech = updateData.technician || (updateData.assignedTechnicianId ? 'Assigned' : 'Unassigned');
            auditDetails = `Technician assignment changed from "${oldTech}" to "${newTech}"`;
        } else if (updateData.technician && updateData.technician !== existingJob.technician) {
            // Technician name change (legacy field)
            auditAction = 'ASSIGN_TECHNICIAN';
            auditDetails = `Technician assignment changed from "${existingJob.technician}" to "${updateData.technician}"`;
        }

        // Audit Log
        await auditLogger.log({
            userId: req.session?.adminUserId || 'system',
            action: auditAction,
            entity: 'JobTicket',
            entityId: job.id,
            details: auditDetails,
            oldValue: {
                status: existingJob.status,
                technician: existingJob.technician,
                assignedTechnicianId: existingJob.assignedTechnicianId,
                ...(updateData.status ? {} : { otherFields: updateData })
            },
            newValue: {
                status: job.status,
                technician: job.technician,
                assignedTechnicianId: job.assignedTechnicianId,
                ...(updateData.status ? {} : { otherFields: updateData })
            },
            req: req
        });

        publishJobTicketEvent({
            action: updateData.status && updateData.status !== existingJob.status ? 'status_changed' : 'updated',
            entityId: job.id,
            invalidate: [...JOB_REALTIME_TAGS],
            permissions: ['jobs'],
            payload: {
                jobId: job.id,
                ticketNumber: job.id,
                status: job.status,
            },
        });

        if (updateData.technician !== undefined || updateData.assignedTechnicianId !== undefined) {
            try {
                const projection = await jobService.syncLinkedServiceRequestFromJob(job.id, "System Projection");
                if (projection.serviceRequest?.customerId && projection.changed) {
                    notifyCustomerUpdate(projection.serviceRequest.customerId, {
                        type: 'order_update',
                        orderId: projection.serviceRequest.id,
                        trackingStatus: projection.trackingStatus,
                        status: projection.status,
                        updatedAt: new Date().toISOString()
                    });
                }
            } catch (syncErr) {
                console.error('[Projection] Failed to project SR from job update:', syncErr);
            }
        }

        // Send push notification to customer on status change
        if (updateData.status && updateData.status !== existingJob.status && job.customerPhone) {
            // Lookup customer by phone to get their userId for push notifications
            userRepo.getUserByPhoneNormalized(job.customerPhone)
                .then(customer => {
                    if (customer) {
                        pushService.notifyOrderStatusChange(customer.id, job.id, job.status)
                            .then(() => console.log(`[Push] Sent status notification for job ${job.id}`))
                            .catch(err => console.error('[Push] Failed to send status notification:', err));
                    }
                })
                .catch(err => console.error('[Push] Failed to lookup customer:', err));
        }

        res.json(job);
    } catch (error: any) {
        console.error('Failed to update job ticket:', error.message, error);
        res.status(500).json({ error: 'Failed to update job ticket', details: error.message });
    }
});

/**
 * DELETE /api/job-tickets/:id - Delete job ticket
 */
router.delete('/api/job-tickets/:id', requireAdminAuth, requireGranularPermission('jobs.delete'), async (req: Request, res: Response) => {
    try {
        const jobId = req.params.id;
        const existing = await jobRepo.getJobTicket(jobId);
        if (!existing) {
            return res.status(404).json({ error: 'Job ticket not found' });
        }
        try {
            assertJobNotNgProtected(existing.status, "delete");
        } catch (err) {
            if (isNgWorkflowError(err)) {
                return res.status(err.status).json({ error: err.message, code: err.code });
            }
            throw err;
        }
        const success = await jobRepo.deleteJobTicket(jobId);
        if (!success) {
            return res.status(404).json({ error: 'Job ticket not found' });
        }

        publishJobTicketEvent({
            action: 'deleted',
            entityId: jobId,
            invalidate: [...JOB_REALTIME_TAGS],
            permissions: ['jobs'],
            payload: {
                jobId,
                ticketNumber: jobId,
            },
        });

        // Audit Log
        await auditLogger.log({
            userId: req.session?.adminUserId || 'system',
            action: 'DELETE_JOB',
            entity: 'JobTicket',
            entityId: jobId,
            details: `Deleted job ticket ${jobId}`,
            oldValue: { id: jobId }, // Minimal info since deleted
            req: req
        });

        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete job ticket' });
    }
});

/**
 * GET /api/public/qr - Proxy QR image generation for reliable preview/printing
 */
router.get('/api/public/qr', async (req: Request, res: Response) => {
    try {
        const data = typeof req.query.data === 'string' ? req.query.data : '';
        const size = typeof req.query.size === 'string' ? req.query.size : '150x150';

        if (!data) {
            return res.status(400).json({ error: 'Missing QR data' });
        }

        if (!/^\d{2,4}x\d{2,4}$/.test(size)) {
            return res.status(400).json({ error: 'Invalid QR size' });
        }

        const qrResponse = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=${encodeURIComponent(size)}&data=${encodeURIComponent(data)}`);
        if (!qrResponse.ok) {
            return res.status(502).json({ error: 'Failed to generate QR code' });
        }

        const contentType = qrResponse.headers.get('content-type') || 'image/png';
        const imageBuffer = Buffer.from(await qrResponse.arrayBuffer());

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.send(imageBuffer);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to generate QR code', details: error.message });
    }
});

/**
 * GET /api/job-tickets/track/:id - Public job tracking (for QR code scanning)
 * Allowlist only — no serials, estimatedCost, phone, notes, or money fields.
 */
router.get('/api/job-tickets/track/:id', async (req: Request, res: Response) => {
    try {
        const job = await jobRepo.getJobTicket(req.params.id);
        if (!job) {
            return res.status(404).json({ error: 'Job ticket not found' });
        }

        // JOB-INTAKE-UNIFICATION-01A-B — external Technician jobs are not public-trackable.
        // TECHNICIAN-QR-TRACKING-01 owns the scoped replacement; same not-found as missing id.
        const { isExternalTechnicianJob } = await import(
            '../services/external-technician-intake.service.js'
        );
        if (isExternalTechnicianJob(job as any)) {
            return res.status(404).json({ error: 'Job ticket not found' });
        }

        res.json({
            id: job.id,
            device: job.device,
            screenSize: job.screenSize,
            status: job.status,
            createdAt: job.createdAt,
            completedAt: job.completedAt,
            deadline: job.deadline,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch job tracking info' });
    }
});

/**
 * GET /api/public/quote/:token — RETIRED (SERVICE-INTAKE-RELIABILITY-01B)
 * Legacy public quote view. Replaced by canonical retail quote contract (00C-A).
 * Returns 410 Gone for any token. No job lookup, no existence oracle, no data leak.
 */
router.get('/api/public/quote/:token', async (_req: Request, res: Response) => {
    return res.status(410).json({
        error: "This legacy quote link is no longer available.",
        code: "LEGACY_PUBLIC_QUOTE_RETIRED",
    });
});

/**
 * POST /api/public/quote/:token/approve — RETIRED (SERVICE-INTAKE-RELIABILITY-01B)
 * Legacy 1-click quote approval. Replaced by canonical retail quote accept/convert flow.
 * Returns 410 Gone for any token. No job lookup, no mutation, no data leak.
 */
router.post('/api/public/quote/:token/approve', async (_req: Request, res: Response) => {
    return res.status(410).json({
        error: "This legacy quote link is no longer available.",
        code: "LEGACY_PUBLIC_QUOTE_RETIRED",
    });
});

/**
 * POST /api/job-tickets/:id/record-payment
 * 00C-B: Compatibility adapter — never writes paidAmount without canonical POS settlement.
 * Deprecated for new clients; use POST /api/pos-transactions.
 */
router.post('/api/job-tickets/:id/record-payment', requireAdminAuth, requireGranularPermission('pos.processPayment'), async (req: Request, res: Response) => {
    try {
        const jobId = req.params.id;
        const { paymentId, amount, method, clientRequestId } = req.body || {};

        if (!paymentId || amount == null || !method) {
            return res.status(400).json({ error: "Missing payment details", code: "MISSING_PAYMENT_DETAILS" });
        }

        const actor = (req as any).user;
        const actorUserId = actor?.id || req.session?.adminUserId;
        if (!actorUserId) {
            return res.status(401).json({ error: "Admin authentication required" });
        }

        const { settleJobPaymentViaPos, RetailMoneyError, withPosLifecycle } = await import(
            '../services/retail-money-settlement.service.js'
        );

        const result = await settleJobPaymentViaPos({
            jobId,
            amount: Number(amount),
            method: String(method),
            paymentId: String(paymentId),
            clientRequestId: clientRequestId ? String(clientRequestId) : String(paymentId),
            actorUserId,
            req,
        });

        await auditLogger.log({
            userId: actorUserId,
            action: result.reused ? 'RECORD_PAYMENT_ADAPTER_REUSE' : 'RECORD_PAYMENT_ADAPTER_SETTLE',
            entity: 'JobTicket',
            entityId: jobId,
            details: `Adapter settlement via POS ${result.posTransaction.id} amount=${amount} method=${method}`,
            newValue: {
                posTransactionId: result.posTransaction.id,
                paidAmount: result.job.paidAmount,
                paymentStatus: result.job.paymentStatus,
                reused: result.reused,
            },
            req,
        });

        publishJobTicketEvent({
            action: 'updated',
            entityId: result.job.id,
            invalidate: [...JOB_REALTIME_TAGS],
            permissions: ['jobs'],
            payload: {
                jobId: result.job.id,
                ticketNumber: result.job.id,
                status: result.job.status,
            },
        });

        res.json({
            ...result.job,
            posTransaction: withPosLifecycle(result.posTransaction),
            settlement: {
                reused: result.reused,
                deprecated: true,
                deprecation: "Use POST /api/pos-transactions for new integrations",
                legacyHistoryIncomplete: result.legacyHistoryIncomplete,
            },
        });
    } catch (error: any) {
        const { RetailMoneyError } = await import('../services/retail-money-settlement.service.js');
        if (error instanceof RetailMoneyError) {
            return res.status(error.status).json({
                error: error.message,
                code: error.code,
                ...(error.details || {}),
            });
        }
        console.error('[Jobs] record-payment adapter failed:', (error as Error).message);
        res.status(500).json({ error: 'Failed to record payment' });
    }
});

/**
 * POST /api/job-tickets/:id/generate-invoice - Generate invoice with checks
 * Requires: Admin auth + process_payment permission (Cashier/Manager/Super Admin)
 */
router.post('/api/job-tickets/:id/generate-invoice', requireAdminAuth, requirePermission('process_payment'), async (req: Request, res: Response) => {
    try {
        const jobId = req.params.id;
        const userId = req.session?.adminUserId;
        const user = userId ? await userRepo.getUser(userId) : null;
        const userRole = user?.role;

        const job = await jobRepo.getJobTicket(jobId);
        if (!job) return res.status(404).json({ error: "Job not found" });

        try {
            assertJobNotNgProtected(job.status, "generate-invoice");
        } catch (err) {
            if (isNgWorkflowError(err)) {
                return res.status(err.status).json({ error: err.message, code: err.code });
            }
            throw err;
        }

        // 1. Payment Check
        if (job.paymentStatus !== 'paid' && job.paymentStatus !== 'partial') {
            return res.status(403).json({
                error: "Payment Required",
                message: "Cannot generate invoice for unpaid job. Please collect payment first."
            });
        }

        // 2. Print Limit Check
        const printCount = job.invoicePrintCount || 0;
        if (printCount >= 2 && userRole !== 'Super Admin') {
            return res.status(403).json({
                error: "Print Limit Exceeded",
                message: "Maximum 2 prints allowed. Contact Super Admin for reprints."
            });
        }

        // Update print stats
        const updatedJob = await jobRepo.updateJobTicket(jobId, {
            billingStatus: 'invoiced',
            invoicePrintedAt: new Date(),
            invoicePrintedBy: req.session?.adminUserId,
            invoicePrintCount: printCount + 1
        });

        // Audit Log
        await auditLogger.log({
            userId: req.session?.adminUserId || 'unknown',
            action: 'GENERATE_INVOICE',
            entity: 'JobTicket',
            entityId: jobId,
            details: `Invoice generated (Print #${printCount + 1})`,
            req: req
        });

        if (updatedJob) {
            publishJobTicketEvent({
                action: 'updated',
                entityId: updatedJob.id,
                invalidate: [...JOB_REALTIME_TAGS],
                permissions: ['jobs'],
                payload: {
                    jobId: updatedJob.id,
                    ticketNumber: updatedJob.id,
                    status: updatedJob.status,
                },
            });
        }

        res.json(updatedJob);
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate invoice' });
    }
});

/**
 * POST /api/job-tickets/:id/write-off - Write off bad debt (Manager/Super Admin only)
 * Requires: Admin auth + Manager or Super Admin role
 */
router.post('/api/job-tickets/:id/write-off', requireAdminAuth, requireGranularPermission('jobs.writeOff'), async (req: Request, res: Response) => {
    try {
        const userId = req.session?.adminUserId;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const { reason } = req.body;
        if (!reason) return res.status(400).json({ error: "Reason is required for write-off" });

        const existing = await jobRepo.getJobTicket(req.params.id);
        if (!existing) return res.status(404).json({ error: "Job not found" });
        try {
            assertJobNotNgProtected(existing.status, "write-off");
        } catch (err) {
            if (err instanceof NgWorkflowLockedError) {
                return res.status(409).json({ error: err.message, code: err.code });
            }
            throw err;
        }

        const user = (req as any).user;
        const transition = await transitionJobStatus({
            jobId: req.params.id,
            toStatus: 'Closed',
            actor: {
                id: user?.id || req.session?.adminUserId || 'system',
                name: user?.name || 'System',
                role: user?.role || 'Manager',
            },
            reason: 'write_off',
            extraPatch: {
                paymentStatus: 'written_off',
                writeOffReason: reason,
                writeOffBy: req.session?.adminUserId,
                writeOffAt: new Date(),
            },
            suppressReadyNotify: true,
        });
        const updatedJob = transition.job;

        await auditLogger.log({
            userId: req.session?.adminUserId || 'unknown',
            action: 'WRITE_OFF_JOB',
            entity: 'JobTicket',
            entityId: req.params.id,
            details: `Job written off: ${reason}`,
            req: req
        });

        if (updatedJob) {
            publishJobTicketEvent({
                action: 'updated',
                entityId: updatedJob.id,
                invalidate: [...JOB_REALTIME_TAGS],
                permissions: ['jobs'],
                payload: {
                    jobId: updatedJob.id,
                    ticketNumber: updatedJob.id,
                    status: updatedJob.status,
                },
            });
        }

        res.json(updatedJob);
    } catch (error: any) {
        if (isNgWorkflowError(error)) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        res.status(500).json({ error: 'Failed to write off job' });
    }
});

/**
 * POST /api/job-tickets/:id/mark-incomplete - Mark payment as incomplete
 * Requires: Admin auth + process_payment permission (Cashier/Manager/Super Admin)
 */
router.post('/api/job-tickets/:id/mark-incomplete', requireAdminAuth, requirePermission('process_payment'), async (req: Request, res: Response) => {
    try {
        const { reason } = req.body;
        const existing = await jobRepo.getJobTicket(req.params.id);
        if (!existing) return res.status(404).json({ error: "Job not found" });
        try {
            assertJobNotNgProtected(existing.status, "mark-incomplete");
        } catch (err) {
            if (isNgWorkflowError(err)) {
                return res.status(err.status).json({ error: err.message, code: err.code });
            }
            throw err;
        }
        const updatedJob = await jobRepo.updateJobTicket(req.params.id, {
            paymentStatus: 'incomplete',
            notes: reason ? `Payment incomplete: ${reason}` : undefined
        });

        await auditLogger.log({
            userId: req.session?.adminUserId || 'unknown',
            action: 'MARK_PAYMENT_INCOMPLETE',
            entity: 'JobTicket',
            entityId: req.params.id,
            details: reason || 'Marked as payment incomplete',
            req: req
        });

        if (updatedJob) {
            publishJobTicketEvent({
                action: 'updated',
                entityId: updatedJob.id,
                invalidate: [...JOB_REALTIME_TAGS],
                permissions: ['jobs'],
                payload: {
                    jobId: updatedJob.id,
                    ticketNumber: updatedJob.id,
                    status: updatedJob.status,
                },
            });
        }

        res.json(updatedJob);
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark payment incomplete' });
    }
});

// ─── Unified Repair Case ───

router.get('/api/admin/job-tickets/:id/repair-case', requireAdminAuth, requireGranularPermission('jobs.view'), async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (user?.role === 'Technician') {
            const job = await jobRepo.getJobTicket(req.params.id);
            if (!job || (job.assignedTechnicianId !== user.id && (job as any).technician !== user.name)) {
                return res.status(403).json({ error: 'Access denied: not assigned to this job' });
            }
        }
        const repairCase = await loadRepairCaseByJobTicket(req.params.id);
        if (!repairCase) return res.status(404).json({ error: 'Job ticket not found' });
        res.json(repairCase);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to load repair case' });
    }
});

export default router;
