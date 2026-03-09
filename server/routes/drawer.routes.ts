import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { financeRepo, posRepo, userRepo, notificationRepo } from '../repositories/index.js';
import { insertDrawerSessionSchema } from '../../shared/schema.js';
import { auditLogger } from '../utils/auditLogger.js';
import { requireAdminAuth } from './middleware/auth.js';
import { runDrawerDayCloseNow } from '../services/drawer-day-close.service.js';

export const drawerRouter = Router();

function appendRouteNote(existing: string | null | undefined, note: string): string {
    const base = (existing ?? '').trim();
    return base ? `${base}\n${note}` : note;
}

type OpeningVarianceStatus = 'balanced' | 'surplus' | 'shortage';

function withOpeningVariance<T extends { startingFloat: number }>(
    session: T,
    baselineFloat: number | null
): T & {
    openingBaselineFloat?: number;
    openingDifference?: number;
    openingVarianceStatus?: OpeningVarianceStatus;
} {
    if (baselineFloat === null || Number.isNaN(baselineFloat)) return session;

    const openedFloat = Number(session.startingFloat ?? 0);
    const openingDifference = openedFloat - baselineFloat;
    const openingVarianceStatus: OpeningVarianceStatus =
        Math.abs(openingDifference) < 0.01 ? 'balanced' : openingDifference > 0 ? 'surplus' : 'shortage';

    return {
        ...session,
        openingBaselineFloat: baselineFloat,
        openingDifference,
        openingVarianceStatus,
    };
}

// Get active drawer session
drawerRouter.get('/api/drawer/active', async (req: Request, res: Response) => {
    try {
        const activeDrawer = await posRepo.getCurrentDrawerSession();
        if (!activeDrawer) {
            return res.status(200).json(null);
        }
        const baselineSession = await posRepo.getLatestClosedDrawerSession();
        const baselineFloat = baselineSession ? Number(baselineSession.startingFloat ?? 0) : null;
        res.json(withOpeningVariance(activeDrawer, baselineFloat));
    } catch (error) {
        console.error("Error fetching active drawer:", error);
        res.status(500).json({ message: "Failed to fetch active drawer status." });
    }
});

// Get drawer history
drawerRouter.get('/api/drawer/history', async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const history = await storage.getDrawerHistory(page, limit);
        res.json(history);
    } catch (error) {
        console.error("Error fetching drawer history:", error);
        res.status(500).json({ message: "Failed to fetch drawer history." });
    }
});

// Manual QA trigger for drawer day-end pipeline (Admin only)
drawerRouter.post('/api/drawer/day-close/run-now', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const actorId = user?.id || req.session?.adminUserId || 'system';
        const actorName = user?.name || user?.username || 'Admin';

        const result = await runDrawerDayCloseNow({
            id: actorId,
            name: actorName,
        });

        res.json(result);
    } catch (error) {
        console.error("Error running day-close pipeline:", error);
        res.status(500).json({ message: "Failed to execute drawer day-close run." });
    }
});

