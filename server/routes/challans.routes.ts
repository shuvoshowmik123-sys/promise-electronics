/**
 * Challans Routes — operational (retail) challans
 * UNIFIED-OPS-01B: granular create/edit/assignDriver/delete; own-scope mutations; sanitized errors.
 */

import { Router, Request, Response } from 'express';
import { financeRepo } from '../repositories/index.js';
import { storage } from '../storage.js';
import { insertChallanSchema } from '../../shared/schema.js';
import {
    requireAdminAuth,
    requireGranularPermission,
    requireAnyGranularPermission,
    userHasGranularPermission,
} from './middleware/auth.js';
import { auditLogger } from '../utils/auditLogger.js';

const router = Router();

router.use('/api/challans', requireAdminAuth);

const CHALLAN_READ_KEYS = [
    'challans.view',
    'challans.viewOwn',
    'challans.create',
    'challans.edit',
    'challans.manage',
] as const;

function canViewAllOpsChallans(user: { role: string; permissions?: string | null }): boolean {
    return userHasGranularPermission(user, 'challans.view');
}

function canAccessChallan(
    user: { id: string; role: string; permissions?: string | null },
    challan: { createdByUserId?: string | null; assignedDriverId?: string | null },
): boolean {
    if (canViewAllOpsChallans(user)) return true;
    if (
        userHasGranularPermission(user, 'challans.viewOwn') ||
        userHasGranularPermission(user, 'challans.create') ||
        userHasGranularPermission(user, 'challans.edit') ||
        userHasGranularPermission(user, 'challans.manage')
    ) {
        return challan.createdByUserId === user.id || challan.assignedDriverId === user.id;
    }
    return false;
}

function canEditChallan(
    user: { id: string; role: string; permissions?: string | null },
    challan: { createdByUserId?: string | null; assignedDriverId?: string | null },
): boolean {
    if (!userHasGranularPermission(user, 'challans.edit') && !userHasGranularPermission(user, 'challans.manage')) {
        return false;
    }
    if (canViewAllOpsChallans(user)) return true;
    if (userHasGranularPermission(user, 'challans.viewOwn')) {
        return challan.createdByUserId === user.id || challan.assignedDriverId === user.id;
    }
    // edit/manage without view-all and without viewOwn → own created/assigned only
    return challan.createdByUserId === user.id || challan.assignedDriverId === user.id;
}

function canAssignDriver(user: { role: string; permissions?: string | null }): boolean {
    return userHasGranularPermission(user, 'challans.assignDriver');
}

/** Fire-and-forget audit; never blocks successful mutation responses. */
function auditChallanMutation(params: Parameters<typeof auditLogger.log>[0]): void {
    auditLogger.log(params).catch(() => {});
}

async function validateActiveDriverUserId(driverId: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const driver = await storage.getUser(driverId);
    if (!driver) {
        return { ok: false, error: 'Assigned driver not found' };
    }
    if (driver.role !== 'Driver') {
        return { ok: false, error: 'assignedDriverId must reference an active Driver account' };
    }
    if (String(driver.status || '').toLowerCase() !== 'active') {
        return { ok: false, error: 'Assigned driver is not active' };
    }
    return { ok: true };
}

/**
 * GET /api/challans
 */
router.get(
    '/api/challans',
    requireAnyGranularPermission([...CHALLAN_READ_KEYS]),
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

            let items;
            if (canViewAllOpsChallans(user)) {
                items = await financeRepo.getAllChallans();
            } else {
                items = await financeRepo.getChallansVisibleToUser(user.id);
            }
            res.json(items);
        } catch (error) {
            console.error('[Challans] list failed');
            res.status(500).json({ error: 'Failed to fetch challans' });
        }
    },
);

/**
 * GET /api/challans/:id
 */
router.get(
    '/api/challans/:id',
    requireAnyGranularPermission([...CHALLAN_READ_KEYS]),
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

            const challan = await financeRepo.getChallan(req.params.id);
            if (!challan) {
                return res.status(404).json({ error: 'Challan not found' });
            }
            if (!canAccessChallan(user, challan as any)) {
                return res.status(403).json({ error: 'Access denied: not your challan' });
            }
            res.json(challan);
        } catch (error) {
            console.error('[Challans] get failed');
            res.status(500).json({ error: 'Failed to fetch challan' });
        }
    },
);

/**
 * POST /api/challans
 */
