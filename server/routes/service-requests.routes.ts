/**
 * Service Requests Routes
 * 
 * Handles service request CRUD, stage transitions, and timeline events.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { insertServiceRequestSchema } from '../../shared/schema.js';
import { requireAdminAuth } from './middleware/auth.js';
import { notifyAdminUpdate, notifyCustomerUpdate } from './middleware/sse-broker.js';

const router = Router();

// ============================================
// Public Service Requests API
// ============================================

/**
 * GET /api/service-requests - Get all service requests
 */
router.get('/api/service-requests', async (req: Request, res: Response) => {
    try {
        const requests = await storage.getAllServiceRequests();
        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch service requests' });
    }
});

/**
 * GET /api/service-requests/:id - Get service request by ID
 */
router.get('/api/service-requests/:id', async (req: Request, res: Response) => {
    try {
        const request = await storage.getServiceRequest(req.params.id);
        if (!request) {
            return res.status(404).json({ error: 'Service request not found' });
        }
        res.json(request);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch service request' });
    }
});

/**
 * POST /api/service-requests - Create service request
 */
router.post('/api/service-requests', async (req: Request, res: Response) => {
    try {
        const validated = insertServiceRequestSchema.parse(req.body);

        if (validated.mediaUrls) {
            const thirtyDaysFromNow = new Date();
            thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
            (validated as any).expiresAt = thirtyDaysFromNow;
        }

        let request = await storage.createServiceRequest(validated);

        let trackingStatus = 'Request Received';
        if (validated.servicePreference === 'service_center') {
            trackingStatus = 'Awaiting Drop-off';
        } else if (validated.servicePreference === 'home_pickup') {
            trackingStatus = 'Arriving to Receive';
        }

        if (trackingStatus !== 'Request Received') {
            request = await storage.updateServiceRequest(request.id, { trackingStatus }) || request;
        }

        let customerIdToLink = req.session?.customerId;

        if (!customerIdToLink && validated.phone) {
            const user = await storage.getUserByPhoneNormalized(validated.phone);
            if (user) {
                customerIdToLink = user.id;
            }
        }

        if (customerIdToLink) {
            await storage.linkServiceRequestToCustomer(request.id, customerIdToLink);
            const linkedRequest = await storage.getServiceRequest(request.id);
            if (linkedRequest) {
                request = linkedRequest;
            }
        }

        notifyAdminUpdate({
            type: 'service_request_created',
            data: request,
            createdAt: new Date().toISOString()
        });

        res.status(201).json(request);
    } catch (error: any) {
        console.error('Service request validation error:', error.message);
        res.status(400).json({ error: 'Invalid service request data', details: error.message });
    }
});

/**
 * PATCH /api/service-requests/:id - Update service request
 */
