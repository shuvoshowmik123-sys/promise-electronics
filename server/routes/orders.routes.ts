/**
 * Orders Routes
 * 
 * Handles customer and admin order management.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { db } from '../db.js';
import { sparePartOrders } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';
import { requireCustomerAuth, requireAdminAuth, getCustomerId } from './middleware/auth.js';
import { notifyAdminUpdate, notifyCustomerUpdate } from './middleware/sse-broker.js';

const router = Router();

// ============================================
// Customer Orders API
// ============================================

/**
 * POST /api/orders - Create order (customer)
 */
router.post('/api/orders', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const user = await storage.getUser(req.session.customerId!);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        const { items, address, phone, notes } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Order must have at least one item' });
        }

        if (!address || typeof address !== 'string' || address.trim() === '') {
            return res.status(400).json({ error: 'Delivery address is required' });
        }

        if (!phone || typeof phone !== 'string' || phone.trim() === '') {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        let subtotal = 0;
        const orderItems = [];

        for (const item of items) {
            const product = await storage.getInventoryItem(item.productId);
            if (!product) {
                return res.status(400).json({ error: `Product ${item.productId} not found` });
            }

            let price = product.price;
            let variantName = null;
            let isFromHotDeal = false;

            if (item.variantId) {
                const variant = await storage.getProductVariant(item.variantId);
                if (!variant) {
                    return res.status(400).json({ error: `Variant ${item.variantId} not found` });
                }
                price = variant.price;
                variantName = variant.variantName;
            } else if (item.price !== undefined && item.isFromHotDeal) {
                // Validate the hot deal price against the stored hot deal price
                const clientPrice = Number(item.price);
                const serverHotDealPrice = product.hotDealPrice;

                // Accept the client price if it matches either regular price or hot deal price
                if (serverHotDealPrice !== null && serverHotDealPrice !== undefined) {
                    // If the client claims it's a hot deal, validate against hot deal price
                    if (Math.abs(clientPrice - serverHotDealPrice) < 0.01) {
                        price = clientPrice;
                        isFromHotDeal = true;
                    } else if (Math.abs(clientPrice - product.price) < 0.01) {
                        // Fallback to regular price if that's what was sent
                        price = product.price;
                    } else {
                        // Price doesn't match either - use hot deal price if marked as hot deal
                        console.log(`Price mismatch for ${product.name}: client=${clientPrice}, hotDeal=${serverHotDealPrice}, regular=${product.price}. Using hot deal price.`);
                        price = serverHotDealPrice;
                        isFromHotDeal = true;
                    }
                } else {
                    // No hot deal price set on server, use regular price
                    price = product.price;
                }
            }

            const quantity = Number(item.quantity) || 1;
            const itemTotal = price * quantity;
            subtotal += itemTotal;

            orderItems.push({
                productId: product.id,
                productName: product.name,
                variantId: item.variantId || null,
                variantName,
                quantity,
                price: price,
                total: itemTotal,
            });
        }

        const total = subtotal;

        const order = await storage.createOrder(
            {
                customerId: user.id,
                customerName: user.name,
                customerPhone: phone,
                customerAddress: address,
                status: 'Pending',
                paymentMethod: 'COD',
                subtotal: subtotal,
                total: total,
                notes: notes || null,
            },
            orderItems
        );

        notifyAdminUpdate({
            type: 'order_created',
            data: order,
            createdAt: new Date().toISOString(),
        });

        notifyCustomerUpdate(user.id, {
            type: 'order_created',
            data: order,
            createdAt: new Date().toISOString(),
        });

        res.status(201).json(order);
    } catch (error: any) {
        console.error('Order creation error:', error);
        res.status(500).json({ error: 'Failed to create order', details: error.message });
    }
});

/**
 * GET /api/customer/orders - Get customer's orders
 */
