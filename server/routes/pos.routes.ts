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
import { repairJourneyService } from '../services/customer-repair-journey.service.js';
import { jobService } from '../services/job.service.js';
import { jobRepo } from '../repositories/index.js';
import { getActiveServiceAreaById } from '../repositories/service-area.repository.js';

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
router.get('/api/pos-transactions/:id', requireAdminAuth, requirePermission('pos'), async (req: Request, res: Response) => {
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

        // Map-03A Fix 2: load linked jobs FIRST, then resolve area.
        // Client-supplied serviceAreaId is only validated for standalone POS (no linked jobs).
        // When linked retail jobs exist the client area is completely ignored and overridden
        // by the first linked job that has a serviceAreaId.
        const linkedJobAllocations: Array<{ job: any; billedAmount: number }> = [];
        for (const linked of linkedJobs) {
            const billedAmount = Number(linked?.billedAmount);
            if (!linked?.jobId || !Number.isFinite(billedAmount) || billedAmount < 0) {
                return res.status(400).json({ error: 'Each linked job requires a valid non-negative billed amount.' });
            }
            const existingJob = await storage.getJobTicket(linked.jobId);
            if (!existingJob) return res.status(400).json({ error: 'A linked job does not exist.' });
            if (existingJob.corporateClientId || existingJob.corporateChallanId) {
                return res.status(400).json({ error: 'Corporate jobs cannot be billed through retail POS area analytics.' });
            }
            linkedJobAllocations.push({ job: existingJob, billedAmount });
        }
        const linkedBilledTotal = linkedJobAllocations.reduce((sum, allocation) => sum + allocation.billedAmount, 0);
        if (linkedBilledTotal > Number(validated.total) + 0.01) {
            return res.status(400).json({ error: 'Linked job billed amounts cannot exceed the transaction total.' });
        }

        if (linkedJobAllocations.length > 0) {
            // Linked retail jobs: derive area from first job that has one, ignore client area entirely.
            const jobWithArea = linkedJobAllocations.find(({ job }) => Boolean(job.serviceAreaId));
            (validated as any).serviceAreaId = jobWithArea ? jobWithArea.job.serviceAreaId : null;
        } else {
            // Standalone POS: validate client-supplied serviceAreaId.
            if ((validated as any).serviceAreaId && !await getActiveServiceAreaById((validated as any).serviceAreaId)) {
                return res.status(400).json({ error: 'Selected service area is not active or does not exist.' });
            }
        }

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

        // Map-03A Fix 1: atomic write — POS row + allocations in a single DB transaction.
        // If allocation insert fails, the POS row is rolled back automatically.
        const areaAllocations = linkedJobAllocations
            .filter(({ job }) => Boolean(job.serviceAreaId))
            .map(({ job, billedAmount }) => ({
                jobTicketId: job.id as string | null,
                serviceAreaId: job.serviceAreaId as string,
                billedAmount,
            }));
        const transaction = await posRepo.createPosTransactionWithAllocations(validated, areaAllocations);

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

        // Handle Linked Jobs — sync billing, payment, job status, and journey
        if (linkedJobs.length > 0) {
            const isPaid = ['Cash', 'Bank', 'bKash', 'Nagad'].includes(paymentMethod);

            for (const allocation of linkedJobAllocations) {
                const existingJob = allocation.job;
                const job = { jobId: existingJob.id };

                // 1. Bill Ready journey event (always, dedup-safe)
                repairJourneyService.syncBillToJourney({
                    jobId: job.jobId,
                    invoiceNumber: transaction.invoiceNumber || undefined,
                    transactionId: transaction.id,
                    amount: allocation.billedAmount,
                    paymentMethod,
                }).catch(err => console.error('[RepairJourney] Bill sync failed:', (err as Error).message));

                // 2. Record payment on job for paid methods
                if (isPaid) {
                    try {
                        await jobService.recordJobPayment(job.jobId, {
                            paymentId: transaction.id,
                            amount: allocation.billedAmount,
                            method: paymentMethod,
                        });
                    } catch (payErr) {
                        console.error('[POS] Job payment recording failed:', (payErr as Error).message);
                    }
                }

                // 3. Mark job Completed if not already + sync journey
                if (existingJob.status !== 'Completed') {
                    const warrantyDays = (existingJob as any).warrantyDays ?? 30;
                    const completionPatch: any = {
                        status: 'Completed',
                        completedAt: new Date(),
                    };
                    if (warrantyDays > 0 && !(existingJob as any).warrantyExpiryDate) {
                        const expiry = new Date();
                        expiry.setDate(expiry.getDate() + warrantyDays);
                        completionPatch.warrantyExpiryDate = expiry;
                    }
                    if (isPaid) {
                        completionPatch.billingStatus = 'invoiced';
                    }

                    await jobRepo.updateJobTicket(job.jobId, completionPatch);

                    await auditLogger.log({
                        userId: req.session?.adminUserId || 'system',
                        action: 'STATUS_CHANGE_TO_COMPLETED',
                        entity: 'JobTicket',
                        entityId: job.jobId,
                        details: `Job marked as completed via POS transaction ${transaction.invoiceNumber || transaction.id}`,
                        oldValue: { status: existingJob.status },
                        newValue: { status: 'Completed' },
                        req,
                    });

                    repairJourneyService.syncJobStatusToJourney(job.jobId, 'Completed', {
                        device: (existingJob as any).device,
                        warrantyDays,
                        warrantyExpiryDate: completionPatch.warrantyExpiryDate || (existingJob as any).warrantyExpiryDate,
                    }).catch(err => console.error('[RepairJourney] POS job status sync failed:', (err as Error).message));
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
