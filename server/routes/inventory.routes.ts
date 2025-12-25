/**
 * Inventory Routes
 * 
 * Handles inventory items, products, and shop functionality.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { insertInventoryItemSchema, insertProductSchema } from '../../shared/schema.js';
import { requireAdminAuth } from './middleware/auth.js';

const router = Router();

// ============================================
// Inventory API
// ============================================

/**
 * GET /api/inventory - Get all inventory items
 */
router.get('/api/inventory', async (req: Request, res: Response) => {
    try {
        const items = await storage.getAllInventoryItems();
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch inventory items' });
    }
});

/**
 * GET /api/inventory/:id - Get inventory item by ID
 */
router.get('/api/inventory/:id', async (req: Request, res: Response) => {
    try {
        const item = await storage.getInventoryItem(req.params.id);
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
router.post('/api/inventory', async (req: Request, res: Response) => {
    try {
        const validated = insertInventoryItemSchema.parse(req.body);
        const item = await storage.createInventoryItem(validated);
        res.status(201).json(item);
    } catch (error: any) {
        console.error('Inventory validation error:', error.message);
        res.status(400).json({ error: 'Invalid inventory item data', details: error.message });
    }
});

/**
 * PATCH /api/inventory/:id - Update inventory item
 */
router.patch('/api/inventory/:id', async (req: Request, res: Response) => {
    try {
        const item = await storage.updateInventoryItem(req.params.id, req.body);
        if (!item) {
            return res.status(404).json({ error: 'Inventory item not found' });
        }
        res.json(item);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update inventory item' });
    }
});

/**
 * PATCH /api/inventory/:id/stock - Update inventory stock quantity
 */
router.patch('/api/inventory/:id/stock', async (req: Request, res: Response) => {
    try {
        const { quantity } = req.body;
        if (typeof quantity !== 'number') {
            return res.status(400).json({ error: 'Quantity must be a number' });
        }
        const item = await storage.updateInventoryStock(req.params.id, quantity);
        if (!item) {
            return res.status(404).json({ error: 'Inventory item not found' });
        }
        res.json(item);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update inventory stock' });
    }
});

/**
 * DELETE /api/inventory/:id - Delete inventory item
 */
router.delete('/api/inventory/:id', async (req: Request, res: Response) => {
    try {
        const success = await storage.deleteInventoryItem(req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'Inventory item not found' });
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete inventory item' });
    }
});

/**
 * POST /api/inventory/bulk-import - Bulk import inventory items
 */
router.post('/api/inventory/bulk-import', async (req: Request, res: Response) => {
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
                const id = item.id || `INV-${Date.now()}-${i}`;

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
                });

                await storage.createInventoryItem(validated);
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
router.post('/api/products', async (req: Request, res: Response) => {
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
router.patch('/api/products/:id', async (req: Request, res: Response) => {
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
router.delete('/api/products/:id', async (req: Request, res: Response) => {
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

export default router;
