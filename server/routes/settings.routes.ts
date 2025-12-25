/**
 * Settings Routes
 * 
 * Handles settings, service catalog, service categories, and policies.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import {
    insertSettingSchema,
    insertServiceCatalogSchema,
    insertProductVariantSchema
} from '../../shared/schema.js';
import { requireAdminAuth } from './middleware/auth.js';

const router = Router();

// ============================================
// Settings API
// ============================================

/**
 * GET /api/settings - Get all settings
 */
router.get('/api/settings', async (req: Request, res: Response) => {
    try {
        const settings = await storage.getAllSettings();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

/**
 * GET /api/settings/:key - Get setting by key
 */
router.get('/api/settings/:key', async (req: Request, res: Response) => {
    try {
        const setting = await storage.getSetting(req.params.key);
        if (!setting) {
            return res.status(404).json({ error: 'Setting not found' });
        }
        res.json(setting);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch setting' });
    }
});

/**
 * POST /api/settings - Create/update setting
 */
router.post('/api/settings', async (req: Request, res: Response) => {
    try {
        const validated = insertSettingSchema.parse(req.body);
        const setting = await storage.upsertSetting(validated);
        res.json(setting);
    } catch (error) {
        res.status(400).json({ error: 'Invalid setting data' });
    }
});

// ============================================
// Service Catalog API
// ============================================

/**
 * GET /api/services - Get all active services (public)
 */
router.get('/api/services', async (req: Request, res: Response) => {
    try {
        const inventoryServices = await storage.getActiveServicesFromInventory();
        const services = inventoryServices.map(item => ({
            id: item.id,
            name: item.name,
            description: item.description || '',
            category: item.category,
            icon: item.icon || 'Wrench',
            minPrice: item.minPrice || item.price,
            maxPrice: item.maxPrice || item.price,
            estimatedDays: item.estimatedDays || '3-5 days',
            isActive: item.showOnWebsite,
            displayOrder: item.displayOrder || 0,
            images: item.images,
            features: item.features,
        }));
        res.json(services);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch services' });
    }
});

/**
 * GET /api/services/:id - Get single service
 */
router.get('/api/services/:id', async (req: Request, res: Response) => {
    try {
        const item = await storage.getInventoryItem(req.params.id);
        if (!item || item.itemType !== 'service') {
            return res.status(404).json({ error: 'Service not found' });
        }
        const service = {
            id: item.id,
            name: item.name,
            description: item.description || '',
            category: item.category,
            icon: item.icon || 'Wrench',
            minPrice: item.minPrice || item.price,
            maxPrice: item.maxPrice || item.price,
            estimatedDays: item.estimatedDays || '3-5 days',
            isActive: item.showOnWebsite,
            displayOrder: item.displayOrder || 0,
            images: item.images,
            features: item.features,
        };
        res.json(service);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch service' });
    }
});

/**
 * GET /api/admin/services - Get all services (admin)
 */
router.get('/api/admin/services', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const inventoryServices = await storage.getServicesFromInventory();
        const services = inventoryServices.map(item => ({
            id: item.id,
            name: item.name,
            description: item.description || '',
            category: item.category,
            icon: item.icon || 'Wrench',
            minPrice: item.minPrice || item.price,
            maxPrice: item.maxPrice || item.price,
            estimatedDays: item.estimatedDays || '3-5 days',
            isActive: item.showOnWebsite,
            displayOrder: item.displayOrder || 0,
            images: item.images,
            features: item.features,
        }));
        res.json(services);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch services' });
    }
});

/**
 * POST /api/admin/services - Create service
 */
router.post('/api/admin/services', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const validated = insertServiceCatalogSchema.parse(req.body);
        const service = await storage.createServiceCatalogItem(validated);
        res.status(201).json(service);
    } catch (error: any) {
        console.error('Service creation error:', error);
        res.status(400).json({ error: 'Invalid service data', details: error.message });
    }
});

/**
 * PATCH /api/admin/services/:id - Update service
 */
router.patch('/api/admin/services/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const service = await storage.updateServiceCatalogItem(req.params.id, req.body);
        if (!service) {
            return res.status(404).json({ error: 'Service not found' });
        }
        res.json(service);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update service' });
    }
});

/**
 * DELETE /api/admin/services/:id - Delete service
 */
router.delete('/api/admin/services/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const success = await storage.deleteServiceCatalogItem(req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'Service not found' });
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete service' });
    }
});

// ============================================
// Service Categories API
// ============================================

/**
 * GET /api/service-categories - Get all service categories
 */
router.get('/api/service-categories', async (req: Request, res: Response) => {
    try {
        const categories = await storage.getAllServiceCategories();
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch service categories' });
    }
});

/**
 * POST /api/admin/service-categories - Create service category
 */
router.post('/api/admin/service-categories', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { name, displayOrder } = req.body;
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ error: 'Category name is required' });
        }
        const category = await storage.createServiceCategory({
            name: name.trim(),
            displayOrder: displayOrder || 0
        });
        res.status(201).json(category);
    } catch (error: any) {
        if (error.message?.includes('unique')) {
            return res.status(400).json({ error: 'Category name already exists' });
        }
        console.error('Service category creation error:', error);
        res.status(500).json({ error: 'Failed to create service category' });
    }
});

/**
 * PATCH /api/admin/service-categories/:id - Update service category
 */
router.patch('/api/admin/service-categories/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const category = await storage.updateServiceCategory(req.params.id, req.body);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        res.json(category);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update service category' });
    }
});

/**
 * DELETE /api/admin/service-categories/:id - Delete service category
 */
