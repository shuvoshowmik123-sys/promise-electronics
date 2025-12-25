/**
 * Quotes Routes
 * 
 * Handles quote request workflows.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { insertQuoteRequestSchema } from '../../shared/schema.js';
import { requireAdminAuth } from './middleware/auth.js';
import { notifyAdminUpdate, notifyCustomerUpdate } from './middleware/sse-broker.js';

const router = Router();

// ============================================
// Quote Requests API
// ============================================

/**
 * POST /api/quotes - Submit quote request
 */
router.post('/api/quotes', async (req: Request, res: Response) => {
    try {
        const validated = insertQuoteRequestSchema.parse(req.body);

        const customerId = req.session?.customerId || null;

        const quoteRequest = await storage.createServiceRequest({
            ...validated,
            customerId,
            isQuote: true,
            quoteStatus: 'Pending',
            status: 'Pending',
            servicePreference: validated.servicePreference || null,
            requestIntent: validated.requestIntent || 'quote',
            serviceMode: validated.serviceMode || null,
        });

        notifyAdminUpdate({
            type: 'quote_request_created',
            data: quoteRequest,
            createdAt: new Date().toISOString()
        });

        res.status(201).json(quoteRequest);
    } catch (error: any) {
        console.error('Quote request error:', error);
        res.status(400).json({ error: 'Invalid quote request', details: error.message });
    }
});

/**
 * GET /api/admin/quotes - Get all quote requests (admin)
 */
router.get('/api/admin/quotes', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const quotes = await storage.getQuoteRequests();
        res.json(quotes);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch quotes' });
    }
});

/**
 * PATCH /api/admin/quotes/:id/price - Update quote with pricing (admin)
 */
router.patch('/api/admin/quotes/:id/price', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { quoteAmount, quoteNotes } = req.body;
        if (!quoteAmount) {
            return res.status(400).json({ error: 'Quote amount is required' });
        }

        const updated = await storage.updateQuote(req.params.id, quoteAmount, quoteNotes);
        if (!updated) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        if (updated.customerId) {
            notifyCustomerUpdate(updated.customerId, {
                type: 'quote_updated',
                data: updated,
                updatedAt: new Date().toISOString()
            });
        }

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update quote' });
    }
});

/**
 * POST /api/quotes/:id/accept - Accept quote (customer)
 */
router.post('/api/quotes/:id/accept', async (req: Request, res: Response) => {
    try {
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

        const updated = await storage.acceptQuote(
            req.params.id,
            actualPickupTier,
            address || '',
            servicePreference,
            parsedScheduledVisitDate
        );
        if (!updated) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        await storage.updateServiceRequest(req.params.id, { trackingStatus: trackingStatus as any });

        let eventMessage = servicePreference === 'home_pickup'
            ? 'Our team is on the way to collect your TV.'
            : 'Your service request has been queued. Please bring your TV to our service center.';

        if (servicePreference === 'service_center' && scheduledVisitDate) {
            const visitDate = new Date(scheduledVisitDate);
            eventMessage = `Your visit is scheduled for ${visitDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}. Please bring your TV to our service center.`;
        }

        await storage.createServiceRequestEvent({
            serviceRequestId: req.params.id,
            status: trackingStatus,
            message: eventMessage,
            actor: 'System',
        });

        notifyAdminUpdate({
            type: 'quote_accepted',
            data: { ...updated, servicePreference, trackingStatus, scheduledVisitDate },
            acceptedAt: new Date().toISOString()
        });

        res.json({ ...updated, servicePreference, trackingStatus, scheduledPickupDate: parsedScheduledVisitDate });
    } catch (error) {
        console.error('Error accepting quote:', error);
        res.status(500).json({ error: 'Failed to accept quote' });
    }
});

/**
 * POST /api/quotes/:id/decline - Decline quote (customer)
 */
router.post('/api/quotes/:id/decline', async (req: Request, res: Response) => {
    try {
        const updated = await storage.declineQuote(req.params.id);
        if (!updated) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        notifyAdminUpdate({
            type: 'quote_declined',
            data: updated,
            declinedAt: new Date().toISOString()
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to decline quote' });
    }
});

/**
 * POST /api/quotes/:id/convert - Convert quote to service request
 */
router.post('/api/quotes/:id/convert', async (req: Request, res: Response) => {
    try {
        const updated = await storage.convertQuoteToServiceRequest(req.params.id);
        if (!updated) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        notifyAdminUpdate({
            type: 'quote_converted',
            data: updated,
            convertedAt: new Date().toISOString()
        });

        res.json(updated);
    } catch (error) {
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

        const pickup = await storage.updatePickupSchedule(req.params.id, updates);
        if (!pickup) {
            return res.status(404).json({ error: 'Pickup schedule not found' });
        }

        notifyAdminUpdate({
            type: 'pickup_updated',
            data: pickup,
            updatedAt: new Date().toISOString()
        });

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
            await storage.updateServiceRequest(pickup.serviceRequestId, {
                trackingStatus: 'Delivered'
            } as any);
        }

        res.json(pickup);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update pickup status' });
    }
});

export default router;