router.get('/api/customer/orders', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const customerId = getCustomerId(req);
        if (!customerId) {
            return res.status(401).json({ error: 'Customer ID not found' });
        }
        const orders = await storage.getOrdersByCustomerId(customerId);
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

/**
 * GET /api/customer/orders/:id - Get customer's order by ID
 */
router.get('/api/customer/orders/:id', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const customerId = getCustomerId(req);
        if (!customerId) {
            return res.status(401).json({ error: 'Customer ID not found' });
        }

        const order = await storage.getOrder(req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (order.customerId !== customerId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const items = await storage.getOrderItems(order.id);
        res.json({ ...order, items });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

/**
 * GET /api/orders/track/:orderNumber - Track order by order number (public)
 */
router.get('/api/orders/track/:orderNumber', async (req: Request, res: Response) => {
    try {
        const order = await storage.getOrderByOrderNumber(req.params.orderNumber);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const items = await storage.getOrderItems(order.id);
        res.json({ ...order, items });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

// ============================================
// Admin Orders API
// ============================================

/**
 * GET /api/admin/orders - Get all orders (admin)
 */
router.get('/api/admin/orders', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const orders = await storage.getAllOrders();
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

/**
 * GET /api/admin/orders/:id - Get order details (admin)
 */
router.get('/api/admin/orders/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const order = await storage.getOrder(req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const items = await storage.getOrderItems(order.id);

        // Check for spare part details
        const sparePartDetails = await db.select().from(sparePartOrders).where(eq(sparePartOrders.orderId, order.id)).limit(1);

        res.json({
            ...order,
            items,
            sparePartDetails: sparePartDetails.length > 0 ? sparePartDetails[0] : null
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

/**
 * PATCH /api/admin/orders/:id - Update order (admin)
 */
router.patch('/api/admin/orders/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { status, declineReason, notes } = req.body;

        const order = await storage.getOrder(req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const updates: any = {};
        if (status) updates.status = status;
        if (declineReason !== undefined) updates.declineReason = declineReason;
        if (notes !== undefined) updates.notes = notes;

        const updated = await storage.updateOrder(req.params.id, updates);

        if (updated && updated.customerId) {
            notifyCustomerUpdate(updated.customerId, {
                type: 'order_updated',
                data: updated,
                updatedAt: new Date().toISOString(),
            });
        }

        notifyAdminUpdate({
            type: 'order_updated',
            data: updated,
            updatedAt: new Date().toISOString(),
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update order' });
    }
});

/**
 * POST /api/admin/orders/:id/accept - Accept order (admin)
 */
router.post('/api/admin/orders/:id/accept', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const order = await storage.getOrder(req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (order.status !== 'Pending') {
            return res.status(400).json({ error: 'Only pending orders can be accepted' });
        }

        const updated = await storage.updateOrder(req.params.id, { status: 'Accepted' });

        if (updated && updated.customerId) {
            notifyCustomerUpdate(updated.customerId, {
                type: 'order_accepted',
                data: updated,
                updatedAt: new Date().toISOString(),
            });
        }

        notifyAdminUpdate({
            type: 'order_accepted',
            data: updated,
            updatedAt: new Date().toISOString(),
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to accept order' });
    }
});

/**
 * POST /api/admin/orders/:id/decline - Decline order (admin)
 */
router.post('/api/admin/orders/:id/decline', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { reason } = req.body;

        const order = await storage.getOrder(req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (order.status !== 'Pending') {
            return res.status(400).json({ error: 'Only pending orders can be declined' });
        }

        const updated = await storage.updateOrder(req.params.id, {
            status: 'Declined',
            declineReason: reason || 'Order declined by admin',
        });

        if (updated && updated.customerId) {
            notifyCustomerUpdate(updated.customerId, {
                type: 'order_declined',
                data: updated,
                updatedAt: new Date().toISOString(),
            });
        }

        notifyAdminUpdate({
            type: 'order_declined',
            data: updated,
            updatedAt: new Date().toISOString(),
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to decline order' });
    }
});

export default router;
