/**
 * Service Requests Routes
 * 
 * Handles service request CRUD, stage transitions, and timeline events.
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';

import { jobRepo, serviceRequestRepo, userRepo, systemRepo, settingsRepo, notificationRepo } from '../repositories/index.js';
import { insertServiceRequestSchema, otpCodes, type ServiceRequest } from '../../shared/schema.js';
import { requireAdminAuth, requireCustomerAuth, requireGranularPermission, requireSuperAdmin, getCustomerId } from './middleware/auth.js';
import { notifyAdminUpdate, notifyCustomerUpdate } from './middleware/sse-broker.js';
import { serviceRequestLimiter } from './middleware/rate-limit.js';
import { auditLogger } from '../utils/auditLogger.js';
import { jobService, JobOwnsLifecycleError } from '../services/job.service.js';
import { publishJobTicketEvent, publishServiceRequestEvent } from '../services/admin-realtime.service.js';
import { deriveTrackingStatus } from '../lib/workflowAutomation.js';
import { logRouteError } from '../utils/route-error.js';
import { smsService } from '../services/sms.service.js';
import { db } from '../db.js';
import { and, desc, eq, gt } from 'drizzle-orm';
import { repairJourneyService } from '../services/customer-repair-journey.service.js';
import { loadRepairCaseByServiceRequest } from '../services/repair-case.service.js';
import { getCallAttempts, createCallAttempt, updateCallAttempt, getIntakeSummaryBulk } from '../services/call-attempt.service.js';
import { getActiveServiceAreaById } from '../repositories/service-area.repository.js';
import { deriveServiceRequestPaymentState, applyDerivedPaymentState } from '../services/service-request-payment-projection.service.js';
import {
    sendOrPriceQuote,
    acceptRetailQuote,
    declineRetailQuote,
    listAdminAcceptancesForServiceRequest,
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
    assertNoWorkflowForge,
    pickSafeServiceRequestPatch,
    WorkflowManagedError,
    SERVICE_REQUEST_WORKFLOW_MANAGED,
} from '../services/service-request-mutation.guard.js';

const router = Router();
const SERVICE_REQUEST_REALTIME_TAGS = ["serviceRequests", "dashboardStats"] as const;
const SERVICE_REQUEST_CREATE_REALTIME_TAGS = [...SERVICE_REQUEST_REALTIME_TAGS, "adminNotifications", "adminNotificationCount"] as const;
const JOB_REALTIME_TAGS = ["jobTickets", "jobOverview", "dashboardStats"] as const;
const JOB_CREATE_REALTIME_TAGS = [...JOB_REALTIME_TAGS, "adminNotifications", "adminNotificationCount"] as const;
const CUSTODY_STAGES = ["picked_up", "device_received", "completed"];

function hashOtpCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
}

function isPickupRequest(request: ServiceRequest): boolean {
    return request.servicePreference === "pickup"
        || request.servicePreference === "home_pickup"
        || request.serviceMode === "pickup";
}

function getCustodyPurpose(id: string, action: string): string {
    return `custody_${action}:${id}`;
}

function getCustodyTargetStage(request: ServiceRequest, action: string): string {
    if (action === "receive") return isPickupRequest(request) ? "picked_up" : "device_received";
    if (action === "delivery") return "completed";
    throw new Error("Invalid custody action");
}

function getCustodyLabel(request: ServiceRequest, action: string): string {
    if (action === "receive") return isPickupRequest(request) ? "pickup receive" : "counter receive";
    return "delivery handover";
}

// ============================================
// Public Service Requests API
// ============================================

/**
 * GET /api/service-requests - Get all service requests
 * PROTECTED: Admin only
 */
router.get('/api/service-requests', requireAdminAuth, requireGranularPermission('serviceRequests.view'), async (req: Request, res: Response) => {
    try {
        // 01E: clamp unbounded page/limit; SQL filter/sort/total
        const pageRaw = parseInt(String(req.query.page ?? "1"), 10);
        const limitRaw = parseInt(String(req.query.limit ?? "50"), 10);
        const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, limitRaw) : 50;
        const status = typeof req.query.status === "string" ? req.query.status : undefined;
        const servicePreference = typeof req.query.servicePreference === "string" ? req.query.servicePreference : undefined;
        const search = typeof req.query.search === "string" ? req.query.search : undefined;
        const sort = req.query.sort === "ticketNumber" ? "ticketNumber" as const : "createdAt" as const;
        const order = req.query.order === "asc" ? "asc" as const : "desc" as const;

        let listed;
        try {
            listed = await serviceRequestRepo.listServiceRequestsPaginated({
                page,
                limit,
                status,
                servicePreference,
                search,
                sort,
                order,
            });
        } catch (error: any) {
            if (error?.code === "SERVICE_REQUEST_LIST_UNAVAILABLE" || error?.statusCode === 503) {
                return res.status(503).json({ error: error.message, code: "SERVICE_REQUEST_LIST_UNAVAILABLE" });
            }
            throw error;
        }
        const items = listed.items;

        // Enrich only the current page (not the full table)
        const linkedJobIds = items
            .filter(i => (i.status === 'Work Order' || i.status === 'Converted') && i.convertedJobId)
            .map(i => i.convertedJobId as string);
        const linkedJobs = await jobRepo.getJobTicketsByIds(linkedJobIds);

        const enrichedItems = await Promise.all(items.map(async (item) => {
            let jobStatus = undefined;
            let jobTechnician = undefined;
            let derivedPayment: { paymentStatus: string; paidAmount: number | null; estimatedCost: number | null; paymentSource: 'job' | 'service_request' | 'none' } | undefined;
            if ((item.status === 'Work Order' || item.status === 'Converted') && item.convertedJobId) {
                const jobTicket = linkedJobs.get(item.convertedJobId);
                if (jobTicket) {
                    jobStatus = jobTicket.status;
                    jobTechnician = jobTicket.technician;
                    derivedPayment = {
                        paymentStatus: String(jobTicket.paymentStatus ?? 'unpaid'),
                        paidAmount: jobTicket.paidAmount != null ? Number(jobTicket.paidAmount) : null,
                        estimatedCost: jobTicket.estimatedCost != null ? Number(jobTicket.estimatedCost) : null,
                        paymentSource: 'job',
                    };
                }
            }
            if (!derivedPayment) {
                const state = await deriveServiceRequestPaymentState(item);
                derivedPayment = state;
            }
            return {
                ...item,
                paymentStatus: derivedPayment.paymentStatus,
                derivedPayment,
                trackingStatus: deriveTrackingStatus(
                    item.status,
                    (item.servicePreference || item.serviceMode || "service_center") as any,
                    jobStatus,
                    jobTechnician,
                    item.scheduledPickupDate || item.expectedPickupDate
                )
            };
        }));

        // Preserve legacy top-level pagination fields used by admin clients
        res.json({
            items: enrichedItems,
            total: listed.total,
            page: listed.page,
            limit: listed.limit,
            totalPages: listed.totalPages,
        });
    } catch (error) {
        logRouteError('ServiceRequests.List', req, error);
        res.status(500).json({ error: 'Failed to fetch service requests' });
    }
});

/**
 * GET /api/service-requests/:id - Get service request by ID
 * PROTECTED: Admin only (for * GET /api/service-requests/:id - Get service request by ID
 */
