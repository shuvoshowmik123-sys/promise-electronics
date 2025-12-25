/**
 * Finance Routes
 * 
 * Handles petty cash, due records, and financial operations.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { insertPettyCashRecordSchema } from '../../shared/schema.js';
import { requireAdminAuth } from './middleware/auth.js';

const router = Router();

// ============================================
// Petty Cash API
// ============================================

/**
 * GET /api/petty-cash - Get all petty cash records
 */
router.get('/api/petty-cash', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const records = await storage.getAllPettyCashRecords();
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch petty cash records' });
    }
});

/**
 * POST /api/petty-cash - Create petty cash record
 */
router.post('/api/petty-cash', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const validated = insertPettyCashRecordSchema.parse(req.body);
        const record = await storage.createPettyCashRecord(validated);
        res.status(201).json(record);
    } catch (error) {
        res.status(400).json({ error: 'Invalid petty cash data' });
    }
});

/**
 * DELETE /api/petty-cash/:id - Delete petty cash record
 */
router.delete('/api/petty-cash/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const success = await storage.deletePettyCashRecord(req.params.id);
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
router.get('/api/due-records', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const records = await storage.getAllDueRecords();
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch due records' });
    }
});

/**
 * PATCH /api/due-records/:id - Update due record (partial payment)
 */
router.patch('/api/due-records/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { paymentAmount, paymentMethod } = req.body;
        const id = req.params.id;

        const dueRecord = await storage.getDueRecord(id);
        if (!dueRecord) {
            return res.status(404).json({ error: 'Due record not found' });
        }

        const currentPaid = Number(dueRecord.paidAmount || 0);
        const totalAmount = Number(dueRecord.amount);
        const payment = Number(paymentAmount);

        if (isNaN(payment) || payment <= 0) {
            return res.status(400).json({ error: 'Invalid payment amount' });
        }

        if (currentPaid + payment > totalAmount) {
            return res.status(400).json({ error: 'Payment exceeds due amount' });
        }

        const newPaidAmount = currentPaid + payment;
        const newStatus = newPaidAmount >= totalAmount ? 'Paid' : 'Pending';

        const updatedRecord = await storage.updateDueRecord(id, {
            paidAmount: newPaidAmount,
            status: newStatus,
        });

        // If fully paid, update the linked POS transaction status
        if (newStatus === 'Paid' && dueRecord.invoice) {
            await storage.updatePosTransactionStatusByInvoice(dueRecord.invoice, 'Paid');
        }

        // Create Petty Cash Record for the payment
        if (paymentMethod && ['Cash', 'Bank', 'bKash', 'Nagad'].includes(paymentMethod)) {
            await storage.createPettyCashRecord({
                description: `Due Payment - ${dueRecord.customer} - Invoice ${dueRecord.invoice}`,
                category: 'Due Collection',
                amount: payment,
                type: paymentMethod,
                dueRecordId: id,
            });
        }

        res.json(updatedRecord);
    } catch (error) {
        console.error('Failed to update due record:', error);
        res.status(500).json({ error: 'Failed to update due record' });
    }
});

export default router;
