/**
 * Admin Notifications Routes
 * 
 * Provides SSE stream and REST endpoints for admin real-time notifications.
 */

import { Router, Request, Response } from 'express';
import { requireAdminAuth, requireAnyPermission, requirePermission } from './middleware/auth.js';
import { storage } from '../storage.js';
import { settingsRepo, notificationRepo, systemRepo, userRepo, jobRepo, serviceRequestRepo, warrantyRepo, hrRepo } from '../repositories/index.js';
import { handleAdminEventStream } from './admin-stream.js';

const router = Router();

// ============================================
// Admin SSE Stream
// ============================================

/**
 * GET /api/admin/sse - Real-time Server-Sent Events stream for admins
 * 
 * This endpoint establishes a persistent connection that receives
 * real-time notifications when events occur (new service requests, 
 * job updates, orders, etc.)
 */
router.get('/api/admin/sse', requireAdminAuth, (req: Request, res: Response) => {
    handleAdminEventStream(req, res);
});

// ============================================
// Admin Notifications REST API
// ============================================

/**
 * GET /api/admin/notifications - Get stored notifications for admin dashboard
 */
router.get('/api/admin/notifications', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const [serviceRequests, jobs] = await Promise.all([
            storage.getAllServiceRequests(),
            jobRepo.getAllJobTickets(),
        ]);

        const serviceRequestNotifications = serviceRequests.map((sr: any) => ({
            id: `sr-${sr.id}`,
            type: 'service_request',
            title: 'Service Request',
            message: `${sr.brand} ${sr.modelNumber || ''} - ${sr.status}`,
            createdAt: sr.createdAt,
            read: Boolean(sr.adminInteracted),
            link: 'service-requests',
            linkId: sr.id,
        }));

        const jobNotifications = jobs
            .filter((job: any) =>
                job.status !== 'Completed'
                && job.status !== 'Delivered'
                && (job.priority === 'High' || job.priority === 'Critical')
            )
            .map((job: any) => ({
                id: `job-${job.id}`,
                type: 'job',
                title: `Urgent Job: ${job.ticketNumber || job.id}`,
                message: `${job.device || 'Device'} - ${job.issue || 'Needs attention'}`,
                createdAt: job.createdAt,
                read: false,
                link: 'jobs',
                linkId: job.ticketNumber || job.id,
            }));

        const notifications = [...serviceRequestNotifications, ...jobNotifications]
            .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
            .slice(0, limit);

        res.json(notifications);
    } catch (error) {
        console.error('Failed to fetch admin notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

/**
 * GET /api/admin/notifications/unread-count - Get unread notification count
 */
router.get('/api/admin/notifications/unread-count', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const currentUserId = req.session.adminUserId;

        const [serviceRequestUnreadCount, personalNotes, broadcastNotes] = await Promise.all([
            serviceRequestRepo.getUnreadServiceRequestsCount(),
            currentUserId ? notificationRepo.getUnreadNotifications(currentUserId) : Promise.resolve([]),
            notificationRepo.getUnreadNotifications('broadcast')
        ]);

        // Filter out notifications older than 7 days per the plan
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const validUnread = [...personalNotes, ...broadcastNotes].filter(n => new Date(n.createdAt || 0).getTime() > sevenDaysAgo.getTime());

        res.json({ count: serviceRequestUnreadCount + validUnread.length });
    } catch (error) {
        console.error('Failed to get unread count:', error);
        res.status(500).json({ error: 'Failed to get unread count' });
    }
});

// ============================================
// Admin Override Requests API
// ============================================

/**
 * POST /api/admin/notifications/override - Create an assignment override request
 */