router.get('/api/service-requests/:id', requireAdminAuth, requireGranularPermission('serviceRequests.view'), async (req: Request, res: Response) => {
    try {
        let request = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!request) {
            return res.status(404).json({ error: 'Service request not found' });
        }

        let jobStatus = undefined;
        let jobTechnician = undefined;
        if ((request.status === 'Work Order' || request.status === 'Converted') && request.convertedJobId) {
            const jobTicket = await jobRepo.getJobTicket(request.convertedJobId);
            if (jobTicket) {
                jobStatus = jobTicket.status;
                jobTechnician = jobTicket.technician;
            }
        }

        const paymentState = await deriveServiceRequestPaymentState(request);
        const enrichedRequest = applyDerivedPaymentState(request, paymentState);
        const enrichedWithTracking = {
            ...enrichedRequest,
            trackingStatus: deriveTrackingStatus(
                request.status,
                (request.servicePreference || request.serviceMode || "service_center") as any,
                jobStatus,
                jobTechnician,
                request.scheduledPickupDate || request.expectedPickupDate
            )
        };

        res.json(enrichedWithTracking);
    } catch (error: any) {
        logRouteError('ServiceRequests.Detail', req, error);
        res.status(500).json({ error: 'Failed to fetch service request', details: error.message });
    }
});

/**
 * POST /api/admin/service-requests/:id/mark-interacted - Mark a service request as interacted/reviewed
 */
router.post('/api/admin/service-requests/:id/mark-interacted', requireAdminAuth, requireGranularPermission('serviceRequests.view'), async (req: Request, res: Response) => {
    try {
        const request = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!request) {
            return res.status(404).json({ error: 'Service request not found' });
        }

        if (request.adminInteracted) {
            return res.json(request);
        }

        const actor = await userRepo.getUser(req.session.adminUserId!);
        const updatedRequest = await serviceRequestRepo.markServiceRequestAsInteracted(
            req.params.id,
            actor?.name || actor?.username || 'Admin'
        );

        if (updatedRequest) {
            publishServiceRequestEvent({
                action: 'updated',
                entityId: updatedRequest.id,
                invalidate: [...SERVICE_REQUEST_CREATE_REALTIME_TAGS],
                permissions: ['serviceRequests'],
                payload: {
                    serviceRequestId: updatedRequest.id,
                    status: updatedRequest.status || undefined,
                },
            });
        }

        res.json(updatedRequest);
    } catch (error: any) {
        logRouteError('ServiceRequests.MarkInteracted', req, error);
        res.status(500).json({ error: 'Failed to mark request as interacted' });
    }
});

/**
 * POST /api/admin/service-requests/sync-job/:jobId - Syncs a job ticket's status to its parent service request
 */
router.post('/api/admin/service-requests/sync-job/:jobId', requireAdminAuth, requireGranularPermission('serviceRequests.transitionStage'), async (req: Request, res: Response) => {
    try {
        const { jobId } = req.params;
        const result = await jobService.syncLinkedServiceRequestFromJob(jobId, "System Manager Sync");
        if (!result.serviceRequest) return res.status(404).json({ error: 'No Service Request is linked to this Job Ticket' });

        res.json(result.serviceRequest);
    } catch (error: any) {
        logRouteError('ServiceRequests.SyncJob', req, error);
        res.status(500).json({ error: 'Failed to sync service request', details: error.message });
    }
});

/**
 * POST /api/service-requests - Create service request (rate limited - 10/hour)
 * SERVICE-INTAKE-RELIABILITY-01C: Uses canonical retail intake service with idempotency + duplicate window.
 */
router.post('/api/service-requests', ...(process.env.NODE_ENV === 'production' ? [serviceRequestLimiter] : []), async (req: Request, res: Response) => {
    try {
        const validated = insertServiceRequestSchema.parse(req.body);

        if ((validated as any).serviceAreaId) {
            const area = await getActiveServiceAreaById((validated as any).serviceAreaId);
            if (!area) {
                return res.status(400).json({ error: 'Invalid or inactive service area' });
            }
        }

        const idempotencyKey = parseIdempotencyKeyHeader(req.headers['idempotency-key']);
        const customerId = req.session?.customerId || null;

        const initialTrackingStatus =
            validated.servicePreference === 'service_center' ? 'Awaiting Drop-off'
            : validated.servicePreference === 'home_pickup' ? 'Arriving to Receive'
            : 'Request Received';

        const result = await createRetailServiceRequest({
            brand: validated.brand,
            primaryIssue: validated.primaryIssue,
            customerName: validated.customerName,
            phone: validated.phone,
            screenSize: validated.screenSize || null,
            modelNumber: validated.modelNumber || null,
            symptoms: validated.symptoms || null,
            description: validated.description || null,
            address: validated.address || null,
            mediaUrls: validated.mediaUrls || null,
            servicePreference: validated.servicePreference || null,
            serviceMode: validated.serviceMode || null,
            requestIntent: validated.requestIntent || null,
            serviceId: (validated as any).serviceId || null,
            serviceAreaId: (validated as any).serviceAreaId || null,
            // PICKUP-MAP-PIN-01 — `?? null` keeps a legitimate 0 coordinate intact.
            pickupLatitude: (validated as any).pickupLatitude ?? null,
            pickupLongitude: (validated as any).pickupLongitude ?? null,
            pickupLocationSource: (validated as any).pickupLocationSource || null,
            customerId,
            intakeSource: customerId ? "customer_portal" : "public_web",
            idempotencyKey,
            initialTrackingStatus,
        });

        if (result.duplicateWindow) {
            return res.status(202).json({
                error: "We already received a similar request. Our team will contact you soon.",
                code: "DUPLICATE_REQUEST_WINDOW",
            });
        }

        if (result.idempotent) {
            return res.status(200).json(sanitizePublicServiceRequest(result.serviceRequest as any));
        }

        const request = result.serviceRequest;

        // Remember that THIS browser created this customer record, so the person
        // who just submitted can register with their own number instead of being
        // told to contact support about a record they made seconds ago.
        // Only set for anonymous submissions, and only when intake resolved an
        // owner we did not already have from the session.
        if (!customerId && request?.customerId) {
            req.session.pendingClaimUserId = request.customerId;
        }

        publishServiceRequestEvent({
            action: 'created',
            entityId: request.id,
            invalidate: [...SERVICE_REQUEST_CREATE_REALTIME_TAGS],
            permissions: ['serviceRequests'],
            payload: {
                serviceRequestId: request.id,
                ticketNumber: request.ticketNumber || request.id,
                status: request.status || undefined,
            },
            toast: {
                level: 'success',
                title: 'New service request received',
                message: `Request #${request.ticketNumber || request.id} needs review.`,
                sound: true,
            },
        });

        const srServiceMode = validated.servicePreference === 'home_pickup' ? 'pickup' as const
            : validated.servicePreference === 'service_center' ? 'drop_off' as const
            : 'drop_off' as const;
        // ITEM 2: await so failures are observable; do NOT reject the already-committed
        // service request — customer already has a ticket; journey is best-effort linkage.
        // HOTFIX-2: the log below does NOT recreate a missing journey. Re-running
        // intake is idempotent and does NOT recreate the journey either, and
        // reconcileOrphanJourneys only assigns ownership to a journey that already
        // exists. Missing-journey recreation remains a separate follow-up that
        // requires an explicit non-guessing design — no migration/outbox here.
        try {
            await repairJourneyService.createJourneyFromServiceRequest({
                serviceRequestId: request.id,
                customerId: request.customerId || null,
                serviceMode: srServiceMode,
                customerNote: validated.description || undefined,
            });
        } catch (err) {
            console.error(
                '[RepairJourney] FAILED to create journey from service request',
                request.id,
                (err as Error).message,
            );
        }

        res.status(201).json(sanitizePublicServiceRequest(request as any));
    } catch (error: any) {
        if (error instanceof IntakeError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error('[ServiceRequests] Intake error:', (error as Error).message);
        res.status(400).json({ error: 'Invalid service request data' });
    }
});

/**
 * PATCH /api/service-requests/:id - Safe non-workflow field edits only (01D).
 * Workflow/quote fields → 409 SERVICE_REQUEST_WORKFLOW_MANAGED (no writes/side effects).
 * PROTECTED: Admin only + serviceRequests.edit
 */
router.patch('/api/service-requests/:id', requireAdminAuth, requireGranularPermission('serviceRequests.edit'), async (req: Request, res: Response) => {
    try {
        const body = (req.body && typeof req.body === 'object') ? req.body as Record<string, unknown> : {};

        // Fail closed on protected workflow fields — do not strip and continue.
        try {
            assertNoWorkflowForge(body);
        } catch (e) {
            if (e instanceof WorkflowManagedError) {
                return res.status(409).json({
                    error: e.message,
                    code: SERVICE_REQUEST_WORKFLOW_MANAGED,
                });
            }
            throw e;
        }

        const updateData = pickSafeServiceRequestPatch(body);
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        if (updateData.serviceAreaId !== undefined && updateData.serviceAreaId !== null) {
            const area = await getActiveServiceAreaById(updateData.serviceAreaId as string);
            if (!area) {
                return res.status(400).json({ error: 'Invalid or inactive service area' });
            }
        }

        if (updateData.scheduledPickupDate && typeof updateData.scheduledPickupDate === 'string') {
            updateData.scheduledPickupDate = new Date(updateData.scheduledPickupDate as string);
        }
        if (updateData.estimatedDelivery && typeof updateData.estimatedDelivery === 'string') {
            updateData.estimatedDelivery = new Date(updateData.estimatedDelivery as string);
        }
        for (const dk of ['expectedPickupDate', 'expectedReturnDate', 'expectedReadyDate'] as const) {
            if (updateData[dk] && typeof updateData[dk] === 'string') {
                updateData[dk] = new Date(updateData[dk] as string);
            }
        }

        const request = await serviceRequestRepo.updateServiceRequest(req.params.id, updateData as any);
        if (!request) {
            return res.status(404).json({ error: 'Service request not found' });
        }

        publishServiceRequestEvent({
            action: 'updated',
            entityId: request.id,
            invalidate: [...SERVICE_REQUEST_REALTIME_TAGS],
            permissions: ['serviceRequests'],
            payload: {
                serviceRequestId: request.id,
                ticketNumber: request.ticketNumber || request.id,
                status: request.status || undefined,
            },
        });

        res.json(request);
    } catch (error) {
        if (error instanceof WorkflowManagedError) {
            return res.status(409).json({
                error: error.message,
                code: SERVICE_REQUEST_WORKFLOW_MANAGED,
            });
        }
        console.error('Failed to update service request:', error);
        res.status(500).json({ error: 'Failed to update service request' });
    }
});

/**
 * DELETE /api/service-requests/:id - Delete service request
 * PROTECTED: Admin only
 */
router.delete('/api/service-requests/:id', requireAdminAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const requestId = req.params.id;

        // Guard: a request already converted to a job ticket is the source record
        // for that job (customer's original report, media, timeline). Deleting it
        // orphans the job's history. Block — delete the job first if truly needed.
        const existing = await serviceRequestRepo.getServiceRequest(requestId);
        if (existing?.convertedJobId) {
            return res.status(409).json({
                error: 'Cannot delete: this request was converted to a job ticket',
                convertedJobId: existing.convertedJobId,
            });
        }

        const success = await serviceRequestRepo.deleteServiceRequest(requestId);
        if (!success) {
            return res.status(404).json({ error: 'Service request not found' });
        }

        publishServiceRequestEvent({
            action: 'deleted',
            entityId: requestId,
            invalidate: [...SERVICE_REQUEST_REALTIME_TAGS],
            permissions: ['serviceRequests'],
            payload: {
                serviceRequestId: requestId,
                ticketNumber: requestId,
            },
        });

        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete service request' });
    }
});

