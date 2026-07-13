import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { auditLogs, users } from '../../shared/schema.js';
import { desc, eq, and, sql, lt } from 'drizzle-orm';
import { requireAdminAuth, requirePermission, requireSuperAdmin } from './middleware/auth.js';
import { auditLogger } from '../utils/auditLogger.js';
import { AUDIT_ACTIONS } from '../../shared/constants.js';

const router = Router();

/**
 * GET /api/audit-logs — Retrieve system audit logs enriched with actor names.
 *
 * The audit_logs table stores userId (an opaque nanoid). This route does a
 * LEFT JOIN with the users table so every log row carries the human-readable
 * actorName for the Actor column, fixing the "random alphanumeric" display.
 */
router.get('/api/audit-logs', requireAdminAuth, requirePermission('auditLogs'), async (req: Request, res: Response) => {
    // Log that audit log was accessed — who is watching the watchers
    const viewerId = (req as any).session?.adminUserId || 'unknown';
    auditLogger.log({
        userId: viewerId,
        action: AUDIT_ACTIONS.VIEW_AUDIT,
        entity: 'AuditLog',
        entityId: 'list',
        details: 'Admin viewed audit log',
        req,
        severity: 'info',
    }).catch(() => {});

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

/**
 * GET /api/admin/db-health — Database optimization health check
 * Shows table sizes, index hit rates, largest tables, last vacuum times.
 * Super Admin only. On-demand — zero background cost.
 */
router.get('/api/admin/db-health', requireAdminAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const [tableSizes, indexHitRate, vacuumStats, auditStats] = await Promise.all([
            // Top 15 tables by size
            db.execute(sql`
                SELECT relname AS table_name,
                       pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
                       n_live_tup AS live_rows
                FROM pg_stat_user_tables
                ORDER BY pg_total_relation_size(relid) DESC
                LIMIT 15
            `),
            // Index hit rate (should be >99%)
            db.execute(sql`
                SELECT
                    schemaname,
                    relname AS table_name,
                    CASE WHEN (idx_scan + seq_scan) = 0 THEN NULL
                         ELSE ROUND(100.0 * idx_scan / (idx_scan + seq_scan), 2)
                    END AS index_hit_pct,
                    seq_scan,
                    idx_scan
                FROM pg_stat_user_tables
                WHERE (idx_scan + seq_scan) > 10
                ORDER BY seq_scan DESC
                LIMIT 15
            `),
            // Last vacuum/analyze per table
            db.execute(sql`
                SELECT relname AS table_name,
                       last_vacuum,
                       last_autovacuum,
                       last_analyze,
                       last_autoanalyze
                FROM pg_stat_user_tables
                ORDER BY last_autovacuum DESC NULLS LAST
                LIMIT 10
            `),
            // Audit log summary
            db.execute(sql`
                SELECT severity, count(*) AS count,
                       min(created_at) AS oldest,
                       max(created_at) AS newest
                FROM audit_logs
                GROUP BY severity
                ORDER BY severity
            `),
        ]);

        res.json({
            checkedAt: new Date().toISOString(),
            tableSizes: tableSizes.rows,
            indexHitRate: indexHitRate.rows,
            vacuumStats: vacuumStats.rows,
            auditLogSummary: auditStats.rows,
        });
    } catch (error: any) {
        console.error('DB health check failed:', error);
        res.status(500).json({ error: 'DB health check failed', detail: error.message });
    }
});

/**
 * POST /api/admin/db-health/analyze — Run ANALYZE on key tables (refreshes query planner stats)
 * Super Admin only. Safe: ANALYZE never locks, never modifies data.
 */
router.post('/api/admin/db-health/analyze', requireAdminAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const tables = ['audit_logs', 'job_tickets', 'customers', 'corporate_bills', 'staff_presence'];
        for (const t of tables) {
            await db.execute(sql.raw(`ANALYZE ${t}`));
        }
        const userId = (req as any).session?.adminUserId || 'unknown';
        auditLogger.log({
            userId,
            action: 'DB_ANALYZE',
            entity: 'Database',
            entityId: 'key_tables',
            details: `Admin ran ANALYZE on: ${tables.join(', ')}`,
            req,
            severity: 'info',
        }).catch(() => {});
        res.json({ success: true, tables });
    } catch (error: any) {
        res.status(500).json({ error: 'ANALYZE failed', detail: error.message });
    }
});

export default router;
