/**
 * Finance Routes
 * 
 * Handles petty cash, due records, and financial operations.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { storage } from '../storage.js';
import { financeRepo, notificationRepo, posRepo, serviceRequestRepo, userRepo } from '../repositories/index.js';
import { insertManualPaymentSchema, insertPettyCashRecordSchema, manualPayments } from '../../shared/schema.js';
import { requireAdminAuth, requirePermission, requireGranularPermission } from './middleware/auth.js';
import { auditLogger } from '../utils/auditLogger.js';
import { EXPENSE_CATEGORY_IDS, normaliseLegacyCategory, reversalNeedsReason } from '../../shared/expense-tracking.js';
import { financeService } from '../services/finance.service.js';
import { db } from '../db.js';
import { notifyCustomerUpdate } from './middleware/sse-broker.js';
import { getItemProfit, getProfitSummary } from '../services/profit-report.service.js';
import { logRouteError } from '../utils/route-error.js';
import { accountTotals, planAllocation, money } from '../../shared/due-balance.js';

/**
 * The window a report covers, defaulting to the last 30 days.
 *
 * `to` is exclusive and pushed to the end of the given day, because a person
 * asking for 1–31 August means the whole of the 31st. Treating it as midnight
 * would silently drop a day's sales from every month-end report.
 */
function parseReportWindow(query: Record<string, unknown>): { from: Date; to: Date } {
    const rawFrom = typeof query.from === 'string' ? new Date(query.from) : null;
    const rawTo = typeof query.to === 'string' ? new Date(query.to) : null;

    const to = rawTo && !isNaN(rawTo.getTime())
        ? new Date(rawTo.getFullYear(), rawTo.getMonth(), rawTo.getDate() + 1)
        : new Date();
    const from = rawFrom && !isNaN(rawFrom.getTime())
        ? rawFrom
        : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    return { from, to };
}

const router = Router();

/**
 * Who is doing this, from the session rather than the request body.
 *
 * Admin auth is session-based, so req.user is not populated the way Passport
 * routes expect. Attribution that a client could supply would be worthless on
 * a ledger, so it is always looked up here.
 */
async function resolveActor(req: Request): Promise<{ id: string; name: string }> {
    const id = (req as any).user?.id || req.session?.adminUserId || 'system';
    let name = (req as any).user?.name || 'Admin';
    if (id && id !== 'system') {
        try {
            const admin = await userRepo.getUser(id);
            if (admin?.name) name = admin.name;
        } catch { /* the ledger entry still gets an id */ }
    }
    return { id, name };
}

const MANUAL_PAYMENT_STATUSES = ['pending', 'staff_verified', 'rejected', 'applied_to_invoice'] as const;

function canApplyManualPayment(payment: typeof manualPayments.$inferSelect) {
    return payment.jobTicketId || payment.dueRecordId;
}

