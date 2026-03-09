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
import { requireAdminAuth, requirePermission } from './middleware/auth.js';
import { pushService } from '../pushService.js';
import { jobService } from '../services/job.service.js';
import { publishAdminNotificationEvent, publishJobTicketEvent } from '../services/admin-realtime.service.js';

const router = Router();
const JOB_REALTIME_TAGS = ["jobTickets", "jobOverview", "dashboardStats"] as const;
const JOB_CREATE_REALTIME_TAGS = [...JOB_REALTIME_TAGS, "adminNotifications", "adminNotificationCount"] as const;
const ROLLBACK_REALTIME_TAGS = ["pendingRollbacks", "adminNotifications", "adminNotificationCount"] as const;

// ============================================
// Job Tickets API
// ============================================

/**
 * GET /api/job-tickets/list - Lightweight list for tables (no heavy logs)
 */
router.get('/api/job-tickets/list', async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const page = parseInt(req.query.page as string) || 1;

        // This will be implemented in storage.ts next
        const result = await jobRepo.getJobTicketsList(page, limit);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch job list' });
    }
});

/**
 * GET /api/job-tickets - Get all job tickets
 */
router.get('/api/job-tickets', async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const type = (req.query.type as 'all' | 'walk-in' | 'corporate') || 'all';

        // Access Control: Filter jobs for Technicians
        const userId = req.session?.adminUserId;
        if (userId) {
            const user = await userRepo.getUser(userId);
            if (user && user.role === 'Technician') {
                const myJobs = await jobRepo.getJobTicketsByTechnician(user.name);
                return res.json({
                    items: myJobs,
                    pagination: {
                        total: myJobs.length,
                        page: 1,
                        limit: myJobs.length,
                        pages: 1
                    }
                });
            }
        }

        // Managers/Admins view all
        const result = await jobRepo.getAllJobTickets();
        // Mock pagination to prevent frontend break
        res.json({
            items: result,
            pagination: {
                total: result.length,
                page,
                limit,
                pages: Math.ceil(result.length / limit) || 1
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch job tickets' });
    }
});

/**
 * GET /api/job-tickets/next-number - Get next auto-generated job number
 */
router.get('/api/job-tickets/next-number', async (req: Request, res: Response) => {
    try {
        const nextNumber = await jobRepo.getNextJobNumber();
        res.json({ nextNumber });
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate job number' });
    }
});

/**
 * GET /api/job-tickets/ready-for-billing - Get jobs ready for billing
 */
router.get('/api/job-tickets/ready-for-billing', async (req: Request, res: Response) => {
    try {
        const allJobs = await jobRepo.getAllJobTickets();
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
router.get('/api/job-tickets/:id', async (req: Request, res: Response) => {
    try {
        const job = await jobRepo.getJobTicket(req.params.id);
        if (!job) {
            return res.status(404).json({ error: 'Job ticket not found' });
        }
        res.json(job);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch job ticket' });
    }
});

/**
 * GET /api/job-tickets/:id/history - Get job audit history
 */
router.get('/api/job-tickets/:id/history', requireAdminAuth, requirePermission('jobs'), async (req: Request, res: Response) => {
    try {
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
 */
router.post('/api/job-tickets', requireAdminAuth, requirePermission('jobs'), async (req: Request, res: Response) => {
    try {
        // Auto-generate job ID if not provided
        let jobData = { ...req.body };
        if (!jobData.id) {
            jobData.id = await jobRepo.getNextJobNumber();
        }

        // Convert deadline string to Date if present
        if (jobData.deadline && typeof jobData.deadline === 'string') {
            jobData.deadline = new Date(jobData.deadline);
        }

        const validated = insertJobTicketSchema.parse(jobData);
        const job = await jobRepo.createJobTicket(validated);

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

        res.status(201).json(job);
    } catch (error: any) {
        console.error('Job ticket validation error:', error.message);
        res.status(400).json({ error: 'Invalid job ticket data', details: error.message });
    }
});

/**
 * POST /api/job-tickets/:id/advance-status - Enforces strict linear progression
 */
router.post('/api/job-tickets/:id/advance-status', requireAdminAuth, requirePermission('jobs'), async (req: Request, res: Response) => {
    try {
        const jobId = req.params.id;
        const job = await jobRepo.getJobTicket(jobId);
        if (!job) return res.status(404).json({ error: 'Job ticket not found' });

        const currentStatus = job.status;

        // Linear Progression State Machine Map
        const stateMachine: Record<string, string> = {
            'Pending': 'In Progress',
            'In Progress': 'Ready',
            'Ready': 'Completed',
        };
        // Handle alternate/legacy states mapping nicely
        stateMachine['Diagnosing'] = 'In Progress';
        stateMachine['Pending Parts'] = 'In Progress';
        stateMachine['Waiting on Parts'] = 'In Progress';

        const nextStatus = stateMachine[currentStatus];

        if (!nextStatus) {
            return res.status(400).json({ error: `Cannot mathematically advance from terminal status: ${currentStatus}` });
        }

        const updatedJob = await jobRepo.updateJobTicket(jobId, { status: nextStatus });
        if (!updatedJob) {
            return res.status(500).json({ error: 'Failed to update job status' });
        }

        // Audit Tracking
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

        // Smart Sync SSE prompt for staff — includes job info for SmartSyncPrompt component
        notifyAdminUpdate({
            type: 'smart_sync_needed',
            jobId: updatedJob?.id,
            jobDisplayId: updatedJob?.id?.slice(-6).toUpperCase(),
            device: updatedJob?.device,
            newStatus: nextStatus,
            customerId: (updatedJob as any)?.customerId,
        });

        // Phase O — Auto-trigger: notify customer when job becomes Ready (checks setting)
        if (nextStatus === 'Ready') {
            try {
                const settings = await settingsRepo.getAllSettings();
                const triggerEnabled = settings.find?.((s: any) => s.key === 'trigger_notify_ready');
                if (!triggerEnabled || triggerEnabled.value === 'true') {
                    const customerId = (updatedJob as any)?.customerId;
                    if (customerId) {
                        await notificationRepo.createNotification({
                            userId: customerId,
                            title: '🎉 Your device is ready!',
                            message: `${(updatedJob as any)?.device || 'Your device'} is ready for pickup. Job #${updatedJob?.id?.slice(-6)?.toUpperCase() || updatedJob?.id}`,
                            type: 'job_ready',
                            jobId: updatedJob?.id,
                        } as any);
                    }
                }
            } catch (notifyErr) {
                console.error('[AutoTrigger] Failed to notify customer:', notifyErr);
            }
        }

        // AUTO-SYNC: Propagate job status to linked service request
        try {
            const linkedSR = await serviceRequestRepo.getServiceRequestByConvertedJobId(jobId);
            if (linkedSR) {
                const isPickup = linkedSR.servicePreference === 'pickup' || linkedSR.servicePreference === 'home_pickup';
                const statusToTrackingMap: Record<string, string> = {
                    'Diagnosing': 'Diagnosis Complete',
                    'Pending Parts': 'Awaiting Parts',
                    'In Progress': 'Repairing',
                    'On Workbench': 'Repairing',
                    'Ready': isPickup ? 'Ready for Return' : 'Ready for Collection',
                    'Completed': isPickup ? 'Delivered' : 'Collected',
                    'Cancelled': 'Cancelled',
                };
                const newTrackingStatus = statusToTrackingMap[nextStatus];

                if (newTrackingStatus) {
                    await serviceRequestRepo.updateServiceRequest(linkedSR.id, { trackingStatus: newTrackingStatus });
                    await serviceRequestRepo.createServiceRequestEvent({
                        serviceRequestId: linkedSR.id,
                        status: newTrackingStatus,
                        message: `Auto-synced from Job ${updatedJob?.id?.slice(-6)?.toUpperCase() || jobId}: status → ${nextStatus}`,
                        actor: 'System Auto-Sync'
                    });
                    // Notify customer real-time
                    if (linkedSR.customerId) {
                        notifyCustomerUpdate(linkedSR.customerId, {
                            type: 'order_update',
                            orderId: linkedSR.id,
                            trackingStatus: newTrackingStatus,
                            updatedAt: new Date().toISOString()
                        });
                    }
                }
            }
        } catch (syncErr) {
            console.error('[AutoSync] Failed to sync SR from advance-status:', syncErr);
        }

        res.json(updatedJob);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to advance job status', details: error.message });
    }
});

/**
 * POST /api/job-tickets/bulk-update - Mass update jobs
 */
router.post('/api/job-tickets/bulk-update', requireAdminAuth, requirePermission('jobs'), async (req: Request, res: Response) => {
    try {
        const { jobIds, updates } = req.body;
        if (!Array.isArray(jobIds) || jobIds.length === 0) {
            return res.status(400).json({ error: 'Array of jobIds is required' });
        }

        const results = await Promise.all(jobIds.map(async (id) => {
            const job = await jobRepo.getJobTicket(id);
            if (!job) return null;

            const updatedJob = await jobRepo.updateJobTicket(id, updates);

            await auditLogger.log({
                userId: req.session?.adminUserId || 'system',
                action: 'BULK_UPDATE_JOB',
                entity: 'JobTicket',
                entityId: id,
                details: `Bulk updated fields: ${Object.keys(updates).join(', ')}`,
                newValue: updates,
                req: req
            });

            // AUTO-SYNC for bulk updates with status change
            if (updates.status && updatedJob) {
                try {
                    const linkedSR = await serviceRequestRepo.getServiceRequestByConvertedJobId(id);
                    if (linkedSR) {
                        const isPickup = linkedSR.servicePreference === 'pickup' || linkedSR.servicePreference === 'home_pickup';
                        const statusToTrackingMap: Record<string, string> = {
                            'Diagnosing': 'Diagnosis Complete',
                            'Pending Parts': 'Awaiting Parts',
                            'In Progress': 'Repairing',
                            'On Workbench': 'Repairing',
                            'Ready': isPickup ? 'Ready for Return' : 'Ready for Collection',
                            'Completed': isPickup ? 'Delivered' : 'Collected',
                            'Cancelled': 'Cancelled',
                        };
                        const newTracking = statusToTrackingMap[updates.status];
                        if (newTracking) {
                            await serviceRequestRepo.updateServiceRequest(linkedSR.id, { trackingStatus: newTracking });
                        }
                    }
                } catch (syncErr) {
                    console.error('[AutoSync] Failed to sync SR from bulk-update:', syncErr);
                }
            }

            return updatedJob;
        }));

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
        res.status(500).json({ error: 'Failed to perform bulk update', details: error.message });
    }
});

/**
 * POST /api/job-tickets/:id/request-rollback
 */
router.post('/api/job-tickets/:id/request-rollback', requireAdminAuth, requirePermission('jobs'), async (req: Request, res: Response) => {
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
            await jobRepo.updateJobTicket(rollback.jobTicketId, { status: rollback.targetStatus });

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
router.patch('/api/job-tickets/:id', requireAdminAuth, requirePermission('jobs'), async (req: Request, res: Response) => {
    try {
        let updateData = { ...req.body };

        // Resolve the actual DB ID — old records may have a trailing space
        const rawId = req.params.id.trim();
        const resolvedId = (await jobRepo.getJobTicket(rawId))
            ? rawId
            : (await jobRepo.getJobTicket(rawId + ' ') ? rawId + ' ' : rawId);

        // Defensive: never allow updating the primary key even if sent in payload
        delete updateData.id;

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
router.delete('/api/job-tickets/:id', requireAdminAuth, requirePermission('jobs'), async (req: Request, res: Response) => {
    try {
        const jobId = req.params.id;
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
 */
router.get('/api/job-tickets/track/:id', async (req: Request, res: Response) => {
    try {
        const job = await jobRepo.getJobTicket(req.params.id);
        if (!job) {
            return res.status(404).json({ error: 'Job ticket not found' });
        }

        // Return limited public info for security
        res.json({
            id: job.id,
            device: job.device,
            screenSize: job.screenSize,
            status: job.status,
            createdAt: job.createdAt,
            completedAt: job.completedAt,
            estimatedCost: job.estimatedCost,
            deadline: job.deadline,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch job tracking info' });
    }
});

/**
 * GET /api/public/quote/:token - Public endpoint to retrieve Quote Details
 */
router.get('/api/public/quote/:token', async (req: Request, res: Response) => {
    try {
        const job = await jobRepo.getJobTicket(req.params.token);
        if (!job) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        // Expose only required information for public quotes
        const jobData = job as any;
        res.json({
            id: job.id,
            device: job.device,
            status: job.status,
            createdAt: job.createdAt,
            estimatedCost: job.estimatedCost,
            tasks: jobData.tasks || [],
            parts: jobData.parts || []
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch quote details' });
    }
});

/**
 * POST /api/public/quote/:token/approve - Process 1-Click Quote Approval & Payment Simulation
 */
router.post('/api/public/quote/:token/approve', async (req: Request, res: Response) => {
    try {
        const job = await jobRepo.getJobTicket(req.params.token);
        if (!job) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        if (job.status === "Approved" || job.status === "In Progress" || job.status === "Completed") {
            return res.status(400).json({ error: 'Quote has already been approved' });
        }

        const updatedJob = await jobRepo.updateJobTicket(job.id, {
            status: "In Progress"
        });
        if (!updatedJob) {
            return res.status(500).json({ error: 'Failed to update quote status' });
        }

        // Record Audit Log for the public approval
        await auditLogger.log({
            action: 'UPDATE_JOB_STATUS_PUBLIC',
            entity: 'JOB_TICKET',
            entityId: job.id,
            details: `Customer approved quote and mock payment received for ৳${job.estimatedCost || '0'}. Status advanced to In Progress.`,
            userId: 'PUBLIC_CUSTOMER',
            req
        });

        publishJobTicketEvent({
            action: 'status_changed',
            entityId: updatedJob.id,
            invalidate: [...JOB_REALTIME_TAGS],
            permissions: ['jobs'],
            payload: {
                jobId: updatedJob.id,
                ticketNumber: updatedJob.id,
                status: updatedJob.status,
            },
        });

        // Look up the linked service request (if any)
        const linkedSR = await serviceRequestRepo.getServiceRequestByConvertedJobId(updatedJob.id);

        res.json({
            ...updatedJob,
            serviceRequestId: linkedSR?.id || null,
            jobId: updatedJob.id,
            trackingType: linkedSR ? "service" : "job",
        });
    } catch (error) {
        console.error('Failed to approve quote:', error);
        res.status(500).json({ error: 'Failed to process quote approval' });
    }
});

/**
 * POST /api/job-tickets/:id/record-payment - Verify and record payment (Called by POS)
 */
router.post('/api/job-tickets/:id/record-payment', requireAdminAuth, requirePermission('process_payment'), async (req: Request, res: Response) => {
    try {
        const jobId = req.params.id;
        const { paymentId, amount, method } = req.body;

        if (!paymentId || !amount || !method) {
            return res.status(400).json({ error: "Missing payment details" });
        }

        const job = await jobRepo.getJobTicket(jobId);
        if (!job) return res.status(404).json({ error: "Job not found" });

        // Update payment status via storage method
        const updatedJob = await jobService.recordJobPayment(jobId, { paymentId, amount, method });

        // Audit Log
        await auditLogger.log({
            userId: req.session?.adminUserId || 'system',
            action: 'RECORD_PAYMENT',
            entity: 'JobTicket',
            entityId: jobId,
            details: `Payment recorded: ${amount} via ${method}`,
            oldValue: { paymentStatus: job.paymentStatus, paidAmount: job.paidAmount },
            newValue: { paymentStatus: updatedJob.paymentStatus, paidAmount: updatedJob.paidAmount },
            req: req
        });

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

        res.json(updatedJob);
    } catch (error) {
        console.error('Payment record error:', error);
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
router.post('/api/job-tickets/:id/write-off', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const userId = req.session?.adminUserId;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const user = await userRepo.getUser(userId);
        const userRole = user?.role;
        if (userRole !== 'Manager' && userRole !== 'Super Admin') {
            return res.status(403).json({ error: "Unauthorized. Requires Manager or Super Admin role." });
        }

        const { reason } = req.body;
        if (!reason) return res.status(400).json({ error: "Reason is required for write-off" });

        const updatedJob = await jobRepo.updateJobTicket(req.params.id, {
            paymentStatus: 'written_off',
            writeOffReason: reason,
            writeOffBy: req.session?.adminUserId,
            writeOffAt: new Date(),
            status: 'Closed' // Close the job as well
        });

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
    } catch (error) {
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

export default router;