// Direct POS close-day endpoint
drawerRouter.post('/api/drawer/:id/close-day', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { mode, note } = req.body ?? {};

        if (mode !== 'reconciled' && mode !== 'under_review') {
            return res.status(400).json({ executed: false, reason: 'invalid_mode' });
        }

        const actor = (req as any).user;
        const actorId = actor?.id || req.session?.adminUserId;
        const actorName = actor?.name || actor?.username || 'Admin';
        if (!actorId) {
            return res.status(401).json({ executed: false, reason: 'auth_required' });
        }

        const session = await posRepo.getDrawerSession(id);
        if (!session) {
            return res.status(404).json({ executed: false, reason: 'session_not_found' });
        }

        if (session.closedAt) {
            return res.json({
                executed: false,
                reason: 'already_closed',
                sessionId: session.id,
                updatedStatus: session.status,
                closedAt: new Date(session.closedAt).toISOString(),
            });
        }

        if (session.status !== 'counting') {
            return res.status(400).json({
                executed: false,
                reason: 'blind_drop_required',
                sessionId: session.id,
                updatedStatus: session.status,
            });
        }

        if (mode === 'reconciled' && Math.abs(Number(session.discrepancy ?? 0)) >= 0.01) {
            return res.status(400).json({
                executed: false,
                reason: 'discrepancy_requires_review',
                sessionId: session.id,
                updatedStatus: session.status,
            });
        }

        const closedAt = new Date();
        const status = mode === 'reconciled' ? 'reconciled' : 'counting';
        const auditSuffix = mode === 'reconciled'
            ? 'Register closed after balanced blind drop.'
            : 'Register day closed under review; Super Admin reconciliation required.';
        const notePrefix = `[POS CLOSE ${closedAt.toISOString()}]`;
        const systemNote = mode === 'reconciled'
            ? `${notePrefix} ${auditSuffix}`
            : `${notePrefix} ${auditSuffix}`;
        const mergedNotes = appendRouteNote(session.notes, note ? `${systemNote} Note: ${String(note).trim()}` : systemNote);

        const updated = await posRepo.updateDrawerSession(id, {
            status,
            closedAt,
            notes: mergedNotes,
            ...(mode === 'reconciled' ? { closedBy: actorId, closedByName: actorName } : {}),
        });

        if (!updated) {
            return res.status(500).json({ executed: false, reason: 'session_update_failed' });
        }

        await auditLogger.log({
            userId: actorId,
            action: mode === 'reconciled' ? 'CLOSE_REGISTER_RECONCILED' : 'CLOSE_REGISTER_UNDER_REVIEW',
            entity: 'DrawerSession',
            entityId: id,
            details: `${actorName} closed register in mode '${mode}'.`,
            newValue: {
                status: updated.status,
                closedAt: updated.closedAt,
                mode,
            },
            req,
            severity: mode === 'reconciled' ? 'info' : 'warning',
        });

        res.json({
            executed: true,
            sessionId: updated.id,
            updatedStatus: updated.status,
            closedAt: updated.closedAt ? new Date(updated.closedAt).toISOString() : closedAt.toISOString(),
        });
    } catch (error) {
        console.error("Error closing register day:", error);
        res.status(500).json({ executed: false, reason: 'internal_error' });
    }
});

// Open a new register session
drawerRouter.post('/api/drawer/open', async (req: Request, res: Response) => {
    try {
        const data = insertDrawerSessionSchema.parse(req.body);

        // Ensure no other register is currently open
        const existing = await posRepo.getCurrentDrawerSession();
        if (existing) {
            return res.status(400).json({ message: "A register session is already active. Please close it first." });
        }

        const baselineSession = await posRepo.getLatestClosedDrawerSession();
        const baselineFloat = baselineSession ? Number(baselineSession.startingFloat ?? 0) : null;
        const openedFloat = Number(data.startingFloat ?? 0);
        const openingDifference = baselineFloat === null ? null : openedFloat - baselineFloat;
        const hasVariance = openingDifference !== null && Math.abs(openingDifference) >= 0.01;

        const varianceNote = hasVariance
            ? `[OPEN VARIANCE ${new Date().toISOString()}] Baseline ${baselineFloat?.toFixed(2)} vs opened ${openedFloat.toFixed(2)}. Difference ${openingDifference!.toFixed(2)}.`
            : null;

        const payload = hasVariance
            ? { ...data, notes: appendRouteNote(data.notes, varianceNote!) }
            : data;

        const newDrawer = await storage.openDrawer(payload);
        const response = withOpeningVariance(newDrawer, baselineFloat);

        if (hasVariance) {
            const openerName = newDrawer.openedByName || 'Unknown';
            const sign = openingDifference! > 0 ? '+' : '-';
            const varianceLabel = openingDifference! > 0 ? 'surplus' : 'shortage';
            const absDiff = Math.abs(openingDifference!).toFixed(2);

            try {
                const allUsersResult = await userRepo.getAllUsers(1, 500);
                const adminUsers = allUsersResult.items.filter(
                    (u: any) => u.role === 'super_admin' || u.role === 'admin' || u.role === 'Super Admin' || u.role === 'Admin'
                );
                for (const admin of adminUsers) {
                    await notificationRepo.createNotification({
                        userId: admin.id,
                        title: 'Opening Float Variance Detected',
                        message: `Register opened by ${openerName} with ${varianceLabel}: ${sign}৳${absDiff}. Baseline: ৳${baselineFloat!.toFixed(2)}, Opened: ৳${openedFloat.toFixed(2)}.`,
                        type: 'alert',
                    });
                }
            } catch (notifyErr) {
                console.error("[Drawer] Failed to send opening variance notifications:", notifyErr);
            }

            await auditLogger.log({
                userId: newDrawer.openedBy,
                action: 'OPENING_FLOAT_VARIANCE',
                entity: 'DrawerSession',
                entityId: newDrawer.id,
                details: `${openerName} opened register with ${varianceLabel} (${sign}${absDiff}) vs latest closed baseline.`,
                newValue: {
                    openingBaselineFloat: baselineFloat,
                    openedFloat,
                    openingDifference,
                },
                req,
                severity: 'warning',
            });
        }

        res.status(201).json(response);
    } catch (error) {
        console.error("Error opening drawer:", error);
        res.status(500).json({ message: "Failed to open register." });
    }
});