async function notifyCustomerPaymentDecision(payment: typeof manualPayments.$inferSelect, decision: 'accepted' | 'rejected', reason?: string) {
    if (payment.source !== 'customer_submission') return;

    const request = payment.serviceRequestId
        ? await serviceRequestRepo.getServiceRequest(payment.serviceRequestId)
        : undefined;
    const customer = request?.customerId
        ? await userRepo.getUser(request.customerId)
        : payment.customerPhone
            ? await userRepo.getUserByPhoneNormalized(payment.customerPhone)
            : undefined;
    if (!customer) return;

    const ticketLabel = request?.ticketNumber ? ` #${request.ticketNumber}` : '';
    const title = decision === 'accepted' ? 'Payment Verified' : 'Payment Rejected';
    const message = decision === 'accepted'
        ? `Your payment${ticketLabel} has been verified.`
        : `Your payment${ticketLabel} was rejected.${reason ? ` Reason: ${reason}` : ''}`;

    const notification = await notificationRepo.createNotification({
        userId: customer.id,
        title,
        message,
        type: decision === 'accepted' ? 'success' : 'warning',
        link: request?.id ? `/track/${request.ticketNumber || request.id}` : null,
        jobId: payment.jobTicketId || null,
        contextType: 'customer_payment',
    });

    notifyCustomerUpdate(customer.id, {
        type: decision === 'accepted' ? 'payment_verified' : 'payment_rejected',
        paymentId: payment.id,
        serviceRequestId: payment.serviceRequestId,
        ticketNumber: request?.ticketNumber,
        amount: payment.amount,
        reason,
        notification,
        updatedAt: new Date().toISOString(),
    });
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
        const { page, limit, search, from, to, type, category } = req.query;
        const records = await financeRepo.getAllPettyCashRecords({
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
            search: search as string,
            from: from as string,
            to: to as string,
            type: type as string,
            // The filter chips run through here, so a chip filters the whole
            // ledger rather than whichever 25 rows are on screen.
            category: category as string,
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
router.post('/api/petty-cash', requireAdminAuth, requireGranularPermission('finance.createRecord'), async (req: Request, res: Response) => {
    try {
        const validated = insertPettyCashRecordSchema.parse(req.body);

        // Finance staff enter on everybody's behalf, so who the money belongs
        // to is a field on the form, while who typed it comes from the session
        // and is never client-supplied.
        const actor = await resolveActor(req);
        const record = await financeRepo.createPettyCashRecord({
            ...validated,
            category: EXPENSE_CATEGORY_IDS.includes(validated.category as any)
                ? validated.category
                : normaliseLegacyCategory(validated.category),
            enteredBy: actor.id,
            enteredByName: actor.name,
            // Absent means it was spent as it was entered, which is the common
            // case; a backdated spend sends its own timestamp.
            occurredAt: validated.occurredAt ? new Date(validated.occurredAt) : new Date(),
        } as any);

        // If this is an Expense, subtract from active drawer expectedCash
        if (validated.type === 'Expense') {
            const activeDrawer = await posRepo.getActiveDrawer();
            if (activeDrawer) {
                await posRepo.updateDrawerExpectedCash(activeDrawer.id, -validated.amount);
            }
        }

        res.status(201).json(record);
    } catch (error) {
        console.error('[PettyCash] Create failed:', error);
        res.status(400).json({ error: 'Invalid petty cash data' });
    }
});

/**
 * GET /api/petty-cash/category-totals — the number on each filter chip.
 */
router.get('/api/petty-cash/category-totals', requireAdminAuth, requirePermission('finance'), async (req: Request, res: Response) => {
    try {
        res.json(await financeRepo.getExpenseCategoryTotals({
            from: req.query.from as string | undefined,
            to: req.query.to as string | undefined,
        }));
    } catch (error) {
        console.error('[PettyCash] Category totals failed:', error);
        res.status(500).json({ error: 'Failed to build category totals' });
    }
});

/**
 * GET /api/petty-cash/parts-summary — LVDS x10, Panel x4, by month.
 */
router.get('/api/petty-cash/parts-summary', requireAdminAuth, requirePermission('finance'), async (req: Request, res: Response) => {
    try {
        res.json(await financeRepo.getPartsSummary({
            from: req.query.from as string | undefined,
            to: req.query.to as string | undefined,
        }));
    } catch (error) {
        console.error('[PettyCash] Parts summary failed:', error);
        res.status(500).json({ error: 'Failed to build parts summary' });
    }
});

/**
 * GET /api/petty-cash/rollup — month, then day, then nothing else.
 *
 * The complaint this answers is that dozens of ৳40 entries are unreadable.
 * They still all exist; this returns the shape you actually look at, and the
 * individual entries stay behind the existing list endpoint for when a day is
 * opened.
 *
 * Behind requirePermission('finance') like the rest of this file — the owner's
 * personal spending is in this table, and it is not for general viewing.
 */
router.get('/api/petty-cash/rollup', requireAdminAuth, requirePermission('finance'), async (req: Request, res: Response) => {
    try {
        const rollup = await financeRepo.getExpenseRollup({
            from: req.query.from as string | undefined,
            to: req.query.to as string | undefined,
        });
        res.json(rollup);
    } catch (error) {
        console.error('[PettyCash] Rollup failed:', error);
        res.status(500).json({ error: 'Failed to build expense rollup' });
    }
});

/**
 * GET /api/petty-cash/by-person — what each person spent, and on what.
 */
router.get('/api/petty-cash/by-person', requireAdminAuth, requirePermission('finance'), async (req: Request, res: Response) => {
    try {
        const people = await financeRepo.getExpenseByPerson({
            from: req.query.from as string | undefined,
            to: req.query.to as string | undefined,
        });
        res.json(people);
    } catch (error) {
        console.error('[PettyCash] Per-person breakdown failed:', error);
        res.status(500).json({ error: 'Failed to build per-person breakdown' });
    }
});

/**
 * POST /api/petty-cash/:id/reverse — undo an expense without erasing it.
 *
 * This replaces DELETE, which had two faults. It removed the row outright, so
 * a ledger meant to show what people spent could be made to forget. And it
 * never gave the money back to the drawer: creating an expense subtracts from
 * the session's expected cash, deleting it did not add back, so a mistyped and
 * then deleted expense left the register expecting less cash than it held and
 * the blind count reported a surplus on a shift where nothing had gone wrong.
 *
 * Reversing does both halves: the original is stamped, a cancelling row is
 * written, and the drawer gets its money back.
 */
router.post('/api/petty-cash/:id/reverse', requireAdminAuth, requireGranularPermission('finance.deleteRecord'), async (req: Request, res: Response) => {
    try {
        const actor = await resolveActor(req);
        const existing = await financeRepo.getPettyCashRecord(req.params.id);
        if (!existing) {
            return res.status(404).json({ error: 'Record not found' });
        }
        if (existing.reversedAt || existing.reversalOf) {
            return res.status(409).json({ error: 'This entry has already been reversed' });
        }

        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
        // Undoing your own entry is free; undoing somebody else's has to say
        // why, or the ledger cannot explain where a spend went.
        if (reversalNeedsReason({ entrySpentBy: existing.spentBy, entryEnteredBy: existing.enteredBy, actorId: actor.id }) && !reason) {
            return res.status(400).json({
                error: 'A reason is required to reverse an entry belonging to someone else',
                code: 'REASON_REQUIRED',
            });
        }

        const result = await financeRepo.reversePettyCashRecord(req.params.id, {
            id: actor.id,
            name: actor.name,
            reason,
        });
        if (!result) {
            return res.status(409).json({ error: 'This entry has already been reversed' });
        }

        // Give the drawer back what the original entry took from it. Only the
        // open session can be adjusted — a closed one was already counted, and
        // the cancelling row carries today's date for exactly that reason.
        if (existing.type === 'Expense') {
            const activeDrawer = await posRepo.getActiveDrawer();
            if (activeDrawer) {
                await posRepo.updateDrawerExpectedCash(activeDrawer.id, existing.amount);
            }
        }

        await auditLogger.log({
            userId: actor.id,
            action: 'UPDATE',
            entity: 'PETTY_CASH',
            entityId: existing.id,
            details: `Reversed ${existing.type} of ${existing.amount} (${existing.description})${reason ? ` — ${reason}` : ''}`,
        });

        res.json(result);
    } catch (error) {
        console.error('[PettyCash] Reversal failed:', error);
        res.status(500).json({ error: 'Failed to reverse record' });
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
router.post('/api/due-records', requireAdminAuth, requireGranularPermission('finance.createRecord'), async (req: Request, res: Response) => {
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
        const source = typeof req.query.source === 'string' ? req.query.source : undefined;
        const conditions = [];
        if (status && MANUAL_PAYMENT_STATUSES.includes(status as any)) {
            conditions.push(eq(manualPayments.status, status));
        }
        if (source === 'customer_submission' || source === 'admin_manual') {
            conditions.push(eq(manualPayments.source, source));
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
            source: 'admin_manual',
            status: 'pending',
            updatedAt: new Date(),
        }).returning();

        res.status(201).json(record);
    } catch (error: any) {
        res.status(400).json({ error: error.message || 'Invalid manual payment data' });
    }
});

/**
 * POST /api/manual-payments/:id/verify
 * 00C-B-HOTFIX-1: applied_to_invoice only after canonical POS; staff_verified never sends accepted notify.
 * Requires pos.processPayment when settlement can apply money.
 */
router.post('/api/manual-payments/:id/verify', requireAdminAuth, requireGranularPermission('pos.processPayment'), async (req: Request, res: Response) => {
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

        let operatorActionRequired: string | null = null;
        let posTransaction: any = null;
        let settlementError: { status: number; code: string; message: string } | null = null;

        if (payment.jobTicketId) {
            const { settleJobPaymentViaPos, RetailMoneyError, mapToPosPaymentMethod } = await import(
                '../services/retail-money-settlement.service.js'
            );
            const mapped = mapToPosPaymentMethod(payment.method);
            if (!mapped) {
                status = 'staff_verified';
                operatorActionRequired =
                    'Manual payment held as evidence. Unrecognized method — collect via POS (Cash/Bank/bKash/Nagad).';
                settlementError = {
                    status: 400,
                    code: 'INVALID_PAYMENT_METHOD',
                    message: 'Unrecognized payment method for retail POS settlement',
                };
            } else if (mapped === 'Due') {
                status = 'staff_verified';
                operatorActionRequired =
                    'Manual payment held as evidence. Due/credit cannot apply job money through verify — use POS Due flow if required.';
                settlementError = {
                    status: 400,
                    code: 'DUE_NOT_ALLOWED_ON_ADAPTER',
                    message: 'Due/credit settlements cannot apply money through manual-payment verify',
                };
            } else {
                try {
                    const actorId = req.session.adminUserId!;
                    const settlement = await settleJobPaymentViaPos({
                        jobId: payment.jobTicketId,
                        amount: Number(payment.amount),
                        method: mapped,
                        paymentId: payment.transactionId || undefined,
                        clientRequestId: `manual_verify:${payment.id}`,
                        actorUserId: actorId,
                        customerName: payment.customerName,
                        customerPhone: payment.customerPhone,
                        req,
                    });
                    appliedJob = settlement.job;
                    posTransaction = settlement.posTransaction;
                    status = 'applied_to_invoice';
                } catch (settleErr: any) {
                    if (settleErr instanceof RetailMoneyError) {
                        status = 'staff_verified';
                        operatorActionRequired = settleErr.message || 'POS settlement required before money applies';
                        settlementError = {
                            status: settleErr.status,
                            code: settleErr.code,
                            message: settleErr.message,
                        };
                    } else if (settleErr?.code && settleErr?.status) {
                        status = 'staff_verified';
                        operatorActionRequired = settleErr.message || 'POS settlement required before money applies';
                        settlementError = {
                            status: Number(settleErr.status) || 400,
                            code: String(settleErr.code),
                            message: String(settleErr.message || 'Settlement failed'),
                        };
                    } else {
                        throw settleErr;
                    }
                }
            }
        } else if (payment.dueRecordId) {
            appliedDue = await financeService.recordDuePayment(payment.dueRecordId, Number(payment.amount), payment.method);
            status = 'applied_to_invoice';
        } else if (!canApplyManualPayment(payment)) {
            status = 'staff_verified';
            operatorActionRequired = 'Link payment to a job or due record and settle via POS when applying money.';
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

        // Only applied_to_invoice means money accepted — never notify success for staff_verified
        if (status === 'applied_to_invoice') {
            await notifyCustomerPaymentDecision(updated, 'accepted');
        }

        if (settlementError) {
            return res.status(settlementError.status).json({
                error: settlementError.message,
                code: settlementError.code,
                payment: updated,
                job: appliedJob,
                posTransaction,
                operatorActionRequired,
                moneyAuthority: 'pos_transactions',
            });
        }

        res.json({
            payment: updated,
            job: appliedJob,
            dueRecord: appliedDue,
            posTransaction,
            operatorActionRequired,
            moneyAuthority: 'pos_transactions',
        });
    } catch (error: any) {
        console.error('[ManualPayments] Verify failed:', (error as Error).message);
        res.status(500).json({ error: 'Failed to verify manual payment' });
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

        await notifyCustomerPaymentDecision(updated, 'rejected', reason);
        res.json(updated);
    } catch (error: any) {
        console.error('[ManualPayments] Reject failed:', error.message);
        res.status(400).json({ error: error.message || 'Failed to reject manual payment' });
    }
});

// ============================================
// Legacy Due Entry (Opening Balance / Bulk Import)
// ============================================

const LEGACY_SOURCES = ['opening_balance', 'legacy_import'] as const;

/**
 * POST /api/admin/finance/legacy-dues - Create a single legacy due entry
 */
router.post('/api/admin/finance/legacy-dues', requireAdminAuth, requireGranularPermission('finance.createRecord'), async (req: Request, res: Response) => {
    try {
        const { customerName, customerPhone, amount, deviceName, dueDate, note, oldReference, source } = req.body;

        if (!customerName || amount == null || Number(amount) <= 0) {
            return res.status(400).json({ error: 'customerName and a positive amount are required' });
        }
        const entrySource = LEGACY_SOURCES.includes(source) ? source : 'opening_balance';

        if (oldReference) {
            const existing = await financeRepo.getAllDueRecords({ search: oldReference });
            const dup = existing.items.find((d: any) =>
                d.oldReference === oldReference && d.customerPhone === (customerPhone || null) && d.amount === Number(amount)
            );
            if (dup) {
                return res.status(409).json({ error: 'Duplicate legacy due', existingId: dup.id });
            }
        }

        const record = await financeRepo.createDueRecord({
            customer: customerName,
            invoice: oldReference || `LEGACY-${Date.now()}`,
            amount: Number(amount),
            dueDate: dueDate ? new Date(dueDate) : new Date(),
            status: 'Pending',
            source: entrySource,
            customerPhone: customerPhone || null,
            deviceName: deviceName || null,
            oldReference: oldReference || null,
            note: note || null,
            createdBy: req.session?.adminUserId || 'system',
        } as any);

        console.log(`[LegacyDue] Created opening due ${record.id} for ${customerName}`);
        res.status(201).json({ id: record.id, customer: record.customer, amount: record.amount, source: entrySource });
    } catch (error: any) {
        console.error('[LegacyDue] Create failed:', error.message);
        res.status(400).json({ error: 'Failed to create legacy due record' });
    }
});

/**
 * POST /api/admin/finance/legacy-dues/preview - Preview bulk rows before import
 */
router.post('/api/admin/finance/legacy-dues/preview', requireAdminAuth, requireGranularPermission('finance.view'), async (req: Request, res: Response) => {
    try {
        const { rows } = req.body;
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ error: 'rows array is required' });
        }
        if (rows.length > 200) {
            return res.status(400).json({ error: 'Maximum 200 rows per batch' });
        }

        const preview = rows.map((row: any, idx: number) => {
            const errors: string[] = [];
            if (!row.customerName) errors.push('customerName required');
            if (!row.amount || Number(row.amount) <= 0) errors.push('positive amount required');
            return {
                row: idx + 1,
                customerName: row.customerName || '',
                customerPhone: row.customerPhone || '',
                amount: Number(row.amount) || 0,
                deviceName: row.deviceName || '',
                oldReference: row.oldReference || '',
                valid: errors.length === 0,
                errors,
            };
        });

        const valid = preview.filter(r => r.valid).length;
        const invalid = preview.filter(r => !r.valid).length;
        res.json({ total: rows.length, valid, invalid, preview });
    } catch (error: any) {
        console.error('[LegacyDue] Preview failed:', error.message);
        res.status(400).json({ error: 'Failed to preview rows' });
    }
});

/**
 * POST /api/admin/finance/legacy-dues/bulk - Bulk import legacy dues
 */
router.post('/api/admin/finance/legacy-dues/bulk', requireAdminAuth, requireGranularPermission('finance.createRecord'), async (req: Request, res: Response) => {
    try {
        const { rows } = req.body;
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ error: 'rows array is required' });
        }
        if (rows.length > 200) {
            return res.status(400).json({ error: 'Maximum 200 rows per batch' });
        }

        const created: { id: string; customer: string; amount: number }[] = [];
        const skipped: { row: number; reason: string }[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row.customerName || !row.amount || Number(row.amount) <= 0) {
                skipped.push({ row: i + 1, reason: 'Missing customerName or invalid amount' });
                continue;
            }

            if (row.oldReference) {
                const existing = await financeRepo.getAllDueRecords({ search: row.oldReference });
                const dup = existing.items.find((d: any) =>
                    d.oldReference === row.oldReference && d.customerPhone === (row.customerPhone || null) && d.amount === Number(row.amount)
                );
                if (dup) {
                    skipped.push({ row: i + 1, reason: `Duplicate (existing: ${dup.id})` });
                    continue;
                }
            }

            const record = await financeRepo.createDueRecord({
                customer: row.customerName,
                invoice: row.oldReference || `LEGACY-${Date.now()}-${i}`,
                amount: Number(row.amount),
                dueDate: row.dueDate ? new Date(row.dueDate) : new Date(),
                status: 'Pending',
                source: 'legacy_import',
                customerPhone: row.customerPhone || null,
                deviceName: row.deviceName || null,
                oldReference: row.oldReference || null,
                note: row.note || null,
                createdBy: req.session?.adminUserId || 'system',
            } as any);

            created.push({ id: record.id, customer: record.customer, amount: record.amount });
        }

        console.log(`[LegacyDue] Bulk import: ${created.length} created, ${skipped.length} skipped`);
        res.status(201).json({ created: created.length, skipped: skipped.length, details: { created, skipped } });
    } catch (error: any) {
        console.error('[LegacyDue] Bulk import failed:', error.message);
        res.status(400).json({ error: 'Failed to process bulk import' });
    }
});

