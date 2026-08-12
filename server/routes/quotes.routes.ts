/**
 * Quotes Routes
 * 
 * Handles quote request workflows.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { settingsRepo, notificationRepo, systemRepo, userRepo, jobRepo, serviceRequestRepo, warrantyRepo, hrRepo } from '../repositories/index.js';
import { insertQuoteRequestSchema } from '../../shared/schema.js';
import { getCustomerId, requireAdminAuth, requireCustomerAuth, requireGranularPermission, requireAnyGranularPermission } from './middleware/auth.js';
import { notifyAdminUpdate, notifyCustomerUpdate } from './middleware/sse-broker.js';
import { pushService } from '../pushService.js';
import { jobService } from '../services/job.service.js';

import { serviceRequestLimiter } from './middleware/rate-limit.js';
import { repairJourneyService } from '../services/customer-repair-journey.service.js';
import { syncPickupScheduleToLogisticsTask } from '../services/logistics-task.service.js';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { auditLogger } from '../utils/auditLogger.js';
import {
    sendOrPriceQuote,
    acceptRetailQuote,
    declineRetailQuote,
    convertRetailQuoteToJob,
    RetailQuoteError,
    attachCanonicalQuoteView,
} from '../services/retail-quote.service.js';
import {
    createRetailServiceRequest,
    IntakeError,
    parseIdempotencyKeyHeader,
    sanitizePublicServiceRequest,
} from '../services/retail-intake.service.js';
import {
    createPosSaleAtomic,
    derivePosRefundLifecycle,
    findPosByClientRequest,
    awaitPosByClientRequest,
    fingerprintFromValidated,
    assertIdempotentReplay,
    PosBillingError,
} from '../services/pos-billing.service.js';
import { getSafeJobDisplayRef } from '../../shared/job-display-utils.js';

const router = Router();
const PICKUP_SCHEDULEABLE_STAGES = ['intake', 'assessment', 'authorized', 'pickup_scheduled'];
const PICKUP_RECEIVED_STAGES = ['picked_up', 'device_received', 'in_repair', 'ready', 'out_for_delivery', 'completed', 'closed'];
const PICKUP_DELIVERED_STAGES = ['completed', 'closed'];
const JOB_NUMBER_RE = /^JOB-\d{4}-\d{4,}$/i;

function validatePickupCustodyStatus(status: string | undefined, stage: string | null | undefined) {
    if (status === 'PickedUp' && !PICKUP_RECEIVED_STAGES.includes(stage || '')) {
        return 'Customer receive OTP is required before marking this pickup as picked up.';
    }
    if (status === 'Delivered' && !PICKUP_DELIVERED_STAGES.includes(stage || '')) {
        return 'Customer delivery OTP is required before marking this pickup as delivered.';
    }
    return null;
}

// ============================================
// Quote Requests API
// ============================================

/**
 * POST /api/quotes - Submit quote request (rate limited)
 */
