/**
 * Warranty Claims API Routes
 *
 * Handles warranty claim management with strict audit trail:
 * - List claims (with filters)
 * - Create claim (auto-validates warranty)
 * - Approve/Reject claims (Manager+ only)
 * - Create linked warranty job
 *
 * Route order matters: specific paths (/check/:x) MUST come before param paths (/:id).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { storage } from '../storage.js';
import { notificationRepo, jobRepo, warrantyRepo } from '../repositories/index.js';
import { auditLogger } from '../utils/auditLogger.js';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import {
    requireAdminAuth,
    requireGranularPermission,
    requireAnyGranularPermission,
} from './middleware/auth.js';
import { repairJourneyService } from '../services/customer-repair-journey.service.js';

const router = Router();

// All warranty routes require admin session
router.use('/api/warranty-claims', requireAdminAuth);

// ── Read routes ──────────────────────────────────────────────────────────────

// Get all warranty claims with optional filters
// Includes safe job references via LEFT JOIN (see warrantyRepo.getAllWarrantyClaims)
router.get('/api/warranty-claims', requireGranularPermission('warranty.view'), async (req: Request, res: Response) => {
    try {
        const { status, phone, page = '1', limit = '20' } = req.query;
        const claims = await warrantyRepo.getAllWarrantyClaims({
            status: status as string,
            phone: phone as string,
            page: parseInt(page as string),
            limit: parseInt(limit as string),
        });
        res.json(claims);
    } catch (error: any) {
        console.error('[Warranty] Error fetching claims:', error);
        res.status(500).json({ error: error.message });
    }
});

// Search original job for warranty check — MUST be before /:id to avoid param capture
router.get(
    '/api/warranty-claims/check/:jobId',
    requireAnyGranularPermission(['warranty.view', 'warranty.create']),
    async (req: Request, res: Response) => {
        try {
            const job = await jobRepo.getJobTicket(req.params.jobId);
            if (!job) {
                return res.status(404).json({ error: 'Job not found' });
            }

            const now = new Date();
            const warrantyValid = job.warrantyExpiryDate
                ? new Date(job.warrantyExpiryDate) > now
                : false;

            /**
             * Report BOTH clocks.
             *
             * This returned only the labour warranty, so a staff member looking
             * at a job with live parts cover was told "expired" and would turn
             * the customer away. The `warranty` object keeps its original shape
             * for existing callers; `parts` is additive.
             *
             * `parts` is null when the job has no distinct parts warranty, which
             * is every job created before the column existed — the caller can
             * then show a single period exactly as before.
             */
            const daysBetween = (d: Date) =>
                Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

            const partsExpiry = job.partsWarrantyExpiryDate
                ? new Date(job.partsWarrantyExpiryDate)
                : null;

            res.json({
                job,
                warranty: {
                    valid: warrantyValid,
                    expiryDate: job.warrantyExpiryDate,
                    daysRemaining: job.warrantyExpiryDate
                        ? daysBetween(new Date(job.warrantyExpiryDate))
                        : 0,
                },
                parts: partsExpiry
                    ? {
                          valid: partsExpiry > now,
                          expiryDate: job.partsWarrantyExpiryDate,
                          daysRemaining: daysBetween(partsExpiry),
                      }
                    : null,
            });
        } catch (error: any) {
            console.error('[Warranty] Error checking warranty:', error);
            res.status(500).json({ error: error.message });
        }
    },
);

// Check if a device serial number has an active warranty — MUST be before /:id
router.get(
    '/api/warranty-claims/check-serial/:serial',
    requireAnyGranularPermission(['warranty.view', 'warranty.create']),
    async (req: Request, res: Response) => {
        try {
            const { serial } = req.params;
            if (!serial || serial.trim().length < 3) {
                return res.json({ hasWarranty: false, jobs: [] });
            }

            const now = new Date().toISOString();

            const rows = await db.execute(sql`
                SELECT id, device, status,
                       COALESCE(NULLIF(serial_number, ''), NULLIF(tv_serial_number, '')) as "serialNumber",
                       warranty_expiry_date as "warrantyExpiryDate", warranty_days as "warrantyDays",
                       completed_at as "completedAt"
                FROM job_tickets
                WHERE (LOWER(TRIM(serial_number)) = LOWER(TRIM(${serial}))
                       OR LOWER(TRIM(tv_serial_number)) = LOWER(TRIM(${serial})))
                  AND status IN ('Ready', 'Delivered', 'Completed')
                  AND warranty_expiry_date IS NOT NULL
                  AND warranty_expiry_date > ${now}
                LIMIT 5
            `);

            const jobs = ((rows as any).rows ?? rows) as any[];

            res.json({
                hasWarranty: jobs.length > 0,
                jobs: jobs.map((j: any) => ({
                    id: j.id,
                    device: j.device,
                    status: j.status,
                    warrantyExpiryDate: j.warrantyExpiryDate,
                    warrantyDays: j.warrantyDays,
                    completedAt: j.completedAt,
                })),
            });
        } catch (error: any) {
            console.error('[Warranty] Error checking serial warranty:', error);
            res.status(500).json({ error: 'Failed to check serial warranty' });
        }
    },
);

