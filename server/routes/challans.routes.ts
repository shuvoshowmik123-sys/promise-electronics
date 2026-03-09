/**
 * Challans Routes
 * 
 * Handles challan CRUD operations.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { financeRepo, posRepo, userRepo } from '../repositories/index.js';
import { insertChallanSchema } from '../../shared/schema.js';
import { requireAdminAuth } from './middleware/auth.js';

const router = Router();

// Secure challans routes (Admin only)
router.use('/api/challans', requireAdminAuth);

// ============================================
// Challans API
// ============================================

/**
 * GET /api/challans - Get all challans
 */
router.get('/api/challans', async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const result = await financeRepo.getAllChallans();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch challans' });
    }
});

/**
 * GET /api/challans/:id - Get challan by ID
 */
router.get('/api/challans/:id', async (req: Request, res: Response) => {
    try {
        const challan = await financeRepo.getChallan(req.params.id);
        if (!challan) {
            return res.status(404).json({ error: 'Challan not found' });
        }
        res.json(challan);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch challan' });
    }
});

/**
 * POST /api/challans - Create challan
 */
router.post('/api/challans', async (req: Request, res: Response) => {
    try {
        const validated = insertChallanSchema.parse(req.body);
        const challan = await financeRepo.createChallan(validated);
        res.status(201).json(challan);
    } catch (error) {
        res.status(400).json({ error: 'Invalid challan data' });
    }
});

/**
 * PATCH /api/challans/:id - Update challan
 */
router.patch('/api/challans/:id', async (req: Request, res: Response) => {
    try {
        const challan = await financeRepo.updateChallan(req.params.id, req.body);
        if (!challan) {
            return res.status(404).json({ error: 'Challan not found' });
        }
        res.json(challan);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update challan' });
    }
});

/**
 * DELETE /api/challans/:id - Delete challan
 */
router.delete('/api/challans/:id', async (req: Request, res: Response) => {
    try {
        const success = await financeRepo.deleteChallan(req.params.id);
        if (!success) {
            return res.status(404).json({ error: 'Challan not found' });
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete challan' });
    }
});

export default router;