router.post('/api/quotes', serviceRequestLimiter, async (req: Request, res: Response) => {
    try {
        const validated = insertQuoteRequestSchema.parse(req.body);

        const customerId = req.session?.customerId || null;
        const idempotencyKey = parseIdempotencyKeyHeader(req.headers['idempotency-key']);

        const result = await createRetailServiceRequest({
            brand: validated.brand,
            primaryIssue: validated.primaryIssue,
            customerName: validated.customerName,
            phone: validated.phone,
            screenSize: validated.screenSize || null,
            modelNumber: validated.modelNumber || null,
            symptoms: validated.symptoms || null,
            description: validated.description || null,
            servicePreference: validated.servicePreference || null,
            requestIntent: validated.requestIntent || 'quote',
            serviceMode: validated.serviceMode || null,
            serviceId: validated.serviceId || null,
            isQuote: true,
            customerId,
            intakeSource: "quote_request",
            idempotencyKey,
            // Quotes stay at Request Received until acceptance — do not advance pickup/drop-off.
            initialTrackingStatus: "Request Received",
        });

        if (result.duplicateWindow) {
            return res.status(202).json({
                error: 'We already received a similar request. Our team will contact you soon.',
                code: 'DUPLICATE_REQUEST_WINDOW',
            });
        }

        const quoteRequest = result.serviceRequest;
        const publicQuote = sanitizePublicServiceRequest(quoteRequest as any);

        if (!result.idempotent) {
            notifyAdminUpdate({
                type: 'quote_request_created',
                data: publicQuote,
                createdAt: new Date().toISOString()
            });

            // ITEM 1: use post-intake resolved owner (quoteRequest.customerId), not the
            // pre-intake session capture which is null for anonymous submissions.
            // ITEM 2: await so failures are observable; do NOT reject the already-committed
            // service request — customer already has a ticket; journey is best-effort linkage.
            // HOTFIX-2: the log below does NOT recreate a missing journey. Re-running
            // intake is idempotent and does NOT recreate the journey either, and
            // reconcileOrphanJourneys only assigns ownership to a journey that already
            // exists. Missing-journey recreation remains a separate follow-up that
            // requires an explicit non-guessing design — no migration/outbox here.
            try {
                await repairJourneyService.createJourneyFromQuote({
                    quoteRequestId: quoteRequest.id,
                    customerId: quoteRequest.customerId || null,
                    customerNote: validated.description || undefined,
                    serviceMode: (validated.serviceMode as any) || undefined,
                });
            } catch (err) {
                console.error(
                    '[RepairJourney] FAILED to create journey from quote',
                    quoteRequest.id,
                    (err as Error).message,
                );
            }
        }

        res.status(result.idempotent ? 200 : 201).json(publicQuote);
    } catch (error: any) {
        if (error instanceof IntakeError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error('[Quotes] Quote request failed:', (error as Error).message);
        res.status(400).json({ error: 'Invalid quote request' });
    }
});

/**
 * GET /api/admin/quotes - List retail quote requests (00C-A-HOTFIX)
 * Requires quote pricing or service-request view — not bare admin session.
 */
router.get(
    '/api/admin/quotes',
    requireAdminAuth,
    requireAnyGranularPermission(['serviceRequests.view', 'serviceRequests.quote']),
    async (req: Request, res: Response) => {
        try {
            const quotes = await serviceRequestRepo.getQuoteRequests();
            res.json(quotes);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch quotes' });
        }
    },
);

/**
 * PATCH /api/admin/quotes/:id/price - Update quote with pricing (admin)
 * Canonical: retail-quote.service sendOrPriceQuote (00C-A)
 */
router.patch('/api/admin/quotes/:id/price', requireAdminAuth, requireGranularPermission('serviceRequests.quote'), async (req: Request, res: Response) => {
    try {
        const { quoteAmount, quoteNotes, quoteValidDays } = req.body;
        const user = (req as any).user;
        if (!user?.id) return res.status(401).json({ error: 'Admin authentication required' });

        const result = await sendOrPriceQuote(
            req.params.id,
            { quoteAmount, quoteNotes, quoteValidDays },
            { kind: "admin", id: user.id, name: user.name || "Admin", role: user.role },
            req,
        );
        const updated = result.serviceRequest;

        if (updated.customerId) {
            notifyCustomerUpdate(updated.customerId, {
                type: 'quote_updated',
                data: attachCanonicalQuoteView(updated),
                updatedAt: new Date().toISOString()
            });

            pushService.notifyQuoteReady(updated.customerId, updated.id, Number(updated.quoteAmount || quoteAmount))
                .catch(err => console.error('[Push] Failed to send quote ready notification:', (err as Error).message));
        }

        repairJourneyService.findJourneyByQuoteRequest(req.params.id).then(journeyId => {
            if (journeyId) {
                repairJourneyService.updateJourneyStage(journeyId, 'quote_sent')
                    .catch(err => console.error('[RepairJourney] Failed to update journey to quote_sent:', (err as Error).message));
            }
        }).catch(err => console.error('[RepairJourney] Lookup error:', (err as Error).message));

        res.json(attachCanonicalQuoteView(updated));
    } catch (error: any) {
        if (error instanceof RetailQuoteError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error('[Quotes] price failed:', (error as Error).message);
        res.status(500).json({ error: 'Failed to update quote' });
    }
});

/**
 * POST /api/quotes/:id/accept - Accept quote (customer)
 * Canonical: acceptRetailQuote (00C-A). Logistics prefs still applied after accept.
 */
router.post('/api/quotes/:id/accept', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const customerId = getCustomerId(req);
        if (!customerId) {
            return res.status(401).json({ error: 'Please login to continue', code: 'NOT_AUTHENTICATED' });
        }

        const { pickupTier, servicePreference, address, scheduledVisitDate } = req.body;

        if (!servicePreference || !['home_pickup', 'service_center'].includes(servicePreference)) {
            return res.status(400).json({ error: 'Valid service preference is required (home_pickup or service_center)' });
        }

        if (servicePreference === 'home_pickup' && !pickupTier) {
            return res.status(400).json({ error: 'Pickup tier is required for home pickup service' });
        }

        const validTiers = ['Regular', 'Priority', 'Emergency'];
        if (servicePreference === 'home_pickup' && !validTiers.includes(pickupTier)) {
            return res.status(400).json({ error: 'Invalid pickup tier. Must be Regular, Priority, or Emergency' });
        }

        const actualPickupTier = servicePreference === 'service_center' ? null : pickupTier;
        const trackingStatus = servicePreference === 'home_pickup' ? 'Arriving to Receive' : 'Queued';

        const parsedScheduledVisitDate = (servicePreference === 'service_center' && scheduledVisitDate)
            ? new Date(scheduledVisitDate)
            : null;

        const outcome = await acceptRetailQuote(
            req.params.id,
            { kind: "customer", id: customerId },
            {
                servicePreference,
                pickupTier: actualPickupTier,
                address: address || '',
                scheduledVisitDate: parsedScheduledVisitDate,
            },
            req,
        );

        let updated = outcome.serviceRequest;
        updated = await serviceRequestRepo.updateServiceRequest(req.params.id, { trackingStatus: trackingStatus as any }) || updated;

        let eventMessage = servicePreference === 'home_pickup'
            ? 'Our team is on the way to collect your TV.'
            : 'Your service request has been queued. Please bring your TV to our service center.';

        if (servicePreference === 'service_center' && scheduledVisitDate) {
            const visitDate = new Date(scheduledVisitDate);
            eventMessage = `Your visit is scheduled for ${visitDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}. Please bring your TV to our service center.`;
        }

        if (!outcome.idempotent) {
            await serviceRequestRepo.createServiceRequestEvent({
                serviceRequestId: req.params.id,
                status: trackingStatus,
                message: eventMessage,
                actor: 'System',
            });
        }

        notifyAdminUpdate({
            type: 'quote_accepted',
            data: { ...updated, servicePreference, trackingStatus, scheduledVisitDate },
            acceptedAt: new Date().toISOString()
        });

        if (updated.customerId) {
            pushService.notifyQuoteAccepted(updated.customerId, updated.ticketNumber || updated.id)
                .catch(err => console.error('[Push] Failed to send quote accepted notification:', (err as Error).message));
        }

        repairJourneyService.findJourneyByQuoteRequest(req.params.id).then(async (journeyId) => {
            if (!journeyId) return;
            const schedType = servicePreference === 'home_pickup' ? 'pickup' : 'service_center_visit';
            const journeyMode = servicePreference === 'home_pickup' ? 'pickup' : 'drop_off';
            const isPickup = servicePreference === 'home_pickup';

            await db.execute(sql`
                UPDATE customer_repair_journeys
                SET current_stage = 'quote_accepted',
                    customer_friendly_status = 'Quote accepted! We will schedule your service shortly.',
                    next_action = 'schedule_service',
                    next_action_label = 'Schedule Pickup or Visit',
                    service_mode = ${journeyMode},
                    pickup_required = ${isPickup},
                    dropoff_required = ${!isPickup},
                    updated_at = NOW()
                WHERE id = ${journeyId}
            `);

            await repairJourneyService.addJourneyEvent({
                journeyId,
                eventType: 'stage_quote_accepted',
                title: 'Quote Accepted',
                message: 'Quote accepted! We will schedule your service shortly.',
                actorType: 'system',
            });

            await repairJourneyService.insertScheduleRow({
                journeyId,
                scheduleType: schedType,
                requestedDate: parsedScheduledVisitDate?.toISOString().split('T')[0] || undefined,
                customerNote: address || undefined,
            });
        }).catch(err => console.error('[RepairJourney] Quote accept sync failed:', (err as Error).message));

        res.json({
            ...attachCanonicalQuoteView(updated),
            servicePreference,
            trackingStatus,
            scheduledPickupDate: parsedScheduledVisitDate,
            idempotent: outcome.idempotent,
        });
    } catch (error: any) {
        if (error instanceof RetailQuoteError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error('[Quotes] Error accepting quote:', (error as Error).message);
        res.status(500).json({ error: 'Failed to accept quote' });
    }
});

/**
 * POST /api/quotes/:id/decline - Decline quote (customer)
 * Canonical: declineRetailQuote (00C-A)
 */
router.post('/api/quotes/:id/decline', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const customerId = getCustomerId(req);
        if (!customerId) {
            return res.status(401).json({ error: 'Please login to continue', code: 'NOT_AUTHENTICATED' });
        }

        const outcome = await declineRetailQuote(
            req.params.id,
            { kind: "customer", id: customerId },
            req,
        );

        notifyAdminUpdate({
            type: 'quote_declined',
            data: outcome.serviceRequest,
            declinedAt: new Date().toISOString()
        });

        res.json({ ...attachCanonicalQuoteView(outcome.serviceRequest), idempotent: outcome.idempotent });
    } catch (error: any) {
        if (error instanceof RetailQuoteError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error('[Quotes] decline failed:', (error as Error).message);
        res.status(500).json({ error: 'Failed to decline quote' });
    }
});

