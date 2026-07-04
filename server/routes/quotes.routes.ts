/**
 * Quotes Routes
 * 
 * Handles quote request workflows.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { settingsRepo, notificationRepo, systemRepo, userRepo, jobRepo, serviceRequestRepo, warrantyRepo, hrRepo } from '../repositories/index.js';
import { insertQuoteRequestSchema } from '../../shared/schema.js';
import { getCustomerId, requireAdminAuth, requireCustomerAuth, requireGranularPermission } from './middleware/auth.js';
import { notifyAdminUpdate, notifyCustomerUpdate } from './middleware/sse-broker.js';
import { pushService } from '../pushService.js';
import { jobService } from '../services/job.service.js';

import { serviceRequestLimiter } from './middleware/rate-limit.js';
import { repairJourneyService } from '../services/customer-repair-journey.service.js';
import { syncPickupScheduleToLogisticsTask } from '../services/logistics-task.service.js';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { auditLogger } from '../utils/auditLogger.js';

const router = Router();
const PICKUP_SCHEDULEABLE_STAGES = ['intake', 'assessment', 'authorized', 'pickup_scheduled'];
const PICKUP_RECEIVED_STAGES = ['picked_up', 'device_received', 'in_repair', 'ready', 'out_for_delivery', 'completed', 'closed'];
const PICKUP_DELIVERED_STAGES = ['completed', 'closed'];

function validatePickupCustodyStatus(status: string | undefined, stage: string | null | undefined) {
    if (status === 'PickedUp' && !PICKUP_RECEIVED_STAGES.includes(stage || '')) {
        return 'Customer receive OTP is required before marking this pickup as picked up.';
    }
    if (status === 'Delivered' && !PICKUP_DELIVERED_STAGES.includes(stage || '')) {
        return 'Customer delivery OTP is required before marking this pickup as delivered.';
    }
    return null;
}

// ============================================
// Quote Requests API
// ============================================

/**
 * POST /api/quotes - Submit quote request (rate limited)
 */
router.post('/api/quotes', serviceRequestLimiter, async (req: Request, res: Response) => {
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

        repairJourneyService.createJourneyFromQuote({
            quoteRequestId: quoteRequest.id,
            customerId: customerId || null,
            customerNote: validated.description || undefined,
            serviceMode: (validated.serviceMode as any) || undefined,
        }).catch(err => console.error('[RepairJourney] Failed to create journey from quote:', (err as Error).message));

        res.status(201).json(quoteRequest);
    } catch (error: any) {
        console.error('[Quotes] Quote request failed:', (error as Error).message);
        res.status(400).json({ error: 'Invalid quote request' });
    }
});

/**
 * GET /api/admin/quotes - Get all quote requests (admin)
 */
router.get('/api/admin/quotes', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const quotes = await serviceRequestRepo.getQuoteRequests();
        res.json(quotes);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch quotes' });
    }
});

/**
 * PATCH /api/admin/quotes/:id/price - Update quote with pricing (admin)
 * Money action — requires serviceRequests.quote permission.
 */
router.patch('/api/admin/quotes/:id/price', requireAdminAuth, requireGranularPermission('serviceRequests.quote'), async (req: Request, res: Response) => {
    try {
        const { quoteAmount, quoteNotes } = req.body;
        if (!quoteAmount) {
            return res.status(400).json({ error: 'Quote amount is required' });
        }

        const updated = await serviceRequestRepo.updateQuote(req.params.id, quoteAmount, quoteNotes);
        if (!updated) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        auditLogger.log({
            userId: req.session.adminUserId!,
            action: 'QUOTE_PRICE_UPDATED',
            entity: 'ServiceRequest',
            entityId: req.params.id,
            newValue: { quoteAmount, quoteNotes: quoteNotes ?? null, ticketNumber: updated.ticketNumber || null },
            req,
        }).catch(() => {});

        if (updated.customerId) {
            notifyCustomerUpdate(updated.customerId, {
                type: 'quote_updated',
                data: updated,
                updatedAt: new Date().toISOString()
            });

            // Send push notification: Quote Ready
            pushService.notifyQuoteReady(updated.customerId, updated.id, quoteAmount)
                .catch(err => console.error('[Push] Failed to send quote ready notification:', (err as Error).message));
        }

        repairJourneyService.findJourneyByQuoteRequest(req.params.id).then(journeyId => {
            if (journeyId) {
                repairJourneyService.updateJourneyStage(journeyId, 'quote_sent')
                    .catch(err => console.error('[RepairJourney] Failed to update journey to quote_sent:', (err as Error).message));
            }
        }).catch(err => console.error('[RepairJourney] Lookup error:', (err as Error).message));

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update quote' });
    }
});