// Get single warranty claim (with safe refs)
router.get('/api/warranty-claims/:id', requireGranularPermission('warranty.view'), async (req: Request, res: Response) => {
    try {
        const claim = await warrantyRepo.getWarrantyClaimWithRefs(req.params.id);
        if (!claim) {
            return res.status(404).json({ error: 'Warranty claim not found' });
        }
        res.json(claim);
    } catch (error: any) {
        console.error('[Warranty] Error fetching claim:', error);
        res.status(500).json({ error: error.message });
    }
});

// ── Write routes ─────────────────────────────────────────────────────────────

// Create warranty claim (admin-originated)
router.post('/api/warranty-claims', requireGranularPermission('warranty.create'), async (req: Request, res: Response) => {
    try {
        const { originalJobId, claimType, claimReason, notes } = req.body;

        const job = await jobRepo.getJobTicket(originalJobId);
        if (!job) {
            return res.status(404).json({ error: 'Original job not found' });
        }

        // C: validate and preserve claimType; do not fall back silently to 'general'
        const validTypes = ['service', 'parts', 'crr', 'reservice', 'general'];
        const resolvedType = validTypes.includes(claimType) ? claimType : 'general';

        /**
         * Judge the claim against the clock that actually governs it.
         *
         * resolvedType was computed, stored on the claim, and then ignored: this
         * check only ever read job.warrantyExpiryDate, so a parts claim and a
         * service claim on the same job produced the same answer. A panel still
         * inside a manufacturer's six-month cover was refused the moment the
         * 30-day labour warranty lapsed — which is the opposite of what the
         * published Terms promise.
         *
         * A 'parts' claim now reads the parts expiry when the job has one.
         * Falling back to the service expiry is deliberate rather than lazy:
         * every job created before parts_warranty_expiry_date existed has NULL
         * there, and those jobs must keep behaving exactly as they did. A
         * fallback also fails in the customer's favour, which is the right
         * direction for an ambiguous warranty.
         */
        const now = new Date();
        const claimIsPartsOnly = resolvedType === 'parts';
        const governingExpiry = claimIsPartsOnly && job.partsWarrantyExpiryDate
            ? job.partsWarrantyExpiryDate
            : job.warrantyExpiryDate;

        let warrantyValid = false;
        let warrantyExpiryDate: Date | null = null;
        if (governingExpiry) {
            warrantyExpiryDate = new Date(governingExpiry);
            if (warrantyExpiryDate > now) warrantyValid = true;
        }

        // D: actor from session — never from client body
        const actor = (req as any).user;

        const claim = await warrantyRepo.createWarrantyClaim({
            originalJobId,
            serviceAreaId: job.corporateClientId || job.corporateChallanId ? undefined : job.serviceAreaId || undefined,
            customer: job.customer || 'Unknown',
            customerPhone: job.customerPhone,
            device: (job as any).device || undefined,
            claimType: resolvedType,
            claimReason,
            status: 'pending',
            warrantyValid,
            warrantyExpiryDate: warrantyExpiryDate || undefined,
            claimedBy: actor?.id || 'system',
            claimedByName: actor?.name || 'System',
            claimedByRole: actor?.role || 'System',
            claimedAt: new Date(),
            notes,
        });

        res.status(201).json(claim);
    } catch (error: any) {
        console.error('[Warranty] Error creating claim:', error);
        res.status(500).json({ error: error.message });
    }
});

