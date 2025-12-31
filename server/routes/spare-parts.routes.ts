import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { requireCustomerAuth, requireAdminAuth, getCustomerId } from './middleware/auth.js';
import { db } from '../db.js';
import { orders, orderItems, sparePartOrders, insertSparePartOrderSchema } from '../../shared/schema.js';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const router = Router();

// ============================================
// Customer Spare Part Orders API
// ============================================

/**
 * POST /api/orders/spare-parts - Create a new spare part order
 */
router.post('/api/orders/spare-parts', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const customerId = req.session.customerId!;
        const user = await storage.getUser(customerId);
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        const {
            items,
            address,
            phone,
            deviceInfo,
            fulfillmentType,
            pickupTier,
            pickupAddress,
            scheduledDate
        } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Order must have at least one item' });
        }

        // Start transaction
        const result = await db.transaction(async (tx) => {
            // 1. Calculate totals (only part price, service charge is quoted later)
            let subtotal = 0;
            const orderItemsData = [];

            for (const item of items) {
                const product = await storage.getInventoryItem(item.productId);
                if (!product) throw new Error(`Product ${item.productId} not found`);

                const price = product.price; // Spare parts usually don't have variants/hot deals logic yet, keep simple
                const quantity = Number(item.quantity) || 1;
                const itemTotal = price * quantity;
                subtotal += itemTotal;

                orderItemsData.push({
                    productId: product.id,
                    productName: product.name,
                    quantity,
                    price,
                    total: itemTotal,
                });
            }

            // 2. Create Main Order
            const orderId = nanoid();
            const orderNumber = `ORD-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${nanoid(4).toUpperCase()}`;

            const [newOrder] = await tx.insert(orders).values({
                id: orderId,
                orderNumber,
                customerId,
                customerName: user.name,
                customerPhone: phone || user.phone,
                customerAddress: address || user.address || '',
                status: 'Pending Verification', // Special status for spare parts
                paymentMethod: 'COD', // Default for now
                subtotal,
                total: subtotal, // Service charge added later
                notes: 'Spare Part Order - Pending Verification',
            }).returning();

            // 3. Create Order Items
            for (const item of orderItemsData) {
                await tx.insert(orderItems).values({
                    id: nanoid(),
                    orderId: newOrder.id,
                    ...item,
                });
            }

            // 4. Create Spare Part Order Details
            const [sparePartOrder] = await tx.insert(sparePartOrders).values({
                id: nanoid(),
                orderId: newOrder.id,
                brand: deviceInfo.brand,
                screenSize: deviceInfo.screenSize,
                modelNumber: deviceInfo.modelNumber,
                primaryIssue: deviceInfo.primaryIssue,
                symptoms: deviceInfo.symptoms ? JSON.stringify(deviceInfo.symptoms) : null,
                description: deviceInfo.description,
                images: deviceInfo.images ? JSON.stringify(deviceInfo.images) : null,
                fulfillmentType,
                pickupTier,
                pickupAddress,
                scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
                verificationStatus: 'pending',
            }).returning();

            return { order: newOrder, sparePartOrder };
        });

        res.status(201).json(result);
    } catch (error: any) {
        console.error('Error creating spare part order:', error);
        res.status(500).json({ error: error.message || 'Failed to create order' });
    }
});

/**
 * GET /api/customer/spare-part-orders - Get all spare part orders for customer
 */
router.get('/api/customer/spare-part-orders', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const customerId = req.session.customerId!;

        // Join orders and sparePartOrders
        const results = await db.select({
            order: orders,
            sparePartOrder: sparePartOrders,
        })
            .from(sparePartOrders)
            .innerJoin(orders, eq(sparePartOrders.orderId, orders.id))
            .where(eq(orders.customerId, customerId))
            .orderBy(desc(orders.createdAt));

        // Format results
        const formattedResults = results.map(({ order, sparePartOrder }) => ({
            ...order,
            sparePartDetails: sparePartOrder,
        }));

        res.json(formattedResults);
    } catch (error: any) {
        console.error('Error fetching spare part orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

/**
 * GET /api/orders/spare-parts/:id - Get specific spare part order details
 */
router.get('/api/orders/spare-parts/:id', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const orderId = req.params.id;
        const customerId = req.session.customerId!;

        const result = await db.select({
            order: orders,
            sparePartOrder: sparePartOrders,
        })
            .from(sparePartOrders)
            .innerJoin(orders, eq(sparePartOrders.orderId, orders.id))
            .where(eq(orders.id, orderId))
            .limit(1);

        if (result.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const { order, sparePartOrder } = result[0];

        // Check ownership
        if (order.customerId !== customerId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Get items
        const items = await storage.getOrderItems(orderId);

        res.json({
            ...order,
            items,
            sparePartDetails: sparePartOrder,
        });
    } catch (error: any) {
        console.error('Error fetching spare part order details:', error);
        res.status(500).json({ error: 'Failed to fetch order details' });
    }
});

export default router;
