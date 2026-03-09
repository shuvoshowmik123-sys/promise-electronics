/**
 * Finance Routes
 * 
 * Handles petty cash, due records, and financial operations.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { financeRepo, posRepo, userRepo } from '../repositories/index.js';
import { insertPettyCashRecordSchema } from '../../shared/schema.js';
import { requireAdminAuth, requirePermission } from './middleware/auth.js';
import { financeService } from '../services/finance.service.js';

const router = Router();

// ============================================
// Petty Cash API
// ============================================

/**
 * GET /api/petty-cash - Get all petty cash records
 * Requires: Admin auth + finance permission (view_financials)
 */
router.get('/api/petty-cash', requireAdminAuth, requirePermission('finance'), async (req: Request, res: Response) => {
    try {
        const { page, limit, search, from, to, type } = req.query;
        const records = await financeRepo.getAllPettyCashRecords({
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
            search: search as string,
            from: from as string,
            to: to as string,
            type: type as string,
        });
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch petty cash records' });
    }
});

/**
 * GET /api/petty-cash/summary - Get aggregate petty cash stats
 */
router.get('/api/petty-cash/summary', requireAdminAuth, requirePermission('finance'), async (req: Request, res: Response) => {
    try {
        const { from, to } = req.query;
        const summary = await financeRepo.getPettyCashSummary({
            from: from as string,
            to: to as string,
        });
        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch petty cash summary' });
    }
});

/**
 * POST /api/petty-cash - Create petty cash record
 * Requires: Admin auth + finance permission
 */
router.post('/api/petty-cash', requireAdminAuth, requirePermission('finance'), async (req: Request, res: Response) => {
    try {
        const validated = insertPettyCashRecordSchema.parse(req.body);
        const record = await financeRepo.createPettyCashRecord(validated);

        // If this is an Expense, subtract from active drawer expectedCash
        if (validated.type === 'Expense') {
            const activeDrawer = await posRepo.getActiveDrawer();
            if (activeDrawer) {
                await posRepo.updateDrawerExpectedCash(activeDrawer.id, -validated.amount);
            }
        }

        res.status(201).json(record);
    } catch (error) {
        res.status(400).json({ error: 'Invalid petty cash data' });
    }
});

/**
 * DELETE /api/petty-cash/:id - Delete petty cash record
 * Requires: Admin auth + finance permission
 */
router.delete('/api/petty-cash/:id', requireAdminAuth, requirePermission('finance'), async (req: Request, res: Response) => {
    try {
        const success = await financeRepo.deletePettyCashRecord(req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'Record not found' });
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete record' });
    }
});

// ============================================
// Due Records API
// ============================================

/**
 * GET /api/due-records - Get all due records
 */
router.get('/api/due-records', requirePermission('finance'), async (req: Request, res: Response) => {
    try {
        const { page, limit, search, status, from, to } = req.query;
        const records = await financeRepo.getAllDueRecords({
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
            search: search as string,
            status: status as string,
            from: from as string,
            to: to as string,
        });
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch due records' });
    }
});

/**
 * GET /api/due-records/summary - Get aggregate due record stats
 */
router.get('/api/due-records/summary', requirePermission('finance'), async (req: Request, res: Response) => {
    try {
        const { from, to } = req.query;
        const summary = await financeRepo.getDueSummary({
            from: from as string,
            to: to as string,
        });
        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch due records summary' });
    }
});

/**
 * PATCH /api/due-records/:id - Update due record (partial payment)
 * Requires: Admin auth + process_payment permission (Cashier/Manager/Super Admin)
 */
router.patch('/api/due-records/:id', requireAdminAuth, requirePermission('process_payment'), async (req: Request, res: Response) => {
    try {
        const { paymentAmount, paymentMethod } = req.body;
        const id = req.params.id;

        const dueRecord = await financeRepo.getDueRecord(id);
        if (!dueRecord) {
            return res.status(404).json({ error: 'Due record not found' });
        }

        const updatedRecord = await financeService.recordDuePayment(id, Number(paymentAmount), paymentMethod);

        res.json(updatedRecord);
    } catch (error) {
        console.error('Failed to update due record:', error);
        res.status(500).json({ error: 'Failed to update due record' });
    }
});

export default router;
