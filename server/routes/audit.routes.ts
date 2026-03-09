import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { auditLogs, users } from '../../shared/schema.js';
import { desc, eq, and, sql } from 'drizzle-orm';
import { requireAdminAuth, requirePermission } from './middleware/auth.js';

const router = Router();

/**
 * GET /api/audit-logs — Retrieve system audit logs enriched with actor names.
 *
 * The audit_logs table stores userId (an opaque nanoid). This route does a
 * LEFT JOIN with the users table so every log row carries the human-readable
 * actorName for the Actor column, fixing the "random alphanumeric" display.
 */
router.get('/api/audit-logs', requireAdminAuth, requirePermission('auditLogs'), async (req: Request, res: Response) => {
    try {
        const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string), 1000) : 500;
        const userId = req.query.userId as string | undefined;
        const entity = req.query.entity as string | undefined;
        const search = req.query.search as string | undefined;
        const startDate = req.query.startDate as string | undefined;
        const endDate = req.query.endDate as string | undefined;

        let query = db
            .select({
                id: auditLogs.id,
                userId: auditLogs.userId,
                actorName: sql<string>`COALESCE(${users.name}, 'System')`,
                action: auditLogs.action,
                entity: auditLogs.entity,
                entityId: auditLogs.entityId,
                details: auditLogs.details,
                metadata: auditLogs.metadata,
                changes: auditLogs.changes,
                severity: auditLogs.severity,
                createdAt: auditLogs.createdAt,
            })
            .from(auditLogs)
            .leftJoin(users, eq(auditLogs.userId, users.id))
            .orderBy(desc(auditLogs.createdAt))
            .$dynamic();

        const conditions: any[] = [];
        if (userId) conditions.push(eq(auditLogs.userId, userId));
        if (entity) conditions.push(eq(auditLogs.entity, entity));

        if (startDate) {
            conditions.push(sql`${auditLogs.createdAt} >= ${new Date(startDate).toISOString()}`);
        }
        if (endDate) {
            conditions.push(sql`${auditLogs.createdAt} <= ${new Date(endDate).toISOString()}`);
        }

        if (search) conditions.push(
            sql`(${auditLogs.action} ILIKE ${'%' + search + '%'} OR ${auditLogs.details} ILIKE ${'%' + search + '%'})`
        );

        if (conditions.length > 0) {
            query = query.where(and(...conditions)) as typeof query;
        }

        const logs = await query.limit(limit);
        res.json(logs);
    } catch (error) {
        console.error('Failed to fetch audit logs', error);
        res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
});

export default router;
