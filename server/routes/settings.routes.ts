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
// Mobile App Settings API (Public for Flutter app)
// ============================================

/**
 * GET /api/mobile/settings - Get all mobile app settings (public)
 * Returns settings keyed by mobile_ prefix as a configuration object
 */
router.get('/api/mobile/settings', async (req: Request, res: Response) => {
    try {
        const allSettings = await storage.getAllSettings();

        // Filter and transform mobile-specific settings
        const mobileSettings: Record<string, any> = {};

        // Default values for mobile settings
        const defaults: Record<string, any> = {
            mobile_hero_slides: JSON.stringify([
                {
                    title1: "Your TV,",
                    title2: "Our Care.",
                    subtitle: "Expert repairs at your doorstep.",
                    image: "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=400"
                },
                {
                    title1: "Fast &",
                    title2: "Reliable.",
                    subtitle: "Same-day service available.",
                    image: "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=400"
                },
                {
                    title1: "Quality",
                    title2: "Parts Only.",
                    subtitle: "Genuine components guaranteed.",
                    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400"
                }
            ]),
            mobile_banner_enabled: "false",
            mobile_banner_text: "",
            mobile_banner_type: "info",
            mobile_banner_link: "none",
            mobile_popup_enabled: "false",
            mobile_popup_image: "",
            mobile_popup_title: "",
            mobile_popup_description: "",
            mobile_popup_button_text: "Learn More",
            mobile_popup_button_link: "none",
            mobile_popup_show_once: "true",
            mobile_maintenance_mode: "false",
            mobile_maintenance_message: "We're updating our systems. Please check back soon.",
            mobile_min_version: "1.0.0",
            mobile_contact_phone: "",
            mobile_contact_whatsapp: "",
            mobile_contact_address: "",
            mobile_business_hours: ""
        };

        // Start with defaults
        Object.entries(defaults).forEach(([key, value]) => {
            const settingKey = key.replace('mobile_', '');
            mobileSettings[settingKey] = value;
        });

        // Override with actual database values
        allSettings.forEach(setting => {
            if (setting.key.startsWith('mobile_')) {
                const settingKey = setting.key.replace('mobile_', '');
                mobileSettings[settingKey] = setting.value;
            }
        });

        // Parse JSON values
        try {
            if (mobileSettings.hero_slides) {
                mobileSettings.hero_slides = JSON.parse(mobileSettings.hero_slides);
            }
        } catch {
            // Keep as string if parsing fails
        }

        // Convert boolean strings to actual booleans
        ['banner_enabled', 'popup_enabled', 'popup_show_once', 'maintenance_mode'].forEach(key => {
            if (mobileSettings[key] === 'true') mobileSettings[key] = true;
            else if (mobileSettings[key] === 'false') mobileSettings[key] = false;
        });

        res.json(mobileSettings);
    } catch (error) {
        console.error('Error fetching mobile settings:', error);
        res.status(500).json({ error: 'Failed to fetch mobile settings' });
    }
});

/**
 * GET /api/mobile/inventory - Get inventory items visible on Android app
 */
router.get('/api/mobile/inventory', async (req: Request, res: Response) => {
    try {
        const items = await storage.getInventoryItemsForAndroidApp();
        res.json(items);
    } catch (error) {
        console.error('Error fetching mobile inventory:', error);
        res.status(500).json({ error: 'Failed to fetch inventory' });
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
 * GET /api/mobile/policies/:slug - Get published policy for mobile app
 */
router.get('/api/mobile/policies/:slug', async (req: Request, res: Response) => {
    try {
        const { slug } = req.params;
        if (!validPolicySlugs.includes(slug as any)) {
            return res.status(400).json({ error: 'Invalid policy slug. Must be one of: privacy, warranty, terms' });
        }
        const policy = await storage.getPolicyBySlug(slug);
        if (!policy || !policy.isPublishedApp) {
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
        const { slug, title, content, isPublished, isPublishedApp } = req.body;
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
            isPublishedApp: isPublishedApp !== false,
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