// Approve warranty claim
router.patch('/api/warranty-claims/:id/approve', requireGranularPermission('warranty.approve'), async (req: Request, res: Response) => {
    try {
        const claim = await warrantyRepo.getWarrantyClaim(req.params.id);
        if (!claim) {
            return res.status(404).json({ error: 'Warranty claim not found' });
        }

        if (claim.status !== 'pending') {
            return res.status(400).json({ error: `Cannot approve claim with status: ${claim.status}` });
        }

        // Authorization MUST be based on the authenticated user's real role — never
        // a client-supplied req.body.approvedByRole (that let any admin send
        // approvedByRole:'Super Admin' to bypass the gate / expired-warranty override).
        const actor = (req as any).user;
        const approvedBy = actor?.id;
        const approvedByName = actor?.name;
        const approvedByRole = actor?.role;

        if (!['Manager', 'Super Admin', 'Admin'].includes(approvedByRole)) {
            return res.status(403).json({ error: 'Only Manager or Admin can approve warranty claims' });
        }

        if (!claim.warrantyValid && approvedByRole !== 'Super Admin') {
            return res.status(403).json({
                error: 'Only Super Admin can approve claims with expired warranty',
            });
        }

        const updated = await storage.updateWarrantyClaim(req.params.id, {
            status: 'approved',
            approvedBy,
            approvedByName,
            approvedByRole,
            approvedAt: new Date(),
        });

        await auditLogger.log({
            userId: approvedBy,
            action: 'APPROVE',
            entity: 'warranty_claim',
            entityId: req.params.id,
            oldValue: { status: claim.status },
            newValue: { status: 'approved', approvedBy, approvedByName },
        });

        // E: sync outcome to customer journey
        const approveJourneyRows = await db.execute(sql`
            SELECT id FROM customer_repair_journeys WHERE warranty_claim_id = ${req.params.id} LIMIT 1
        `);
        const approveJourney = ((approveJourneyRows as any).rows ?? approveJourneyRows)[0] as { id: string } | undefined;
        if (approveJourney) {
            await db.execute(sql`
                UPDATE customer_repair_journeys
                SET current_stage = 'repair_approved', current_status = 'active',
                    customer_friendly_status = 'Your warranty claim has been approved. A repair job is being prepared.',
                    updated_at = NOW()
                WHERE id = ${approveJourney.id}
            `);
            repairJourneyService.addJourneyEvent({
                journeyId: approveJourney.id,
                eventType: 'warranty_claim_approved',
                title: 'Warranty Claim Approved',
                message: 'Your warranty claim has been approved. A repair job has been opened for review.',
                actorType: 'admin',
                actorId: approvedBy,
                isCustomerVisible: true,
            }).catch((err: Error) => console.error('[Warranty] Journey event failed (approve):', err.message));
        }

        res.json(updated);
    } catch (error: any) {
        console.error('[Warranty] Error approving claim:', error);
        res.status(500).json({ error: error.message });
    }
});