/**
 * POST /api/quotes/:id/convert - Convert accepted retail quote to job ticket (admin)
 * Requires serviceRequests.convertToJob AND jobs.create (00C-A-HOTFIX).
 */
router.post(
    '/api/quotes/:id/convert',
    requireAdminAuth,
    requireGranularPermission('serviceRequests.convertToJob'),
    requireGranularPermission('jobs.create'),
    async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!user?.id) return res.status(401).json({ error: 'Admin authentication required' });
        const result = await convertRetailQuoteToJob(
            req.params.id,
            { kind: "admin", id: user.id, name: user.name || "Admin", role: user.role },
            req,
        );

        notifyAdminUpdate({
            type: 'quote_converted',
            data: {
                serviceRequest: attachCanonicalQuoteView(result.serviceRequest),
                jobTicket: result.jobTicket,
            },
            convertedAt: new Date().toISOString()
        });

        res.status(result.idempotent ? 200 : 201).json({
            ...attachCanonicalQuoteView(result.serviceRequest),
            jobTicket: result.jobTicket,
            jobId: result.jobTicket.id,
            estimatedCost: result.jobTicket.estimatedCost,
            idempotent: result.idempotent,
        });
    } catch (error: any) {
        if (error instanceof RetailQuoteError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error('[Quotes] convert failed:', (error as Error).message);
        res.status(500).json({ error: 'Failed to convert quote' });
    }
});

