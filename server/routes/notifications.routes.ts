/**
 * Notifications Routes
 * 
 * Handles notifications, push tokens, and inquiries.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { insertInquirySchema } from '../../shared/schema.js';
import { requireCustomerAuth, requireAdminAuth } from './middleware/auth.js';

const router = Router();

// ============================================
// Push Notifications API
// ============================================

/**
 * POST /api/push/register - Register device token for push notifications
 */
router.post('/api/push/register', async (req: Request, res: Response) => {
    try {
        const { userId, token, platform } = req.body;

        if (!userId || !token) {
            return res.status(400).json({ error: 'userId and token are required' });
        }

        // Dynamic import of pushService
        const { pushService } = await import('../pushService.js');
        await pushService.registerDeviceToken(userId, token, platform);

        res.json({ success: true });
    } catch (error) {
        console.error('Push registration error:', error);
        res.status(500).json({ error: 'Failed to register push token' });
    }
});

// ============================================
// Inquiries API
// ============================================

/**
 * POST /api/inquiries - Submit inquiry
 */
router.post('/api/inquiries', async (req: Request, res: Response) => {
    try {
        const validated = insertInquirySchema.parse(req.body);
        const inquiry = await storage.createInquiry(validated);
        res.status(201).json(inquiry);
    } catch (error: any) {
        res.status(400).json({ error: 'Invalid inquiry data', details: error.message });
    }
});

/**
 * GET /api/inquiries - Get all inquiries (admin)
 */
router.get('/api/inquiries', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const inquiries = await storage.getAllInquiries();
        res.json(inquiries);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch inquiries' });
    }
});

/**
 * PATCH /api/inquiries/:id/status - Update inquiry status
 */
router.patch('/api/inquiries/:id/status', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { status, reply } = req.body;
        if (status && !['Pending', 'Read', 'Replied'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const updates: any = {};
        if (status) updates.status = status;
        if (reply) updates.reply = reply;

        const updated = await storage.updateInquiry(req.params.id, updates);
        if (!updated) {
            return res.status(404).json({ error: 'Inquiry not found' });
        }
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update inquiry status' });
    }
});

/**
 * GET /api/customer/inquiries - Get customer's inquiries
 */
router.get('/api/customer/inquiries', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const user = await storage.getUser(req.session.customerId!);
        if (!user || !user.phone) {
            return res.json([]);
        }
        const inquiries = await storage.getInquiriesByPhone(user.phone);
        res.json(inquiries);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch inquiries' });
    }
});

// ============================================
// Customer Notifications API
// ============================================

/**
 * GET /api/customer/notifications - Get customer's notifications
 */
router.get('/api/customer/notifications', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const notifications = await storage.getNotifications(req.session.customerId!);
        res.json(notifications);
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

/**
 * GET /api/customer/notifications/unread-count - Get unread notification count
 */
router.get('/api/customer/notifications/unread-count', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const notifications = await storage.getNotifications(req.session.customerId!);
        const unreadCount = notifications.filter(n => !n.read).length;
        res.json({ count: unreadCount });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({ error: 'Failed to fetch unread count' });
    }
});

/**
 * PATCH /api/customer/notifications/:id/read - Mark notification as read
 */
router.patch('/api/customer/notifications/:id/read', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const updated = await storage.markNotificationAsRead(req.params.id);
        if (!updated) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        res.json(updated);
    } catch (error) {
        console.error('Mark notification read error:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

/**
 * POST /api/customer/notifications/mark-all-read - Mark all notifications as read
 */
router.post('/api/customer/notifications/mark-all-read', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        await storage.markAllNotificationsAsRead(req.session.customerId!);
        res.json({ success: true });
    } catch (error) {
        console.error('Mark all notifications read error:', error);
        res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
});

export default router;
