/**
 * Service Requests Routes
 * 
 * Handles service request CRUD, stage transitions, and timeline events.
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';

import { jobRepo, serviceRequestRepo, userRepo, systemRepo, settingsRepo, notificationRepo } from '../repositories/index.js';
import { insertServiceRequestSchema } from '../../shared/schema.js';
import { requireAdminAuth, requirePermission } from './middleware/auth.js';
import { notifyAdminUpdate, notifyCustomerUpdate } from './middleware/sse-broker.js';
import { serviceRequestLimiter } from './middleware/rate-limit.js';
import { auditLogger } from '../utils/auditLogger.js';
import { jobService } from '../services/job.service.js';
import { publishJobTicketEvent, publishServiceRequestEvent } from '../services/admin-realtime.service.js';
import { deriveTrackingStatus } from '../lib/workflowAutomation.js';
import { logRouteError } from '../utils/route-error.js';

const router = Router();
const SERVICE_REQUEST_REALTIME_TAGS = ["serviceRequests", "dashboardStats"] as const;
const SERVICE_REQUEST_CREATE_REALTIME_TAGS = [...SERVICE_REQUEST_REALTIME_TAGS, "adminNotifications", "adminNotificationCount"] as const;
const JOB_REALTIME_TAGS = ["jobTickets", "jobOverview", "dashboardStats"] as const;
const JOB_CREATE_REALTIME_TAGS = [...JOB_REALTIME_TAGS, "adminNotifications", "adminNotificationCount"] as const;

// ============================================
// Public Service Requests API
// ============================================

/**
 * GET /api/service-requests - Get all service requests
 * PROTECTED: Admin only
 */
router.get('/api/service-requests', requireAdminAuth, requirePermission('serviceRequests'), async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const status = req.query.status as string;
        const servicePreference = req.query.servicePreference as string;

        let items = await serviceRequestRepo.getAllServiceRequests();
        if (status) items = items.filter(r => r.status === status);
        if (servicePreference) items = items.filter(r => r.servicePreference === servicePreference);

        // Derive tracking status for each item
        const enrichedItems = await Promise.all(items.map(async (item) => {
            let jobStatus = undefined;
            let jobTechnician = undefined;
            if ((item.status === 'Work Order' || item.status === 'Converted') && item.convertedJobId) {
                const jobTicket = await jobRepo.getJobTicket(item.convertedJobId);
                if (jobTicket) {
                    jobStatus = jobTicket.status;
                    jobTechnician = jobTicket.technician;
                }
            }
            return {
                ...item,
                trackingStatus: deriveTrackingStatus(
                    item.status,
                    (item.servicePreference || item.serviceMode || "service_center") as any,
                    jobStatus,
                    jobTechnician,
                    item.scheduledPickupDate || item.expectedPickupDate
                )
            };
        }));

        const result = {
            items: enrichedItems,
            total: enrichedItems.length,
            page: 1,
            limit: enrichedItems.length > 0 ? enrichedItems.length : 50,
            totalPages: 1
        };
        res.json(result);
    } catch (error) {
        logRouteError('ServiceRequests.List', req, error);
        res.status(500).json({ error: 'Failed to fetch service requests' });
    }
});

/**
 * GET /api/service-requests/:id - Get service request by ID
 * PROTECTED: Admin only (for * GET /api/service-requests/:id - Get service request by ID
 */
router.get('/api/service-requests/:id', requireAdminAuth, requirePermission('serviceRequests'), async (req: Request, res: Response) => {
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

        const enrichedRequest = {
            ...request,
            trackingStatus: deriveTrackingStatus(
                request.status,
                (request.servicePreference || request.serviceMode || "service_center") as any,
                jobStatus,
                jobTechnician,
                request.scheduledPickupDate || request.expectedPickupDate
            )
        };

        res.json(enrichedRequest);
    } catch (error: any) {
        logRouteError('ServiceRequests.Detail', req, error);
        res.status(500).json({ error: 'Failed to fetch service request', details: error.message });
    }
});