// ============================================
// Pickup Schedules API
// ============================================

/**
 * GET /api/admin/pickups - Get all pickup schedules (admin)
 */
router.get('/api/admin/pickups', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { status } = req.query;
        let pickups;
        if (status && typeof status === 'string') {
            pickups = await storage.getPickupSchedulesByStatus(status);
        } else {
            pickups = await storage.getAllPickupSchedules();
        }
        res.json(pickups);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pickup schedules' });
    }
});

/**
 * GET /api/admin/pickups/pending - Get pending pickups (admin)
 */
router.get('/api/admin/pickups/pending', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const pickups = await storage.getPendingPickupSchedules();
        res.json(pickups);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pending pickups' });
    }
});

/**
 * GET /api/pickups/by-request/:serviceRequestId - Get pickup by service request
 */
router.get('/api/pickups/by-request/:serviceRequestId', async (req: Request, res: Response) => {
    try {
        const pickup = await storage.getPickupScheduleByServiceRequestId(req.params.serviceRequestId);
        if (!pickup) {
            return res.status(404).json({ error: 'Pickup schedule not found' });
        }
        res.json(pickup);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pickup schedule' });
    }
});

/**
/**
 * Finish a transfer: move the request into `pickup_scheduled` and give the task
 * a driver when there is only one to give it to.
 *
 * Creating the pickup schedule used to be the entire operation, which left the
 * request sitting in its old stage. The action button is driven by that stage,
 * so it stayed on "Transfer Pickup" and a second click hit the idempotent
 * branch and reported "Already in Pickup & Delivery" — the transfer had worked
 * both times, the screen just never said so.
 *
 * Both steps are best-effort. The pickup schedule is already committed by this
 * point; a stage that will not advance (because the request is further along)
 * must not turn a successful transfer into an error.
 */
