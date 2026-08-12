/**
 * Service Requests Routes
 * 
 * Handles service request CRUD, stage transitions, and timeline events.
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';

import { jobRepo, serviceRequestRepo, userRepo, systemRepo, settingsRepo, notificationRepo, pickupRepo } from '../repositories/index.js';
import { insertServiceRequestSchema, otpCodes, type ServiceRequest } from '../../shared/schema.js';
import { requireAdminAuth, requireCustomerAuth, requireGranularPermission, requireAnyGranularPermission, requireSuperAdmin, getCustomerId, actorHasPermission } from './middleware/auth.js';
import { notifyAdminUpdate, notifyCustomerUpdate } from './middleware/sse-broker.js';
import { serviceRequestLimiter } from './middleware/rate-limit.js';
import { auditLogger } from '../utils/auditLogger.js';
import { jobService, JobOwnsLifecycleError, isPostCustodyLifecycleStage } from '../services/job.service.js';
import { publishJobTicketEvent, publishServiceRequestEvent } from '../services/admin-realtime.service.js';
import { deriveTrackingStatus } from '../lib/workflowAutomation.js';
import { logRouteError } from '../utils/route-error.js';
import { smsService } from '../services/sms.service.js';
import { db } from '../db.js';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { repairJourneyService } from '../services/customer-repair-journey.service.js';
import { loadRepairCaseByServiceRequest } from '../services/repair-case.service.js';
import { getCallAttempts, createCallAttempt, updateCallAttempt, getIntakeSummaryBulk } from '../services/call-attempt.service.js';
import { getActiveServiceAreaById } from '../repositories/service-area.repository.js';
import { deriveServiceRequestPaymentState, applyDerivedPaymentState } from '../services/service-request-payment-projection.service.js';
import { notifyAdminsWithPush } from '../services/fcm.service.js';
import * as pushService from '../pushService.js';
import {
    resolveCustodyAuthority,
    issueCustodyCode,
    hashCustodyCode,
    redactCustodyNotification,
    CustodyAuthorityError,
} from '../services/custody-handover.service.js';
import { completeCustody, describeCustodyOutcome, type CustodyCompletionOutcome } from '../services/custody-completion.service.js';
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

/**
 * The two custody completion clocks, defined together because their
 * relationship is the correctness property — separately they each look fine.
 *
 * LEASE bounds how long one claimed completion excludes others. It must exceed
 * the slowest honest completion, or a slow worker's own lease expires beneath
 * it and a second confirmation runs completeCustody concurrently.
 *
 * RESUME_WINDOW bounds how long an already-verified but unfinished handover may
 * be finished after a crash, measured from `verified_at`.
 *
 * RESUME_WINDOW must be comfortably GREATER than LEASE. If it is not, a worker
 * that claims the lease and dies holds the issuance until a point where no
 * retry can resume it, and the handover is stranded — the driver has the TV,
 * the customer has gone, and the system can neither finish nor reissue.
 * Recovery was previously bounded by the code's own `expires_at` (issuance + 5
 * minutes); since the lease can only be claimed after issuance, that bound was
 * always the earlier of the two and recovery was unreachable in every case.
 */