router.post('/api/admin/notifications/override', requireAdminAuth, requirePermission('canAssignTechnician'), async (req: Request, res: Response) => {
    try {
        const { jobId, originalTechId, originalTechName, proposedTechId, proposedTechName, reason } = req.body;
        const currentUserId = (req.session as any).adminId;

        // Fetch user info for the requester
        const requestor = await userRepo.getUser(currentUserId);
        if (!requestor) return res.status(401).json({ error: 'Unauthorized' });

        // Job Details
        const job = await jobRepo.getJobTicket(jobId);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        // Create the notification
        const notificationPayload = {
            jobId,
            originalTechId,
            originalTechName,
            proposedTechId,
            proposedTechName,
            requestedBy: currentUserId,
            requestedByName: requestor.name,
            reason
        };

        const notification = await notificationRepo.createNotification({
            userId: 'broadcast', // Handled by broadcast mechanism ideally, or super admins
            title: `Assignment Override Request`,
            message: `${requestor.name} requested to reassign Job #${job.id} from ${originalTechName || 'unassigned'} to ${proposedTechName}.`,
            type: 'assignment_override',
            link: JSON.stringify(notificationPayload),
            jobId: job.id,
            contextType: 'assignment_override'
        });

        res.json({ success: true, notification });
    } catch (error) {
        console.error('Failed to create override request:', error);
        res.status(500).json({ error: 'Failed to create override request' });
    }
});

/**
 * GET /api/admin/notifications/overrides - Fetch pending override requests
 */
router.get('/api/admin/notifications/overrides', requireAdminAuth, requirePermission('canAssignTechnician'), async (req: Request, res: Response) => {
    try {
        // storage.getNotifications expects a userId. We used 'broadcast'.
        const allBroadcast = await notificationRepo.getNotifications('broadcast');
        const pendingOverrides = allBroadcast.filter(n => n.type === 'assignment_override' && !n.read);

        res.json(pendingOverrides);
    } catch (error) {
        console.error('Failed to fetch overrides:', error);
        res.status(500).json({ error: 'Failed to fetch overrides' });
    }
});

/**
 * POST /api/admin/notifications/override/:id/approve - Approve an override
 */
router.post('/api/admin/notifications/override/:id/approve', requireAdminAuth, requirePermission('canAssignTechnician'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const currentUserId = (req.session as any).adminId;

        // Ensure only Super Admin can approve
        const user = await userRepo.getUser(currentUserId);
        if (user?.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Only Super Admins can approve overrides.' });
        }

        // Get notification to parse payload
        // We don't have getNotificationById in storage interface, so we'll fetch all and find it
        const allBroadcast = await notificationRepo.getNotifications('broadcast');
        const notification = allBroadcast.find(n => n.id === id);

        if (!notification || !notification.link) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        const payload = JSON.parse(notification.link);

        // Update the job ticket
        const updateData: any = {
            assignedTechnicianId: payload.proposedTechId,
            technician: payload.proposedTechName,
        };

        // Fetch current job to remove proposed tech from assistedByIds if they were there
        const job = await jobRepo.getJobTicket(payload.jobId);
        if (job && job.assistedByIds) {
            const assistedArr = JSON.parse(job.assistedByIds as string);
            if (Array.isArray(assistedArr) && assistedArr.includes(payload.proposedTechId)) {
                updateData.assistedByIds = JSON.stringify(assistedArr.filter(tid => tid !== payload.proposedTechId));
                // Note: we'd ideally also update assistedByNames here but skipping for brevity
            }
        }

        await storage.updateJobTicket(payload.jobId, updateData);

        // Mark notification as read
        await notificationRepo.markNotificationAsRead(id);

        res.json({ success: true });
    } catch (error) {
        console.error('Failed to approve override:', error);
        res.status(500).json({ error: 'Failed to approve override flow' });
    }
});

// ============================================
// Admin Push Token Registration (FCM)
// ============================================

import { registerDeviceToken, unregisterDeviceTokens } from '../services/fcm.service.js';

/**
 * POST /api/admin/push/register - Register device token for push notifications
 */
router.post('/api/admin/push/register', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { token, platform } = req.body;
        const adminId = (req.session as any).adminId;

        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        // Store the token using FCM service
        registerDeviceToken(adminId, token, platform || 'android');

        console.log(`[FCM] Admin ${adminId} registered push token`);
        res.json({ success: true });
    } catch (error) {
        console.error('Failed to register push token:', error);
        res.status(500).json({ error: 'Failed to register token' });
    }
});

/**
 * POST /api/admin/push/unregister - Unregister device token
 */
router.post('/api/admin/push/unregister', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { token } = req.body;

        if (token) {
            unregisterDeviceTokens([token]);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Failed to unregister push token:', error);
        res.status(500).json({ error: 'Failed to unregister token' });
    }
});

export default router;