async function finishPickupTransfer(
    serviceRequestId: string,
    pickupScheduleId: string,
): Promise<{
    stage?: string;
    autoAssignedDriver?: string | null;
    /**
     * The logistics task the transfer produced. Returned so the caller can offer
     * a driver straight away: with two or more drivers autoAssignSoleDriver
     * deliberately assigns nobody, and until now nothing told the admin that a
     * choice was still outstanding — the task simply sat unassigned in Pickup &
     * Delivery waiting for someone to notice.
     */
    taskId?: string | null;
    /** True when the task exists but no driver was assigned automatically. */
    driverChoiceRequired?: boolean;
    /** Why no driver was assigned, when none was. */
    driverBlocker?: "no_task" | "no_driver" | null;
}> {
    let stage: string | undefined;
    let autoAssignedDriver: string | null = null;
    let taskId: string | null = null;

    try {
        const { jobService } = await import('../services/job.service.js');
        const result = await jobService.transitionStage(serviceRequestId, 'pickup_scheduled', 'System');
        stage = result.serviceRequest.stage ?? undefined;
    } catch (err) {
        // Already at or past pickup_scheduled is the common case here, and is fine.
        console.log('[Pickup] Stage not advanced:', (err as Error).message);
    }

    try {
        const { getPickupTaskIdForSchedule, autoAssignSoleDriver } =
            await import('../services/logistics-task.service.js');
        taskId = await getPickupTaskIdForSchedule(pickupScheduleId);
        if (taskId) {
            const assigned = await autoAssignSoleDriver(taskId);
            autoAssignedDriver = assigned?.assignedDriverName ?? null;
        }
    } catch (err) {
        console.error('[Pickup] Auto-assign step failed:', (err as Error).message);
    }

    /**
     * Say what actually happened, including when nothing did.
     *
     * driverChoiceRequired was Boolean(taskId) && !autoAssignedDriver, so a
     * missing task — no logistics row for the schedule — produced neither an
     * assignment nor a prompt, and the caller then showed a plain
     * "Transferred to Pickup & Delivery" success. The request sat with no
     * driver and nothing anywhere said a driver was still owed, which is
     * exactly what "the button does not assign the driver" looks like from
     * the counter.
     *
     * The two failures are also different problems and must not read the
     * same. No task is a sync fault in this system; no driver is a staffing
     * fact only the shop can fix.
     */
    let driverBlocker: "no_task" | "no_driver" | null = null;
    if (!taskId) {
        driverBlocker = "no_task";
    } else if (!autoAssignedDriver) {
        const { rows } = await db.execute(sql`
            SELECT count(*)::int AS n FROM users WHERE role = 'Driver' AND status = 'Active'
        `);
        if (Number((rows[0] as any)?.n ?? 0) === 0) driverBlocker = "no_driver";
    }

    return {
        stage,
        autoAssignedDriver,
        taskId,
        driverBlocker,
        // Only ask for a choice when there is genuinely a choice to make.
        driverChoiceRequired: Boolean(taskId) && !autoAssignedDriver && driverBlocker === null,
    };
}

/**
 * POST /api/admin/service-requests/:id/transfer-to-pickup
 * Creates a pickup & delivery schedule from a service request (idempotent).
 * Used by the "Transfer to Pickup & Delivery" action on pickup-type requests.
 */
