import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { inventoryRepo, financeRepo } from '../repositories/index.js';
import { requireAdminAuth, requirePermission } from './middleware/auth.js';
import { insertPurchaseOrderSchema, insertPurchaseOrderItemSchema } from '../../shared/schema.js';
import { z } from 'zod';
import { inventoryService } from '../services/inventory.service.js';

const router = Router();

/**
 * GET /api/purchase-orders - Fetch all purchase orders
 */
router.get('/api/purchase-orders', requireAdminAuth, requirePermission('purchasing'), async (req: Request, res: Response) => {
    try {
        const pos = await storage.getAllPurchaseOrders();
        res.json(pos);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch purchase orders' });
    }
});

/**
 * GET /api/purchase-orders/:id - Fetch PO by ID
 */
router.get('/api/purchase-orders/:id', requireAdminAuth, requirePermission('purchasing'), async (req: Request, res: Response) => {
    try {
        const po = await inventoryRepo.getPurchaseOrder(req.params.id);
        if (!po) {
            return res.status(404).json({ error: 'Purchase order not found' });
        }
        res.json(po);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch purchase order' });
    }
});

/**
 * GET /api/purchase-orders/:id/items - Fetch items for a PO
 */
router.get('/api/purchase-orders/:id/items', requireAdminAuth, requirePermission('purchasing'), async (req: Request, res: Response) => {
    try {
        const items = await storage.getPurchaseOrderItems(req.params.id);
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch purchase order items' });
    }
});

/**
 * POST /api/purchase-orders - Create a new Purchase Order
 */
router.post('/api/purchase-orders', requireAdminAuth, requirePermission('purchasing'), async (req: Request, res: Response) => {
    try {
        const { order, items } = req.body;

        const validOrder = insertPurchaseOrderSchema.parse(order);
        const validItems = z.array(insertPurchaseOrderItemSchema).parse(items);

        const newPo = await inventoryService.createPurchaseOrder(validOrder, validItems);
        res.status(201).json(newPo);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: "Validation failed", details: error.errors });
        }
        res.status(500).json({ error: 'Failed to create purchase order', details: error.message });
    }
});

/**
 * PATCH /api/purchase-orders/:id/status - Update PO status
 */
router.patch('/api/purchase-orders/:id/status', requireAdminAuth, requirePermission('purchasing'), async (req: Request, res: Response) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Status is required' });

        const po = await inventoryRepo.getPurchaseOrder(req.params.id);
        if (!po) return res.status(404).json({ error: 'Purchase order not found' });

        // If status changes to Received, apply standard stock increases
        if (status === 'Received' && po.status !== 'Received') {
            const items = await storage.getPurchaseOrderItems(po.id);
            for (const item of items) {
                // Determine if item is serialized
                const inventoryItem = await inventoryRepo.getInventoryItem(item.inventoryItemId);
                if (inventoryItem) {
                    // Note: If item.isSerialized, the frontend MUST send the serial numbers and call
                    // POST /api/inventory/:id/serials instead. But for standard parts, we increase stock here.
                    if (!inventoryItem.isSerialized) {
                        await storage.updateInventoryStock(inventoryItem.id, inventoryItem.stock + item.quantity);
                    }
                }
            }
        }

        const updatedPo = await storage.updatePurchaseOrderStatus(req.params.id, status);
        res.json(updatedPo);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to update purchase order status', details: error.message });
    }
});

export default router;