// ============================================
// Admin Stage Transition API
// ============================================

/**
 * GET /api/admin/service-requests/:id/next-stages - Get valid next stages
 */
router.get('/api/admin/service-requests/:id/next-stages', requireAdminAuth, requireGranularPermission('serviceRequests.view'), async (req: Request, res: Response) => {
    try {
        const validNextStages = await serviceRequestRepo.getNextValidStages(req.params.id);
        const serviceRequest = await serviceRequestRepo.getServiceRequest(req.params.id);
        const { getStageFlow } = await import('../../shared/constants.js');
        const flow = getStageFlow(serviceRequest?.requestIntent || null, serviceRequest?.serviceMode || null);

        res.json({
            currentStage: serviceRequest?.stage || 'intake',
            validNextStages,
            stageFlow: [...flow]
        });
    } catch (error: any) {
        logRouteError('ServiceRequests.NextStages', req, error);
        res.status(500).json({ error: error.message || 'Failed to get next stages' });
    }
});

/**
 * POST /api/admin/service-requests/:id/transition-stage - Transition to new stage
 */
router.post('/api/admin/service-requests/:id/transition-stage', requireAdminAuth, requireGranularPermission('serviceRequests.transitionStage'), async (req: Request, res: Response) => {
    try {
        const { stage, actorName } = req.body;
        if (!stage) {
            return res.status(400).json({ error: 'Stage is required' });
        }

        if (CUSTODY_STAGES.includes(stage)) {
            return res.status(409).json({
                error: 'Customer OTP is required for custody handoff',
                custodyAction: stage === 'completed' ? 'delivery' : 'receive',
            });
        }

        const adminUser = await userRepo.getUser(req.session.adminUserId!);
        const actor = actorName || adminUser?.name || 'Admin';

        // Get existing service request for audit trail
        const existingRequest = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!existingRequest) {
            return res.status(404).json({ error: 'Service request not found' });
        }

        let result: Awaited<ReturnType<typeof jobService.transitionStage>>;
        try {
            result = await jobService.transitionStage(req.params.id, stage, actor);
        } catch (err) {
            if (err instanceof JobOwnsLifecycleError) {
                return res.status(409).json({
                    error: err.message,
                    code: err.code,
                });
            }
            throw err;
        }

        // Audit Log — only after successful mutation
        await auditLogger.log({
            userId: req.session.adminUserId!,
            action: 'TRANSITION_SERVICE_REQUEST_STAGE',
            entity: 'ServiceRequest',
            entityId: req.params.id,
            details: `Stage transitioned from "${existingRequest.stage}" to "${stage}" by ${actor}`,
            oldValue: { stage: existingRequest.stage, trackingStatus: existingRequest.trackingStatus },
            newValue: { stage: result.serviceRequest.stage, trackingStatus: result.serviceRequest.trackingStatus },
            req: req
        });

        if (result.serviceRequest.customerId) {
            notifyCustomerUpdate(result.serviceRequest.customerId, {
                type: 'order_update',
                orderId: result.serviceRequest.id,
                ticketNumber: result.serviceRequest.ticketNumber,
                stage: result.serviceRequest.stage,
                trackingStatus: result.serviceRequest.trackingStatus,
                updatedAt: new Date().toISOString()
            });
        }

        publishServiceRequestEvent({
            action: 'status_changed',
            entityId: result.serviceRequest.id,
            invalidate: [...SERVICE_REQUEST_REALTIME_TAGS],
            permissions: ['serviceRequests'],
            payload: {
                serviceRequestId: result.serviceRequest.id,
                ticketNumber: result.serviceRequest.ticketNumber || result.serviceRequest.id,
                status: result.serviceRequest.stage || result.serviceRequest.status || undefined,
            },
        });

        const STAGE_TO_JOURNEY: Record<string, { stage: string; title: string; message: string }> = {
            'authorized': { stage: 'quote_accepted', title: 'Request Authorized', message: 'Your repair request has been authorized. We will schedule service shortly.' },
            'pickup_scheduled': { stage: 'schedule_confirmed', title: 'Pickup Scheduled', message: 'Your pickup has been scheduled.' },
            'in_repair': { stage: 'repair_in_progress', title: 'Repair Started', message: 'Your device is being repaired.' },
        };
        const journeySync = STAGE_TO_JOURNEY[stage];
        if (journeySync) {
            repairJourneyService.findJourneyByServiceRequest(req.params.id).then(async (journeyId) => {
                if (!journeyId) return;
                await repairJourneyService.updateJourneyStage(journeyId, journeySync.stage as any);
                await repairJourneyService.addJourneyEvent({
                    journeyId,
                    eventType: `stage_${stage}`,
                    title: journeySync.title,
                    message: journeySync.message,
                    actorType: 'admin',
                    isCustomerVisible: true,
                });
            }).catch((err) => console.error('[RepairJourney] Stage transition sync failed:', (err as Error).message));
        }

        res.json(result);
    } catch (error: any) {
        logRouteError('ServiceRequests.TransitionStage', req, error);
        res.status(400).json({ error: error.message || 'Failed to transition stage' });
    }

});

