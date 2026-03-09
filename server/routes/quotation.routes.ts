import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { eq, desc, and } from 'drizzle-orm';
import {
    quotations,
    quotationItems,
    insertQuotationSchema,
    insertQuotationItemSchema
} from '../../shared/schema.js';
import { requireAdminAuth, requirePermission } from './middleware/auth.js';
import { z, ZodError } from 'zod';
import { nanoid } from 'nanoid';
import { auditLogger } from '../utils/auditLogger.js';

const router = Router();

// ============================================
// Quotations API
// ============================================

/**
 * GET /api/admin/quotations
 * List all quotations (with items)
 */
router.get('/api/admin/quotations', requireAdminAuth, requirePermission('quotations'), async (req: Request, res: Response) => {
    try {
        const allQuotations = await db.query.quotations.findMany({
            orderBy: [desc(quotations.createdAt)],
            with: {
                // If relationships were defined, we could use them here.
                // Since they aren't explicitly defined in Drizzle relations yet,
                // we'll fetch items manually or return just headers if items aren't needed for the list.
            }
        });

        res.json(allQuotations);
    } catch (error) {
        console.error('Error fetching quotations:', error);
        res.status(500).json({ error: 'Failed to fetch quotations' });
    }
});

/**
 * GET /api/admin/quotations/:id
 * Get single quotation with items
 */
router.get('/api/admin/quotations/:id', requireAdminAuth, requirePermission('quotations'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const quotation = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1);

        if (!quotation.length) {
            return res.status(404).json({ error: 'Quotation not found' });
        }

        const items = await db.select().from(quotationItems).where(eq(quotationItems.quotationId, id));

        res.json({ ...quotation[0], items });
    } catch (error) {
        console.error('Error fetching quotation:', error);
        res.status(500).json({ error: 'Failed to fetch quotation details' });
    }
});

/**
 * GET /api/admin/quotations/by-customer/:customerId
 * Get quotations for a specific customer
 */
router.get('/api/admin/quotations/by-customer/:customerId', requireAdminAuth, requirePermission('quotations'), async (req: Request, res: Response) => {
    try {
        const { customerId } = req.params;
        const custQuotations = await db.select()
            .from(quotations)
            .where(eq(quotations.customerId, customerId))
            .orderBy(desc(quotations.createdAt));

        res.json(custQuotations);
    } catch (error) {
        console.error('Error fetching customer quotations:', error);
        res.status(500).json({ error: 'Failed to fetch customer quotations' });
    }
});

/**
 * POST /api/admin/quotations
 * Create a new quotation
 */
router.post('/api/admin/quotations', requireAdminAuth, requirePermission('quotations'), async (req: Request, res: Response) => {
    try {
        const { items, ...headerData } = req.body;

        // Auto-generate ID and Date if not provided
        const quotationId = nanoid();

        // Auto-generate quotation number if not provided
        // We can do a simple count or use a timestamp
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const quotationNumber = headerData.quotationNumber || `QTN-${new Date().getFullYear()}${new Date().getMonth() + 1}-${randomNum}`;

        const validatedHeader = insertQuotationSchema.parse({
            ...headerData,
            validUntil: headerData.validUntil ? new Date(headerData.validUntil) : null,
            quotationNumber,
            // Extract from user session
            createdBy: (req as any).user?.id || 'system',
            createdByName: (req as any).user?.name || 'System User',
        });

        // Use transaction to ensure both header and items are created
        await db.transaction(async (tx) => {
            await tx.insert(quotations).values({ ...validatedHeader, id: quotationId });

            if (items && Array.isArray(items) && items.length > 0) {
                const validatedItems = items.map((item, index) => {
                    const parsed = insertQuotationItemSchema.parse({
                        ...item,
                        quotationId: quotationId,
                        sortOrder: item.sortOrder ?? index,
                    });
                    return { ...parsed, id: nanoid() };
                });
                await tx.insert(quotationItems).values(validatedItems);
            }
        });

        await auditLogger.log({
            userId: (req as any).user?.id?.toString() || 'system',
            action: 'CREATE',
            entity: 'QUOTATION',
            entityId: quotationId,
            details: `Created quotation ${quotationNumber} for ${validatedHeader.customerName}`,
            req
        });

        res.status(201).json({ id: quotationId, quotationNumber });
    } catch (error: any) {
        console.error('Error creating quotation:', error instanceof Error ? error.stack || String(error) : String(error));
        if (error instanceof ZodError) {
            return res.status(400).json({ error: 'Validation failed', details: error.errors });
        }
        res.status(400).json({ error: 'Failed to create quotation', details: error.message });
    }
});

