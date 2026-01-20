/**
 * Admin Notifications Routes
 * 
 * Provides SSE stream and REST endpoints for admin real-time notifications.
 */

import { Router, Request, Response } from 'express';
import { requireAdminAuth } from './middleware/auth.js';
import { addAdminSSEClient, removeAdminSSEClient } from './middleware/sse-broker.js';
import { storage } from '../storage.js';

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
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Send initial connection success message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE connection established' })}\n\n`);

    // Register this admin client
    addAdminSSEClient(res);

    // Keep-alive ping every 30 seconds to prevent connection timeout
    const pingInterval = setInterval(() => {
        res.write(': ping\n\n');
    }, 30000);

    // Cleanup when connection closes
    req.on('close', () => {
        clearInterval(pingInterval);
        removeAdminSSEClient(res);
    });
});

// ============================================
// Admin Notifications REST API
// ============================================

/**
 * GET /api/admin/notifications - Get stored notifications for admin dashboard
 */
router.get('/api/admin/notifications', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        // For now, we'll return recent activity from service requests
        // In future, we can create a dedicated admin_notifications table
        const limit = parseInt(req.query.limit as string) || 50;

        const serviceRequests = await storage.getAllServiceRequests();

        // Transform to notification format
        const notifications = serviceRequests.slice(0, limit).map((sr: any) => ({
            id: `sr-${sr.id}`,
            type: 'service_request',
            title: 'Service Request',
            message: `${sr.brand} ${sr.modelNumber || ''} - ${sr.status}`,
            createdAt: sr.createdAt,
            read: false,
            link: `/service-requests/${sr.id}`
        }));

        // Sort by date descending
        notifications.sort((a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

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
        // For MVP, return count of recent items (last 24 hours)
        const [serviceRequests] = await Promise.all([
            storage.getAllServiceRequests()
        ]);

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentCount = serviceRequests.filter(sr =>
            new Date(sr.createdAt) > oneDayAgo
        ).length;

        res.json({ count: recentCount });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get unread count' });
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