router.post('/api/admin/service-requests/:id/custody-otp/send', requireAdminAuth, requireGranularPermission('pickup.confirmHandover'), async (req: Request, res: Response) => {
    try {
        const { action } = req.body;
        if (action !== "receive" && action !== "delivery") {
            return res.status(400).json({ error: 'Invalid custody action' });
        }

        const request = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!request) return res.status(404).json({ error: 'Service request not found' });
        if (!request.phone) return res.status(400).json({ error: 'Customer phone number is required' });
        if (action === "delivery" && !request.convertedJobId) {
            return res.status(409).json({ error: 'Delivery OTP requires a linked job ticket' });
        }

        const normalizedPhone = smsService.normalizePhoneNumber(request.phone);
        if (!smsService.isValidBangladeshPhone(normalizedPhone)) {
            return res.status(400).json({ error: 'Customer phone number is invalid' });
        }

        const targetStage = getCustodyTargetStage(request, action);
        const purpose = getCustodyPurpose(request.id, action);
        const code = smsService.generateOtpCode();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        const label = getCustodyLabel(request, action);

        // Deliver first — only persist OTP when at least one channel succeeds (no orphan codes).
        let inApp = false;
        if (request.customerId) {
            try {
                await notificationRepo.createNotification({
                    userId: request.customerId,
                    title: `Handover code — ${request.ticketNumber || request.id}`,
                    message: `Your Promise Electronics ${label} code is ${code}. Valid for 5 minutes. Tell this code to the staff member only when they are with you.`,
                    // Typed so the customer's tracking page can find the live
                    // code and show it in its own place rather than leaving the
                    // customer to dig through a notification list.
                    type: "handover_code",
                    link: `/track-order?order=${encodeURIComponent(request.ticketNumber || request.id)}&type=service`,
                    contextType: "customer",
                } as any);
                inApp = true;
            } catch (err) {
                console.error("[CustodyOTP] In-app notification failed:", (err as Error).message);
            }
        }

        let smsOk = false;
        try {
            const sms = await smsService.sendSms({
                to: normalizedPhone,
                message: `Promise Electronics ${label} OTP for ${request.ticketNumber || request.id}: ${code}. Valid for 5 minutes.`,
            });
            smsOk = !!sms.success;
            if (!sms.success) {
                console.error("[CustodyOTP] SMS delivery failed:", sms.error || "unknown");
            }
        } catch (err) {
            console.error("[CustodyOTP] SMS threw:", (err as Error).message);
        }

        const delivered = { inApp, sms: smsOk };
        const anyDelivered = inApp || smsOk;

        if (!anyDelivered) {
            // Never insert OTP; never show code to driver; UI must use no-code path.
            return res.json({
                success: true,
                action,
                targetStage,
                expiresAt: expiresAt.toISOString(),
                phone: `+${normalizedPhone.slice(0, 5)}*****${normalizedPhone.slice(-2)}`,
                delivered,
                codeIssued: false,
                needsNoCodeHandover: true,
            });
        }

        await db.insert(otpCodes).values({
            id: randomUUID(),
            phone: normalizedPhone,
            codeHash: hashOtpCode(code),
            purpose,
            attempts: 0,
            maxAttempts: 3,
            expiresAt,
            ipAddress: req.ip || null,
        });

        await serviceRequestRepo.createServiceRequestEvent({
            serviceRequestId: request.id,
            status: request.trackingStatus || request.status,
            message: `Customer OTP issued for ${label} (inApp=${inApp}, sms=${smsOk}).`,
            actor: 'System',
        });

        res.json({
            success: true,
            action,
            targetStage,
            expiresAt: expiresAt.toISOString(),
            phone: `+${normalizedPhone.slice(0, 5)}*****${normalizedPhone.slice(-2)}`,
            delivered,
            codeIssued: true,
            needsNoCodeHandover: false,
            maxAttempts: 3,
            ...(process.env.NODE_ENV !== 'production' ? { _testCode: code } : {}),
        });
    } catch (error: any) {
        logRouteError('ServiceRequests.SendCustodyOtp', req, error);
        res.status(500).json({ error: error.message || 'Failed to send custody OTP' });
    }
});

router.post('/api/admin/service-requests/:id/custody-otp/confirm', requireAdminAuth, requireGranularPermission('pickup.confirmHandover'), async (req: Request, res: Response) => {
    try {
        const { action, code } = req.body;
        if (action !== "receive" && action !== "delivery") {
            return res.status(400).json({ error: 'Invalid custody action' });
        }
        if (!code) {
            return res.status(400).json({ error: 'OTP code is required' });
        }

        const request = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!request) return res.status(404).json({ error: 'Service request not found' });
        if (!request.phone) return res.status(400).json({ error: 'Customer phone number is required' });

        const normalizedPhone = smsService.normalizePhoneNumber(request.phone);
        const purpose = getCustodyPurpose(request.id, action);
        const records = await db
            .select()
            .from(otpCodes)
            .where(and(
                eq(otpCodes.phone, normalizedPhone),
                eq(otpCodes.purpose, purpose),
                gt(otpCodes.expiresAt, new Date())
            ))
            .orderBy(desc(otpCodes.createdAt))
            .limit(1);
        const otpRecord = records[0];

        if (!otpRecord || otpRecord.verifiedAt) {
            return res.status(400).json({ error: 'OTP not found or expired. Please send a new OTP.' });
        }
        if (otpRecord.attempts >= otpRecord.maxAttempts) {
            return res.status(400).json({ error: 'Maximum OTP attempts exceeded. Please send a new OTP.' });
        }

        const codeHash = hashOtpCode(code.toString().trim());
        if (codeHash !== otpRecord.codeHash) {
            await db.update(otpCodes)
                .set({ attempts: otpRecord.attempts + 1 })
                .where(eq(otpCodes.id, otpRecord.id));
            return res.status(400).json({
                error: 'Invalid OTP code',
                remainingAttempts: otpRecord.maxAttempts - otpRecord.attempts - 1,
            });
        }

        await db.update(otpCodes)
            .set({ verifiedAt: new Date() })
            .where(eq(otpCodes.id, otpRecord.id));

        const adminUser = await userRepo.getUser(req.session.adminUserId!);
        const actor = adminUser?.name || 'Admin';
        const targetStage = getCustodyTargetStage(request, action);
        const result = await jobService.transitionStage(request.id, targetStage, actor);

        await auditLogger.log({
            userId: req.session.adminUserId!,
            action: 'CONFIRM_CUSTODY_OTP',
            entity: 'ServiceRequest',
            entityId: request.id,
            details: `Customer OTP confirmed for ${getCustodyLabel(request, action)}. Stage moved to ${targetStage}.`,
            oldValue: { stage: request.stage, trackingStatus: request.trackingStatus },
            newValue: { stage: result.serviceRequest.stage, trackingStatus: result.serviceRequest.trackingStatus },
            req,
        });

        if (result.serviceRequest.customerId) {
            notifyCustomerUpdate(result.serviceRequest.customerId, {
                type: 'order_update',
                orderId: result.serviceRequest.id,
                ticketNumber: result.serviceRequest.ticketNumber,
                stage: result.serviceRequest.stage,
                trackingStatus: result.serviceRequest.trackingStatus,
                updatedAt: new Date().toISOString()
            });
        }

        publishServiceRequestEvent({
            action: 'status_changed',
            entityId: result.serviceRequest.id,
            invalidate: [...SERVICE_REQUEST_REALTIME_TAGS],
            permissions: ['serviceRequests'],
            payload: {
                serviceRequestId: result.serviceRequest.id,
                ticketNumber: result.serviceRequest.ticketNumber || result.serviceRequest.id,
                status: result.serviceRequest.stage || result.serviceRequest.status || undefined,
            },
        });

        res.json(result);
    } catch (error: any) {
        logRouteError('ServiceRequests.ConfirmCustodyOtp', req, error);
        res.status(400).json({ error: error.message || 'Failed to confirm custody OTP' });
    }
});

