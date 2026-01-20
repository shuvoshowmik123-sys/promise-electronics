import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { requireAdminAuth, requirePermission } from './middleware/auth.js';

const router = Router();
console.log('DEBUG: Audit Routes Loaded');

/**
 * GET /api/audit-logs - Retrieve system audit logs (super admin or report viewer)
 */
router.get('/api/audit-logs', requireAdminAuth, requirePermission('settings'), async (req: Request, res: Response) => {
    console.log('DEBUG: GET /api/audit-logs hit', req.query);
    try {
        const filters = {
            userId: req.query.userId as string,
            entity: req.query.entity as string,
            limit: req.query.limit ? parseInt(req.query.limit as string) : 100
        };
        const logs = await storage.getAuditLogs(filters);
        res.json(logs);
    } catch (error) {
        console.error('Failed to fetch audit logs', error);
        res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
});

export default router;
