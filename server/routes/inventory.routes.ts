/**
 * Inventory Routes
 * 
 * Handles inventory items, products, and shop functionality.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { inventoryRepo, financeRepo } from '../repositories/index.js';
import { insertInventoryItemSchema, insertProductSchema, insertLocalPurchaseSchema, insertWastageLogSchema } from '../../shared/schema.js';
import { requireAdminAuth, requirePermission } from './middleware/auth.js';
import { auditLogger } from '../utils/auditLogger.js';
import { inventoryService } from '../services/inventory.service.js';

const router = Router();

// ============================================
// Inventory API
// ============================================

/**
 * GET /api/inventory - Get all inventory items
 */
router.get('/api/inventory', async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const result = await inventoryRepo.getAllInventoryItems();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch inventory items' });
    }
});

/**
 * GET /api/inventory/hot-deals - Get inventory items marked as hot deals
 */
router.get('/api/inventory/hot-deals', async (req: Request, res: Response) => {
    try {
        const items = await inventoryRepo.getAllInventoryItems();
        const hotDeals = items.filter(item => item.showOnHotDeals === true);
        res.json(hotDeals);
    } catch (error) {
        console.error('Error fetching hot deals:', error);
        res.status(500).json({ error: 'Failed to fetch hot deals' });
    }
});

// ============================================
// Phase 4.5: Wastage & Defect Tracking
// ============================================

/**
 * GET /api/inventory/wastage - Get wastage report
 */
router.get('/api/inventory/wastage', requireAdminAuth, requirePermission('inventory'), async (req: Request, res: Response) => {
    try {
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

        const logs = await storage.getWastageLogs(startDate, endDate);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch wastage logs' });
    }
});

/**
 * GET /api/inventory/:id - Get inventory item by ID
 */
router.get('/api/inventory/:id', async (req: Request, res: Response) => {
    try {
        const item = await inventoryRepo.getInventoryItem(req.params.id);
        if (!item) {
            return res.status(404).json({ error: 'Inventory item not found' });
        }
        res.json(item);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch inventory item' });
    }
});

/**
 * POST /api/inventory - Create inventory item
 */
router.post('/api/inventory', requireAdminAuth, requirePermission('inventory'), async (req: Request, res: Response) => {
    try {
        const validated = insertInventoryItemSchema.parse(req.body);
        const item = await inventoryRepo.createInventoryItem(validated);

        // Audit Log
        await auditLogger.log({
            userId: req.session?.adminUserId || 'system',
            action: 'CREATE_INVENTORY',
            entity: 'InventoryItem',
            entityId: item.id,
            details: `Created inventory item ${item.name}`,
            newValue: item,
            req: req
        });

        res.status(201).json(item);
    } catch (error: any) {
        console.error('Inventory validation error:', error.message);
        res.status(400).json({ error: 'Invalid inventory item data', details: error.message });
    }
});

/**
 * PATCH /api/inventory/:id - Update inventory item
 */
router.patch('/api/inventory/:id', requireAdminAuth, requirePermission('inventory'), async (req: Request, res: Response) => {
    try {
        const existingItem = await inventoryRepo.getInventoryItem(req.params.id);
        const item = await inventoryRepo.updateInventoryItem(req.params.id, req.body);
        if (!item) {
            return res.status(404).json({ error: 'Inventory item not found' });
        }

        // Audit Log
        if (existingItem) {
            await auditLogger.log({
                userId: req.session?.adminUserId || 'system',
                action: 'UPDATE_INVENTORY',
                entity: 'InventoryItem',
                entityId: item.id,
                details: `Updated inventory item ${item.name}`,
                oldValue: existingItem,
                newValue: item,
                req: req
            });
        }

        res.json(item);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update inventory item' });
    }
});

/**
 * PATCH /api/inventory/:id/stock - Update inventory stock quantity
 */