/**
 * Explicit lower-assurance handover when no channel can deliver a customer code.
 * Requires typed reason + photo proof. Never silently downgrades verification.
 */
router.post(
    '/api/admin/service-requests/:id/custody-handover/no-code',
    requireAdminAuth,
    requireGranularPermission('pickup.confirmHandover'),
    async (req: Request, res: Response) => {
        try {
            const { action, reason, proofPhotoUrl } = req.body as {
                action?: string;
                reason?: string;
                proofPhotoUrl?: string;
            };
            if (action !== "receive" && action !== "delivery") {
                return res.status(400).json({ error: 'Invalid custody action' });
            }
            const reasonText = typeof reason === "string" ? reason.trim() : "";
            if (reasonText.length < 8) {
                return res.status(400).json({ error: 'A reason of at least 8 characters is required' });
            }
            const photo = typeof proofPhotoUrl === "string" ? proofPhotoUrl.trim() : "";
            if (!photo || !/^https?:\/\//i.test(photo)) {
                return res.status(400).json({ error: 'A photo proof URL is required' });
            }

            const request = await serviceRequestRepo.getServiceRequest(req.params.id);
            if (!request) return res.status(404).json({ error: 'Service request not found' });
            if (action === "delivery" && !request.convertedJobId) {
                return res.status(409).json({ error: 'Delivery handover requires a linked job ticket' });
            }

            const adminUser = await userRepo.getUser(req.session.adminUserId!);
            const actor = adminUser?.name || 'Admin';
            const targetStage = getCustodyTargetStage(request, action);
            const label = getCustodyLabel(request, action);
            const result = await jobService.transitionStage(request.id, targetStage, actor);

            await serviceRequestRepo.createServiceRequestEvent({
                serviceRequestId: request.id,
                status: result.serviceRequest.trackingStatus || result.serviceRequest.status,
                message: `Lower-assurance no-code ${label}: ${reasonText}`,
                actor,
            });

            await auditLogger.log({
                userId: req.session.adminUserId!,
                action: 'CONFIRM_CUSTODY_NO_CODE',
                entity: 'ServiceRequest',
                entityId: request.id,
                details: `No-code handover (${label}). Reason recorded. Proof photo attached. Stage → ${targetStage}.`,
                oldValue: { stage: request.stage, trackingStatus: request.trackingStatus, assurance: 'otp' },
                newValue: {
                    stage: result.serviceRequest.stage,
                    trackingStatus: result.serviceRequest.trackingStatus,
                    assurance: 'no_code_lower',
                    reason: reasonText,
                    proofPhotoUrl: photo,
                },
                req,
            });

            if (result.serviceRequest.customerId) {
                notifyCustomerUpdate(result.serviceRequest.customerId, {
                    type: 'order_update',
                    orderId: result.serviceRequest.id,
                    ticketNumber: result.serviceRequest.ticketNumber,
                    stage: result.serviceRequest.stage,
                    trackingStatus: result.serviceRequest.trackingStatus,
                    updatedAt: new Date().toISOString(),
                });
            }

            publishServiceRequestEvent({
                action: 'status_changed',
                entityId: result.serviceRequest.id,
                invalidate: [...SERVICE_REQUEST_REALTIME_TAGS],
                permissions: ['serviceRequests'],
                payload: {
                    serviceRequestId: result.serviceRequest.id,
                    ticketNumber: result.serviceRequest.ticketNumber || result.serviceRequest.id,
                    status: result.serviceRequest.stage || result.serviceRequest.status || undefined,
                },
            });

            res.json({
                ...result,
                handoverAssurance: 'no_code_lower',
            });
        } catch (error: any) {
            logRouteError('ServiceRequests.NoCodeCustodyHandover', req, error);
            res.status(400).json({ error: error.message || 'Failed to record no-code handover' });
        }
    },
);

/**
 * POST /api/admin/service-requests/:id/verify-and-convert - Verify & Convert to Job Ticket
 * Requires: service request access plus create access to spawn a job
 */
router.post(
    '/api/admin/service-requests/:id/verify-and-convert',
    requireAdminAuth,
    requireGranularPermission('serviceRequests.convertToJob'),
    requireGranularPermission('jobs.create'),
    async (req: Request, res: Response) => {
        try {
            const { verificationNotes, priority } = req.body;

            const user = await userRepo.getUser(req.session?.adminUserId!);
            const actorName = user?.name || 'Manager';

            const result = await jobService.verifyAndConvertServiceRequest(
                req.params.id,
                actorName,
                verificationNotes,
                priority
            );

            // Post-commit side effects: fire-and-forget — must not turn a committed conversion into 500
            if (!result.idempotent) {
                auditLogger.log({
                    userId: req.session?.adminUserId!,
                    action: 'VERIFY_AND_CONVERT_SERVICE_REQUEST',
                    entity: 'ServiceRequest',
                    entityId: req.params.id,
                    details: `Service request verified and converted to Job Ticket ${result.jobTicket.id} by ${actorName}. Priority: ${priority}. ${verificationNotes ? `Notes: ${verificationNotes}` : ''}`,
                    newValue: {
                        status: result.serviceRequest.status,
                        stage: result.serviceRequest.stage,
                        convertedJobId: result.serviceRequest.convertedJobId
                    },
                    req: req
                }).catch(() => {});

                auditLogger.log({
                    userId: req.session?.adminUserId!,
                    action: 'CREATE_JOB_FROM_SERVICE_REQUEST',
                    entity: 'JobTicket',
                    entityId: result.jobTicket.id,
                    details: `Job ticket created from Service Request ${req.params.id} by ${actorName}`,
                    newValue: result.jobTicket,
                    req: req
                }).catch(() => {});

                publishServiceRequestEvent({
                    action: 'status_changed',
                    entityId: result.serviceRequest.id,
                    invalidate: [...SERVICE_REQUEST_REALTIME_TAGS],
                    permissions: ['serviceRequests'],
                    payload: {
                        serviceRequestId: result.serviceRequest.id,
                        ticketNumber: result.serviceRequest.ticketNumber || result.serviceRequest.id,
                        status: result.serviceRequest.status || undefined,
                    },
                });

                publishJobTicketEvent({
                    action: 'created',
                    entityId: result.jobTicket.id,
                    invalidate: [...JOB_CREATE_REALTIME_TAGS],
                    permissions: ['jobs'],
                    payload: {
                        jobId: result.jobTicket.id,
                        ticketNumber: result.jobTicket.id,
                        status: result.jobTicket.status,
                    },
                    toast: {
                        level: 'success',
                        title: 'Job ticket created',
                        message: `Job ${result.jobTicket.id} is ready for assignment.`,
                        sound: true,
                    },
                });

                repairJourneyService.syncJobConversionToJourney(req.params.id, result.jobTicket.id)
                    .catch((err) => console.error('[RepairJourney] Job conversion sync failed:', (err as Error).message));
            }

            res.status(result.idempotent ? 200 : 201).json({
                serviceRequest: result.serviceRequest,
                jobTicket: result.jobTicket,
                idempotent: result.idempotent,
            });
        } catch (error: any) {
            if (error?.code === 'USE_RETAIL_QUOTE_CONVERT') {
                return res.status(error.status || 409).json({ error: error.message, code: error.code });
            }
            if (error?.code === 'LINKED_JOB_MISSING') {
                return res.status(error.status || 409).json({ error: error.message, code: error.code });
            }
            if (error?.code === 'INVALID_STAGE') {
                return res.status(error.status || 400).json({ error: error.message, code: error.code });
            }
            if (error?.code === 'NOT_FOUND') {
                return res.status(404).json({ error: error.message });
            }
            if (process.env.NODE_ENV === "test" && error?.message?.includes("TEST_FAIL_POINT")) {
                return res.status(500).json({ error: "Conversion failed due to forced test failure", code: "TEST_FAIL_POINT" });
            }
            console.error('[ServiceRequests] Failed to verify and convert:', (error as Error).message);
            res.status(400).json({ error: error.message || 'Failed to verify and convert request' });
        }
    });