/**
 * POST /api/admin/service-requests/:id/mark-interacted - Mark a service request as interacted/reviewed
 */
router.post('/api/admin/service-requests/:id/mark-interacted', requireAdminAuth, async (req: Request, res: Response) => {
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
router.post('/api/admin/service-requests/sync-job/:jobId', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { jobId } = req.params;
        const jobTicket = await jobRepo.getJobTicket(jobId);
        if (!jobTicket) return res.status(404).json({ error: 'Job ticket not found' });

        const serviceRequest = await serviceRequestRepo.getServiceRequestByConvertedJobId(jobId);
        if (!serviceRequest) return res.status(404).json({ error: 'No Service Request is linked to this Job Ticket' });

        // Map Job Ticket Status to Service Request Tracking Status
        let trackingStatus = 'Technician Assigned';
        if (jobTicket.status === 'In Progress') trackingStatus = 'Repairing';
        if (jobTicket.status === 'Ready') trackingStatus = 'Ready for Collection';
        if (jobTicket.status === 'Completed') trackingStatus = 'Collected';

        const updatedRequest = await serviceRequestRepo.updateServiceRequest(serviceRequest.id, {
            trackingStatus
        });

        await serviceRequestRepo.createServiceRequestEvent({
            serviceRequestId: serviceRequest.id,
            status: trackingStatus,
            message: `Automatic Sync: Internal Job progressed to ${jobTicket.status}.`,
            actor: 'System Manager Sync'
        });

        res.json(updatedRequest);
    } catch (error: any) {
        logRouteError('ServiceRequests.SyncJob', req, error);
        res.status(500).json({ error: 'Failed to sync service request', details: error.message });
    }
});

/**
 * POST /api/service-requests - Create service request (rate limited - 10/hour)
 */