router.patch('/api/inventory/:id/stock', requireAdminAuth, requirePermission('inventory'), async (req: Request, res: Response) => {
    try {
        const { quantity } = req.body;
        if (typeof quantity !== 'number') {
            return res.status(400).json({ error: 'Quantity must be a number' });
        }
        const existingItem = await inventoryRepo.getInventoryItem(req.params.id);
        const item = await storage.updateInventoryStock(req.params.id, quantity);
        if (!item) {
            return res.status(404).json({ error: 'Inventory item not found' });
        }

        // Audit Log
        if (existingItem) {
            await auditLogger.log({
                userId: req.session?.adminUserId || 'system',
                action: 'UPDATE_STOCK',
                entity: 'InventoryItem',
                entityId: item.id,
                details: `Updated stock content for ${item.name} by ${quantity}`,
                oldValue: { stock: existingItem.stock },
                newValue: { stock: item.stock, change: quantity },
                req: req
            });
        }

        res.json(item);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update inventory stock' });
    }
});

/**
 * DELETE /api/inventory/:id - Delete inventory item
 */
router.delete('/api/inventory/:id', requireAdminAuth, requirePermission('inventory'), async (req: Request, res: Response) => {
    try {
        const existingItem = await inventoryRepo.getInventoryItem(req.params.id);
        const success = await inventoryRepo.deleteInventoryItem(req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'Inventory item not found' });
        }

        // Audit Log
        if (existingItem) {
            await auditLogger.log({
                userId: req.session?.adminUserId || 'system',
                action: 'DELETE_INVENTORY',
                entity: 'InventoryItem',
                entityId: req.params.id,
                details: `Deleted inventory item ${existingItem.name}`,
                oldValue: existingItem,
                req: req
            });
        }

        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete inventory item' });
    }
});

/**
 * GET /api/inventory/:id/serials - Get serial numbers for an item
 */
router.get('/api/inventory/:id/serials', async (req: Request, res: Response) => {
    try {
        const serials = await storage.getInventorySerials(req.params.id);
        res.json(serials);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch inventory serials' });
    }
});

/**
 * POST /api/inventory/:id/serials - Add new serial numbers (restock)
 */
router.post('/api/inventory/:id/serials', requireAdminAuth, requirePermission('inventory'), async (req: Request, res: Response) => {
    try {
        const { serials } = req.body;
        if (!Array.isArray(serials) || serials.length === 0) {
            return res.status(400).json({ error: 'Serials array is required and must not be empty' });
        }

        const storeId = (req.user as any)?.storeId; // Will exist on multi-tenant
        const addedSerials = await storage.createInventorySerials(req.params.id, serials, storeId);

        // Auto-increment the parent inventory item's stock count
        const item = await inventoryRepo.getInventoryItem(req.params.id);
        if (item) {
            await storage.updateInventoryStock(item.id, item.stock + addedSerials.length);

            // Audit Log
            await auditLogger.log({
                userId: req.session?.adminUserId || 'system',
                action: 'ADD_SERIALS',
                entity: 'InventoryItem',
                entityId: item.id,
                details: `Added ${addedSerials.length} serial numbers for ${item.name}`,
                newValue: { addedSerials: serials },
                req: req
            });
        }

        res.status(201).json(addedSerials);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add inventory serials' });
    }
});

/**
 * POST /api/inventory/bulk-import - Bulk import inventory items
 */
