/**
 * Refund Management API Routes
 * 
 * Handles refund processing with strict audit trail and approval workflow:
 * - List refunds (with filters)
 * - Request refund (from job or POS transaction)
 * - Approve/Reject refunds (Manager+ only, Super Admin for high amounts)
 * - Process refund (creates negative petty cash entry)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { storage } from '../storage.js';
import { settingsRepo, notificationRepo, systemRepo, userRepo, jobRepo, serviceRequestRepo, warrantyRepo, hrRepo, posRepo } from '../repositories/index.js';
import { auditLogger } from '../utils/auditLogger.js';

const router = Router();

// Refund approval threshold setting key
const REFUND_THRESHOLD_KEY = 'refund_approval_threshold';
const DEFAULT_THRESHOLD = 2000; // ৳2,000

// Get refund approval threshold from settings
async function getRefundThreshold(): Promise<number> {
    const settings = await settingsRepo.getAllSettings();
    const threshold = settings.find(s => s.key === REFUND_THRESHOLD_KEY);
    return threshold?.value ? parseFloat(threshold.value) : DEFAULT_THRESHOLD;
}

// Get all refunds with optional filters
router.get('/api/refunds', async (req: Request, res: Response) => {
    try {
        const { status, page = '1', limit = '20' } = req.query;
        const refunds = await warrantyRepo.getAllRefunds({
            status: status as string,
            page: parseInt(page as string),
            limit: parseInt(limit as string),
        });
        res.json(refunds);
    } catch (error: any) {
        console.error('[Refund] Error fetching refunds:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get single refund
router.get('/api/refunds/:id', async (req: Request, res: Response) => {
    try {
        const refund = await warrantyRepo.getRefund(req.params.id);
        if (!refund) {
            return res.status(404).json({ error: 'Refund not found' });
        }
        res.json(refund);
    } catch (error: any) {
        console.error('[Refund] Error fetching refund:', error);
        res.status(500).json({ error: error.message });
    }
});

// Request a refund (from job or POS transaction)
router.post('/api/refunds', async (req: Request, res: Response) => {
    try {
        const {
            type, // 'job' | 'pos' | 'warranty'
            referenceId, // Job ID or POS Transaction ID
            refundAmount,
            reason,
            requestedBy,
            requestedByName,
            requestedByRole,
            notes
        } = req.body;

        // Validate source exists
        let customer = 'Unknown';
        let customerPhone: string | null = null;
        let originalAmount = 0;
        let referenceInvoice: string | null = null;

        if (type === 'job') {
            const job = await jobRepo.getJobTicket(referenceId);
            if (!job) {
                return res.status(404).json({ error: 'Job not found' });
            }
            customer = job.customer || 'Unknown';
            customerPhone = job.customerPhone;
            originalAmount = job.paidAmount || 0;
        } else if (type === 'pos') {
            const transaction = await storage.getPosTransaction(referenceId);
            if (!transaction) {
                return res.status(404).json({ error: 'Transaction not found' });
            }
            customer = transaction.customer || 'Unknown';
            originalAmount = Number(transaction.total);
            referenceInvoice = transaction.invoiceNumber;
        } else if (type !== 'warranty') {
            return res.status(400).json({ error: 'Invalid type. Must be "job", "pos", or "warranty"' });
        }

        // Validate amount
        const amount = parseFloat(refundAmount);
        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({ error: 'Invalid refund amount' });
        }
        if (amount > originalAmount) {
            return res.status(400).json({ error: `Refund amount cannot exceed paid amount (৳${originalAmount})` });
        }

        // Check if this needs Super Admin approval
        const threshold = await getRefundThreshold();
        const requiresSuperAdminApproval = amount > threshold;

        const refund = await warrantyRepo.createRefund({
            type,
            referenceId,
            referenceInvoice,
            customer,
            customerPhone,
            originalAmount,
            refundAmount: amount,
            reason,
            status: 'pending',
            requestedBy,
            requestedByName,
            requestedByRole,
            requestedAt: new Date(),
            notes,
        });

        await auditLogger.log({
            userId: requestedBy,
            action: 'REQUEST_REFUND',
            entity: 'refund',
            entityId: refund.id,
            newValue: refund,
        });

        res.status(201).json({
            ...refund,
            requiresSuperAdminApproval,
            threshold,
            message: requiresSuperAdminApproval
                ? `Refund amount exceeds ৳${threshold}. Requires Super Admin approval.`
                : 'Refund request created. Awaiting Manager approval.'
        });
    } catch (error: any) {
        console.error('[Refund] Error creating refund:', error);
        res.status(500).json({ error: error.message });
    }
});

// Approve refund
router.patch('/api/refunds/:id/approve', async (req: Request, res: Response) => {
    try {
        const { approvedBy, approvedByName, approvedByRole } = req.body;

        const refund = await warrantyRepo.getRefund(req.params.id);
        if (!refund) {
            return res.status(404).json({ error: 'Refund not found' });
        }

        if (refund.status !== 'pending') {
            return res.status(400).json({ error: `Cannot approve refund with status: ${refund.status}` });
        }

        // Role check
        if (!['Manager', 'Super Admin', 'Admin'].includes(approvedByRole)) {
            return res.status(403).json({ error: 'Only Manager or Admin can approve refunds' });
        }

        // Super Admin check for high amounts
        const threshold = await getRefundThreshold();
        if (refund.refundAmount > threshold && approvedByRole !== 'Super Admin') {
            return res.status(403).json({
                error: `Refunds over ৳${threshold} require Super Admin approval`
            });
        }

        const updated = await storage.updateRefund(req.params.id, {
            status: 'approved',
            approvedBy,
            approvedByName,
            approvedByRole,
            approvedAt: new Date(),
        });

        await auditLogger.log({
            userId: approvedBy,
            action: 'APPROVE_REFUND',
            entity: 'refund',
            entityId: req.params.id,
            oldValue: { status: refund.status },
            newValue: { status: 'approved', approvedBy, approvedByName },
        });

        res.json(updated);
    } catch (error: any) {
        console.error('[Refund] Error approving refund:', error);
        res.status(500).json({ error: error.message });
    }
});

// Reject refund
router.patch('/api/refunds/:id/reject', async (req: Request, res: Response) => {
    try {
        const { approvedBy, approvedByName, approvedByRole, rejectionReason } = req.body;

        const refund = await warrantyRepo.getRefund(req.params.id);
        if (!refund) {
            return res.status(404).json({ error: 'Refund not found' });
        }

        if (refund.status !== 'pending') {
            return res.status(400).json({ error: `Cannot reject refund with status: ${refund.status}` });
        }

        if (!['Manager', 'Super Admin', 'Admin'].includes(approvedByRole)) {
            return res.status(403).json({ error: 'Only Manager or Admin can reject refunds' });
        }

        const updated = await storage.updateRefund(req.params.id, {
            status: 'rejected',
            approvedBy,
            approvedByName,
            approvedByRole,
            approvedAt: new Date(),
            rejectionReason,
        });

        await auditLogger.log({
            userId: approvedBy,
            action: 'REJECT_REFUND',
            entity: 'refund',
            entityId: req.params.id,
            oldValue: { status: refund.status },
            newValue: { status: 'rejected', rejectionReason },
        });

        res.json(updated);
    } catch (error: any) {
        console.error('[Refund] Error rejecting refund:', error);
        res.status(500).json({ error: error.message });
    }
});

// Process (finalize) an approved refund - creates negative petty cash entry
router.patch('/api/refunds/:id/process', async (req: Request, res: Response) => {
    try {
        const { processedBy, processedByName, processedByRole, refundMethod } = req.body;

        const refund = await warrantyRepo.getRefund(req.params.id);
        if (!refund) {
            return res.status(404).json({ error: 'Refund not found' });
        }

        if (refund.status !== 'approved') {
            return res.status(400).json({ error: 'Only approved refunds can be processed' });
        }

        // Role check (only Manager+ can process)
        if (!['Manager', 'Super Admin', 'Admin'].includes(processedByRole)) {
            return res.status(403).json({ error: 'Only Manager or Admin can process refunds' });
        }

        // Phase N — Cash refund drawer balance check
        if (refundMethod === 'cash') {
            const session = await posRepo.getActiveDrawer();
            if (!session) {
                return res.status(400).json({
                    error: 'No active cash drawer session. Open the cash drawer before processing a cash refund.'
                });
            }
            const currentBalance = Number(session.expectedCash || session.startingFloat || 0);
            if (currentBalance < refund.refundAmount) {
                return res.status(400).json({
                    error: `Insufficient drawer balance (৳${currentBalance.toFixed(2)}) for ৳${refund.refundAmount.toFixed(2)} cash refund. Top up drawer first.`
                });
            }
        }

        // Create negative petty cash entry for the refund
        const pettyCashEntry = await storage.createPettyCashRecord({
            type: 'Expense',
            description: `REFUND: ${refund.reason} (${refund.type}: ${refund.referenceId})`,
            category: 'Refund',
            amount: refund.refundAmount,
        });

        // Update drawer expectedCash for cash refunds
        if (refundMethod === 'cash') {
            const activeDrawer = await posRepo.getActiveDrawer();
            if (activeDrawer) {
                await posRepo.updateDrawerExpectedCash(activeDrawer.id, -refund.refundAmount);
            }
        }

        // Update refund status
        const updated = await storage.updateRefund(req.params.id, {
            status: 'processed',
            processedBy,
            processedByName,
            processedByRole,
            processedAt: new Date(),
            refundMethod,
            pettyCashRecordId: pettyCashEntry.id,
        });

        await auditLogger.log({
            userId: processedBy,
            action: 'PROCESS_REFUND',
            entity: 'refund',
            entityId: req.params.id,
            newValue: {
                status: 'processed',
                processedBy,
                processedByName,
                pettyCashRecordId: pettyCashEntry.id
            },
        });

        res.json({
            refund: updated,
            pettyCashEntry,
            message: 'Refund processed successfully. Negative petty cash entry created.'
        });
    } catch (error: any) {
        console.error('[Refund] Error processing refund:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