router.post('/api/service-requests', serviceRequestLimiter, async (req: Request, res: Response) => {
    try {
        const validated = insertServiceRequestSchema.parse(req.body);

        if (validated.mediaUrls) {
            const thirtyDaysFromNow = new Date();
            thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
            (validated as any).expiresAt = thirtyDaysFromNow;
        }

        let request = await serviceRequestRepo.createServiceRequest(validated);

        let trackingStatus = 'Request Received';
        if (validated.servicePreference === 'service_center') {
            trackingStatus = 'Awaiting Drop-off';
        } else if (validated.servicePreference === 'home_pickup') {
            trackingStatus = 'Arriving to Receive';
        }

        if (trackingStatus !== 'Request Received') {
            request = await serviceRequestRepo.updateServiceRequest(request.id, { trackingStatus }) || request;
        }

        let customerIdToLink = req.session?.customerId;

        if (!customerIdToLink && validated.phone) {
            let user = await userRepo.getUserByPhoneNormalized(validated.phone);

            if (!user) {
                // Auto-create a customer account if they don't exist
                const { nanoid } = await import('nanoid');
                user = await userRepo.createUser({
                    name: validated.customerName,
                    phone: validated.phone,
                    role: 'Customer',
                    status: 'Active',
                    password: await bcrypt.hash(nanoid(), 12),
                    address: validated.address || null,
                    permissions: '{}'
                });
            }

            customerIdToLink = user.id;
        }

        if (customerIdToLink) {
            await serviceRequestRepo.linkServiceRequestToCustomer(request.id, customerIdToLink);
            const linkedRequest = await serviceRequestRepo.getServiceRequest(request.id);
            if (linkedRequest) {
                request = linkedRequest;
            }
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

        res.status(201).json(request);
    } catch (error: any) {
        console.error('Service request validation error:', error.message);
        res.status(400).json({ error: 'Invalid service request data', details: error.message });
    }
});

/**
 * PATCH /api/service-requests/:id - Update service request
 * PROTECTED: Admin only
 */
router.patch('/api/service-requests/:id', requireAdminAuth, requirePermission('serviceRequests'), async (req: Request, res: Response) => {
    try {
        // Check if status is being changed to "Work Order" - auto-create job ticket
        if (req.body.status === 'Work Order' || req.body.status === 'Converted') {
            const originalRequest = await serviceRequestRepo.getServiceRequest(req.params.id);
            if (!originalRequest) {
                return res.status(404).json({ error: 'Service request not found' });
            }

            const originalStatus = originalRequest.status;
            const hasExistingWorkOrder = originalStatus === 'Work Order' || originalStatus === 'Converted' || !!originalRequest.convertedJobId;

            if (!hasExistingWorkOrder) {
                const jobId = await jobRepo.getNextJobNumber();

                const jobTicketData = {
                    id: jobId,
                    customer: originalRequest.customerName,
                    customerPhone: originalRequest.phone || null,
                    customerAddress: originalRequest.address || null,
                    device: `${originalRequest.brand}${originalRequest.modelNumber ? ` ${originalRequest.modelNumber}` : ''}`,
                    tvSerialNumber: null,
                    issue: originalRequest.primaryIssue,
                    status: 'Pending' as const,
                    priority: 'Medium' as const,
                    technician: 'Unassigned',
                    screenSize: originalRequest.screenSize || null,
                    notes: originalRequest.description || null,
                };

                const newJob = await jobRepo.createJobTicket(jobTicketData);
                req.body.convertedJobId = newJob.id;

                await serviceRequestRepo.createServiceRequestEvent({
                    serviceRequestId: req.params.id,
                    status: 'Work Order',
                    message: `Work order ${newJob.id} created. A technician can now be assigned.`,
                    actor: 'Admin',
                });

                publishJobTicketEvent({
                    action: 'created',
                    entityId: newJob.id,
                    invalidate: [...JOB_CREATE_REALTIME_TAGS],
                    permissions: ['jobs'],
                    payload: {
                        jobId: newJob.id,
                        ticketNumber: newJob.id,
                        status: newJob.status,
                    },
                    toast: {
                        level: 'success',
                        title: 'Job ticket created',
                        message: `Job ${newJob.id} was created from a service request.`,
                        sound: true,
                    },
                });
            }
        }

        // Convert date strings to Date objects
        const updateData = { ...req.body };
        if (updateData.trackingStatus) delete updateData.trackingStatus;
        if (updateData.scheduledPickupDate && typeof updateData.scheduledPickupDate === 'string') {
            updateData.scheduledPickupDate = new Date(updateData.scheduledPickupDate);
        }

        const request = await serviceRequestRepo.updateServiceRequest(req.params.id, updateData);
        if (!request) {
            return res.status(404).json({ error: 'Service request not found' });
        }

        // Notify customer if they have a linked account
        if (request.customerId && (req.body.trackingStatus || req.body.paymentStatus || req.body.status)) {
            notifyCustomerUpdate(request.customerId, {
                type: 'order_update',
                orderId: request.id,
                ticketNumber: request.ticketNumber,
                trackingStatus: request.trackingStatus,
                paymentStatus: request.paymentStatus,
                status: request.status,
                convertedJobId: request.convertedJobId,
                updatedAt: new Date().toISOString()
            });

            const notificationTitle = req.body.trackingStatus
                ? `Update: ${req.body.trackingStatus}`
                : req.body.status
                    ? `Status: ${req.body.status}`
                    : 'Service Request Updated';

            const notificationMessage = req.body.trackingStatus
                ? `Your service request #${request.ticketNumber} is now ${req.body.trackingStatus}`
                : `Your service request #${request.ticketNumber} has been updated.`;

            const notification = await notificationRepo.createNotification({
                userId: request.customerId,
                title: notificationTitle,
                message: notificationMessage,
                type: 'repair',
                link: `/native/bookings`,
            });

            notifyCustomerUpdate(request.customerId, {
                type: 'notification',
                data: notification
            });
        }

        publishServiceRequestEvent({
            action: req.body.trackingStatus || req.body.status ? 'status_changed' : 'updated',
            entityId: request.id,
            invalidate: [...SERVICE_REQUEST_REALTIME_TAGS],
            permissions: ['serviceRequests'],
            payload: {
                serviceRequestId: request.id,
                ticketNumber: request.ticketNumber || request.id,
                status: request.status || request.trackingStatus || undefined,
            },
        });

        res.json(request);
    } catch (error) {
        console.error('Failed to update service request:', error);
        res.status(500).json({ error: 'Failed to update service request' });
    }
});

/**
 * DELETE /api/service-requests/:id - Delete service request
 * PROTECTED: Admin only
 */
router.delete('/api/service-requests/:id', requireAdminAuth, requirePermission('serviceRequests'), async (req: Request, res: Response) => {
    try {
        const requestId = req.params.id;
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
router.get('/api/admin/service-requests/:id/next-stages', requireAdminAuth, requirePermission('serviceRequests'), async (req: Request, res: Response) => {
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
        console.error('Failed to get next stages:', error);
        res.status(500).json({ error: error.message || 'Failed to get next stages' });
    }
});

/**
 * POST /api/admin/service-requests/:id/transition-stage - Transition to new stage
 */
router.post('/api/admin/service-requests/:id/transition-stage', requireAdminAuth, requirePermission('serviceRequests'), async (req: Request, res: Response) => {
    try {
        const { stage, actorName } = req.body;
        if (!stage) {
            return res.status(400).json({ error: 'Stage is required' });
        }

        const adminUser = await userRepo.getUser(req.session.adminUserId!);
        const actor = actorName || adminUser?.name || 'Admin';

        // Get existing service request for audit trail
        const existingRequest = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!existingRequest) {
            return res.status(404).json({ error: 'Service request not found' });
        }

        const result = await jobService.transitionStage(req.params.id, stage, actor);

        // Audit Log
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

        res.json(result);
    } catch (error: any) {
        console.error('Failed to transition stage:', error);
        res.status(400).json({ error: error.message || 'Failed to transition stage' });
    }

});

/**
 * POST /api/admin/service-requests/:id/verify-and-convert - Verify & Convert to Job Ticket
 * Requires: service request access plus create access to spawn a job
 */
router.post(
    '/api/admin/service-requests/:id/verify-and-convert',
    requireAdminAuth,
    requirePermission('serviceRequests'),
    requirePermission('jobs'),
    requirePermission('canCreate'),
    async (req: Request, res: Response) => {
        try {
            const { verificationNotes, priority } = req.body;

            // Use user ID to get name, or fallback to Admin
            const user = await userRepo.getUser(req.session?.adminUserId!);
            const actorName = user?.name || 'Manager';

            // Get existing service request for audit trail
            const existingRequest = await serviceRequestRepo.getServiceRequest(req.params.id);
            if (!existingRequest) {
                return res.status(404).json({ error: 'Service request not found' });
            }

            const result = await jobService.verifyAndConvertServiceRequest(
                req.params.id,
                actorName,
                verificationNotes,
                priority
            );

            // Audit Log for Service Request conversion
            await auditLogger.log({
                userId: req.session?.adminUserId!,
                action: 'VERIFY_AND_CONVERT_SERVICE_REQUEST',
                entity: 'ServiceRequest',
                entityId: req.params.id,
                details: `Service request verified and converted to Job Ticket ${result.jobTicket.id} by ${actorName}. Priority: ${priority}. ${verificationNotes ? `Notes: ${verificationNotes}` : ''}`,
                oldValue: {
                    status: existingRequest.status,
                    stage: existingRequest.stage,
                    convertedJobId: existingRequest.convertedJobId
                },
                newValue: {
                    status: result.serviceRequest.status,
                    stage: result.serviceRequest.stage,
                    convertedJobId: result.serviceRequest.convertedJobId
                },
                req: req
            });

            // Audit Log for Job Ticket creation
            await auditLogger.log({
                userId: req.session?.adminUserId!,
                action: 'CREATE_JOB_FROM_SERVICE_REQUEST',
                entity: 'JobTicket',
                entityId: result.jobTicket.id,
                details: `Job ticket created from Service Request ${req.params.id} by ${actorName}`,
                newValue: result.jobTicket,
                req: req
            });

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

            // Notify technician if auto-assigned (future enhancement)

            res.json(result);
        } catch (error: any) {
            console.error('Failed to verify and convert:', error);
            res.status(400).json({ error: error.message || 'Failed to verify and convert request' });
        }
    });

/**
 * PUT /api/admin/service-requests/:id/expected-dates - Update expected dates
 */
router.put('/api/admin/service-requests/:id/expected-dates', requireAdminAuth, requirePermission('serviceRequests'), async (req: Request, res: Response) => {
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
 */
router.post('/api/admin/service-requests/:id/action', requireAdminAuth, requirePermission('serviceRequests'), async (req: Request, res: Response) => {
    try {
        const { actionId } = req.body;
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
        }

        res.json(updatedRequest);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Action failed' });
    }
});

/**
 * POST /api/admin/service-requests/:id/adjust-progress - Rollback/adjust workflow progress
 */
router.post('/api/admin/service-requests/:id/adjust-progress', requireAdminAuth, requirePermission('serviceRequests'), async (req: Request, res: Response) => {
    try {
        const { targetStatus, reason } = req.body;
        const request = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!request) return res.status(404).json({ error: 'Service request not found' });

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
 */
router.post('/api/admin/service-requests/:id/send-quote', requireAdminAuth, requirePermission('serviceRequests'), async (req: Request, res: Response) => {
    try {
        const { quoteAmount, quoteNotes, quoteValidDays } = req.body;

        if (!quoteAmount || isNaN(Number(quoteAmount))) {
            return res.status(400).json({ error: 'Valid quote amount is required' });
        }

        const request = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!request) return res.status(404).json({ error: 'Service request not found' });

        if (request.requestIntent !== 'quote') {
            return res.status(400).json({ error: 'Cannot send quote for a non-quote service request.' });
        }

        const validDays = Number(quoteValidDays) || 7;
        const validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + validDays);

        const updatedRequest = await serviceRequestRepo.updateServiceRequest(req.params.id, {
            status: 'Quote Sent',
            quoteAmount: Number(quoteAmount),
            quoteNotes: quoteNotes || null,
            quoteExpiresAt: validUntil,
        });

        if (updatedRequest) {
            await serviceRequestRepo.createServiceRequestEvent({
                serviceRequestId: req.params.id,
                status: 'Quote Sent',
                message: `Quote sent for ৳${quoteAmount}. Notes: ${quoteNotes || 'None'}`,
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
        }

        res.json(updatedRequest);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to send quote' });
    }
});

/**
 * PATCH /api/service-requests/:id/quote-response - Customer responds to quote
 */
router.patch('/api/service-requests/:id/quote-response', async (req: Request, res: Response) => {
    try {
        const { response } = req.body; // 'accepted' or 'rejected'

        if (response !== 'accepted' && response !== 'rejected') {
            return res.status(400).json({ error: 'Invalid response. Must be accepted or rejected.' });
        }

        const request = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!request) return res.status(404).json({ error: 'Service request not found' });

        // Verify user owns this request (or is admin)
        const isOwner = req.session?.customerId && req.session.customerId === request.customerId;
        const isAdmin = !!req.session?.adminUserId;

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ error: 'Unauthorized to respond to this quote.' });
        }

        // Ensure request is in Quote Sent status
        if (request.status !== 'Quote Sent') {
            return res.status(400).json({ error: 'This request is not awaiting a quote response.' });
        }

        const newStatus = response === 'accepted' ? 'Quote Accepted' : 'Quote Rejected';

        const updatedRequest = await serviceRequestRepo.updateServiceRequest(req.params.id, {
            status: newStatus,
        });

        if (updatedRequest) {
            await serviceRequestRepo.createServiceRequestEvent({
                serviceRequestId: req.params.id,
                status: newStatus,
                message: `Quote was ${response} by customer.`,
                actor: isAdmin ? 'Admin' : 'Customer',
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

            // Notify admins
            if (!isAdmin) {
                // ... (Admin notification logic could go here)
            }
        }

        res.json(updatedRequest);
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Failed to process quote response' });
    }
});

export default router;