router.post('/api/admin/service-requests/:id/transfer-to-pickup', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const sr = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!sr) {
            return res.status(404).json({ error: 'Service request not found' });
        }

        // Idempotent — return the existing pickup if already transferred.
        //
        // The self-heal now runs BEFORE responding rather than as a detached
        // promise. Pressing the button a second time is exactly how an admin
        // asks "who is taking this?", and answering that needs the task id and
        // assignment state in the response — which a fire-and-forget call
        // cannot provide.
        const existing = await storage.getPickupScheduleByServiceRequestId(sr.id);
        if (existing) {
            let outcome: Awaited<ReturnType<typeof finishPickupTransfer>> = {};
            try {
                await syncPickupScheduleToLogisticsTask(existing.id);
                outcome = await finishPickupTransfer(sr.id, existing.id);
            } catch (err) {
                console.error('[Logistics] Transfer self-heal sync failed:', (err as Error).message);
            }
            return res.json({
                pickup: existing,
                alreadyExisted: true,
                stage: outcome.stage ?? 'pickup_scheduled',
                autoAssignedDriver: outcome.autoAssignedDriver ?? null,
                taskId: outcome.taskId ?? null,
                driverChoiceRequired: outcome.driverChoiceRequired ?? false,
                driverBlocker: outcome.driverBlocker ?? null,
            });
        }

        const { tier, tierCost } = req.body || {};
        const pickup = await storage.createPickupSchedule({
            serviceRequestId: sr.id,
            tier: tier || (sr as any).pickupTier || 'Regular',
            tierCost: typeof tierCost === 'number' ? tierCost : ((sr as any).pickupCost || 0),
            status: 'Pending',
            pickupAddress: (sr as any).address || null,
        } as any);

        notifyAdminUpdate({
            type: 'pickup_created',
            data: pickup,
            updatedAt: new Date().toISOString()
        });

        // Sync must land before we can auto-assign — the task does not exist yet.
        await syncPickupScheduleToLogisticsTask(pickup.id)
            .catch((err) => console.error('[Logistics] Transfer-to-pickup sync failed:', (err as Error).message));

        const outcome = await finishPickupTransfer(sr.id, pickup.id);

        res.status(201).json({ pickup, alreadyExisted: false, ...outcome });
    } catch (error: any) {
        res.status(500).json({ error: error?.message || 'Failed to transfer to pickup' });
    }
});

/**
 * POST /api/admin/pickups/:id/collect-payment
 * SYSTEM-UNIFICATION-00C-B-COD-CLOSE: narrow adapter to canonical POS.
 * Creates exactly one POS transaction + allocation linked to the converted job.
 * No direct petty-cash / drawer / service-request payment writes.
 * Fails safe 409 with zero money writes when no valid POS target exists.
 */