router.post('/api/inventory/bulk-import', requireAdminAuth, requirePermission('inventory'), async (req: Request, res: Response) => {
    try {
        const { items } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Items array is required and must not be empty' });
        }

        const errors: string[] = [];
        let imported = 0;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            try {
                const id = item.id;

                if (!item.name || typeof item.name !== 'string' || item.name.trim() === '') {
                    errors.push(`Row ${i + 1}: Name is required`);
                    continue;
                }
                if (!item.category || typeof item.category !== 'string' || item.category.trim() === '') {
                    errors.push(`Row ${i + 1}: Category is required`);
                    continue;
                }

                const price = parseFloat(item.price);
                if (isNaN(price) || price < 0) {
                    errors.push(`Row ${i + 1}: Price must be a valid positive number`);
                    continue;
                }

                let stock = 0;
                if (item.stock !== undefined && item.stock !== '' && item.stock !== null) {
                    stock = parseInt(item.stock, 10);
                    if (isNaN(stock) || stock < 0) {
                        errors.push(`Row ${i + 1}: Stock must be a valid non-negative integer`);
                        continue;
                    }
                }

                let lowStockThreshold = 5;
                if (item.lowStockThreshold !== undefined && item.lowStockThreshold !== '' && item.lowStockThreshold !== null) {
                    lowStockThreshold = parseInt(item.lowStockThreshold, 10);
                    if (isNaN(lowStockThreshold) || lowStockThreshold < 0) {
                        errors.push(`Row ${i + 1}: Low stock threshold must be a valid non-negative integer`);
                        continue;
                    }
                }

                const validStatuses = ['In Stock', 'Low Stock', 'Out of Stock'];
                let status = 'In Stock';
                if (item.status && item.status.trim() !== '') {
                    if (!validStatuses.includes(item.status)) {
                        errors.push(`Row ${i + 1}: Status must be one of: ${validStatuses.join(', ')}`);
                        continue;
                    }
                    status = item.status;
                }

                const validated = insertInventoryItemSchema.parse({
                    id,
                    name: item.name.trim(),
                    category: item.category.trim(),
                    description: item.description?.trim() || null,
                    stock,
                    price: price.toString(),
                    status,
                    lowStockThreshold,
                    images: item.images || null,
                    showOnWebsite: item.showOnWebsite === 'true' || item.showOnWebsite === true,
                    showOnAndroidApp: item.showOnAndroidApp === 'true' || item.showOnAndroidApp === true,
                    showOnHotDeals: item.showOnHotDeals === 'true' || item.showOnHotDeals === true,
                    hotDealPrice: item.hotDealPrice ? parseFloat(item.hotDealPrice) : null,
                });

                await inventoryRepo.createInventoryItem(validated);
                imported++;
            } catch (error: any) {
                errors.push(`Row ${i + 1}: ${error.message || 'Invalid data'}`);
            }
        }

        res.json({ imported, errors });
    } catch (error: any) {
        console.error('Bulk import error:', error);
        res.status(500).json({ error: 'Failed to import inventory items', details: error.message });
    }
});

/**
 * GET /api/shop/inventory - Public shop inventory
 */
router.get('/api/shop/inventory', async (req: Request, res: Response) => {
    try {
        const items = await storage.getWebsiteInventoryItems();
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch shop inventory items' });
    }
});

// ============================================
// Local Purchases API (Phase 4.4)
// ============================================

/**
 * GET /api/inventory/local-purchases - Get all local purchases
 */
router.get('/api/inventory/local-purchases', requireAdminAuth, requirePermission('inventory'), async (req: Request, res: Response) => {
    try {
        const purchases = await storage.getLocalPurchases(req.query.jobTicketId as string);
        res.json(purchases);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch local purchases' });
    }
});

/**
 * POST /api/inventory/local-purchases - Create local purchase
 */
router.post('/api/inventory/local-purchases', requireAdminAuth, requirePermission('inventory'), async (req: Request, res: Response) => {
    try {
        const payload = {
            ...req.body,
            purchasedBy: (req.user as any)?.name || 'System',
            storeId: (req.user as any)?.storeId || null,
        };

        const validated = insertLocalPurchaseSchema.parse(payload);
        const purchase = await inventoryService.createLocalPurchase(validated);

        await auditLogger.log({
            userId: req.user?.id || 'system',
            action: 'CREATE',
            entity: 'LOCAL_PURCHASE',
            entityId: purchase.id,
            details: `Created local purchase for ${purchase.partName} costing ${purchase.costPrice} for job ${purchase.jobTicketId}`
        });

        res.status(201).json(purchase);
    } catch (error: any) {
        console.error('Local purchase error:', error);
        res.status(400).json({ error: 'Invalid local purchase data', details: error.message });
    }
});

// ============================================
// Products API
// ============================================

/**
 * GET /api/products - Get all products
 */
