/**
 * Catalog Import Routes (Phase 35A)
 *
 * CSV bulk import for first-time setup data. Super Admin only.
 *   GET  /api/admin/catalog-import/templates/:type — CSV template download
 *   POST /api/admin/catalog-import/preview          — validate, no writes
 *   POST /api/admin/catalog-import/commit           — re-validate + import valid rows
 */

import { Router, Request, Response } from 'express';
import { requireAdminAuth, requireSuperAdmin } from './middleware/auth.js';
import { auditLogger } from '../utils/auditLogger.js';
import {
    getTemplate, isImportType, validateImport, commitImport,
    type ImportMode,
} from '../services/catalog-import.service.js';

const router = Router();

const VALID_MODES: ImportMode[] = ['createOnly', 'updateExisting', 'createAndUpdate'];

function parseBody(req: Request): { type?: string; csvText?: string; mode?: string; options?: { autoCreateCategories?: boolean } } {
    const { type, csvText, mode, options } = req.body ?? {};
    return { type, csvText, mode, options };
}

router.get('/api/admin/catalog-import/templates/:type', requireAdminAuth, requireSuperAdmin, (req: Request, res: Response) => {
    const { type } = req.params;
    if (!isImportType(type)) {
        return res.status(400).json({ error: 'Unknown import type' });
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-template.csv"`);
    res.send(getTemplate(type));
});

router.post('/api/admin/catalog-import/preview', requireAdminAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const { type, csvText, mode, options } = parseBody(req);
        if (!type || !isImportType(type)) {
            return res.status(400).json({ error: 'Unknown import type' });
        }
        if (typeof csvText !== 'string' || csvText.trim() === '') {
            return res.status(400).json({ error: 'csvText is required' });
        }
        if (!mode || !VALID_MODES.includes(mode as ImportMode)) {
            return res.status(400).json({ error: 'mode must be createOnly, updateExisting, or createAndUpdate' });
        }
        const result = await validateImport(type, csvText, mode as ImportMode, {
            autoCreateCategories: options?.autoCreateCategories === true,
        });
        res.json(result);
    } catch (error: any) {
        console.error('[CatalogImport] Preview error:', error?.message);
        res.status(500).json({ error: 'Failed to preview import' });
    }
});

router.post('/api/admin/catalog-import/commit', requireAdminAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const { type, csvText, mode, options } = parseBody(req);
        if (!type || !isImportType(type)) {
            return res.status(400).json({ error: 'Unknown import type' });
        }
        if (typeof csvText !== 'string' || csvText.trim() === '') {
            return res.status(400).json({ error: 'csvText is required' });
        }
        if (!mode || !VALID_MODES.includes(mode as ImportMode)) {
            return res.status(400).json({ error: 'mode must be createOnly, updateExisting, or createAndUpdate' });
        }

        const result = await commitImport(type, csvText, mode as ImportMode, {
            autoCreateCategories: options?.autoCreateCategories === true,
        });

        await auditLogger.log({
            userId: req.session.adminUserId!,
            action: 'BULK_IMPORT_COMMIT',
            entity: 'CatalogImport',
            entityId: result.batchId,
            details: `type=${type} mode=${mode} created=${result.created} updated=${result.updated} skipped=${result.skipped} failed=${result.failed}`,
            req,
        }).catch(() => {});

        res.json(result);
    } catch (error: any) {
        console.error('[CatalogImport] Commit error:', error?.message);
        res.status(500).json({ error: 'Failed to commit import' });
    }
});

export default router;