router.patch('/api/service-requests/:id', async (req: Request, res: Response) => {
    try {
        // Check if status is being changed to "Converted" - auto-create job ticket
        if (req.body.status === 'Converted') {
            const originalRequest = await storage.getServiceRequest(req.params.id);
            if (!originalRequest) {
                return res.status(404).json({ error: 'Service request not found' });
            }

            if (originalRequest.status !== 'Converted' && !originalRequest.convertedJobId) {
                const jobId = await storage.getNextJobNumber();

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

                const newJob = await storage.createJobTicket(jobTicketData);
                req.body.convertedJobId = newJob.id;

                await storage.createServiceRequestEvent({
                    serviceRequestId: req.params.id,
                    status: 'Technician Assigned',
                    message: `Converted to Job #${newJob.id}. A technician will be assigned soon.`,
                    actor: 'Admin',
                });

                notifyAdminUpdate({
                    type: 'job_ticket_created',
                    data: newJob,
                    createdAt: new Date().toISOString()
                });
            }
        }

        // Validate "Technician Assigned" tracking status
        if (req.body.trackingStatus === 'Technician Assigned') {
            const existingRequest = await storage.getServiceRequest(req.params.id);
            if (!existingRequest) {
                return res.status(404).json({ error: 'Service request not found' });
            }

            if (existingRequest.status !== 'Converted' && req.body.status !== 'Converted') {
                return res.status(400).json({
                    error: "Cannot set 'Technician Assigned' - request must be converted to a job first"
                });
            }

            const jobId = req.body.convertedJobId || existingRequest.convertedJobId;
            if (!jobId) {
                return res.status(400).json({
                    error: "Cannot set 'Technician Assigned' - no job ticket found for this request"
                });
            }

            const jobTicket = await storage.getJobTicket(jobId);
            if (!jobTicket) {
                return res.status(400).json({
                    error: "Cannot set 'Technician Assigned' - job ticket not found"
                });
            }

            if (!jobTicket.technician || jobTicket.technician === 'Unassigned') {
                return res.status(400).json({
                    error: "Cannot set 'Technician Assigned' - please assign a technician to the job first"
                });
            }
        }

        // Convert date strings to Date objects
        const updateData = { ...req.body };
        if (updateData.scheduledPickupDate && typeof updateData.scheduledPickupDate === 'string') {
            updateData.scheduledPickupDate = new Date(updateData.scheduledPickupDate);
        }

        const request = await storage.updateServiceRequest(req.params.id, updateData);
        if (!request) {
            return res.status(404).json({ error: 'Service request not found' });
        }

        // Create timeline event when tracking status changes
        if (req.body.trackingStatus) {
            const statusMessages: Record<string, string> = {
                'Request Received': 'Your request is being reviewed by our team.',
                'Arriving to Receive': 'Our team is on the way to collect your TV.',
                'Awaiting Drop-off': 'Please bring your TV to our service center.',
                'Received': 'Your TV has been received at our service center.',
                'Technician Assigned': 'A technician has been assigned to your repair.',
                'Diagnosis Completed': "The issue has been diagnosed. We'll contact you with details.",
                'Parts Pending': 'Waiting for replacement parts to arrive.',
                'Repairing': 'Repair work is in progress.',
                'Ready for Delivery': 'Your device is ready for pickup/delivery!',
                'Delivered': 'Your device has been delivered. Thank you!',
                'Cancelled': 'This request has been cancelled.',
            };

            await storage.createServiceRequestEvent({
                serviceRequestId: req.params.id,
                status: req.body.trackingStatus,
                message: statusMessages[req.body.trackingStatus] || `Status updated to ${req.body.trackingStatus}`,
                actor: 'Admin',
            });
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

            const notification = await storage.createNotification({
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

        notifyAdminUpdate({
            type: 'service_request_updated',
            data: request,
            updatedAt: new Date().toISOString()
        });

        res.json(request);
    } catch (error) {
        console.error('Failed to update service request:', error);
        res.status(500).json({ error: 'Failed to update service request' });
    }
});

/**
 * DELETE /api/service-requests/:id - Delete service request
 */
router.delete('/api/service-requests/:id', async (req: Request, res: Response) => {
    try {
        const requestId = req.params.id;
        const success = await storage.deleteServiceRequest(requestId);
        if (!success) {
            return res.status(404).json({ error: 'Service request not found' });
        }

        notifyAdminUpdate({
            type: 'service_request_deleted',
            id: requestId,
            deletedAt: new Date().toISOString()
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
router.get('/api/admin/service-requests/:id/next-stages', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const stages = await storage.getNextValidStages(req.params.id);
        res.json({ stages });
    } catch (error: any) {
        console.error('Failed to get next stages:', error);
        res.status(500).json({ error: error.message || 'Failed to get next stages' });
    }
});

/**
 * POST /api/admin/service-requests/:id/transition-stage - Transition to new stage
 */
router.post('/api/admin/service-requests/:id/transition-stage', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { stage, actorName } = req.body;
        if (!stage) {
            return res.status(400).json({ error: 'Stage is required' });
        }

        const adminUser = await storage.getUser(req.session.adminUserId!);
        const actor = actorName || adminUser?.name || 'Admin';

        const result = await storage.transitionStage(req.params.id, stage, actor);

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

        notifyAdminUpdate({
            type: 'service_request_updated',
            data: result.serviceRequest,
            jobTicket: result.jobTicket,
            updatedAt: new Date().toISOString()
        });

        res.json(result);
    } catch (error: any) {
        console.error('Failed to transition stage:', error);
        res.status(400).json({ error: error.message || 'Failed to transition stage' });
    }
});

/**
 * PUT /api/admin/service-requests/:id/expected-dates - Update expected dates
 */
router.put('/api/admin/service-requests/:id/expected-dates', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { expectedPickupDate, expectedReturnDate, expectedReadyDate } = req.body;

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

        const request = await storage.updateServiceRequest(req.params.id, updates);
        if (!request) {
            return res.status(404).json({ error: 'Service request not found' });
        }

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

        notifyAdminUpdate({
            type: 'service_request_updated',
            data: request,
            updatedAt: new Date().toISOString()
        });

        res.json(request);
    } catch (error: any) {
        console.error('Failed to update expected dates:', error);
        res.status(500).json({ error: error.message || 'Failed to update expected dates' });
    }
});

export default router;