/**
 * POST /api/quotes/:id/accept - Accept quote (customer)
 */
router.post('/api/quotes/:id/accept', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const customerId = getCustomerId(req);
        if (!customerId) {
            return res.status(401).json({ error: 'Please login to continue', code: 'NOT_AUTHENTICATED' });
        }

        const existingRequest = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!existingRequest) {
            return res.status(404).json({ error: 'Quote not found' });
        }
        if (!existingRequest.customerId || existingRequest.customerId !== customerId) {
            return res.status(403).json({ error: 'Forbidden: You can only manage your own quote' });
        }

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

        const updated = await serviceRequestRepo.acceptQuote(
            req.params.id,
            actualPickupTier,
            address || '',
            servicePreference,
            parsedScheduledVisitDate
        );
        if (!updated) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        await serviceRequestRepo.updateServiceRequest(req.params.id, { trackingStatus: trackingStatus as any });

        let eventMessage = servicePreference === 'home_pickup'
            ? 'Our team is on the way to collect your TV.'
            : 'Your service request has been queued. Please bring your TV to our service center.';

        if (servicePreference === 'service_center' && scheduledVisitDate) {
            const visitDate = new Date(scheduledVisitDate);
            eventMessage = `Your visit is scheduled for ${visitDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}. Please bring your TV to our service center.`;
        }

        await serviceRequestRepo.createServiceRequestEvent({
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

        // Send push notification: Quote Accepted confirmation
        if (updated.customerId) {
            pushService.notifyQuoteAccepted(updated.customerId, updated.ticketNumber || updated.id)
                .catch(err => console.error('[Push] Failed to send quote accepted notification:', (err as Error).message));
        }

        repairJourneyService.findJourneyByQuoteRequest(req.params.id).then(async (journeyId) => {
            if (!journeyId) return;
            const schedType = servicePreference === 'home_pickup' ? 'pickup' : 'service_center_visit';
            const journeyMode = servicePreference === 'home_pickup' ? 'pickup' : 'drop_off';
            const isPickup = servicePreference === 'home_pickup';

            await db.execute(sql`
                UPDATE customer_repair_journeys
                SET current_stage = 'quote_accepted',
                    customer_friendly_status = 'Quote accepted! We will schedule your service shortly.',
                    next_action = 'schedule_service',
                    next_action_label = 'Schedule Pickup or Visit',
                    service_mode = ${journeyMode},
                    pickup_required = ${isPickup},
                    dropoff_required = ${!isPickup},
                    updated_at = NOW()
                WHERE id = ${journeyId}
            `);

            await repairJourneyService.addJourneyEvent({
                journeyId,
                eventType: 'stage_quote_accepted',
                title: 'Quote Accepted',
                message: 'Quote accepted! We will schedule your service shortly.',
                actorType: 'system',
            });

            await repairJourneyService.insertScheduleRow({
                journeyId,
                scheduleType: schedType,
                requestedDate: parsedScheduledVisitDate?.toISOString().split('T')[0] || undefined,
                customerNote: address || undefined,
            });
        }).catch(err => console.error('[RepairJourney] Quote accept sync failed:', (err as Error).message));

        res.json({ ...updated, servicePreference, trackingStatus, scheduledPickupDate: parsedScheduledVisitDate });
    } catch (error) {
        console.error('[Quotes] Error accepting quote:', (error as Error).message);
        res.status(500).json({ error: 'Failed to accept quote' });
    }
});

