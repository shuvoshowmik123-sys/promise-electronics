/**
 * Payment Blacklist Routes (manual, human-managed)
 *
 * Admins MANUALLY block sender numbers confirmed as abuse — never auto-populated.
 * The "review" endpoint surfaces numbers with repeated rejections (rolling 48h)
 * so staff can decide before closing the register: typo (whitelist/ignore) vs
 * abuse (block). Deleting a blacklist row = whitelist ("as if nothing happened").
 */
import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { paymentBlacklist, manualPayments } from '../../shared/schema.js';
import { and, eq, gte, desc, sql, count } from 'drizzle-orm';
import { requireAdminAuth, requirePermission } from './middleware/auth.js';
import { smsService } from '../services/sms.service.js';
import { userRepo } from '../repositories/index.js';
import { nanoid } from 'nanoid';

const router = Router();

/** Is a phone number currently (manually) blacklisted from submitting payments? */
export async function isPhoneBlacklisted(phone?: string | null): Promise<boolean> {
    if (!phone) return false;
    const normalized = smsService.normalizePhoneNumber(phone);
    const [hit] = await db.select({ id: paymentBlacklist.id })
        .from(paymentBlacklist)
        .where(eq(paymentBlacklist.phone, normalized))
        .limit(1);
    return !!hit;
}

// GET /api/admin/payment-blacklist — current manual blocks
router.get('/api/admin/payment-blacklist', requireAdminAuth, requirePermission('finance'), async (_req: Request, res: Response) => {
    try {
        const rows = await db.select().from(paymentBlacklist).orderBy(desc(paymentBlacklist.createdAt));
        res.json(rows);
    } catch (e: any) {
        res.status(500).json({ error: 'Failed to fetch blacklist' });
    }
});

// GET /api/admin/payment-blacklist/review — register-close review (rolling 48h)
router.get('/api/admin/payment-blacklist/review', requireAdminAuth, requirePermission('finance'), async (_req: Request, res: Response) => {
    try {
        const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
        // Candidates = numbers with repeated rejected submissions in the last 48h.
        const candidates = await db
            .select({
                phone: manualPayments.senderNumber,
                rejections: count(),
                lastAmount: sql<number>`max(${manualPayments.amount})`,
                lastAt: sql<string>`max(${manualPayments.createdAt})`,
                customerName: sql<string>`max(${manualPayments.customerName})`,
                serviceRequestId: sql<string>`max(${manualPayments.serviceRequestId})`,
            })
            .from(manualPayments)
            .where(and(
                eq(manualPayments.status, 'rejected'),
                gte(manualPayments.createdAt, since),
            ))
            .groupBy(manualPayments.senderNumber)
            .having(sql`count(*) >= 2`);

        const blacklisted = await db.select().from(paymentBlacklist).orderBy(desc(paymentBlacklist.createdAt));
        const blacklistedSet = new Set(blacklisted.map(b => b.phone));

        const flagged = candidates
            .filter(c => c.phone)
            .map(c => ({
                phone: c.phone,
                rejections: Number(c.rejections),
                lastAmount: c.lastAmount,
                lastAt: c.lastAt,
                customerName: c.customerName,
                serviceRequestId: c.serviceRequestId,
                alreadyBlacklisted: blacklistedSet.has(smsService.normalizePhoneNumber(c.phone || '')),
            }));

        res.json({ windowHours: 48, flagged, blacklisted });
    } catch (e: any) {
        console.error('[Blacklist] review failed:', e.message);
        res.status(500).json({ error: 'Failed to build blacklist review' });
    }
});

// POST /api/admin/payment-blacklist — manually block a number
router.post('/api/admin/payment-blacklist', requireAdminAuth, requirePermission('finance'), async (req: Request, res: Response) => {
    try {
        const { phone, reason, serviceRequestId } = req.body || {};
        if (!phone || !smsService.isValidBangladeshPhone(phone)) {
            return res.status(400).json({ error: 'A valid Bangladesh phone number is required' });
        }
        const normalized = smsService.normalizePhoneNumber(phone);
        if (await isPhoneBlacklisted(normalized)) {
            return res.status(409).json({ error: 'This number is already blacklisted' });
        }

        const actor = await userRepo.getUser(req.session.adminUserId!);
        const [row] = await db.insert(paymentBlacklist).values({
            id: nanoid(),
            phone: normalized,
            reason: reason || null,
            addedBy: actor?.id || req.session.adminUserId || null,
            addedByName: actor?.name || (actor as any)?.username || 'Admin',
            serviceRequestId: serviceRequestId || null,
        }).returning();
        res.status(201).json(row);
    } catch (e: any) {
        res.status(500).json({ error: 'Failed to add to blacklist' });
    }
});

// DELETE /api/admin/payment-blacklist/:id — whitelist (remove), "as if nothing happened"
router.delete('/api/admin/payment-blacklist/:id', requireAdminAuth, requirePermission('finance'), async (req: Request, res: Response) => {
    try {
        await db.delete(paymentBlacklist).where(eq(paymentBlacklist.id, req.params.id));
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: 'Failed to remove from blacklist' });
    }
});

export default router;
