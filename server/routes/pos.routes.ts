/**
 * POS (Point of Sale) Routes
 * 
 * Handles POS transactions and related operations.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { financeRepo, posRepo, userRepo, inventoryRepo } from '../repositories/index.js';
import { insertPosTransactionSchema } from '../../shared/schema.js';
import { requireAdminAuth, requirePermission } from './middleware/auth.js';
import { auditLogger } from '../utils/auditLogger.js';

const router = Router();

// ============================================
// POS Transactions API
// ============================================

/**
 * GET /api/pos-transactions - Get all POS transactions
 * Requires: Admin auth + pos permission
 */
router.get('/api/pos-transactions', requireAdminAuth, requirePermission('pos'), async (req: Request, res: Response) => {
    try {
        const { page, limit, search, paymentMethod, from, to } = req.query;
        const transactions = await posRepo.getAllPosTransactions({
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
            search: search as string,
            paymentMethod: paymentMethod as string,
            from: from as string,
            to: to as string,
        });
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch POS transactions' });
    }
});

/**
 * GET /api/pos-transactions/summary - Get aggregate POS stats
 * Requires: Admin auth + pos permission
 */
router.get('/api/pos-transactions/summary', requireAdminAuth, requirePermission('pos'), async (req: Request, res: Response) => {
    try {
        const { from, to } = req.query;
        const summary = await posRepo.getPosTransactionSummary({
            from: from as string,
            to: to as string,
        });
        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch POS summary' });
    }
});

/**
 * GET /api/pos-transactions/:id - Get POS transaction by ID
 */
router.get('/api/pos-transactions/:id', async (req: Request, res: Response) => {
    try {
        const transaction = await posRepo.getPosTransaction(req.params.id);
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
 * Requires: Admin auth + process_payment permission (Cashier/Manager/Super Admin)
 */
router.post('/api/pos-transactions', requireAdminAuth, requirePermission('process_payment'), async (req: Request, res: Response) => {
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

        // Parse cart items + linked jobs BEFORE creating the transaction. Doing
        // this after the insert meant malformed JSON threw post-commit, leaving an
        // orphan paid transaction with no inventory/finance side-effects.
        let cartItems: any[] = [];
        let linkedJobs: any[] = [];
        try {
            if (validated.items) cartItems = JSON.parse(validated.items);
            if (validated.linkedJobs) linkedJobs = JSON.parse((validated as any).linkedJobs);
        } catch {
            return res.status(400).json({ error: 'Malformed items or linkedJobs payload' });
        }
        if (!Array.isArray(cartItems)) cartItems = [];
        if (!Array.isArray(linkedJobs)) linkedJobs = [];

        // Server-side stock guard. Frontend validates, but a direct API call or a
        // stale client could oversell — updateInventoryStock silently floors at 0,
        // losing the real count. Reject before creating the transaction.
        for (const item of cartItems) {
            if (item?.id && item?.quantity) {
                const inv = await inventoryRepo.getInventoryItem(item.id);
                // Only enforce for tracked physical stock; non-inventory products
                // (not found) and service items pass through unchanged.
                if (inv && inv.itemType !== 'service' && item.quantity > (inv.stock ?? 0)) {
                    return res.status(409).json({
                        error: `Insufficient stock for "${inv.name}"`,
                        available: inv.stock ?? 0,
                        requested: item.quantity,
                    });
                }
            }
        }

        const transaction = await posRepo.createPosTransaction(validated);

        // Handle Inventory Updates
        for (const item of cartItems) {
            if (item?.id && item?.quantity) {
                await storage.updateInventoryStock(item.id, -item.quantity);
            }
        }

        // Handle Due/Credit Payments
        if (paymentMethod === 'Due' && customer) {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 7);

            await financeRepo.createDueRecord({
                customer: customer,
                amount: validated.total,
                status: 'Pending',
                invoice: transaction.invoiceNumber || transaction.id,
                dueDate: dueDate,
            });
        }
        // Handle Immediate Payments
        else if (['Cash', 'Bank', 'bKash', 'Nagad'].includes(paymentMethod)) {
            await financeRepo.createPettyCashRecord({
                description: `POS Sale - Invoice ${transaction.invoiceNumber || transaction.id}`,
                category: 'Sales',
                amount: validated.total,
                type: 'Income',
            });

            // Update drawer expectedCash for CASH payments only
            if (paymentMethod === 'Cash') {
                const activeDrawer = await posRepo.getActiveDrawer();
                if (activeDrawer) {
                    await posRepo.updateDrawerExpectedCash(activeDrawer.id, validated.total);
                }
            }
        }

        // Handle Linked Jobs
        if (linkedJobs.length > 0) {
            for (const job of linkedJobs) {
                if (job.jobId) {
                    const existingJob = await storage.getJobTicket(job.jobId);
                    if (existingJob && existingJob.status !== 'Completed') {
                        await storage.updateJobTicket(job.jobId, { status: 'Completed' });

                        // Audit Log for job completion via POS
                        await auditLogger.log({
                            userId: req.session?.adminUserId || 'system',
                            action: 'STATUS_CHANGE_TO_COMPLETED',
                            entity: 'JobTicket',
                            entityId: job.jobId,
                            details: `Job marked as completed via POS transaction ${transaction.invoiceNumber || transaction.id}`,
                            oldValue: { status: existingJob.status },
                            newValue: { status: 'Completed' },
                            req: req
                        });
                    }
                }
            }
        }

        res.status(201).json(transaction);
    } catch (error: any) {
        // Zod validation = client error (400). Anything else (DB, runtime) is a
        // 500 — masking it as 400 hid real server failures.
        if (error?.name === 'ZodError') {
            return res.status(400).json({ error: 'Invalid POS transaction data', details: error.errors });
        }
        console.error('[POS] transaction failed:', error?.message || error);
        res.status(500).json({ error: 'Failed to create POS transaction', details: { message: error?.message } });
    }
});

export default router;