/**
 * POST /api/quotes/:id/decline - Decline quote (customer)
 */
router.post('/api/quotes/:id/decline', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const customerId = getCustomerId(req);
        if (!customerId) {
            return res.status(401).json({ error: 'Please login to continue', code: 'NOT_AUTHENTICATED' });
        }

        const existingRequest = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!existingRequest) {
            return res.status(404).json({ error: 'Quote not found' });
        }
        if (!existingRequest.customerId || existingRequest.customerId !== customerId) {
            return res.status(403).json({ error: 'Forbidden: You can only manage your own quote' });
        }

        const updated = await serviceRequestRepo.declineQuote(req.params.id);
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
 * POST /api/quotes/:id/convert - Convert quote to service request (admin only)
 * Money/flow action — requires serviceRequests.convertToJob permission.
 */
router.post('/api/quotes/:id/convert', requireAdminAuth, requireGranularPermission('serviceRequests.convertToJob'), async (req: Request, res: Response) => {
    try {
        const updated = await storage.convertQuoteToServiceRequest(req.params.id);
        if (!updated) {
            return res.status(404).json({ error: 'Quote not found' });
        }

        auditLogger.log({
            userId: req.session.adminUserId!,
            action: 'QUOTE_CONVERTED',
            entity: 'ServiceRequest',
            entityId: req.params.id,
            newValue: { ticketNumber: updated.ticketNumber || null },
            req,
        }).catch(() => {});

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
 * POST /api/admin/service-requests/:id/transfer-to-pickup
 * Creates a pickup & delivery schedule from a service request (idempotent).
 * Used by the "Transfer to Pickup & Delivery" action on pickup-type requests.
 */
router.post('/api/admin/service-requests/:id/transfer-to-pickup', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const sr = await serviceRequestRepo.getServiceRequest(req.params.id);
        if (!sr) {
            return res.status(404).json({ error: 'Service request not found' });
        }

        // Idempotent — return the existing pickup if already transferred
        const existing = await storage.getPickupScheduleByServiceRequestId(sr.id);
        if (existing) {
            syncPickupScheduleToLogisticsTask(existing.id)
                .catch((err) => console.error('[Logistics] Transfer self-heal sync failed:', (err as Error).message));
            return res.json({ pickup: existing, alreadyExisted: true });
        }

        const { tier, tierCost } = req.body || {};
        const pickup = await storage.createPickupSchedule({
            serviceRequestId: sr.id,
            tier: tier || (sr as any).pickupTier || 'Regular',
            tierCost: typeof tierCost === 'number' ? tierCost : ((sr as any).pickupCost || 0),
            status: 'Pending',
            pickupAddress: (sr as any).address || null,
        } as any);

        notifyAdminUpdate({
            type: 'pickup_created',
            data: pickup,
            updatedAt: new Date().toISOString()
        });

        syncPickupScheduleToLogisticsTask(pickup.id)
            .catch((err) => console.error('[Logistics] Transfer-to-pickup sync failed:', (err as Error).message));

        res.status(201).json({ pickup, alreadyExisted: false });
    } catch (error: any) {
        res.status(500).json({ error: error?.message || 'Failed to transfer to pickup' });
    }
});

/**
 * POST /api/admin/pickups/:id/collect-payment
 * Records cash-on-delivery collected at handover. Mirrors POS posting:
 * petty-cash Income (Sales) + bumps active drawer expectedCash for Cash,
 * and marks the linked service request paid.
 */
router.post('/api/admin/pickups/:id/collect-payment', requireAdminAuth, requireGranularPermission('pos.processPayment'), async (req: Request, res: Response) => {
    try {
        const { amount, method } = req.body || {};
        const amt = Number(amount);
        const pay = String(method || 'Cash');
        if (!Number.isFinite(amt) || amt <= 0) {
            return res.status(400).json({ error: 'Valid amount is required' });
        }
        if (!['Cash', 'Bank', 'bKash', 'Nagad'].includes(pay)) {
            return res.status(400).json({ error: 'Invalid payment method' });
        }

        const pickup = await storage.getPickupSchedule(req.params.id);
        if (!pickup) {
            return res.status(404).json({ error: 'Pickup schedule not found' });
        }

        const activeDrawer = pay === 'Cash' ? await storage.getActiveDrawer() : null;
        if (pay === 'Cash' && !activeDrawer) {
            return res.status(409).json({ error: 'Open drawer first before collecting cash COD' });
        }

        await storage.createPettyCashRecord({
            description: `COD - Pickup/Delivery ${pickup.serviceRequestId}`,
            category: 'Sales',
            amount: amt,
            type: 'Income',
        } as any);

        if (activeDrawer) {
            await storage.updateDrawerExpectedCash(activeDrawer.id, amt);
        }

        await serviceRequestRepo.updateServiceRequest(pickup.serviceRequestId, {
            paymentStatus: 'paid',
        } as any);

        notifyAdminUpdate({
            type: 'cod_collected',
            data: { pickupId: pickup.id, serviceRequestId: pickup.serviceRequestId, amount: amt, method: pay },
            updatedAt: new Date().toISOString()
        });

        res.json({ success: true, amount: amt, method: pay });
    } catch (error: any) {
        res.status(500).json({ error: error?.message || 'Failed to record COD payment' });
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

        const existingPickup = await storage.getPickupSchedule(req.params.id);
        if (!existingPickup) {
            return res.status(404).json({ error: 'Pickup schedule not found' });
        }

        if (updates.status) {
            const sr = await serviceRequestRepo.getServiceRequest(existingPickup.serviceRequestId);
            const custodyError = validatePickupCustodyStatus(updates.status, sr?.stage);
            if (custodyError) {
                return res.status(409).json({ error: custodyError });
            }
        }

        const pickup = await storage.updatePickupSchedule(req.params.id, updates);
        if (!pickup) {
            return res.status(404).json({ error: 'Pickup schedule not found' });
        }

        if (updates.status === 'Scheduled' || updates.scheduledDate) {
            const sr = await serviceRequestRepo.getServiceRequest(pickup.serviceRequestId);
            if (sr && PICKUP_SCHEDULEABLE_STAGES.includes(sr.stage || 'intake')) {
                const user = await userRepo.getUser(req.session.adminUserId!);
                await jobService.transitionStage(pickup.serviceRequestId, 'pickup_scheduled', user?.name || 'Pickup Desk');
            }
        }

        notifyAdminUpdate({
            type: 'pickup_updated',
            data: pickup,
            updatedAt: new Date().toISOString()
        });

        syncPickupScheduleToLogisticsTask(pickup.id)
            .catch((err) => console.error('[Logistics] Pickup sync failed:', (err as Error).message));

        if (updates.status && ['Scheduled', 'PickedUp', 'Delivered'].includes(updates.status)) {
            repairJourneyService.syncPickupStatusToJourney(pickup.serviceRequestId, updates.status)
                .catch((err) => console.error('[RepairJourney] Pickup PATCH journey sync failed:', (err as Error).message));
        }

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

        const currentPickup = await storage.getPickupSchedule(req.params.id);
        if (!currentPickup) {
            return res.status(404).json({ error: 'Pickup schedule not found' });
        }

        const sr = await serviceRequestRepo.getServiceRequest(currentPickup.serviceRequestId);
        const custodyError = validatePickupCustodyStatus(status, sr?.stage);
        if (custodyError) {
            return res.status(409).json({ error: custodyError });
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
            await serviceRequestRepo.updateServiceRequest(pickup.serviceRequestId, {
                trackingStatus: 'Delivered'
            } as any);
        }

        repairJourneyService.syncPickupStatusToJourney(pickup.serviceRequestId, status)
            .catch((err) => console.error('[RepairJourney] Pickup sync failed:', (err as Error).message));

        syncPickupScheduleToLogisticsTask(pickup.id)
            .catch((err) => console.error('[Logistics] Pickup status sync failed:', (err as Error).message));

        res.json(pickup);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update pickup status' });
    }
});

export default router;