router.post('/api/admin/pickups/:id/collect-payment', requireAdminAuth, requireGranularPermission('pos.processPayment'), async (req: Request, res: Response) => {
    try {
        const { amount, method } = req.body || {};
        const amt = Number(amount);
        const pay = String(method || 'Cash');
        if (!Number.isFinite(amt) || amt <= 0) {
            return res.status(400).json({ error: 'Valid amount is required' });
        }
        if (!['Cash', 'Bank', 'bKash', 'Nagad'].includes(pay)) {
            return res.status(400).json({ error: 'Invalid payment method' });
        }

        const pickup = await storage.getPickupSchedule(req.params.id);
        if (!pickup) {
            return res.status(404).json({ error: 'Pickup schedule not found' });
        }

        const sr = await serviceRequestRepo.getServiceRequest(pickup.serviceRequestId);
        if (!sr) {
            return res.status(404).json({ error: 'Linked service request not found' });
        }
        const jobId = sr.convertedJobId;
        if (!jobId) {
            return res.status(409).json({
                error: 'Cannot collect COD: service request has not been converted to a job yet.',
                code: 'COD_NO_JOB_TARGET',
            });
        }
        const job = await jobRepo.getJobTicket(jobId);
        if (!job) {
            return res.status(409).json({
                error: 'Cannot collect COD: linked job not found.',
                code: 'COD_NO_JOB_TARGET',
            });
        }

        const actor = (req as any).user;
        const actorUserId = actor?.id || req.session?.adminUserId;
        const bodyClientRequestId = (req.body?.clientRequestId as string | undefined) || null;
        const headerKeyRaw = req.headers['idempotency-key'];
        let headerClientRequestId: string | null = null;
        try {
            headerClientRequestId = parseIdempotencyKeyHeader(headerKeyRaw);
        } catch (headerErr) {
            return res.status(400).json({ error: (headerErr as Error).message, code: 'INVALID_IDEMPOTENCY_KEY' });
        }
        if (bodyClientRequestId && headerClientRequestId && bodyClientRequestId !== headerClientRequestId) {
            return res.status(409).json({
                error: 'Conflicting idempotency keys: body clientRequestId and Idempotency-Key header differ.',
                code: 'IDEMPOTENCY_KEY_CONFLICT',
            });
        }
        const clientRequestId = bodyClientRequestId || headerClientRequestId || null;

        const srTicket = sr.ticketNumber?.trim() || null;
        const jobRef = getSafeJobDisplayRef({ id: job.id, corporateJobNumber: job.corporateJobNumber });
        const safeDisplayRef = srTicket || (JOB_NUMBER_RE.test(jobRef) ? jobRef : null);
        if (!safeDisplayRef) {
            return res.status(409).json({
                error: 'Cannot collect COD: no safe customer-facing reference available for invoice label.',
                code: 'COD_NO_SAFE_REFERENCE',
            });
        }

        const taxRate = 0;
        const subtotal = amt;
        const tax = 0;
        const discount = 0;
        const validated = {
            customer: job.customer || sr.customerName || null,
            customerPhone: job.customerPhone || sr.phone || null,
            customerAddress: job.customerAddress || sr.address || null,
            items: JSON.stringify([{
                name: `COD Collection — ${safeDisplayRef}`,
                itemType: 'service',
                quantity: 1,
                price: amt,
            }]),
            linkedJobs: JSON.stringify([{ jobId, billedAmount: amt }]),
            subtotal,
            tax,
            taxRate,
            discount,
            total: amt,
            paymentMethod: pay,
            paymentStatus: 'Paid',
            clientRequestId: clientRequestId || undefined,
        };

        const cartItems = [{ name: `COD Collection — ${safeDisplayRef}`, itemType: 'service', quantity: 1, price: amt }];
        const linkedJobs = [{ jobId, billedAmount: amt }];
        const fingerprint = fingerprintFromValidated(validated as any, cartItems, linkedJobs);

        if (clientRequestId && actorUserId) {
            const prior = await findPosByClientRequest(String(actorUserId), String(clientRequestId));
            if (prior) {
                assertIdempotentReplay(prior, fingerprint, String(clientRequestId));
                const lifecycle = derivePosRefundLifecycle(prior as any);
                return res.status(200).json({ ...prior, ...lifecycle, idempotent: true, codAdapter: true });
            }
        }

        const sale = await createPosSaleAtomic({
            validated: validated as any,
            cartItems,
            linkedJobs,
            actorUserId,
            clientRequestId,
            req,
        });

        const lifecycle = derivePosRefundLifecycle(sale.transaction as any);
        notifyAdminUpdate({
            type: 'cod_collected',
            data: { pickupId: pickup.id, serviceRequestId: pickup.serviceRequestId, jobId, invoiceNumber: sale.transaction.invoiceNumber, amount: amt, method: pay },
            updatedAt: new Date().toISOString()
        });

        if (sale.idempotent) {
            return res.status(200).json({ ...sale.transaction, ...lifecycle, idempotent: true, codAdapter: true });
        }
        res.status(201).json({ ...sale.transaction, ...lifecycle, idempotent: false, codAdapter: true });
    } catch (error: any) {
        if (error instanceof PosBillingError) {
            if (error.code === 'IDEMPOTENCY_RACE' && error.details?.clientRequestId && error.details?.requestFingerprint) {
                const actorUserId = (req as any).user?.id || req.session?.adminUserId;
                if (actorUserId) {
                    try {
                        const prior = await awaitPosByClientRequest(
                            String(actorUserId),
                            String(error.details.clientRequestId),
                            String(error.details.requestFingerprint),
                        );
                        const lifecycle = derivePosRefundLifecycle(prior as any);
                        return res.status(200).json({ ...prior, ...lifecycle, idempotent: true, codAdapter: true });
                    } catch (replayErr: any) {
                        if (replayErr instanceof PosBillingError) {
                            const code = replayErr.code === 'IDEMPOTENCY_RACE' ? 'IDEMPOTENCY_IN_FLIGHT' : replayErr.code;
                            return res.status(replayErr.status).json({ error: replayErr.message, code });
                        }
                    }
                }
                return res.status(409).json({
                    error: 'A concurrent COD sale with this clientRequestId has not committed yet; retry the identical request',
                    code: 'IDEMPOTENCY_IN_FLIGHT',
                });
            }
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error('[COD] collect-payment failed:', (error as Error).message);
        res.status(500).json({ error: 'Failed to record COD payment' });
    }
});

/**
 * PATCH /api/admin/pickups/:id - Update pickup schedule (admin)
 */
router.patch('/api/admin/pickups/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const updates: any = { ...req.body };

        if (updates.scheduledDate && typeof updates.scheduledDate === 'string') {
            updates.scheduledDate = new Date(updates.scheduledDate);
        }
        if (updates.pickedUpAt && typeof updates.pickedUpAt === 'string') {
            updates.pickedUpAt = new Date(updates.pickedUpAt);
        }
        if (updates.deliveredAt && typeof updates.deliveredAt === 'string') {
            updates.deliveredAt = new Date(updates.deliveredAt);
        }

        const existingPickup = await storage.getPickupSchedule(req.params.id);
        if (!existingPickup) {
            return res.status(404).json({ error: 'Pickup schedule not found' });
        }

        if (updates.status) {
            const sr = await serviceRequestRepo.getServiceRequest(existingPickup.serviceRequestId);
            const custodyError = validatePickupCustodyStatus(updates.status, sr?.stage);
            if (custodyError) {
                return res.status(409).json({ error: custodyError });
            }
        }

        const pickup = await storage.updatePickupSchedule(req.params.id, updates);
        if (!pickup) {
            return res.status(404).json({ error: 'Pickup schedule not found' });
        }

        if (updates.status === 'Scheduled' || updates.scheduledDate) {
            const sr = await serviceRequestRepo.getServiceRequest(pickup.serviceRequestId);
            if (sr && PICKUP_SCHEDULEABLE_STAGES.includes(sr.stage || 'intake')) {
                const user = await userRepo.getUser(req.session.adminUserId!);
                await jobService.transitionStage(pickup.serviceRequestId, 'pickup_scheduled', user?.name || 'Pickup Desk');
            }
        }

        notifyAdminUpdate({
            type: 'pickup_updated',
            data: pickup,
            updatedAt: new Date().toISOString()
        });

        syncPickupScheduleToLogisticsTask(pickup.id)
            .catch((err) => console.error('[Logistics] Pickup sync failed:', (err as Error).message));

        if (updates.status && ['Scheduled', 'PickedUp', 'Delivered'].includes(updates.status)) {
            repairJourneyService.syncPickupStatusToJourney(pickup.serviceRequestId, updates.status)
                .catch((err) => console.error('[RepairJourney] Pickup PATCH journey sync failed:', (err as Error).message));
        }

        res.json(pickup);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update pickup schedule' });
    }
});

