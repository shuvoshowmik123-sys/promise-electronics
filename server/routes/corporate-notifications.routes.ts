/**
 * Corporate Notifications Routes
 * 
 * Handles corporate-specific notifications for corporate portal users.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { userRepo, customerRepo, orderRepo, corporateRepo, notificationRepo } from '../repositories/index.js';
import { requireAdminAuth, requireCorporateAuth } from './middleware/auth.js';
import { corporateNotificationService } from '../services/corporate-notification.service.js';
import { addCorporateSSEClient, removeCorporateSSEClient } from './middleware/sse-broker.js';

const router = Router();


// ============================================
// Corporate Notifications API
// ============================================

/**
 * GET /api/corporate/notifications - Get corporate user notifications
 */
router.get('/notifications', requireCorporateAuth, async (req: Request, res: Response) => {
    try {
        const corporateUserId = req.session.corporateUserId;
        if (!corporateUserId) {
            return res.status(403).json({ error: 'Not authorized for corporate notifications' });
        }

        const user = await userRepo.getUser(corporateUserId);
        if (!user || !user.corporateClientId) {
            return res.status(403).json({ error: 'Invalid corporate session' });
        }

        const notifications = await corporateNotificationService.getCorporateNotifications(user.corporateClientId);
        res.json(notifications);
    } catch (error) {
        console.error('Get corporate notifications error:', error);
        res.status(500).json({ error: 'Failed to fetch corporate notifications' });
    }
});

/**
 * GET /api/corporate/notifications/unread-count - Get unread notification count
 */
router.get('/notifications/unread-count', requireCorporateAuth, async (req: Request, res: Response) => {
    try {
        const corporateUserId = req.session.corporateUserId;
        if (!corporateUserId) {
            return res.status(403).json({ error: 'Not authorized for corporate notifications' });
        }

        const user = await userRepo.getUser(corporateUserId);
        if (!user || !user.corporateClientId) {
            return res.status(403).json({ error: 'Invalid corporate session' });
        }

        const unreadCount = await corporateNotificationService.getCorporateUnreadCount(user.corporateClientId);
        res.json({ count: unreadCount });
    } catch (error) {
        console.error('Get corporate unread count error:', error);
        res.status(500).json({ error: 'Failed to fetch unread count' });
    }
});

/**
 * PATCH /api/corporate/notifications/:id/read - Mark corporate notification as read
 */
