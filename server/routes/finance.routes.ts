/**
 * Finance Routes
 * 
 * Handles petty cash, due records, and financial operations.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { storage } from '../storage.js';
import { financeRepo, posRepo, userRepo } from '../repositories/index.js';
import { insertManualPaymentSchema, insertPettyCashRecordSchema, manualPayments } from '../../shared/schema.js';
import { requireAdminAuth, requirePermission } from './middleware/auth.js';
import { financeService } from '../services/finance.service.js';
import { jobService } from '../services/job.service.js';
import { db } from '../db.js';

const router = Router();
const MANUAL_PAYMENT_STATUSES = ['pending', 'staff_verified', 'rejected', 'applied_to_invoice'] as const;

function canApplyManualPayment(payment: typeof manualPayments.$inferSelect) {
    return payment.jobTicketId || payment.dueRecordId;
}

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
 * POST /api/due-records - Create a due record (manual entry)
 * Requires: Admin auth + finance permission
 */
router.post('/api/due-records', requireAdminAuth, requirePermission('finance'), async (req: Request, res: Response) => {
    try {
        const { customer, amount, invoice, dueDate, status } = req.body;
        if (!customer || !invoice || amount == null || !dueDate) {
            return res.status(400).json({ error: 'customer, invoice, amount and dueDate are required' });
        }
        const record = await financeRepo.createDueRecord({
            customer,
            invoice,
            amount: Number(amount),
            dueDate: new Date(dueDate),
            status: status || 'Pending',
        } as any);
        res.status(201).json(record);
    } catch (error) {
        console.error('Failed to create due record:', error);
        res.status(400).json({ error: 'Invalid due record data' });
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

router.get('/api/manual-payments', requireAdminAuth, requirePermission('finance'), async (req: Request, res: Response) => {
    try {
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const conditions = [];
        if (status && MANUAL_PAYMENT_STATUSES.includes(status as any)) {
            conditions.push(eq(manualPayments.status, status));
        }

        const records = await db
            .select()
            .from(manualPayments)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(manualPayments.createdAt))
            .limit(100);

        res.json({ items: records });
    } catch (error: any) {
        console.error('[ManualPayments] List failed:', error.message);
        res.status(500).json({ error: 'Failed to fetch manual payments' });
    }
});

router.post('/api/manual-payments', requireAdminAuth, requirePermission('process_payment'), async (req: Request, res: Response) => {
    try {
        const validated = insertManualPaymentSchema.parse(req.body);
        if (!validated.jobTicketId && !validated.serviceRequestId && !validated.dueRecordId) {
            return res.status(400).json({ error: 'Link this payment to a job, service request, or due record' });
        }
        if ((validated.method === 'bkash_send_money' || validated.method === 'nagad_send_money') && !validated.transactionId) {
            return res.status(400).json({ error: 'Transaction ID is required for bKash/Nagad send-money payments' });
        }

        const [record] = await db.insert(manualPayments).values({
            ...validated,
            id: randomUUID(),
            status: 'pending',
            updatedAt: new Date(),
        }).returning();

        res.status(201).json(record);
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'Invalid manual payment data' });
    }
});

router.post('/api/manual-payments/:id/verify', requireAdminAuth, requirePermission('process_payment'), async (req: Request, res: Response) => {
    try {
        const [payment] = await db.select().from(manualPayments).where(eq(manualPayments.id, req.params.id)).limit(1);
        if (!payment) return res.status(404).json({ error: 'Manual payment not found' });
        if (payment.status !== 'pending' && payment.status !== 'staff_verified') {
            return res.status(409).json({ error: `Cannot verify payment in ${payment.status} status` });
        }

        const adminUser = await userRepo.getUser(req.session.adminUserId!);
        const verifiedBy = adminUser?.name || adminUser?.username || 'Admin';
        let status = 'staff_verified';
        let appliedJob = null;
        let appliedDue = null;

        if (payment.jobTicketId) {
            appliedJob = await jobService.recordJobPayment(payment.jobTicketId, {
                paymentId: payment.transactionId || payment.id,
                amount: Number(payment.amount),
                method: payment.method,
            });
            status = 'applied_to_invoice';
        } else if (payment.dueRecordId) {
            appliedDue = await financeService.recordDuePayment(payment.dueRecordId, Number(payment.amount), payment.method);
            status = 'applied_to_invoice';
        } else if (!canApplyManualPayment(payment)) {
            status = 'staff_verified';
        }

        const [updated] = await db.update(manualPayments)
            .set({
                status,
                verifiedBy,
                verifiedAt: payment.verifiedAt || new Date(),
                appliedAt: status === 'applied_to_invoice' ? new Date() : payment.appliedAt,
                updatedAt: new Date(),
            })
            .where(eq(manualPayments.id, payment.id))
            .returning();

        res.json({ payment: updated, job: appliedJob, dueRecord: appliedDue });
    } catch (error: any) {
        console.error('[ManualPayments] Verify failed:', error.message);
        res.status(400).json({ error: error.message || 'Failed to verify manual payment' });
    }
});

router.post('/api/manual-payments/:id/reject', requireAdminAuth, requirePermission('process_payment'), async (req: Request, res: Response) => {
    try {
        const reason = String(req.body.reason || '').trim();
        if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });

        const [payment] = await db.select().from(manualPayments).where(eq(manualPayments.id, req.params.id)).limit(1);
        if (!payment) return res.status(404).json({ error: 'Manual payment not found' });
        if (payment.status === 'applied_to_invoice') {
            return res.status(409).json({ error: 'Applied payments cannot be rejected' });
        }

        const adminUser = await userRepo.getUser(req.session.adminUserId!);
        const rejectedBy = adminUser?.name || adminUser?.username || 'Admin';
        const [updated] = await db.update(manualPayments)
            .set({
                status: 'rejected',
                rejectedBy,
                rejectedAt: new Date(),
                rejectionReason: reason,
                updatedAt: new Date(),
            })
            .where(eq(manualPayments.id, payment.id))
            .returning();

        res.json(updated);
    } catch (error: any) {
        console.error('[ManualPayments] Reject failed:', error.message);
        res.status(400).json({ error: error.message || 'Failed to reject manual payment' });
    }
});

export default router;