/**
 * PATCH /api/admin/pickups/:id/status - Update pickup status (admin)
 */
router.patch('/api/admin/pickups/:id/status', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }

        const currentPickup = await storage.getPickupSchedule(req.params.id);
        if (!currentPickup) {
            return res.status(404).json({ error: 'Pickup schedule not found' });
        }

        const sr = await serviceRequestRepo.getServiceRequest(currentPickup.serviceRequestId);
        const custodyError = validatePickupCustodyStatus(status, sr?.stage);
        if (custodyError) {
            return res.status(409).json({ error: custodyError });
        }

        const updates: any = { status };

        if (status === 'PickedUp') {
            updates.pickedUpAt = new Date();
        } else if (status === 'Delivered') {
            updates.deliveredAt = new Date();
        }

        const pickup = await storage.updatePickupSchedule(req.params.id, updates);
        if (!pickup) {
            return res.status(404).json({ error: 'Pickup schedule not found' });
        }

        if (status === 'Delivered') {
            await serviceRequestRepo.updateServiceRequest(pickup.serviceRequestId, {
                trackingStatus: 'Delivered'
            } as any);
        }

        repairJourneyService.syncPickupStatusToJourney(pickup.serviceRequestId, status)
            .catch((err) => console.error('[RepairJourney] Pickup sync failed:', (err as Error).message));

        syncPickupScheduleToLogisticsTask(pickup.id)
            .catch((err) => console.error('[Logistics] Pickup status sync failed:', (err as Error).message));

        res.json(pickup);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update pickup status' });
    }
});

export default router;