router.patch('/notifications/:id/read', requireCorporateAuth, async (req: Request, res: Response) => {
    try {
        const corporateUserId = req.session.corporateUserId;
        if (!corporateUserId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const user = await userRepo.getUser(corporateUserId);
        if (!user || !user.corporateClientId) {
            return res.status(403).json({ error: 'Invalid corporate session' });
        }

        const updated = await storage.markCorporateNotificationAsRead(req.params.id, user.corporateClientId);
        if (!updated) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        res.json(updated);
    } catch (error) {
        console.error('Mark corporate notification read error:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

/**
 * POST /api/corporate/notifications/mark-all-read - Mark all corporate notifications as read
 */
router.post('/notifications/mark-all-read', requireCorporateAuth, async (req: Request, res: Response) => {
    try {
        const corporateUserId = req.session.corporateUserId;
        if (!corporateUserId) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const user = await userRepo.getUser(corporateUserId);
        if (!user || !user.corporateClientId) {
            return res.status(403).json({ error: 'Invalid corporate session' });
        }

        const result = await corporateNotificationService.markAllCorporateNotificationsAsRead(user.corporateClientId);
        res.json(result);
    } catch (error) {
        console.error('Mark all corporate notifications read error:', error);
        res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
});

/**
 * POST /api/corporate/notifications/job-completed - Create job completion notification (admin use)
 */
router.post('/notifications/job-completed', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { corporateClientId, jobId, device, message, link } = req.body;

        if (!corporateClientId || !jobId || !device) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const job = await storage.getJobTicket(jobId);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        if (job.corporateClientId !== corporateClientId) {
            return res.status(400).json({ error: 'Job does not belong to provided corporate client' });
        }

        const result = await corporateNotificationService.createCorporateJobNotification({
            corporateClientId,
            jobId,
            device,
            newStatus: 'completed',
            message,
            link
        });

        res.json({ success: true, result });
    } catch (error) {
        console.error('Create job completion notification error:', error);
        res.status(500).json({ error: 'Failed to create job completion notification' });
    }
});

/**
 * POST /api/corporate/notifications/job-status-update - Create job status update notification (admin use)
 */
router.post('/notifications/job-status-update', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { corporateClientId, jobId, device, oldStatus, newStatus, link } = req.body;

        if (!corporateClientId || !jobId || !device || !newStatus) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const job = await storage.getJobTicket(jobId);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        if (job.corporateClientId !== corporateClientId) {
            return res.status(400).json({ error: 'Job does not belong to provided corporate client' });
        }

        const result = await corporateNotificationService.createJobStatusUpdateNotification({
            corporateClientId,
            jobId,
            device,
            oldStatus: oldStatus || 'Unknown',
            newStatus,
            link
        });

        res.json({ success: true, result });
    } catch (error) {
        console.error('Create job status update notification error:', error);
        res.status(500).json({ error: 'Failed to create job status update notification' });
    }
});

/**
 * GET /api/corporate/notifications/types - Get notification types and templates
 */
router.get('/notifications/types', requireCorporateAuth, async (req: Request, res: Response) => {
    try {
        const notificationTypes = {
            job_completed: {
                title: "Job Completed: {{jobId}}",
                message: "{{device}} repair has been completed and passed quality control.",
                type: "repair"
            },
            job_status_updated: {
                title: "Job Status Updated: {{jobId}}",
                message: "{{device}} status changed from {{oldStatus}} to {{newStatus}}.",
                type: "info"
            },
            service_request_updated: {
                title: "Service Request Updated: {{requestId}}",
                message: "Service request status changed to {{status}}.",
                type: "info"
            },
            admin_message: {
                title: "Message from Admin",
                message: "{{adminName}}: {{message}}",
                type: "info"
            },
            system_alert: {
                title: "System Alert",
                message: "{{message}}",
                type: "warning"
            }
        };

        res.json(notificationTypes);
    } catch (error) {
        console.error('Get notification types error:', error);
        res.status(500).json({ error: 'Failed to fetch notification types' });
    }
});

/**
 * GET /api/corporate/notifications/stream - SSE stream for real-time notifications
 */
router.get('/notifications/stream', requireCorporateAuth, async (req: Request, res: Response) => {
    try {
        const corporateUserId = req.session.corporateUserId;
        if (!corporateUserId) {
            return res.status(403).json({ error: 'Not authorized for corporate notifications' });
        }

        const user = await userRepo.getUser(corporateUserId);
        if (!user || !user.corporateClientId) {
            return res.status(403).json({ error: 'Invalid corporate session' });
        }

        const corporateClientId = user.corporateClientId;

        // Set headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

        // Send initial connection success message
        res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

        // Register this connection
        addCorporateSSEClient(corporateClientId, res);
        console.log(`[CorporateSSE] Client connected: ${corporateClientId}`);

        // Send heartbeat every 30 seconds to keep connection alive
        const heartbeatInterval = setInterval(() => {
            try {
                res.write(`:heartbeat ${new Date().toISOString()}\n\n`);
            } catch (e) {
                // Connection closed, cleanup will happen in 'close' event
                clearInterval(heartbeatInterval);
            }
        }, 30000);

        // Clean up on client disconnect
        req.on('close', () => {
            clearInterval(heartbeatInterval);
            removeCorporateSSEClient(corporateClientId, res);
            console.log(`[CorporateSSE] Client disconnected: ${corporateClientId}`);
        });

    } catch (error) {
        console.error('[CorporateSSE] Stream setup error:', error);
        res.status(500).json({ error: 'Failed to setup notification stream' });
    }
});

export default router;
