/**
 * Customer Routes
 * 
 * Handles customer authentication, profile, and SSE connections.
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { storage } from '../storage.js';
import {
    customerLoginSchema,
    customerRegisterSchema,
    requireCustomerAuth,
    getCustomerId
} from './middleware/auth.js';
import {
    addCustomerSSEClient,
    removeCustomerSSEClient,
    notifyAdminUpdate,
    notifyCustomerUpdate
} from './middleware/sse-broker.js';
import { z } from 'zod';

const router = Router();

// ============================================
// Customer Authentication
// ============================================

/**
 * POST /api/customer/register - Register new customer
 */
router.post('/api/customer/register', async (req: Request, res: Response) => {
    try {
        const validated = customerRegisterSchema.parse(req.body);

        const existingUser = await storage.getUserByPhone(validated.phone);
        if (existingUser) {
            return res.status(400).json({ error: 'Phone number already registered. Please login instead.' });
        }

        const hashedPassword = await bcrypt.hash(validated.password, 12);

        const user = await storage.createUser({
            username: validated.phone,
            name: validated.name,
            phone: validated.phone,
            email: validated.email || null,
            address: validated.address || null,
            password: hashedPassword,
            role: 'Customer',
            status: 'Active',
            permissions: '{}',
        });

        await storage.linkServiceRequestsByPhone(validated.phone, user.id);

        req.session.customerId = user.id;
        req.session.authMethod = 'phone';

        const { password: _, ...safeUser } = user;

        notifyAdminUpdate({
            type: 'customer_created',
            data: safeUser,
            createdAt: new Date().toISOString(),
        });

        res.status(201).json(safeUser);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Invalid registration data', details: error.errors });
        }
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Failed to register. Please try again.' });
    }
});

/**
 * POST /api/customer/login - Customer login
 */
router.post('/api/customer/login', async (req: Request, res: Response) => {
    try {
        const validated = customerLoginSchema.parse(req.body);

        const user = await storage.getUserByPhone(validated.phone);
        if (!user) {
            return res.status(401).json({ error: 'Invalid phone number or password' });
        }

        if (!user.password) {
            return res.status(401).json({ error: 'Please register with a password first' });
        }

        const isValid = await bcrypt.compare(validated.password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid phone number or password' });
        }

        await storage.updateUserLastLogin(user.id);

        req.session.customerId = user.id;
        req.session.authMethod = 'phone';

        if (user.phone) {
            await storage.linkServiceRequestsByPhone(user.phone, user.id);
        }

        const { password: _, ...safeUser } = user;
        res.json(safeUser);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Invalid login data', details: error.errors });
        }
        console.error('Login error:', error);
        res.status(500).json({ error: 'Failed to login. Please try again.' });
    }
});

/**
 * POST /api/customer/logout - Customer logout
 */
router.post('/api/customer/logout', (req: Request, res: Response) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to logout' });
        }
        res.clearCookie('connect.sid');
        res.json({ message: 'Logged out successfully' });
    });
});

/**
 * GET /api/customer/me - Get current customer
 */
router.get('/api/customer/me', async (req: Request, res: Response) => {
    if (!req.session?.customerId) {
        return res.status(401).json({ error: 'Not logged in' });
    }

    const customer = await storage.getCustomer(req.session.customerId);
    if (!customer) {
        req.session.destroy(() => { });
        return res.status(401).json({ error: 'Customer not found' });
    }

    const { password: _, ...safeCustomer } = customer;
    res.json(safeCustomer);
});

/**
 * PUT /api/customer/profile - Update customer profile
 */