router.delete('/api/admin/service-categories/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const success = await storage.deleteServiceCategory(req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'Category not found' });
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete service category' });
    }
});

// ============================================
// Product Variants API
// ============================================

/**
 * GET /api/products/:productId/variants - Get product variants
 */
router.get('/api/products/:productId/variants', async (req: Request, res: Response) => {
    try {
        const variants = await storage.getProductVariants(req.params.productId);
        res.json(variants);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch product variants' });
    }
});

/**
 * POST /api/admin/products/:productId/variants - Create product variant
 */
router.post('/api/admin/products/:productId/variants', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const validated = insertProductVariantSchema.parse({
            ...req.body,
            productId: req.params.productId,
        });
        const variant = await storage.createProductVariant(validated);
        res.status(201).json(variant);
    } catch (error: any) {
        console.error('Variant creation error:', error);
        res.status(400).json({ error: 'Invalid variant data', details: error.message });
    }
});

/**
 * PATCH /api/admin/products/:productId/variants/:variantId - Update product variant
 */
router.patch('/api/admin/products/:productId/variants/:variantId', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const variant = await storage.updateProductVariant(req.params.variantId, req.body);
        if (!variant) {
            return res.status(404).json({ error: 'Variant not found' });
        }
        res.json(variant);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update variant' });
    }
});

/**
 * DELETE /api/admin/products/:productId/variants/:variantId - Delete product variant
 */
router.delete('/api/admin/products/:productId/variants/:variantId', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const success = await storage.deleteProductVariant(req.params.variantId);
        if (!success) {
            return res.status(404).json({ error: 'Variant not found' });
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete variant' });
    }
});

/**
 * DELETE /api/admin/products/:productId/variants - Delete all product variants
 */
router.delete('/api/admin/products/:productId/variants', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        await storage.deleteProductVariantsByProductId(req.params.productId);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete variants' });
    }
});

// ============================================
// Policies API
// ============================================

const validPolicySlugs = ['privacy', 'warranty', 'terms'] as const;

/**
 * GET /api/policies/:slug - Get published policy (public)
 */
router.get('/api/policies/:slug', async (req: Request, res: Response) => {
    try {
        const { slug } = req.params;
        if (!validPolicySlugs.includes(slug as any)) {
            return res.status(400).json({ error: 'Invalid policy slug. Must be one of: privacy, warranty, terms' });
        }
        const policy = await storage.getPolicyBySlug(slug);
        if (!policy || !policy.isPublished) {
            return res.status(404).json({ error: 'Policy not found' });
        }
        res.json(policy);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch policy' });
    }
});

/**
 * GET /api/admin/policies - Get all policies (admin)
 */
router.get('/api/admin/policies', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const policies = await storage.getAllPolicies();
        res.json(policies);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch policies' });
    }
});

/**
 * GET /api/admin/policies/:slug - Get policy by slug (admin)
 */
router.get('/api/admin/policies/:slug', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { slug } = req.params;
        if (!validPolicySlugs.includes(slug as any)) {
            return res.status(400).json({ error: 'Invalid policy slug. Must be one of: privacy, warranty, terms' });
        }
        const policy = await storage.getPolicyBySlug(slug);
        if (!policy) {
            return res.status(404).json({ error: 'Policy not found' });
        }
        res.json(policy);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch policy' });
    }
});

/**
 * POST /api/admin/policies - Create/update policy (admin)
 */
router.post('/api/admin/policies', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { slug, title, content, isPublished } = req.body;
        if (!slug || !validPolicySlugs.includes(slug)) {
            return res.status(400).json({ error: 'Invalid policy slug. Must be one of: privacy, warranty, terms' });
        }
        if (!title || typeof title !== 'string') {
            return res.status(400).json({ error: 'Title is required' });
        }
        if (!content || typeof content !== 'string') {
            return res.status(400).json({ error: 'Content is required' });
        }
        const policy = await storage.upsertPolicy({
            slug,
            title,
            content,
            isPublished: isPublished !== false,
        });
        res.status(201).json(policy);
    } catch (error) {
        res.status(500).json({ error: 'Failed to save policy' });
    }
});

/**
 * DELETE /api/admin/policies/:slug - Delete policy (admin)
 */
router.delete('/api/admin/policies/:slug', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { slug } = req.params;
        if (!validPolicySlugs.includes(slug as any)) {
            return res.status(400).json({ error: 'Invalid policy slug. Must be one of: privacy, warranty, terms' });
        }
        const success = await storage.deletePolicy(slug);
        if (!success) {
            return res.status(404).json({ error: 'Policy not found' });
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete policy' });
    }
});

// ============================================
// Admin Data Management
// ============================================

import { requireSuperAdmin } from './middleware/auth.js';

/**
 * DELETE /api/admin/data/all - Delete all business data (Super Admin only)
 */
router.delete('/api/admin/data/all', requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const { confirmation } = req.body;

        if (confirmation !== 'DELETE ALL') {
            return res.status(400).json({
                error: "Confirmation required. Send { confirmation: 'DELETE ALL' } to proceed."
            });
        }

        const result = await storage.deleteAllBusinessData();

        console.log('All business data deleted by Super Admin. Counts:', result.deletedCounts);

        res.json({
            success: true,
            message: 'All business data has been deleted successfully.',
            deletedCounts: result.deletedCounts
        });
    } catch (error: any) {
        console.error('Error deleting all data:', error);
        res.status(500).json({ error: 'Failed to delete data', details: error.message });
    }
});

export default router;