const CUSTODY_LEASE_SECONDS = 300;
const CUSTODY_RESUME_WINDOW_SECONDS = 30 * 60;
if (CUSTODY_RESUME_WINDOW_SECONDS <= CUSTODY_LEASE_SECONDS) {
    throw new Error(
        "Custody resume window must exceed the completion lease, or a crashed completion can never be resumed.",
    );
}

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
            /**
             * The day a drop-off customer says they will bring the television in.
             *
             * The desktop form has asked for this for a long time and marks it
             * required for service-centre bookings, insertServiceRequestSchema
             * accepts it, and the column exists — but this insert never wrote
             * it, so every one of those dates went in the bin. Staff had no
             * idea who to expect, and the customer had been made to choose a
             * date to get past the form.
             */
            scheduledPickupDate: (validated as any).scheduledPickupDate ?? null,
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

        // The broadcast above is Server-Sent Events: an in-page toast that only
        // reaches an admin who already has the panel open in a browser tab. It
        // cannot wake a closed tab or a phone, so for a long time nobody was
        // notified of a new request unless they happened to be watching.
        //
        // notifyAdminsWithPush has existed in fcm.service.ts since push was
        // added and had no callers at all — the VAPID work made browsers
        // subscribe successfully to a pipe with nothing feeding it. This is the
        // feed.
        //
        // Deliberately not awaited and impossible to reject: the service
        // request is already committed and the customer already holds a ticket
        // number. A dead FCM token or an unreachable Firebase must never turn a
        // successful intake into an error response.
        void notifyAdminsWithPush({
            type: 'service_request_created',
            // Lead with the device rather than a generic subject line: a bare
            // "New service request" is the kind of vague title Chrome's push
            // classifier scores as low-information. The ticket number makes it
            // actionable from the lock screen.
            title: `New repair request — ${request.brand || 'TV'}`,
            body: `${request.primaryIssue || 'Repair request'}. Ticket ${request.ticketNumber || request.id}.`,
            /**
             * Dispatch only.
             *
             * STAFF_PORTAL_ROLES includes Driver, Technician and Cashier, so
             * this previously buzzed every one of them for every new request —
             * a driver woken for a walk-in that never becomes a pickup, a
             * technician woken for a job not yet assigned to anyone. Nobody is
             * assigned at intake, so the people who need to know are the ones
             * who triage: whoever can act on a service request.
             *
             * Drivers and technicians are notified when work is actually
             * assigned to them, by name, from the assignment itself.
             */
            requiredPermissions: [
                'serviceRequests',
                'serviceRequests.view',
                'serviceRequests.transitionStage',
                'serviceRequests.convertToJob',
            ],
            data: {
                serviceRequestId: String(request.id),
                ticketNumber: String(request.ticketNumber || request.id),
                url: '/admin/service-requests',
            },
        }).catch((err) => {
            console.error('[ServiceRequests] Admin push failed', (err as Error).message);
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

router.post('/api/admin/service-requests/:id/custody-otp/send', requireAdminAuth, requireAnyGranularPermission(['pickup.confirmHandover', 'serviceRequests.confirmCounterCustody']), async (req: Request, res: Response) => {
    try {
        const { action } = req.body;
        if (action !== "receive" && action !== "delivery") {
            return res.status(400).json({ error: 'Invalid custody action' });
        }

        const request = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!request) return res.status(404).json({ error: 'Service request not found' });
        if (action === "delivery" && !request.convertedJobId) {
            return res.status(409).json({ error: 'Delivery code requires a linked job ticket' });
        }

        /**
         * No phone requirement. The code never travels by phone — it appears
         * only in the customer's My Repairs page — so demanding a valid
         * Bangladeshi number here refused a code to customers who could read it
         * perfectly well, and pushed them onto the lower-assurance no-code path
         * for no reason.
         */
        if (!request.customerId) {
            return res.json({
                success: true,
                action,
                targetStage: getCustodyTargetStage(request, action),
                expiresAt: null,
                codeIssued: false,
                needsNoCodeHandover: true,
                customerPortalNotified: false,
                pushReminderAccepted: false,
                maxAttempts: 3,
            });
        }

        // Assignment decides, not the role. Throws 404 for the wrong driver
        // (ticket numbers are guessable, so 403 would confirm existence) and
        // 409 when no unique active task exists.
        const authority = await resolveCustodyAuthority({
            request,
            action,
            actorUserId: req.session.adminUserId!,
            actorHasCounterCustody: await actorHasPermission(req, 'serviceRequests.confirmCounterCustody'),
        });

        const targetStage = getCustodyTargetStage(request, action);
        const label = getCustodyLabel(request, action);

        // Code + notification commit together, or neither exists.
        const issued = await issueCustodyCode({
            request,
            customerId: request.customerId,
            action,
            authority,
            label,
        });

        /**
         * Push is advisory and strictly post-commit. It carries NO code: a
         * lock-screen preview is readable by whoever holds the phone, including
         * the person at the door asking for it. Failure here must never
         * invalidate a code the customer can already see in the portal.
         */
        let pushReminderAccepted = false;
        try {
            const devices = await pushService.sendToUser(request.customerId, {
                /**
                 * Worded to survive Chrome's on-device push spam filter.
                 *
                 * The previous copy — "Handover code ready" / "Open repair X in
                 * My Repairs to see your code" — is structurally identical to
                 * OTP phishing: a vague subject, no named party, and an
                 * instruction to tap through for a code. Chrome's classifier
                 * (Android, since May 2025) reads title and body text, and that
                 * is the exact shape it was built to catch. Flagged
                 * notifications are shown behind a "may be deceptive" warning,
                 * which for a real handover code is the worst possible moment
                 * to lose the customer's trust.
                 *
                 * The fix is specificity, not urgency: name the business, name
                 * the device, say what is physically happening. The code itself
                 * still never appears here — that is a security requirement, and
                 * it is precisely why the old wording had to be vague. Naming
                 * the rest of the context is what makes it read as
                 * transactional rather than as bait.
                 */
                // getCustodyLabel returns internal wording ("pickup receive"),
                // which reads oddly to a customer. Customer-facing terms here.
                title: `Promise Electronics ${action === "receive" ? "collection" : "delivery"} — ${request.brand || "your TV"}`,
                body: `Our staff member is with you now. Your 6-digit code is in My Repairs, under ${request.ticketNumber || request.id}.`,
                data: { type: "handover_code", serviceRequestId: String(request.id) },
            });
            pushReminderAccepted = devices > 0;
        } catch (err) {
            console.error('[CustodyCode] Push reminder failed:', (err as Error).message);
        }

        await serviceRequestRepo.createServiceRequestEvent({
            serviceRequestId: request.id,
            status: request.trackingStatus || request.status,
            message: `Online handover code issued for ${label} (mode=${authority.mode}, custodian=${authority.custodianUserId}).`,
            actor: 'System',
        });

        res.json({
            success: true,
            action,
            targetStage,
            expiresAt: issued.expiresAt.toISOString(),
            codeIssued: true,
            needsNoCodeHandover: false,
            customerPortalNotified: issued.customerPortalNotified,
            pushReminderAccepted,
            maxAttempts: 3,
        });
    } catch (error: any) {
        if (error instanceof CustodyAuthorityError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        logRouteError('ServiceRequests.SendCustodyOtp', req, error);
        res.status(500).json({ error: error.message || 'Failed to issue custody code' });
    }
});

router.post('/api/admin/service-requests/:id/custody-otp/confirm', requireAdminAuth, requireAnyGranularPermission(['pickup.confirmHandover', 'serviceRequests.confirmCounterCustody']), async (req: Request, res: Response) => {
    try {
        const { action, code } = req.body;
        /**
         * The condition photo, on the ordinary handover as well as the
         * exception one.
         *
         * A photograph existed only on the no-code path, where it is evidence
         * that a handover happened at all. It is worth just as much on a
         * successful one, for a different reason: it records what the
         * television looked like as it changed hands. That single fact settles
         * "this crack was not there when I gave it to you" for both sides, and
         * a repair shop holding other people's panels carries that risk daily.
         *
         * Optional here rather than required. A driver at a gate with no signal
         * must still be able to complete a verified handover — refusing custody
         * over a failed upload would be a worse failure than a missing photo.
         */
        const conditionPhotoUrl = typeof req.body?.proofPhotoUrl === "string"
            ? req.body.proofPhotoUrl.trim()
            : "";
        if (action !== "receive" && action !== "delivery") {
            return res.status(400).json({ error: 'Invalid custody action' });
        }
        if (!code) {
            return res.status(400).json({ error: 'Handover code is required' });
        }

        const request = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!request) return res.status(404).json({ error: 'Service request not found' });
        if (!request.customerId) {
            return res.status(409).json({
                error: 'This repair has no linked customer account. Use the audited no-code handover.',
                code: 'NO_CUSTOMER_ACCOUNT',
            });
        }

        /**
         * Same authority as issuance: whoever confirms must be the person the
         * device is actually changing hands with.
         *
         * `allowCompletedTask` is what makes an interrupted completion
         * recoverable. Custody completes the logistics task, so once that write
         * lands there is no executable task left and every retry answered
         * NO_UNIQUE_ACTIVE_TASK — the previous "resume" branch could never be
         * reached. Accepting a completed task here is safe because the driver
         * still has to present the same unexpired code below, and issuance
         * (which must never see a completed task) does not pass this flag.
         */
        const counterPermitted = await actorHasPermission(req, 'serviceRequests.confirmCounterCustody');
        const authority = await resolveCustodyAuthority({
            request,
            action,
            actorUserId: req.session.adminUserId!,
            actorHasCounterCustody: counterPermitted,
            allowCompletedTask: true,
        });

        /**
         * Claim the attempt atomically.
         *
         * The UPDATE ... RETURNING both increments and selects in one statement,
         * so two drivers submitting at once cannot each read attempts=0 and both
         * be granted a try. The row is pinned by every identity field, not just
         * the request: a superseded, expired, verified or differently-assigned
         * issuance can never be the one that matches.
         */
        const claimed = await db.execute(sql`
            UPDATE custody_handover_codes
            SET attempts = attempts + 1
            WHERE id = (
                SELECT id FROM custody_handover_codes
                WHERE service_request_id = ${request.id}
                  AND customer_id = ${request.customerId}
                  AND custody_mode = ${authority.mode}
                  AND action = ${action}
                  AND custodian_user_id = ${authority.custodianUserId}
                  AND logistics_task_id IS NOT DISTINCT FROM ${authority.logisticsTaskId}
                  AND verified_at IS NULL
                  AND invalidated_at IS NULL
                  AND expires_at > NOW()
                ORDER BY created_at DESC
                LIMIT 1
                FOR UPDATE
            )
            AND attempts < max_attempts
            RETURNING id, code_hash, attempts, max_attempts
        `);
        const row = (((claimed as any).rows ?? claimed)[0]) as
            | { id: string; code_hash: string; attempts: number; max_attempts: number }
            | undefined;

        /**
         * Resume an issuance that was verified but whose completion did not land.
         *
         * Settlement and the canonical delivery cannot share one database
         * transaction — the lifecycle operation spans the job, the logistics
         * task and the journey, and owns its own writes. So a crash between
         * "verified" and "delivered" is possible, and compensation in a catch
         * block cannot cover a process that simply died.
         *
         * The verified row IS the durable record that the customer authorised
         * this handover, so the same code is allowed to finish the job it
         * started: the driver re-enters it and completion runs again. That is
         * safe because updateTaskStatusWithLifecycle is idempotent — a delivery
         * already completed against an already-Delivered job is a no-op — so
         * retrying converges on exactly one delivery rather than repeating it.
         *
         * Deliberately narrow: same identity, same code, still inside the
         * recovery window measured from verification, and only while the work is
         * genuinely unfinished. Once the job is Delivered the code is spent and
         * this path refuses it.
         */
        let resumedIssuance: { id: string; code_hash: string } | undefined;
        if (!row) {
            const resumable = await db.execute(sql`
                SELECT id, code_hash FROM custody_handover_codes
                WHERE service_request_id = ${request.id}
                  AND customer_id = ${request.customerId}
                  AND custody_mode = ${authority.mode}
                  AND action = ${action}
                  AND custodian_user_id = ${authority.custodianUserId}
                  AND logistics_task_id IS NOT DISTINCT FROM ${authority.logisticsTaskId}
                  AND verified_at IS NOT NULL
                  -- Without this, a FINISHED handover could be replayed with its
                  -- own still-valid code: completeCustody would run again and
                  -- write a second timeline event for one physical handover.
                  AND completed_at IS NULL
                  AND invalidated_at IS NULL
                  -- Bounded by VERIFICATION, not by the code's expiry.
                  --
                  -- This read "expires_at > NOW()", which made crash recovery
                  -- unreachable. expires_at is issuance + 5 minutes and the
                  -- completion lease is also 5 minutes, but the lease can only
                  -- be claimed AFTER issuance, so the lease always outlives the
                  -- code. A worker that claimed and then died held the issuance
                  -- until a moment when this clause could no longer be true, and
                  -- the verified handover was stranded with no way to finish.
                  --
                  -- The two clocks answer different questions. expires_at bounds
                  -- how long the customer's code may be used to PROVE
                  -- authorisation. Resumption is about finishing work that was
                  -- already proven, so it is bounded from verified_at, the
                  -- moment the customer authorised it, and generously enough to
                  -- outlast any lease held by a process that has since died.
                  --
                  -- Still narrow: same driver, same task, same code hash, only
                  -- while unfinished, and never after completion.
                  AND verified_at > NOW() - (${CUSTODY_RESUME_WINDOW_SECONDS} * INTERVAL '1 second')
                ORDER BY created_at DESC
                LIMIT 1
            `);
            resumedIssuance = (((resumable as any).rows ?? resumable)[0]) as
                | { id: string; code_hash: string }
                | undefined;

            if (resumedIssuance && hashCustodyCode(String(code)) !== resumedIssuance.code_hash) {
                resumedIssuance = undefined;
            }
        }

        if (!row && !resumedIssuance) {
            return res.status(400).json({
                error: 'No usable handover code. Ask the customer to refresh, or issue a new code.',
                code: 'NO_LIVE_ISSUANCE',
            });
        }

        if (row && hashCustodyCode(String(code)) !== row.code_hash) {
            return res.status(400).json({
                error: 'Incorrect code',
                remainingAttempts: Math.max(0, row.max_attempts - row.attempts),
            });
        }

        // The issuance being completed: a freshly claimed one, or the verified
        // one we are resuming after an interrupted completion.
        const issuanceId = row?.id ?? resumedIssuance!.id;

        if (row) {
            // Replay protection: only the first confirmation of THIS issuance wins.
            const settled = await db.execute(sql`
                UPDATE custody_handover_codes
                SET verified_at = NOW()
                WHERE id = ${row.id} AND verified_at IS NULL
                RETURNING id
            `);
            if (!(((settled as any).rows ?? settled)[0])) {
                return res.status(409).json({ error: 'This code was already used.', code: 'ALREADY_VERIFIED' });
            }
        }

        const adminUser = await userRepo.getUser(req.session.adminUserId!);
        const actor = adminUser?.name || 'Admin';
        const targetStage = getCustodyTargetStage(request, action);

        /**
         * Release the verification if the custody move fails.
         *
         * The issuance is marked verified first, and that has to happen first —
         * otherwise two submissions could both pass replay protection. But a
         * spent code with no custody move leaves the driver holding a TV the
         * system says was never collected.
         *
         * This is only safe because transitionStage is now transactional: a
         * thrown transition changed nothing, so releasing the code cannot
         * resurrect it against a request whose custody already advanced. It was
         * previously two unrelated statements, and the comment here claimed a
         * guarantee the code did not provide.
         */
        /**
         * When a job owns the lifecycle, custody is recorded — not staged.
         *
         * Delivery custody targets stage `completed`, which is a post-custody
         * lifecycle stage. transitionStage refuses those outright once a job
         * exists (JOB-LIFECYCLE-TRUST-01A), and the delivery route requires a
         * job. Both branches therefore answered 409 and delivery confirmation
         * could never succeed — a dead end that predates this work and has
         * been live in production since that guard shipped.
         *
         * The guard is right: the job is the source of truth after conversion,
         * and nothing else may publish repair, ready or delivery conclusions on
         * the service request. What the OTP proves is narrower than a lifecycle
         * change — it proves the device physically changed hands. So record
         * exactly that on the timeline and leave the job to close itself.
         */
        /**
         * One completion path, serialized per issuance.
         *
         * completeCustody converges every fact custody implies — job, logistics
         * task, legacy pickup row, stage where the job does not own it — and
         * each step is safe to repeat, so a resumed attempt converges instead
         * of double-applying.
         *
         * Serialization is the lease claimed below, not an advisory lock. An
         * earlier version used pg_advisory_xact_lock; it is gone, because the
         * only way to hold one across the completion is to hold a pool
         * connection across it too, which deadlocks the very services the
         * completion calls.
         */
        let result;
        // Assigned inside the claim branch below; typed explicitly because
        // TypeScript narrows a closure-assigned `let` to `never` otherwise.
        let custodyOutcome: CustodyCompletionOutcome | null = null;
        let settledOutcome: CustodyCompletionOutcome | null = null;
        let alreadyCompleted = false;
        let completionInProgress = false;
        try {
            /**
             * Claim a lease, then do the work with NO connection held.
             *
             * The design before the lease opened a transaction, took an advisory
             * lock, and ran completeCustody inside it — while completeCustody
             * reached back into the same pool for the job, task, pickup and
             * journey writes. With DB_POOL_MAX=5 and five confirmations for five
             * DIFFERENT issuances, each takes a different lock so none blocks
             * another: they simply hold all five connections and then wait for
             * a sixth that cannot exist. The same-issuance test never showed
             * this because four competitors lost the one lock immediately.
             *
             * That is why the lifecycle work still runs outside any transaction
             * here, and why it must keep doing so: completeCustody's downstream
             * services (logistics-task, job-status-transition, the repos) issue
             * their own global-pool statements. Holding a connection across them
             * reintroduces the deadlock exactly.
             *
             * The lease is the cross-statement owner token. Only the claimer may
             * settle, and the expiry means a crashed process releases its claim
             * with nothing needing to clean up.
             */
            const leaseToken = randomUUID();
            /**
             * The lease must outlive the slowest honest completion, not the
             * typical one.
             *
             * At 60s a slow completion — cold start, retry, contended job row —
             * could still be running when its own lease expired. A second
             * confirmation then satisfied the `expires_at < NOW()` branch of the
             * claim and ran completeCustody CONCURRENTLY with the first. The
             * settle is token-gated, so the loser could never double-mark or
             * write a second timeline event, but both had already driven real
             * lifecycle writes by then.
             *
             * Five minutes is far above any completion this path can legitimately
             * take and far below anything a driver would wait through, so the
             * only claim that now sees an expired lease is one whose owner is
             * genuinely gone.
             *
             * Paired with CUSTODY_RESUME_WINDOW_SECONDS: raising this without
             * raising that one strands crashed completions. See the constants.
             */
            const LEASE_SECONDS = CUSTODY_LEASE_SECONDS;

            /**
             * Claim and diagnosis in ONE transaction.
             *
             * They used to be two statements: a conditional UPDATE, then a
             * SELECT to explain a failure. Between them the row could change, so
             * the reason returned to the driver described a state that no longer
             * held — "already completed" for a row that had just been re-leased,
             * or a bare NO_LIVE_ISSUANCE for one that had in fact completed.
             *
             * FOR UPDATE NOWAIT makes the row's state stable across both reads
             * without ever waiting: a competing claimer holding the row fails
             * instantly with 55P03 rather than blocking on a pool connection.
             * The transaction issues no outbound calls, so it holds its
             * connection for microseconds.
             */
            type ClaimOutcome = 'claimed' | 'completed' | 'in_progress' | 'unusable';
            let claimOutcome: ClaimOutcome;
            try {
                claimOutcome = await db.transaction(async (tx): Promise<ClaimOutcome> => {
                    const locked = await tx.execute(sql`
                        SELECT completed_at,
                               (completion_lease_expires_at IS NOT NULL AND completion_lease_expires_at >= NOW()) AS leased
                        FROM custody_handover_codes
                        WHERE id = ${issuanceId}
                        FOR UPDATE NOWAIT
                    `);
                    const lockedRow = (((locked as any).rows ?? locked)[0]) as any;
                    if (!lockedRow) return 'unusable';
                    if (lockedRow.completed_at) return 'completed';
                    if (lockedRow.leased) return 'in_progress';

                    const claimed = await tx.execute(sql`
                        UPDATE custody_handover_codes
                        SET completion_lease_token = ${leaseToken},
                            completion_lease_expires_at = NOW() + (${LEASE_SECONDS} * INTERVAL '1 second')
                        WHERE id = ${issuanceId}
                          AND completed_at IS NULL
                          AND invalidated_at IS NULL
                          AND verified_at IS NOT NULL
                          -- Same clock as the resume query above, deliberately.
                          -- This clause used to be "expires_at > NOW()", which
                          -- re-imposed the code's 5-minute life on a completion
                          -- the customer had ALREADY authorised, so the resume
                          -- path could select an issuance and then fail to claim
                          -- it. Verification is what this row proves; bounding
                          -- the claim by verification is what makes the two
                          -- agree. The fresh path sets verified_at moments
                          -- earlier, so it satisfies this trivially.
                          AND verified_at > NOW() - (${CUSTODY_RESUME_WINDOW_SECONDS} * INTERVAL '1 second')
                          AND service_request_id = ${request.id}
                          AND customer_id = ${request.customerId}
                          AND custody_mode = ${authority.mode}
                          AND action = ${action}
                          AND custodian_user_id = ${authority.custodianUserId}
                          AND logistics_task_id IS NOT DISTINCT FROM ${authority.logisticsTaskId}
                          AND code_hash = ${hashCustodyCode(String(code))}
                          AND (completion_lease_expires_at IS NULL OR completion_lease_expires_at < NOW())
                        RETURNING id
                    `);
                    return (((claimed as any).rows ?? claimed)[0]) ? 'claimed' : 'unusable';
                });
            } catch (claimError: any) {
                // 55P03 lock_not_available: another confirmation holds the row
                // right now. That is precisely COMPLETION_IN_PROGRESS, and NOWAIT
                // reports it immediately instead of occupying a pool connection.
                if (claimError?.code === '55P03') {
                    claimOutcome = 'in_progress';
                } else {
                    throw claimError;
                }
            }

            if (claimOutcome === 'completed') {
                alreadyCompleted = true;
            } else if (claimOutcome === 'in_progress') {
                completionInProgress = true;
            } else if (claimOutcome === 'unusable') {
                throw new CustodyAuthorityError(400, 'NO_LIVE_ISSUANCE', 'This handover code is no longer usable.');
            } else {
                const outcome = await completeCustody({
                    request,
                    action,
                    authority,
                    actorName: actor,
                    actorUserId: req.session.adminUserId!,
                    actorRole: adminUser?.role || "Driver",
                    proofPhotoUrl: conditionPhotoUrl || undefined,
                });

                /**
                 * Settle in one short transaction: the timeline event and the
                 * completion marker commit together, and only the lease owner
                 * may do it. This transaction makes no outbound calls, so it
                 * holds a connection for microseconds rather than for the whole
                 * completion.
                 */
                await db.transaction(async (tx) => {
                    await serviceRequestRepo.createServiceRequestEvent({
                        serviceRequestId: request.id,
                        status: outcome.serviceRequest.trackingStatus || outcome.serviceRequest.status,
                        message: `Customer confirmed ${getCustodyLabel(request, action)} with their online handover code.`,
                        actor,
                    }, tx as any);

                    const marked = await tx.execute(sql`
                        UPDATE custody_handover_codes
                        SET completed_at = NOW(),
                            completion_lease_token = NULL,
                            completion_lease_expires_at = NULL
                        WHERE id = ${issuanceId}
                          AND completed_at IS NULL
                          AND completion_lease_token = ${leaseToken}
                        RETURNING id
                    `);
                    if ((((marked as any).rows ?? marked) as unknown[]).length !== 1) {
                        throw new Error('Custody completion marker did not apply to exactly one issuance.');
                    }
                });

                custodyOutcome = outcome;
            }

            if (completionInProgress) {
                return res.status(409).json({
                    error: 'This handover is being completed right now. Try again in a moment.',
                    code: 'COMPLETION_IN_PROGRESS',
                });
            }

            if (alreadyCompleted) {
                return res.status(409).json({
                    error: 'This handover has already been completed.',
                    code: 'ALREADY_COMPLETED',
                });
            }

            // Read once into a plain const so later use is not narrowed to
            // `never` by the closure assignment above.
            settledOutcome = custodyOutcome as CustodyCompletionOutcome | null;
            result = { serviceRequest: settledOutcome!.serviceRequest };
        } catch (transitionError) {
            /**
             * verified_at is NOT cleared here, deliberately.
             *
             * It records that the customer read their code back and authorised
             * this physical handover. That fact does not become untrue because
             * a later write failed — and completeCustody may already have
             * converged real lifecycle state (job Delivered, task completed)
             * before the failure, since those commit outside this transaction.
             *
             * Clearing it would demand a SECOND authorisation for a handover
             * that already happened: the driver has the TV, the customer has
             * gone, and the system would be asking them to prove it again.
             * Leaving verified_at set with completed_at null is exactly the
             * state the recovery path is built to resume.
             */
            console.error(
                '[CustodyCode] Completion failed; issuance stays verified for retry:',
                (transitionError as Error).message,
            );
            throw transitionError;
        }

        /**
         * Best-effort, because redactSettledCustodyCodes() sweeps every five
         * minutes — the same cadence codes live for — and will close anything
         * missed here.
         *
         * This was briefly fatal, on the reasoning that a readable code is the
         * leak this design exists to prevent. That was the wrong trade: custody
         * has already moved by this point, so failing the response told the
         * driver the handover had not happened when it had — and the retry
         * could only answer "already used". The sweeper removes the dilemma:
         * the response can report the truth, and the secret still cannot
         * survive.
         */
        await redactCustodyNotification(issuanceId, 'used').catch((err) =>
            console.error('[CustodyCode] Inline redaction failed; sweeper will close it:', (err as Error).message));

        await auditLogger.log({
            userId: req.session.adminUserId!,
            action: 'CONFIRM_CUSTODY_OTP',
            entity: 'ServiceRequest',
            entityId: request.id,
            /**
             * Describe what actually converged.
             *
             * This used to read "Stage moved to completed" on every delivery —
             * a stage that never moves, because the job owns it after
             * conversion. An audit trail asserting a write that did not happen
             * is worse than a thin one: it sends whoever reads it looking in
             * the wrong place.
             */
            details: `Customer OTP confirmed for ${getCustodyLabel(request, action)}. ${
                settledOutcome ? describeCustodyOutcome(action, settledOutcome, false) : 'No custody changes recorded.'
            }`,
            oldValue: { stage: request.stage, trackingStatus: request.trackingStatus },
            newValue: {
                stage: result.serviceRequest.stage,
                trackingStatus: result.serviceRequest.trackingStatus,
                jobDelivered: settledOutcome?.jobDelivered ?? false,
                taskCompleted: settledOutcome?.taskCompleted ?? false,
                pickupSchedule: settledOutcome?.pickupScheduleStatus ?? null,
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
        // Authority denials carry their own status — 404 for a driver this task
        // is not assigned to, 409 when no unique active task exists. Without
        // this branch they collapsed into a generic 400, which reads as "wrong
        // code" and tells an unauthorised caller nothing about why they failed
        // but also hid the denial from anyone auditing it.
        if (error instanceof CustodyAuthorityError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
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
    requireAnyGranularPermission(['pickup.confirmHandover', 'serviceRequests.confirmCounterCustody']),
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

            /**
             * The no-code path is the LOWER-assurance route, which makes it the
             * more attractive one to abuse: it advances custody with no customer
             * involvement at all. It therefore needs the same authority as the
             * coded path — the assigned driver, or explicit counter-custody
             * permission — not merely pickup.confirmHandover, which every driver
             * holds for every job in the system.
             */
            const authority = await resolveCustodyAuthority({
                request,
                action,
                actorUserId: req.session.adminUserId!,
                actorHasCounterCustody: await actorHasPermission(req, 'serviceRequests.confirmCounterCustody'),
            });

            const adminUser = await userRepo.getUser(req.session.adminUserId!);
            const actor = adminUser?.name || 'Admin';
            const label = getCustodyLabel(request, action);

            /**
             * Same completion path as the coded handover.
             *
             * This used to call transitionStage(..., 'completed') for delivery,
             * which converted jobs reject outright — so the audited fallback,
             * the one used precisely when the code path has already failed, was
             * itself broken for every delivery. It also left the logistics task
             * untouched and relied on the driver UI to finish the pickup record
             * with a second request that could not succeed either.
             *
             * Routing it through completeCustody means the lower-assurance path
             * reaches exactly the same end state as the coded one. Only the
             * evidence differs — reason and photo instead of a customer code —
             * and that difference stays recorded in the audit entry below.
             */
            const custodyOutcome = await completeCustody({
                request,
                action,
                authority,
                actorName: actor,
                actorUserId: req.session.adminUserId!,
                actorRole: adminUser?.role || 'Driver',
                lowerAssurance: true,
                reason: reasonText,
                proofPhotoUrl: photo,
            });
            const result = { serviceRequest: custodyOutcome.serviceRequest };

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
                details: `No-code handover (${label}). Reason recorded. Proof photo attached. ${describeCustodyOutcome(action, custodyOutcome, true)}`,
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
            if (error instanceof CustodyAuthorityError) {
                return res.status(error.status).json({ error: error.message, code: error.code });
            }
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
