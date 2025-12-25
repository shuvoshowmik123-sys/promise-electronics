/**
 * POS (Point of Sale) Routes
 * 
 * Handles POS transactions and related operations.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { insertPosTransactionSchema } from '../../shared/schema.js';

const router = Router();

// ============================================
// POS Transactions API
// ============================================

/**
 * GET /api/pos-transactions - Get all POS transactions
 */
router.get('/api/pos-transactions', async (req: Request, res: Response) => {
    try {
        const transactions = await storage.getAllPosTransactions();
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch POS transactions' });
    }
});

/**
 * GET /api/pos-transactions/:id - Get POS transaction by ID
 */
router.get('/api/pos-transactions/:id', async (req: Request, res: Response) => {
    try {
        const transaction = await storage.getPosTransaction(req.params.id);
        if (!transaction) {
            return res.status(404).json({ error: 'POS transaction not found' });
        }
        res.json(transaction);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch POS transaction' });
    }
});

/**
 * POST /api/pos-transactions - Create POS transaction
 */
router.post('/api/pos-transactions', async (req: Request, res: Response) => {
    try {
        const validated = insertPosTransactionSchema.parse(req.body);

        const paymentMethod = (validated as any).paymentMethod;
        const customer = validated.customer;

        if (paymentMethod === 'Due' && (!customer || !customer.trim())) {
            return res.status(400).json({ error: 'Customer name is required for Due/Credit payments' });
        }

        const validPaymentMethods = ['Cash', 'Bank', 'bKash', 'Nagad', 'Due'];
        if (!validPaymentMethods.includes(paymentMethod)) {
            return res.status(400).json({ error: 'Invalid payment method' });
        }

        const transaction = await storage.createPosTransaction(validated);

        // Handle Inventory Updates
        if (validated.items) {
            const items = JSON.parse(validated.items);
            for (const item of items) {
                if (item.id && item.quantity) {
                    await storage.updateInventoryStock(item.id, -item.quantity);
                }
            }
        }

        // Handle Due/Credit Payments
        if (paymentMethod === 'Due' && customer) {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 7);

            await storage.createDueRecord({
                customer: customer,
                amount: validated.total,
                status: 'Pending',
                invoice: transaction.invoiceNumber || transaction.id,
                dueDate: dueDate,
            });
        }
        // Handle Immediate Payments
        else if (['Cash', 'Bank', 'bKash', 'Nagad'].includes(paymentMethod)) {
            await storage.createPettyCashRecord({
                description: `POS Sale - Invoice ${transaction.invoiceNumber || transaction.id}`,
                category: 'Sales',
                amount: validated.total,
                type: 'Income',
            });
        }

        // Handle Linked Jobs
        if (validated.linkedJobs) {
            const linkedJobs = JSON.parse(validated.linkedJobs);
            for (const job of linkedJobs) {
                if (job.jobId) {
                    await storage.updateJobTicket(job.jobId, { status: 'Completed' });
                }
            }
        }

        res.status(201).json(transaction);
    } catch (error) {
        res.status(400).json({ error: 'Invalid POS transaction data', details: { message: (error as any).message } });
    }
});

export default router;