router.get('/api/products', async (req: Request, res: Response) => {
    try {
        const products = await storage.getAllProducts();
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

/**
 * GET /api/products/:id - Get product by ID
 */
router.get('/api/products/:id', async (req: Request, res: Response) => {
    try {
        const product = await storage.getProduct(req.params.id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch product' });
    }
});

/**
 * POST /api/products - Create product
 */
router.post('/api/products', requireAdminAuth, requirePermission('inventory'), async (req: Request, res: Response) => {
    try {
        const validated = insertProductSchema.parse(req.body);
        const product = await storage.createProduct(validated);
        res.status(201).json(product);
    } catch (error) {
        res.status(400).json({ error: 'Invalid product data' });
    }
});

/**
 * PATCH /api/products/:id - Update product
 */
router.patch('/api/products/:id', requireAdminAuth, requirePermission('inventory'), async (req: Request, res: Response) => {
    try {
        const product = await storage.updateProduct(req.params.id, req.body);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update product' });
    }
});

/**
 * DELETE /api/products/:id - Delete product
 */
router.delete('/api/products/:id', requireAdminAuth, requirePermission('inventory'), async (req: Request, res: Response) => {
    try {
        const success = await storage.deleteProduct(req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete product' });
    }
});



/**
 * POST /api/inventory/:id/wastage - Report wastage for an item
 */
router.post('/api/inventory/:id/wastage', requireAdminAuth, requirePermission('inventory'), async (req: Request, res: Response) => {
    try {
        const payload = {
            ...req.body,
            inventoryItemId: req.params.id,
            reportedBy: (req.user as any)?.name || 'System',
            storeId: (req.user as any)?.storeId || null,
        };

        const validated = insertWastageLogSchema.parse(payload);
        const log = await inventoryService.createWastageLog({
            ...validated,
            reportedBy: payload.reportedBy,
            storeId: payload.storeId
        });

        await auditLogger.log({
            userId: req.session?.adminUserId || 'system',
            action: 'CREATE',
            entity: 'WASTAGE_LOG',
            entityId: log.id,
            details: `Reported wastage of ${log.quantity} for item ${log.inventoryItemId} - ${log.reason}`
        });

        res.status(201).json(log);
    } catch (error: any) {
        console.error('Wastage report error:', error);
        res.status(400).json({ error: 'Invalid wastage data', details: error.message });
    }
});

/**
 * POST /api/inventory/:id/consume — Phase J
 * Consume a part from inventory for a specific job.
 * Body: { jobId, quantity, consumedBy, consumedByName }
 */
router.post('/api/inventory/:id/consume', requireAdminAuth, requirePermission('inventory'), async (req: Request, res: Response) => {
    try {
        const { jobId, quantity = 1, consumedByName } = req.body;
        const consumedBy = req.session?.adminUserId || 'system';

        if (!jobId) {
            return res.status(400).json({ error: 'jobId is required' });
        }

        const item = await inventoryRepo.getInventoryItem(req.params.id);
        if (!item) {
            return res.status(404).json({ error: 'Inventory item not found' });
        }
        if ((item.stock || 0) < quantity) {
            return res.status(400).json({
                error: `Insufficient stock. Available: ${item.stock}, Requested: ${quantity}`
            });
        }

        // Deduct stock
        const updatedItem = await storage.updateInventoryStock(req.params.id, -quantity);

        // Log as wastage entry tagged as job consumption
        await inventoryService.createWastageLog({
            inventoryItemId: req.params.id,
            quantity,
            reason: `Job consumption: ${jobId}`,
            reportedBy: consumedByName || consumedBy,
            storeId: null,
            cost: Number(item.price) * quantity,
        } as any);

        // Audit log
        await auditLogger.log({
            userId: consumedBy,
            action: 'CONSUME_PART',
            entity: 'InventoryItem',
            entityId: req.params.id,
            details: `Consumed ${quantity}× ${item.name} for job ${jobId}`,
            newValue: { jobId, quantity, remainingStock: updatedItem?.stock },
            req,
        });

        // Phase L — JIT check: notify if stock fell below threshold
        if (updatedItem && item.lowStockThreshold && (updatedItem.stock || 0) <= item.lowStockThreshold) {
            await storage.createNotification({
                userId: 'broadcast',
                title: `⚠️ Low Stock Alert`,
                message: `${item.name} is low (${updatedItem.stock} remaining). Consider reordering.`,
                type: 'low_stock',
                contextType: 'inventory',
            } as any).catch(() => { }); // non-blocking
        }

        res.json({
            success: true,
            partName: item.name,
            partCost: Number(item.price) * quantity,
            remainingStock: updatedItem?.stock,
        });
    } catch (error: any) {
        console.error('[Consume] Error consuming part:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