// Perform a Blind Drop (Cashier closes shift)
drawerRouter.post('/api/drawer/:id/drop', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { declaredCash } = req.body;

        if (declaredCash === undefined || declaredCash === null) {
            return res.status(400).json({ message: "Declared cash amount is required." });
        }

        const updatedDrawer = await storage.logBlindDrop(id, Number(declaredCash));
        if (!updatedDrawer) {
            return res.status(404).json({ message: "Drawer session not found." });
        }

        const discrepancy = updatedDrawer.discrepancy ?? 0;
        const cashierName = updatedDrawer.openedByName || 'Unknown';
        const expectedCash = updatedDrawer.expectedCash ?? updatedDrawer.startingFloat;

        // Notify admins on shortage or surplus
        try {
            // Get all admin/super_admin users
            const allUsersResult = await userRepo.getAllUsers(1, 500);
            const adminUsers = allUsersResult.items.filter(
                (u: any) => u.role === 'super_admin' || u.role === 'admin' || u.role === 'Super Admin' || u.role === 'Admin'
            );

            if (discrepancy < 0) {
                // SHORTAGE — Critical notification to all admins
                const shortageAmount = Math.abs(discrepancy).toFixed(2);
                for (const admin of adminUsers) {
                    await notificationRepo.createNotification({
                        userId: admin.id,
                        title: '⚠️ Cash Shortage Detected',
                        message: `৳${shortageAmount} shortage in register session opened by ${cashierName}. Declared: ৳${Number(declaredCash).toFixed(2)}, Expected: ৳${Number(expectedCash).toFixed(2)}. This requires review and justification.`,
                        type: 'alert',
                    });
                }
                console.log(`[Drawer] SHORTAGE: ৳${shortageAmount} — notified ${adminUsers.length} admin(s)`);
            } else if (discrepancy > 0) {
                // SURPLUS — Info notification
                const surplusAmount = discrepancy.toFixed(2);
                for (const admin of adminUsers) {
                    await notificationRepo.createNotification({
                        userId: admin.id,
                        title: 'ℹ️ Cash Surplus Detected',
                        message: `৳${surplusAmount} surplus in register session by ${cashierName}. Declared: ৳${Number(declaredCash).toFixed(2)}, Expected: ৳${Number(expectedCash).toFixed(2)}.`,
                        type: 'info',
                    });
                }
                console.log(`[Drawer] SURPLUS: ৳${surplusAmount} — notified ${adminUsers.length} admin(s)`);
            }
        } catch (notifyErr) {
            console.error("[Drawer] Failed to send notifications:", notifyErr);
            // Don't fail the blind drop if notification fails
        }

        // Return full result including discrepancy status
        const result = {
            ...updatedDrawer,
            discrepancyStatus: discrepancy < 0 ? 'shortage' : discrepancy > 0 ? 'surplus' : 'exact',
            discrepancyAmount: Math.abs(discrepancy),
        };

        res.json(result);
    } catch (error) {
        console.error("Error logging blind drop:", error);
        res.status(500).json({ message: "Failed to process blind drop." });
    }
});