/**
 * PUT /api/admin/service-requests/:id/expected-dates - Update expected dates
 */
router.put('/api/admin/service-requests/:id/expected-dates', requireAdminAuth, requireGranularPermission('serviceRequests.transitionStage'), async (req: Request, res: Response) => {
    try {
        const { expectedPickupDate, expectedReturnDate, expectedReadyDate } = req.body;

        // Get existing service request for audit trail
        const existingRequest = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!existingRequest) {
            return res.status(404).json({ error: 'Service request not found' });
        }

        const updates: any = {};
        if (expectedPickupDate !== undefined) {
            updates.expectedPickupDate = expectedPickupDate ? new Date(expectedPickupDate) : null;
        }
        if (expectedReturnDate !== undefined) {
            updates.expectedReturnDate = expectedReturnDate ? new Date(expectedReturnDate) : null;
        }
        if (expectedReadyDate !== undefined) {
            updates.expectedReadyDate = expectedReadyDate ? new Date(expectedReadyDate) : null;
        }

        const request = await serviceRequestRepo.updateServiceRequest(req.params.id, updates);
        if (!request) {
            return res.status(404).json({ error: 'Service request not found' });
        }

        // Audit Log
        await auditLogger.log({
            userId: req.session?.adminUserId!,
            action: 'UPDATE_SERVICE_REQUEST_DATES',
            entity: 'ServiceRequest',
            entityId: req.params.id,
            details: 'Updated expected dates for service request',
            oldValue: {
                expectedPickupDate: existingRequest.expectedPickupDate,
                expectedReturnDate: existingRequest.expectedReturnDate,
                expectedReadyDate: existingRequest.expectedReadyDate
            },
            newValue: {
                expectedPickupDate: request.expectedPickupDate,
                expectedReturnDate: request.expectedReturnDate,
                expectedReadyDate: request.expectedReadyDate
            },
            req: req
        });

        if (request.customerId) {
            notifyCustomerUpdate(request.customerId, {
                type: 'order_update',
                orderId: request.id,
                ticketNumber: request.ticketNumber,
                expectedPickupDate: request.expectedPickupDate,
                expectedReturnDate: request.expectedReturnDate,
                expectedReadyDate: request.expectedReadyDate,
                updatedAt: new Date().toISOString()
            });
        }

        publishServiceRequestEvent({
            action: 'updated',
            entityId: request.id,
            invalidate: [...SERVICE_REQUEST_REALTIME_TAGS],
            permissions: ['serviceRequests'],
            payload: {
                serviceRequestId: request.id,
                ticketNumber: request.ticketNumber || request.id,
                status: request.status || undefined,
            },
        });

        res.json(request);
    } catch (error: any) {
        console.error('Failed to update expected dates:', error);
        res.status(500).json({ error: error.message || 'Failed to update expected dates' });
    }
});

/**
 * POST /api/admin/service-requests/:id/action - Execute contextual action
 * Only actionId drives status — body cannot smuggle quote/workflow fields.
 */
router.post('/api/admin/service-requests/:id/action', requireAdminAuth, requireGranularPermission('serviceRequests.transitionStage'), async (req: Request, res: Response) => {
    try {
        const { actionId } = req.body || {};
        // Reject bodies that try to forge quote/workflow columns alongside actionId
        const smuggle = { ...(req.body || {}) };
        delete smuggle.actionId;
        delete smuggle.reason;
        try {
            assertNoWorkflowForge(smuggle);
        } catch (e) {
            if (e instanceof WorkflowManagedError) {
                return res.status(409).json({
                    error: e.message,
                    code: SERVICE_REQUEST_WORKFLOW_MANAGED,
                });
            }
            throw e;
        }

        const request = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!request) return res.status(404).json({ error: 'Service request not found' });

        let updates: any = {};

        switch (actionId) {
            case 'start_review':
                updates.status = 'Under Review';
                break;
            case 'approve':
                updates.status = 'Approved';
                break;
            case 'schedule_pickup':
            case 'mark_awaiting_dropoff':
                updates.status = 'Approved';
                break;
            case 'decline':
                updates.status = 'Declined';
                break;
            case 'cancel':
                updates.status = 'Cancelled';
                break;
            case 'mark_unrepairable':
                updates.status = 'Unrepairable';
                break;
            case 'close':
                updates.status = 'Closed';
                break;
            default:
                return res.status(400).json({ error: 'Invalid action ID' });
        }

        const updatedRequest = await serviceRequestRepo.updateServiceRequest(req.params.id, updates);

        if (updatedRequest) {
            await serviceRequestRepo.createServiceRequestEvent({
                serviceRequestId: req.params.id,
                status: updatedRequest.status,
                message: `Action '${actionId}' executed by admin.`,
                actor: 'Admin',
            });

            publishServiceRequestEvent({
                action: 'status_changed',
                entityId: updatedRequest.id,
                invalidate: [...SERVICE_REQUEST_REALTIME_TAGS],
                permissions: ['serviceRequests'],
                payload: {
                    serviceRequestId: updatedRequest.id,
                    status: updatedRequest.status,
                },
            });

            const ACTION_JOURNEY_EVENTS: Record<string, { stage: string; title: string; message: string }> = {
                decline: { stage: 'cancelled', title: 'Request Declined', message: 'We\'re sorry, we cannot proceed with this request at this time. Please contact us if you have questions.' },
                cancel: { stage: 'cancelled', title: 'Request Cancelled', message: 'This repair request has been cancelled. Please contact us if you need further assistance.' },
                mark_unrepairable: { stage: 'cancelled', title: 'Not Repairable', message: 'After review, we\'ve determined this device cannot be repaired. Please contact us to discuss options.' },
                close: { stage: 'delivered', title: 'Request Closed', message: 'This repair request has been completed and closed.' },
                start_review: { stage: 'inspection_started', title: 'Under Review', message: 'Our team is reviewing your request. We\'ll update you shortly.' },
                approve: { stage: 'quote_accepted', title: 'Request Approved', message: 'Your repair request has been approved. We\'ll schedule your service shortly.' },
            };
            const journeyEvent = ACTION_JOURNEY_EVENTS[actionId];
            if (journeyEvent) {
                repairJourneyService.findJourneyByServiceRequest(req.params.id).then(async (journeyId) => {
                    if (!journeyId) return;
                    await repairJourneyService.updateJourneyStage(journeyId, journeyEvent.stage as any);
                    await repairJourneyService.addJourneyEvent({
                        journeyId,
                        eventType: `admin_${actionId}`,
                        title: journeyEvent.title,
                        message: req.body.reason ? `${journeyEvent.message} Reason: ${req.body.reason}` : journeyEvent.message,
                        actorType: 'admin',
                        isCustomerVisible: true,
                    });
                }).catch((err) => console.error('[RepairJourney] Action sync failed:', (err as Error).message));
            }
        }

        res.json(updatedRequest);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Action failed' });
    }
});