export default router;

/**
 * Profit for a period, and what earned it.
 *
 * Deliberately behind `finance`, the same permission as every other money
 * report: cost prices reveal supplier terms and margin, which is not something
 * every person who can ring up a sale should see.
 *
 * Both endpoints return how much of the period they could account for. Profit
 * calculated over stock whose cost was never recorded is not profit, and the
 * screen has to be able to say "this covers 62% of what you sold" rather than
 * presenting a confident number built on a third of the data.
 */
router.get(
    '/api/reports/profit',
    requireAdminAuth,
    requirePermission('finance'),
    async (req: Request, res: Response) => {
        try {
            const { from, to } = parseReportWindow(req.query);
            res.json(await getProfitSummary(from, to));
        } catch (error) {
            logRouteError('GET /api/reports/profit', req, error);
            res.status(500).json({ error: 'Could not calculate profit.' });
        }
    },
);

router.get(
    '/api/reports/profit/items',
    requireAdminAuth,
    requirePermission('finance'),
    async (req: Request, res: Response) => {
        try {
            const { from, to } = parseReportWindow(req.query);
            const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
            res.json({ items: await getItemProfit(from, to, limit) });
        } catch (error) {
            logRouteError('GET /api/reports/profit/items', req, error);
            res.status(500).json({ error: 'Could not calculate item profit.' });
        }
    },
);