router.put('/api/customer/profile', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const customerId = getCustomerId(req);
        if (!customerId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { phone, address, name, email, avatar, profileImageUrl } = req.body;

        console.log(`[Profile Update] Received update for customer ${customerId}`);
        console.log(`[Profile Update] Payload keys: ${Object.keys(req.body).join(', ')}`);
        if (profileImageUrl) {
            console.log(`[Profile Update] profileImageUrl length: ${profileImageUrl.length}`);
        }

        const updates: any = {};
        if (phone !== undefined) updates.phone = phone;
        if (address !== undefined) updates.address = address;
        if (name !== undefined) updates.name = name;
        if (email !== undefined) updates.email = email;
        if (avatar !== undefined) updates.avatar = avatar;
        if (profileImageUrl !== undefined) updates.profileImageUrl = profileImageUrl;

        console.log(`[Profile Update] Updates object keys: ${Object.keys(updates).join(', ')}`);

        const oldCustomer = await storage.getCustomer(customerId);
        const isAddingPhone = phone && !oldCustomer?.phone;

        const customer = await storage.updateCustomer(customerId, updates);
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        console.log(`[Profile Update] Updated customer. profileImageUrl length: ${customer.profileImageUrl?.length}`);

        if (isAddingPhone && customer.phone) {
            const linkedCount = await storage.linkServiceRequestsByPhone(customer.phone, customer.id);
            if (linkedCount > 0) {
                console.log(`Linked ${linkedCount} service request(s) to customer ${customer.id} by phone ${customer.phone}`);
            }
        }

        const { password: _, ...safeCustomer } = customer;
        res.json(safeCustomer);
    } catch (error: any) {
        console.error('Profile update error:', error);

        if (error?.code === '23505' && error?.constraint === 'customers_phone_key') {
            return res.status(409).json({
                error: 'This phone number is already in use. Please try a different number.',
                code: 'PHONE_EXISTS'
            });
        }

        res.status(500).json({ error: 'Failed to update profile', details: error.message });
    }
});

// ============================================
// Customer SSE Events
// ============================================

/**
 * GET /api/customer/events - SSE endpoint for customer real-time updates
 */
router.get('/api/customer/events', requireCustomerAuth, (req: Request, res: Response) => {
    const customerId = req.session.customerId!;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    addCustomerSSEClient(customerId, res);

    const heartbeat = setInterval(() => {
        try {
            res.write(`:heartbeat\n\n`);
        } catch (e) {
            clearInterval(heartbeat);
        }
    }, 30000);

    req.on('close', () => {
        clearInterval(heartbeat);
        removeCustomerSSEClient(customerId, res);
    });
});

// ============================================
// Customer Service Requests
// ============================================

/**
 * GET /api/customer/service-requests - Get customer's service requests
 */
router.get('/api/customer/service-requests', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const orders = await storage.getServiceRequestsByCustomerId(req.session.customerId!);
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch service requests' });
    }
});

/**
 * GET /api/customer/service-requests/:id - Get service request details
 */
router.get('/api/customer/service-requests/:id', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const order = await storage.getServiceRequest(req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Service request not found' });
        }

        if (order.customerId !== req.session.customerId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const events = await storage.getServiceRequestEvents(order.id);
        res.json({ ...order, timeline: events });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch service request details' });
    }
});

/**
 * GET /api/customer/track/:ticketNumber - Track order by ticket number
 */
router.get('/api/customer/track/:ticketNumber', async (req: Request, res: Response) => {
    try {
        const order = await storage.getServiceRequestByTicketNumber(req.params.ticketNumber);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (req.session?.customerId && order.phone) {
            const customer = await storage.getCustomer(req.session.customerId);
            if (customer && customer.phone === order.phone && !order.customerId) {
                await storage.linkServiceRequestToCustomer(order.id, customer.id);
            }
        }

        if (!req.session?.customerId) {
            return res.json({
                ticketNumber: order.ticketNumber,
                trackingStatus: order.trackingStatus,
                createdAt: order.createdAt,
                message: 'Login to see full details',
            });
        }

        const events = await storage.getServiceRequestEvents(order.id);
        res.json({ ...order, timeline: events });
    } catch (error) {
        res.status(500).json({ error: 'Failed to track order' });
    }
});

/**
 * POST /api/customer/service-requests/link - Link service request to customer
 */
router.post('/api/customer/service-requests/link', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const { ticketNumber } = req.body;
        if (!ticketNumber) {
            return res.status(400).json({ error: 'Ticket number is required' });
        }

        const order = await storage.getServiceRequestByTicketNumber(ticketNumber);
        if (!order) {
            return res.status(404).json({ error: 'Service request not found' });
        }

        const user = await storage.getUser(req.session.customerId!);
        if (!user || user.phone !== order.phone) {
            return res.status(403).json({ error: 'Phone number does not match order' });
        }

        const linked = await storage.linkServiceRequestToCustomer(order.id, user.id);
        res.json(linked);
    } catch (error) {
        res.status(500).json({ error: 'Failed to link service request' });
    }
});