/**
 * POST /api/admin/service-requests/:id/adjust-progress - Rollback/adjust workflow progress
 * Only targetStatus/reason accepted — cannot smuggle quote fields.
 */
router.post('/api/admin/service-requests/:id/adjust-progress', requireAdminAuth, requireGranularPermission('serviceRequests.transitionStage'), async (req: Request, res: Response) => {
    try {
        const { targetStatus, reason } = req.body || {};
        if (!targetStatus || typeof targetStatus !== 'string') {
            return res.status(400).json({ error: 'targetStatus is required' });
        }
        const smuggle = { ...(req.body || {}) };
        delete smuggle.targetStatus;
        delete smuggle.reason;
        try {
            assertNoWorkflowForge(smuggle);
        } catch (e) {
            if (e instanceof WorkflowManagedError) {
                return res.status(409).json({
                    error: e.message,
                    code: SERVICE_REQUEST_WORKFLOW_MANAGED,
                });
            }
            throw e;
        }

        const request = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!request) return res.status(404).json({ error: 'Service request not found' });

        // Explicit allowlist — never pass through full body
        const updatedRequest = await serviceRequestRepo.updateServiceRequest(req.params.id, {
            status: targetStatus
        });

        if (updatedRequest) {
            await serviceRequestRepo.createServiceRequestEvent({
                serviceRequestId: req.params.id,
                status: targetStatus,
                message: `Progress adjusted to ${targetStatus}. Reason: ${reason || 'Admin intervention'}`,
                actor: 'Admin',
            });

            publishServiceRequestEvent({
                action: 'status_changed',
                entityId: updatedRequest.id,
                invalidate: [...SERVICE_REQUEST_REALTIME_TAGS],
                permissions: ['serviceRequests'],
                payload: {
                    serviceRequestId: updatedRequest.id,
                    status: updatedRequest.status,
                },
            });
        }

        res.json(updatedRequest);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Progress adjustment failed' });
    }
});

/**
 * POST /api/admin/service-requests/:id/send-quote - Send quote to customer
 * Canonical owner: retail-quote.service (00C-A)
 */
router.post('/api/admin/service-requests/:id/send-quote', requireAdminAuth, requireGranularPermission('serviceRequests.quote'), async (req: Request, res: Response) => {
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

        const updatedRequest = result.serviceRequest;
        publishServiceRequestEvent({
            action: 'status_changed',
            entityId: updatedRequest.id,
            invalidate: [...SERVICE_REQUEST_REALTIME_TAGS],
            permissions: ['serviceRequests'],
            payload: {
                serviceRequestId: updatedRequest.id,
                status: updatedRequest.status,
            },
        });

        if (updatedRequest.customerId) {
            notifyCustomerUpdate(updatedRequest.customerId, {
                type: 'order_update',
                orderId: updatedRequest.id,
                ticketNumber: updatedRequest.ticketNumber,
                status: updatedRequest.status,
                message: "You have received a new quote.",
                updatedAt: new Date().toISOString()
            });
        }

        res.json(attachCanonicalQuoteView(updatedRequest));
    } catch (error: any) {
        if (error instanceof RetailQuoteError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error('[ServiceRequests] send-quote failed:', (error as Error).message);
        res.status(500).json({ error: 'Failed to send quote' });
    }
});

/**
 * PATCH /api/service-requests/:id/quote-response — CUSTOMER ONLY (00C-A-HOTFIX)
 * requireCustomerAuth enforces CSRF + stale session + ownership path in service.
 */
router.patch(
    '/api/service-requests/:id/quote-response',
    requireCustomerAuth,
    async (req: Request, res: Response) => {
        try {
            const { response } = req.body;
            if (response !== 'accepted' && response !== 'rejected') {
                return res.status(400).json({ error: 'Invalid response. Must be accepted or rejected.' });
            }

            const customerId = getCustomerId(req);
            if (!customerId) {
                return res.status(401).json({ error: 'Authentication required', code: 'NOT_AUTHENTICATED' });
            }

            // Explicit customer actor only — never elevate if admin cookie also present
            const actor = { kind: "customer" as const, id: customerId };
            const outcome = response === 'accepted'
                ? await acceptRetailQuote(req.params.id, actor, {}, req)
                : await declineRetailQuote(req.params.id, actor, req);

            const updatedRequest = outcome.serviceRequest;
            publishServiceRequestEvent({
                action: 'status_changed',
                entityId: updatedRequest.id,
                invalidate: [...SERVICE_REQUEST_REALTIME_TAGS],
                permissions: ['serviceRequests'],
                payload: {
                    serviceRequestId: updatedRequest.id,
                    status: updatedRequest.status,
                },
            });

            const jStage = response === 'accepted' ? 'quote_accepted' as const : 'cancelled' as const;
            repairJourneyService.findJourneyByServiceRequest(req.params.id).then(async (journeyId) => {
                if (!journeyId) return;
                await repairJourneyService.updateJourneyStage(journeyId, jStage);
                await repairJourneyService.addJourneyEvent({
                    journeyId,
                    eventType: `quote_${response}`,
                    title: response === 'accepted' ? 'Quote Accepted' : 'Quote Rejected',
                    message: response === 'accepted'
                        ? 'Quote accepted! We will schedule your service shortly.'
                        : 'Quote was declined by the customer.',
                    actorType: 'customer',
                    isCustomerVisible: true,
                });
            }).catch((err) => console.error('[RepairJourney] Quote response sync failed:', (err as Error).message));

            res.json(attachCanonicalQuoteView(updatedRequest));
        } catch (error: any) {
            if (error instanceof RetailQuoteError) {
                return res.status(error.status).json({ error: error.message, code: error.code });
            }
            console.error('[ServiceRequests] customer quote-response failed:', (error as Error).message);
            res.status(500).json({ error: 'Failed to process quote response' });
        }
    },
);

/**
 * PATCH /api/admin/service-requests/:id/quote-response — ADMIN ONLY (00C-A-HOTFIX)
 * requireAdminAuth + serviceRequests.quote + CSRF. Admin accept requires confirmationNote.
 */
router.patch(
    '/api/admin/service-requests/:id/quote-response',
    requireAdminAuth,
    requireGranularPermission('serviceRequests.quote'),
    async (req: Request, res: Response) => {
        try {
            const { response, confirmationNote } = req.body;
            if (response !== 'accepted' && response !== 'rejected') {
                return res.status(400).json({ error: 'Invalid response. Must be accepted or rejected.' });
            }

            const user = (req as any).user;
            if (!user?.id) {
                return res.status(401).json({ error: 'Admin authentication required' });
            }

            const actor = { kind: "admin" as const, id: user.id, name: user.name || "Admin", role: user.role };
            const outcome = response === 'accepted'
                ? await acceptRetailQuote(req.params.id, actor, { confirmationNote }, req)
                : await declineRetailQuote(req.params.id, actor, req);

            const updatedRequest = outcome.serviceRequest;
            publishServiceRequestEvent({
                action: 'status_changed',
                entityId: updatedRequest.id,
                invalidate: [...SERVICE_REQUEST_REALTIME_TAGS],
                permissions: ['serviceRequests'],
                payload: {
                    serviceRequestId: updatedRequest.id,
                    status: updatedRequest.status,
                },
            });

            const jStage = response === 'accepted' ? 'quote_accepted' as const : 'cancelled' as const;
            repairJourneyService.findJourneyByServiceRequest(req.params.id).then(async (journeyId) => {
                if (!journeyId) return;
                await repairJourneyService.updateJourneyStage(journeyId, jStage);
                await repairJourneyService.addJourneyEvent({
                    journeyId,
                    eventType: `quote_${response}`,
                    title: response === 'accepted' ? 'Quote Accepted' : 'Quote Rejected',
                    message: response === 'accepted'
                        ? 'Quote accepted! We will schedule your service shortly.'
                        : 'Quote was declined.',
                    actorType: 'admin',
                    isCustomerVisible: true,
                });
            }).catch((err) => console.error('[RepairJourney] Admin quote response sync failed:', (err as Error).message));

            res.json(attachCanonicalQuoteView(updatedRequest));
        } catch (error: any) {
            if (error instanceof RetailQuoteError) {
                return res.status(error.status).json({ error: error.message, code: error.code });
            }
            console.error('[ServiceRequests] admin quote-response failed:', (error as Error).message);
            res.status(500).json({ error: 'Failed to process quote response' });
        }
    },
);