/**
 * PATCH /api/admin/quotations/:id
 * Update quotation header and items
 */
router.patch('/api/admin/quotations/:id', requireAdminAuth, requirePermission('quotations'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { items, ...headerUpdates } = req.body;

        const existing = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1);
        if (!existing.length) {
            return res.status(404).json({ error: 'Quotation not found' });
        }

        await db.transaction(async (tx) => {
            // Update header
            if (Object.keys(headerUpdates).length > 0) {
                const updatesToApply = { ...headerUpdates, updatedAt: new Date() };
                if (updatesToApply.validUntil) {
                    updatesToApply.validUntil = new Date(updatesToApply.validUntil);
                }
                await tx.update(quotations)
                    .set(updatesToApply)
                    .where(eq(quotations.id, id));
            }

            // Sync items (delete existing, then insert new)
            if (items !== undefined) {
                await tx.delete(quotationItems).where(eq(quotationItems.quotationId, id));

                if (Array.isArray(items) && items.length > 0) {
                    const validatedItems = items.map((item, index) => {
                        const parsed = insertQuotationItemSchema.parse({
                            ...item,
                            quotationId: id,
                            sortOrder: item.sortOrder ?? index,
                        });
                        return { ...parsed, id: nanoid() };
                    });
                    await tx.insert(quotationItems).values(validatedItems);
                }
            }
        });

        await auditLogger.log({
            userId: (req as any).user?.id?.toString() || 'system',
            action: 'UPDATE',
            entity: 'QUOTATION',
            entityId: id,
            details: `Updated quotation ${existing[0].quotationNumber}`,
            req
        });

        res.json({ success: true, id });
    } catch (error: any) {
        console.error('Error updating quotation:', error instanceof Error ? error.stack || String(error) : String(error));
        if (error instanceof ZodError) {
            return res.status(400).json({ error: 'Validation failed', details: error.errors });
        }
        res.status(400).json({ error: 'Failed to update quotation', details: error.message });
    }
});

/**
 * DELETE /api/admin/quotations/:id
 * Delete a quotation
 */
router.delete('/api/admin/quotations/:id', requireAdminAuth, requirePermission('quotations'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        await db.transaction(async (tx) => {
            await tx.delete(quotationItems).where(eq(quotationItems.quotationId, id));
            await tx.delete(quotations).where(eq(quotations.id, id));
        });

        await auditLogger.log({
            userId: (req as any).user?.id?.toString() || 'system',
            action: 'DELETE',
            entity: 'QUOTATION',
            entityId: id,
            details: `Deleted quotation`,
            req
        });

        res.status(204).send();
    } catch (error) {
        console.error('Error deleting quotation:', error);
        res.status(500).json({ error: 'Failed to delete quotation' });
    }
});

/**
 * PATCH /api/admin/quotations/:id/status
 * Update quotation status only
 */
router.patch('/api/admin/quotations/:id/status', requireAdminAuth, requirePermission('quotations'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }

        const result = await db.update(quotations)
            .set({ status, updatedAt: new Date() })
            .where(eq(quotations.id, id))
            .returning();

        if (!result.length) {
            return res.status(404).json({ error: 'Quotation not found' });
        }

        await auditLogger.log({
            userId: (req as any).user?.id?.toString() || 'system',
            action: 'UPDATE_STATUS',
            entity: 'QUOTATION',
            entityId: id,
            details: `Changed quotation status to ${status}`,
            req
        });

        res.json(result[0]);
    } catch (error) {
        console.error('Error updating quotation status:', error);
        res.status(500).json({ error: 'Failed to update quotation status' });
    }
});

export default router;
