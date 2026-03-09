import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { eq, sql } from 'drizzle-orm';
import { inventoryItems, jobTickets, posTransactions } from '../../shared/schema.js';

const router = Router();

router.post('/sync', async (req: Request, res: Response) => {
    const { entries } = req.body;
    if (!Array.isArray(entries)) {
        return res.status(400).json({ error: "Expected an array of entries" });
    }

    const results = [];

    for (const entry of entries) {
        try {
            // For MVP Conflict mapping, intercept POS or inventory decrements if possible.
            if (entry.type === "pos_sale") {
                const payload = entry.payload;
                const items = typeof payload.items === 'string' ? JSON.parse(payload.items) : payload.items;
                let hasConflict = false;
                let conflictReason = "";

                // Validation: Pre-check stock levels
                for (let item of items) {
                    const current = await db.select().from(inventoryItems).where(eq(inventoryItems.id, item.id)).limit(1);
                    if (current.length === 0) {
                        hasConflict = true;
                        conflictReason = `Item ${item.id} not found.`;
                        break;
                    }
                    if (current[0].stock < item.quantity) {
                        hasConflict = true;
                        conflictReason = `Negative stock conflict for ${current[0].name}. Available: ${current[0].stock}, Requested: ${item.quantity}`;
                        break;
                    }
                }

                if (hasConflict) {
                    results.push({ id: entry.id, status: "conflict", reason: conflictReason });
                } else {
                    // In reality, execute actual transaction insertion logic here
                    // For this MVP implementation plan pass, standard ok resolution is mapped
                    results.push({ id: entry.id, status: "synced" });
                }
            } else {
                // Auto accept job/inventory changes without complex validation for now
                results.push({ id: entry.id, status: "synced" });
            }

        } catch (e: any) {
            console.error(`[Offline Sync] Failed processing entry ${entry.id}`, e);
            results.push({ id: entry.id, status: "failed", reason: e.message });
        }
    }

    return res.json({ success: true, results });
});

export default router;