router.post(
    '/api/challans',
    requireAnyGranularPermission(['challans.create', 'challans.manage']),
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

            const validated = insertChallanSchema.parse(req.body);
            const body = { ...validated };

            // Always stamp creator from authenticated session — never trust client.
            (body as any).createdByUserId = user.id;

            const requestedDriverId =
                body.assignedDriverId === undefined || body.assignedDriverId === null || body.assignedDriverId === ''
                    ? undefined
                    : String(body.assignedDriverId);

            if (canAssignDriver(user)) {
                if (requestedDriverId) {
                    const check = await validateActiveDriverUserId(requestedDriverId);
                    if (!check.ok) {
                        return res.status(400).json({ error: check.error });
                    }
                    (body as any).assignedDriverId = requestedDriverId;
                }
            } else {
                // Without assignDriver: reject client assignment of another user.
                if (requestedDriverId && requestedDriverId !== user.id) {
                    return res.status(403).json({ error: 'Access denied: missing challans.assignDriver' });
                }
                // Driver product flow: force self-assignment when role is Driver; otherwise null.
                if (user.role === 'Driver') {
                    (body as any).assignedDriverId = user.id;
                } else {
                    (body as any).assignedDriverId = null;
                }
            }

            const challan = await financeRepo.createChallan(body);
            // Mutation already succeeded — audit must never flip this into an HTTP failure.
            auditChallanMutation({
                userId: user.id,
                action: 'CREATE',
                entity: 'Challan',
                entityId: challan.id,
                details: 'Operational challan created',
                newValue: {
                    id: challan.id,
                    type: (challan as any).type,
                    status: (challan as any).status,
                    assignedDriverId: (challan as any).assignedDriverId ?? null,
                },
                req,
                severity: 'info',
            });
            res.status(201).json(challan);
        } catch (error: any) {
            if (error?.name === 'ZodError') {
                return res.status(400).json({ error: 'Invalid challan data', details: error.errors });
            }
            console.error('[Challans] create failed');
            res.status(500).json({ error: 'Failed to create challan' });
        }
    },
);

/**
 * PATCH /api/challans/:id
 */
router.patch(
    '/api/challans/:id',
    requireAnyGranularPermission(['challans.edit', 'challans.manage']),
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

            const existing = await financeRepo.getChallan(req.params.id);
            if (!existing) {
                return res.status(404).json({ error: 'Challan not found' });
            }
            if (!canEditChallan(user, existing as any)) {
                return res.status(403).json({ error: 'Access denied: cannot edit this challan' });
            }

            const updates = insertChallanSchema.partial().parse(req.body);
            // Never allow client to re-stamp creator.
            delete (updates as any).createdByUserId;

            const assignmentInBody = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'assignedDriverId');
            if (assignmentInBody) {
                if (!canAssignDriver(user)) {
                    return res.status(403).json({ error: 'Access denied: missing challans.assignDriver' });
                }
                const nextDriverId =
                    updates.assignedDriverId === undefined ||
                    updates.assignedDriverId === null ||
                    updates.assignedDriverId === ''
                        ? null
                        : String(updates.assignedDriverId);
                if (nextDriverId) {
                    const check = await validateActiveDriverUserId(nextDriverId);
                    if (!check.ok) {
                        return res.status(400).json({ error: check.error });
                    }
                    (updates as any).assignedDriverId = nextDriverId;
                } else {
                    (updates as any).assignedDriverId = null;
                }
            } else {
                delete (updates as any).assignedDriverId;
            }

            const challan = await financeRepo.updateChallan(req.params.id, updates);
            if (!challan) {
                return res.status(404).json({ error: 'Challan not found' });
            }

            const action = assignmentInBody ? 'ASSIGN_DRIVER' : 'UPDATE';
            auditChallanMutation({
                userId: user.id,
                action,
                entity: 'Challan',
                entityId: challan.id,
                details: assignmentInBody
                    ? 'Operational challan driver assignment updated'
                    : 'Operational challan updated',
                oldValue: {
                    status: (existing as any).status,
                    assignedDriverId: (existing as any).assignedDriverId ?? null,
                },
                newValue: {
                    status: (challan as any).status,
                    assignedDriverId: (challan as any).assignedDriverId ?? null,
                },
                req,
                severity: assignmentInBody ? 'warning' : 'info',
            });

            res.json(challan);
        } catch (error: any) {
            if (error?.name === 'ZodError') {
                return res.status(400).json({ error: 'Invalid challan data', details: error.errors });
            }
            console.error('[Challans] update failed');
            res.status(500).json({ error: 'Failed to update challan' });
        }
    },
);

/**
 * DELETE /api/challans/:id
 * Explicit challans.delete only — deprecated manage does NOT grant delete.
 */
router.delete(
    '/api/challans/:id',
    requireGranularPermission('challans.delete'),
    async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;
            if (!user?.id) return res.status(401).json({ error: 'Unauthorized' });

            const existing = await financeRepo.getChallan(req.params.id);
            if (!existing) {
                return res.status(404).json({ error: 'Challan not found' });
            }

            const success = await financeRepo.deleteChallan(req.params.id);
            if (!success) {
                return res.status(404).json({ error: 'Challan not found' });
            }

            auditChallanMutation({
                userId: user.id,
                action: 'DELETE',
                entity: 'Challan',
                entityId: req.params.id,
                details: 'Operational challan deleted',
                oldValue: {
                    id: existing.id,
                    status: (existing as any).status,
                    type: (existing as any).type,
                },
                req,
                severity: 'critical',
            });

            res.json({ success: true });
        } catch (error) {
            console.error('[Challans] delete failed');
            res.status(500).json({ error: 'Failed to delete challan' });
        }
    },
);

export default router;