/**
 * Everybody who owes the shop money — retail and corporate together.
 *
 * The question a manager is actually asked is "how much is still out there",
 * and until now it could only be answered for half the shop at a time: walk-in
 * debt lives in due_records, company debt in the unpaid remainder of corporate
 * bills, and the two were on different screens using different words.
 */
router.get(
    '/api/admin/receivables',
    requireAdminAuth,
    requirePermission('finance'),
    async (req: Request, res: Response) => {
        try {
            const { getReceivables } = await import('../services/receivables.service.js');
            res.json(await getReceivables());
        } catch (error) {
            logRouteError('GET /api/admin/receivables', req, error);
            res.status(500).json({ error: 'Could not total what is owed.' });
        }
    },
);

/**
 * One customer's dated statement — the answer to "we do not owe that".
 *
 * `kind` decides where the money is read from: a walk-in customer's history is
 * in due_records keyed by phone, a company's is its issued bills.
 */
router.get(
    '/api/admin/receivables/:kind/:id/statement',
    requireAdminAuth,
    requirePermission('finance'),
    async (req: Request, res: Response) => {
        try {
            const { getRetailStatement, getCorporateStatement } =
                await import('../services/customer-statement.service.js');

            const kind = String(req.params.kind);
            if (kind !== 'retail' && kind !== 'corporate') {
                return res.status(400).json({ error: 'Unknown customer type.' });
            }

            const statement = kind === 'retail'
                ? await getRetailStatement(decodeURIComponent(req.params.id))
                : await getCorporateStatement(req.params.id);

            if (!statement) return res.status(404).json({ error: 'No billing history for this customer.' });
            res.json(statement);
        } catch (error) {
            logRouteError('GET /api/admin/receivables/:kind/:id/statement', req, error);
            res.status(500).json({ error: 'Could not build the statement.' });
        }
    },
);