/**
 * GET /api/admin/service-requests/:id/quote-admin-acceptances
 * Admin-only confirmation notes (never on customer routes).
 */
router.get(
    '/api/admin/service-requests/:id/quote-admin-acceptances',
    requireAdminAuth,
    requireGranularPermission('serviceRequests.quote'),
    async (req: Request, res: Response) => {
        try {
            const rows = await listAdminAcceptancesForServiceRequest(req.params.id);
            res.json({ items: rows });
        } catch (error) {
            console.error('[ServiceRequests] quote-admin-acceptances failed:', (error as Error).message);
            res.status(500).json({ error: 'Failed to load admin acceptance records' });
        }
    },
);

// ─── Test-only: OTP retrieval for e2e tests (dev only) ───
if (process.env.NODE_ENV !== 'production') {
    router.get('/api/test/custody-otp/:phone', requireAdminAuth, async (req: Request, res: Response) => {
        const phone = smsService.normalizePhoneNumber(req.params.phone);
        const records = await db.select().from(otpCodes)
            .where(and(eq(otpCodes.phone, phone), gt(otpCodes.expiresAt, new Date())))
            .orderBy(desc(otpCodes.createdAt))
            .limit(1);
        if (!records[0]) return res.status(404).json({ error: 'No active OTP' });
        const allCodes = await db.select().from(otpCodes)
            .where(eq(otpCodes.phone, phone))
            .orderBy(desc(otpCodes.createdAt))
            .limit(5);
        res.json({ hint: 'Use server console log [CustodyOTP][DEV] for the actual code. This endpoint confirms an OTP exists.', count: allCodes.length, expiresAt: records[0].expiresAt });
    });
}

// ─── Intake Summary (page-scoped lane enrichment; HOTFIX-2) ───

router.get('/api/admin/service-requests/intake-summary', requireAdminAuth, requireGranularPermission('serviceRequests.view'), async (req: Request, res: Response) => {
    try {
        // Required: ids of the currently displayed page only. Empty ids → empty summary (never load-all).
        const idsRaw = typeof req.query.ids === "string" ? req.query.ids : "";
        const ids = idsRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 100);
        if (ids.length === 0) {
            return res.json([]);
        }
        const pageSr = await serviceRequestRepo.getServiceRequestsByIds(ids);
        const summary = await getIntakeSummaryBulk(pageSr.map(sr => ({
            id: sr.id,
            status: sr.status,
            stage: sr.stage,
            convertedJobId: sr.convertedJobId,
            quoteStatus: (sr as any).quoteStatus,
            isQuote: (sr as any).isQuote,
            adminInteracted: sr.adminInteracted,
        })));
        res.json(summary);
    } catch (error: unknown) {
        logRouteError('GET /api/admin/service-requests/intake-summary', req, error);
        res.status(500).json({ error: 'Failed to load intake summary' });
    }
});

// ─── Unified Repair Case ───

router.get('/api/admin/service-requests/:id/repair-case', requireAdminAuth, requireGranularPermission('serviceRequests.view'), async (req: Request, res: Response) => {
    try {
        const repairCase = await loadRepairCaseByServiceRequest(req.params.id);
        if (!repairCase) return res.status(404).json({ error: 'Service request not found' });
        res.json(repairCase);
    } catch (error: any) {
        logRouteError('GET /api/admin/service-requests/:id/repair-case', req, error);
        res.status(500).json({ error: error.message || 'Failed to load repair case' });
    }
});

// ─── Call Attempts ───

const VALID_CALL_TYPES = ['consultation', 'quote', 'schedule', 'follow_up', 'payment', 'delivery'] as const;
const VALID_OUTCOMES = ['scheduled', 'accepted', 'rejected', 'asked_for_time', 'no_answer', 'phone_off', 'wrong_number', 'hung_up', 'callback_requested', 'converted_to_pickup', 'converted_to_service_center', 'converted_to_quote', 'closed_no_response'] as const;
const VALID_MOODS = ['normal', 'confused', 'angry', 'interested', 'not_interested'] as const;

router.get('/api/admin/service-requests/:id/call-attempts', requireAdminAuth, requireGranularPermission('serviceRequests.view'), async (req: Request, res: Response) => {
    try {
        const sr = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!sr) return res.status(404).json({ error: 'Service request not found' });
        const attempts = await getCallAttempts(req.params.id);
        res.json(attempts);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to load call attempts' });
    }
});

router.post('/api/admin/service-requests/:id/call-attempts', requireAdminAuth, requireGranularPermission('serviceRequests.logCall'), async (req: Request, res: Response) => {
    try {
        const sr = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!sr) return res.status(404).json({ error: 'Service request not found' });

        const session = req.session as any;
        const { callType, scheduledAt, calledAt, outcome, nextAction, callbackAt, customerMood, notes, customerVisibleMessage } = req.body;

        if (!callType || !VALID_CALL_TYPES.includes(callType)) {
            return res.status(400).json({ error: `callType must be one of: ${VALID_CALL_TYPES.join(', ')}` });
        }
        if (outcome && !VALID_OUTCOMES.includes(outcome)) {
            return res.status(400).json({ error: `outcome must be one of: ${VALID_OUTCOMES.join(', ')}` });
        }
        if (customerMood && !VALID_MOODS.includes(customerMood)) {
            return res.status(400).json({ error: `customerMood must be one of: ${VALID_MOODS.join(', ')}` });
        }

        const attempt = await createCallAttempt({
            serviceRequestId: req.params.id,
            staffId: session.adminUserId,
            staffName: session.adminUserName || 'Admin',
            callType,
            scheduledAt, calledAt, outcome, nextAction, callbackAt, customerMood, notes, customerVisibleMessage,
        });

        res.status(201).json(attempt);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to create call attempt' });
    }
});

router.patch('/api/admin/service-requests/:id/call-attempts/:attemptId', requireAdminAuth, requireGranularPermission('serviceRequests.logCall'), async (req: Request, res: Response) => {
    try {
        const { calledAt, outcome, nextAction, callbackAt, customerMood, notes, customerVisibleMessage } = req.body;

        if (outcome && !VALID_OUTCOMES.includes(outcome)) {
            return res.status(400).json({ error: `outcome must be one of: ${VALID_OUTCOMES.join(', ')}` });
        }
        if (customerMood && !VALID_MOODS.includes(customerMood)) {
            return res.status(400).json({ error: `customerMood must be one of: ${VALID_MOODS.join(', ')}` });
        }

        const updated = await updateCallAttempt(req.params.attemptId, req.params.id, {
            calledAt, outcome, nextAction, callbackAt, customerMood, notes, customerVisibleMessage,
        });

        if (!updated) return res.status(404).json({ error: 'Call attempt not found for this service request' });
        res.json(updated);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to update call attempt' });
    }
});

export default router;