// ============================================
// Customer Warranties
// ============================================

/**
 * GET /api/customer/warranties - Get customer's warranties
 */
router.get('/api/customer/warranties', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const user = await storage.getUser(req.session.customerId!);
        if (!user || !user.phone) {
            return res.json([]);
        }

        const jobs = await storage.getJobTicketsByCustomerPhone(user.phone);

        const now = new Date();
        const warranties = jobs
            .filter(job => job.status === 'Completed' && ((job.serviceWarrantyDays || 0) > 0 || (job.partsWarrantyDays || 0) > 0))
            .map(job => {
                const serviceActive = job.serviceExpiryDate ? new Date(job.serviceExpiryDate) > now : false;
                const partsActive = job.partsExpiryDate ? new Date(job.partsExpiryDate) > now : false;

                const serviceRemainingDays = job.serviceExpiryDate
                    ? Math.max(0, Math.ceil((new Date(job.serviceExpiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
                    : 0;
                const partsRemainingDays = job.partsExpiryDate
                    ? Math.max(0, Math.ceil((new Date(job.partsExpiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
                    : 0;

                return {
                    jobId: job.id,
                    device: job.device,
                    issue: job.issue,
                    completedAt: job.completedAt,
                    serviceWarranty: {
                        days: job.serviceWarrantyDays,
                        expiryDate: job.serviceExpiryDate,
                        isActive: serviceActive,
                        remainingDays: serviceRemainingDays,
                    },
                    partsWarranty: {
                        days: job.partsWarrantyDays,
                        expiryDate: job.partsExpiryDate,
                        isActive: partsActive,
                        remainingDays: partsRemainingDays,
                    },
                };
            });

        res.json(warranties);
    } catch (error) {
        console.error('Error fetching warranties:', error);
        res.status(500).json({ error: 'Failed to fetch warranties' });
    }
});

// ============================================
// Customer Addresses
// ============================================

import * as customerRepo from '../repositories/customer.repository.js';

/**
 * GET /api/customer/addresses - Get customer's saved addresses
 */
router.get('/api/customer/addresses', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const customerId = getCustomerId(req);
        if (!customerId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        const addresses = await customerRepo.getCustomerAddresses(customerId);
        res.json(addresses);
    } catch (error) {
        console.error('Error fetching addresses:', error);
        res.status(500).json({ error: 'Failed to fetch addresses' });
    }
});

/**
 * POST /api/customer/addresses - Create a new address
 */
router.post('/api/customer/addresses', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const customerId = getCustomerId(req);
        if (!customerId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { label, address, isDefault } = req.body;
        if (!label || !address) {
            return res.status(400).json({ error: 'Label and address are required' });
        }

        const newAddress = await customerRepo.createCustomerAddress({
            customerId,
            label,
            address,
            isDefault: isDefault || false,
        });
        res.status(200).json(newAddress);
    } catch (error) {
        console.error('Error creating address:', error);
        res.status(500).json({ error: 'Failed to create address' });
    }
});

/**
 * PATCH /api/customer/addresses/:id - Update an address
 */
router.patch('/api/customer/addresses/:id', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const customerId = getCustomerId(req);
        if (!customerId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { id } = req.params;
        const { label, address, isDefault } = req.body;

        const updates: any = {};
        if (label !== undefined) updates.label = label;
        if (address !== undefined) updates.address = address;
        if (isDefault !== undefined) updates.isDefault = isDefault;

        const updated = await customerRepo.updateCustomerAddress(id, customerId, updates);
        if (!updated) {
            return res.status(404).json({ error: 'Address not found' });
        }
        res.json(updated);
    } catch (error) {
        console.error('Error updating address:', error);
        res.status(500).json({ error: 'Failed to update address' });
    }
});

/**
 * DELETE /api/customer/addresses/:id - Delete an address
 */
router.delete('/api/customer/addresses/:id', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const customerId = getCustomerId(req);
        if (!customerId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { id } = req.params;
        const deleted = await customerRepo.deleteCustomerAddress(id, customerId);
        if (!deleted) {
            return res.status(404).json({ error: 'Address not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting address:', error);
        res.status(500).json({ error: 'Failed to delete address' });
    }
});

export default router;