/**
 * Take a payment against everything one customer owes, from their statement.
 *
 * Collecting money used to live in a different list from the customer: you
 * found the person on a tile, then hunted a row further down the page to press
 * Settle. QA-23 called that out as the reason the feature was not "one place" —
 * a manager reads the statement, the customer hands over cash, and the button
 * to record it was somewhere else entirely.
 *
 * Applied oldest debt first. That is how a shop settles up, and it means a
 * part payment clears the bill the customer has owed longest rather than
 * spreading a little across everything and closing nothing.
 */
router.post(
    '/api/admin/receivables/:kind/:id/payment',
    requireAdminAuth,
    requirePermission('process_payment'),
    async (req: Request, res: Response) => {
        try {
            const amount = Number(req.body?.amount);
            if (!Number.isFinite(amount) || amount <= 0) {
                return res.status(400).json({ error: 'Enter how much was paid.' });
            }
            if (String(req.params.kind) !== 'retail') {
                return res.status(400).json({
                    error: 'Company payments are recorded against their bill.',
                });
            }

            const phone = decodeURIComponent(req.params.id);

            /**
             * A settlement discount, forgiven at the counter.
             *
             * The 500 left on 52,000 when 51,500 was handed over. Without it the
             * row could only be left owing for ever — every settled account
             * keeping a small false balance until receivables fills with money
             * nobody will pay — or its amount quietly edited, which erases that
             * anything was given away and makes the invoice disagree with the
             * paper the customer is holding.
             */
            const discount = Number(req.body?.discount ?? 0) || 0;
            if (discount < 0) {
                return res.status(400).json({ error: 'A discount cannot be negative.' });
            }
            const discountReason = String(req.body?.discountReason ?? '').trim();
            if (discount > 0.009 && !discountReason) {
                return res.status(400).json({ error: 'Say why the discount was given.' });
            }

            const actor = (req as any).adminSessionUser ?? (req as any).user;
            /**
             * Giving money away is a different decision from taking it.
             *
             * process_payment is held by anyone who works a counter, which is
             * right for receiving cash and wrong for deciding a balance need not
             * be paid.
             */
            if (discount > 0.009 && actor?.role !== 'Super Admin' && actor?.role !== 'Manager') {
                return res.status(403).json({
                    error: 'Only a Manager or Super Admin can settle a balance at a discount.',
                });
            }

            const open = await db.execute(sql`
                SELECT id, invoice, amount,
                       COALESCE(paid_amount, 0) AS paid_amount,
                       COALESCE(discount_amount, 0) AS discount_amount
                FROM due_records
                WHERE customer_phone = ${phone} AND status <> 'Paid'
                  AND (amount - COALESCE(paid_amount, 0) - COALESCE(discount_amount, 0)) > 0.009
                ORDER BY created_at ASC
            `);
            const rows = (open as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];
            if (!rows.length) return res.status(400).json({ error: 'Nothing is owed.' });

            /**
             * The same function the screen used to preview this.
             *
             * Two implementations of one rule is two answers, and the preview
             * would then be a guess about what the server was going to do rather
             * than the thing it does.
             */
            const dues = rows.map((r) => ({
                id: String(r.id),
                invoice: String(r.invoice ?? ''),
                amount: Number(r.amount ?? 0),
                paidAmount: Number(r.paid_amount ?? 0),
                discountAmount: Number(r.discount_amount ?? 0),
            }));

            const outstanding = accountTotals(dues).outstanding;
            if (amount + discount > outstanding + 0.009) {
                return res.status(400).json({
                    error: `That is more than the ${outstanding.toLocaleString()} owed.`,
                });
            }

            const plan = planAllocation(dues, amount, discount);
            const settled: string[] = [];

            for (const a of plan.allocations) {
                const row = dues.find((d) => d.id === a.dueId)!;
                const nowPaid = money(row.paidAmount + a.applied);
                const nowDiscount = money(row.discountAmount + a.discounted);

                /**
                 * Through the repository, not raw SQL, so the catch-up job is
                 * settled alongside its due. Writing the row directly here would
                 * leave the job saying unpaid — the exact drift this feature was
                 * just fixed for.
                 */
                await financeRepo.updateDueRecord(String(a.dueId), {
                    paidAmount: nowPaid,
                    discountAmount: nowDiscount,
                    status: a.settled ? 'Paid' : 'Pending',
                    paidAt: new Date(),
                    ...(a.discounted > 0.009
                        ? {
                              discountReason,
                              discountBy: actor?.name || actor?.id || 'unknown',
                              discountAt: new Date(),
                          }
                        : {}),
                } as never);

                settled.push(String(a.dueId));
            }

            await auditLogger.log({
                userId: (req as any).session?.adminUserId || 'system',
                action: discount > 0.009 ? 'DUE_SETTLED_WITH_DISCOUNT' : 'DUE_PAYMENT_RECORDED',
                entity: 'DueRecord',
                entityId: settled[0] ?? phone,
                details:
                    `Recorded ${amount} against ${phone}, applied to ${settled.length} record(s) oldest first` +
                    (discount > 0.009 ? ` - ${discount} discounted: ${discountReason}` : ''),
                severity: 'warning',
                req,
            }).catch(() => {});

            res.json({
                ok: true,
                applied: amount,
                discounted: plan.totalDiscounted,
                remaining: plan.outstandingAfter,
                recordsTouched: settled.length,
            });
        } catch (error) {
            logRouteError('POST /api/admin/receivables/:kind/:id/payment', req, error);
            res.status(500).json({ error: 'Could not record the payment.' });
        }
    },
);
