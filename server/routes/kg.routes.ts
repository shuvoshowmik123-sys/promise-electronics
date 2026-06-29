/**
 * Knowledge Graph admin routes
 *
 * GET    /api/kg/facts            list facts (search, paginate)
 * POST   /api/kg/facts            add fact
 * DELETE /api/kg/facts/:id        remove fact
 * POST   /api/kg/facts/import     CSV bulk import
 * GET    /api/kg/stats            count + summary
 * POST   /api/kg/test-extract     debug: extract entities from text
 */
import { Router, type Request, type Response } from 'express';
import { requireAdminAuth, requireGranularPermission } from './middleware/auth.js';
import {
    addFact, listFacts, deleteFact, countFacts,
    bulkImportFacts, extractEntities, getRelevantFacts,
} from '../brain/kg.service.js';

const router = Router();

router.get('/api/kg/facts', requireAdminAuth, requireGranularPermission('aiBrain.view'), async (req: Request, res: Response) => {
    try {
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
        const offset = parseInt(req.query.offset as string) || 0;
        const search = (req.query.search as string)?.trim();
        const rows = await listFacts({ limit, offset, search });
        res.json({ success: true, data: rows });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/api/kg/facts', requireAdminAuth, requireGranularPermission('aiBrain.manage'), async (req: Request, res: Response) => {
    try {
        const { subject, predicate, value, tags, confidence, expiresAt } = req.body;
        if (!subject || !predicate || !value) {
            return res.status(400).json({ success: false, error: 'subject, predicate, value required' });
        }
        const user = (req as any).session?.adminUserId ?? 'admin';
        const fact = await addFact({
            subject, predicate, value,
            tags: Array.isArray(tags) ? tags : undefined,
            confidence: typeof confidence === 'number' ? confidence : undefined,
            expiresAt: expiresAt ? new Date(expiresAt) : undefined,
            createdBy: user,
        });
        res.json({ success: true, data: fact });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.delete('/api/kg/facts/:id', requireAdminAuth, requireGranularPermission('aiBrain.manage'), async (req: Request, res: Response) => {
    try {
        await deleteFact(req.params.id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/api/kg/facts/import', requireAdminAuth, requireGranularPermission('aiBrain.manage'), async (req: Request, res: Response) => {
    try {
        const { csv } = req.body;
        if (typeof csv !== 'string' || !csv.trim()) {
            return res.status(400).json({ success: false, error: 'csv string required' });
        }
        const user = (req as any).session?.adminUserId ?? 'admin';
        const result = await bulkImportFacts(csv, user);
        res.json({ success: true, ...result });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/api/kg/stats', requireAdminAuth, async (_req: Request, res: Response) => {
    try {
        const total = await countFacts();
        res.json({ success: true, data: { totalFacts: total } });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/api/kg/test-extract', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ success: false, error: 'text required' });
        const tags = extractEntities(text);
        const facts = await getRelevantFacts(tags);
        res.json({ success: true, data: { tags, matchedFacts: facts } });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

export default router;