// Reconcile Drawer (Manager verifies counts)
drawerRouter.patch('/api/drawer/:id/reconcile', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status, notes, closedBy, closedByName } = req.body;

        if (!status || !closedBy || !closedByName) {
            return res.status(400).json({ message: "Missing required reconciliation fields." });
        }

        const reconciled = await storage.reconcileDrawer(id, { status, notes, closedBy, closedByName });
        if (!reconciled) {
            return res.status(404).json({ message: "Drawer session not found." });
        }

        res.json(reconciled);
    } catch (error) {
        console.error("Error reconciling drawer:", error);
        res.status(500).json({ message: "Failed to reconcile drawer." });
    }
});

// Get session summary (live stats for the active drawer)
drawerRouter.get('/api/drawer/:id/summary', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const session = await posRepo.getDrawerSession(id);
        if (!session) {
            return res.status(404).json({ message: "Session not found." });
        }

        const startingFloat = Number(session.startingFloat || 0);
        const expectedCash = Number(session.expectedCash ?? startingFloat);
        const cashFlow = expectedCash - startingFloat; // Net cash movement
        const openedAt = session.openedAt ? new Date(session.openedAt) : new Date();
        const durationMs = Date.now() - openedAt.getTime();
        const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(1);

        res.json({
            id: session.id,
            status: session.status,
            openedBy: session.openedByName,
            openedAt: session.openedAt,
            startingFloat,
            expectedCash,
            cashFlow,
            durationHours,
            declaredCash: session.declaredCash,
            discrepancy: session.discrepancy,
        });
    } catch (error) {
        console.error("Error fetching session summary:", error);
        res.status(500).json({ message: "Failed to get session summary." });
    }
});

// Super Admin: Justify a shortage (add unrecorded expense)
drawerRouter.post('/api/drawer/:id/justify', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { amount, description, justifiedBy, justifiedByName } = req.body;

        if (!amount || !description || !justifiedBy || !justifiedByName) {
            return res.status(400).json({ message: "Amount, description, justifiedBy, and justifiedByName are required." });
        }

        const justifyAmount = Number(amount);
        if (isNaN(justifyAmount) || justifyAmount <= 0) {
            return res.status(400).json({ message: "Amount must be a positive number." });
        }

        // Get the session
        const session = await posRepo.getDrawerSession(id);
        if (!session) {
            return res.status(404).json({ message: "Drawer session not found." });
        }

        // Create a petty cash record for this justified expense
        await financeRepo.createPettyCashRecord({
            description: `[JUSTIFIED] ${description} (Drawer: ${id})`,
            category: 'Justified Expense',
            amount: justifyAmount,
            type: 'Expense',
        });

        // Update the drawer's expectedCash down by the justified amount
        // This accounts for the missing money, reducing the discrepancy
        const updated = await posRepo.updateDrawerExpectedCash(id, -justifyAmount);

        // Recalculate discrepancy if blind drop was already done
        if (session.declaredCash !== null && session.declaredCash !== undefined && updated) {
            const newExpected = Number(updated.expectedCash ?? updated.startingFloat);
            const newDiscrepancy = Number(session.declaredCash) - newExpected;

            await posRepo.updateDrawerSession(id, {
                discrepancy: newDiscrepancy,
                // If discrepancy resolved, auto-reconcile
                ...(Math.abs(newDiscrepancy) < 0.01 ? { status: 'reconciled', closedAt: new Date(), closedBy: justifiedBy, closedByName: justifiedByName, notes: `Auto-reconciled: shortage justified by ${justifiedByName}` } : {}),
            });
        }

        // Audit log
        await auditLogger.log({
            userId: justifiedBy,
            action: 'JUSTIFY_SHORTAGE',
            entity: 'DrawerSession',
            entityId: id,
            details: `Super Admin justified ৳${justifyAmount.toFixed(2)} shortage: ${description}`,
            newValue: { amount: justifyAmount, description, justifiedByName },
            req,
        });

        res.json({
            message: `Shortage of ৳${justifyAmount.toFixed(2)} justified successfully.`,
            drawer: updated,
        });
    } catch (error) {
        console.error("Error justifying shortage:", error);
        res.status(500).json({ message: "Failed to justify shortage." });
    }
});