// Reject warranty claim
router.patch('/api/warranty-claims/:id/reject', requireGranularPermission('warranty.approve'), async (req: Request, res: Response) => {
    try {
        const { rejectionReason } = req.body;

        const claim = await warrantyRepo.getWarrantyClaim(req.params.id);
        if (!claim) {
            return res.status(404).json({ error: 'Warranty claim not found' });
        }

        if (claim.status !== 'pending') {
            return res.status(400).json({ error: `Cannot reject claim with status: ${claim.status}` });
        }

        // Authorization from the authenticated user's real role, not client body.
        const actor = (req as any).user;
        const approvedBy = actor?.id;
        const approvedByName = actor?.name;
        const approvedByRole = actor?.role;

        if (!['Manager', 'Super Admin', 'Admin'].includes(approvedByRole)) {
            return res.status(403).json({ error: 'Only Manager or Admin can reject warranty claims' });
        }

        const updated = await storage.updateWarrantyClaim(req.params.id, {
            status: 'rejected',
            approvedBy,
            approvedByName,
            approvedByRole,
            approvedAt: new Date(),
            rejectionReason,
        });

        await auditLogger.log({
            userId: approvedBy,
            action: 'REJECT',
            entity: 'warranty_claim',
            entityId: req.params.id,
            oldValue: { status: claim.status },
            newValue: { status: 'rejected', rejectionReason },
        });

        // E: sync outcome to customer journey
        const rejectJourneyRows = await db.execute(sql`
            SELECT id FROM customer_repair_journeys WHERE warranty_claim_id = ${req.params.id} LIMIT 1
        `);
        const rejectJourney = ((rejectJourneyRows as any).rows ?? rejectJourneyRows)[0] as { id: string } | undefined;
        if (rejectJourney) {
            await db.execute(sql`
                UPDATE customer_repair_journeys
                SET current_stage = 'cancelled', current_status = 'closed',
                    customer_friendly_status = 'Your warranty claim has been reviewed and could not be approved at this time.',
                    updated_at = NOW()
                WHERE id = ${rejectJourney.id}
            `);
            const safeReason = rejectionReason ? ` Reason: ${String(rejectionReason).slice(0, 200)}` : '';
            repairJourneyService.addJourneyEvent({
                journeyId: rejectJourney.id,
                eventType: 'warranty_claim_rejected',
                title: 'Warranty Claim Rejected',
                message: `Your warranty claim was not approved.${safeReason}`,
                actorType: 'admin',
                actorId: approvedBy,
                isCustomerVisible: true,
            }).catch((err: Error) => console.error('[Warranty] Journey event failed (reject):', err.message));
        }

        res.json(updated);
    } catch (error: any) {
        console.error('[Warranty] Error rejecting claim:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create linked warranty job from approved claim
router.post('/api/warranty-claims/:id/create-job', requireGranularPermission('warranty.approve'), async (req: Request, res: Response) => {
    try {
        const claim = await warrantyRepo.getWarrantyClaim(req.params.id);
        if (!claim) {
            return res.status(404).json({ error: 'Warranty claim not found' });
        }

        if (claim.status !== 'approved') {
            return res.status(400).json({ error: 'Only approved claims can create warranty jobs' });
        }

        const originalJob = await jobRepo.getJobTicket(claim.originalJobId);
        if (!originalJob) {
            return res.status(404).json({ error: 'Original job not found' });
        }

        const { id: _drop, ...originalJobWithoutId } = originalJob as any;
        const newJob = await jobRepo.createJobTicket({
            ...originalJobWithoutId,
            parentJobId: claim.originalJobId,
            serviceAreaId: originalJob.corporateClientId || originalJob.corporateChallanId ? undefined : originalJob.serviceAreaId || undefined,
            jobType: 'warranty_claim',
            status: 'Pending',
            paymentStatus: 'paid',
            billingStatus: 'billed',
            estimatedCost: 0,
            paidAmount: 0,
            remainingAmount: 0,
            issue: `CRR / Reservice: ${claim.claimReason}`,
            notes: `CRR / reservice #${claim.id}. Original job: ${claim.originalJobId}`,
            createdAt: undefined,
        } as any);

        await storage.updateWarrantyClaim(req.params.id, {
            newJobId: newJob.id,
            status: 'in_repair',
        });

        // D: audit actor from session, not client body
        const createJobActor = (req as any).user;
        await auditLogger.log({
            userId: createJobActor?.id || 'system',
            action: 'CREATE_WARRANTY_JOB',
            entity: 'warranty_claim',
            entityId: req.params.id,
            newValue: { newJobId: newJob.id },
        });

        // E: link journey to new job + notify customer
        const createJobJourneyRows = await db.execute(sql`
            SELECT id FROM customer_repair_journeys WHERE warranty_claim_id = ${req.params.id} LIMIT 1
        `);
        const createJobJourney = ((createJobJourneyRows as any).rows ?? createJobJourneyRows)[0] as { id: string } | undefined;
        if (createJobJourney) {
            await db.execute(sql`
                UPDATE customer_repair_journeys
                SET job_ticket_id = ${newJob.id}, current_stage = 'repair_in_progress', current_status = 'active',
                    customer_friendly_status = 'Your warranty repair job has been created and is waiting for technician review.',
                    updated_at = NOW()
                WHERE id = ${createJobJourney.id}
            `);
            repairJourneyService.addJourneyEvent({
                journeyId: createJobJourney.id,
                eventType: 'warranty_repair_started',
                title: 'Warranty Repair Started',
                message: 'Your warranty repair job has been created and is waiting for technician review.',
                actorType: 'admin',
                actorId: createJobActor?.id,
                isCustomerVisible: true,
            }).catch((err: Error) => console.error('[Warranty] Journey event failed (create-job):', err.message));
        }

        res.status(201).json({ claim: { ...claim, newJobId: newJob.id }, job: newJob });
    } catch (error: any) {
        console.error('[Warranty] Error creating warranty job:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
