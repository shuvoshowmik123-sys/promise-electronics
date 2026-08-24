/**
 * Bulk test-record removal, and the bin that makes it reversible.
 *
 * Super Admin only, and deliberately not a grantable permission: this deletes
 * across the whole system in one action. Every call that removes or restores
 * anything is written to the audit trail as critical, including the ids, so the
 * record of what was destroyed survives the destruction.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAdminAuth, requireSuperAdmin } from "./middleware/auth.js";
import { auditLogger } from "../utils/auditLogger.js";
import {
    ENTITY_DEFS,
    listCandidates,
    candidateCounts,
    deleteRecords,
    listBin,
    getBinEntry,
    restoreRecords,
    purgeExpired,
    purgeNow,
    BIN_RETENTION_HOURS,
} from "../services/record-bin.service.js";

const router = Router();

const idsSchema = z.object({
    type: z.string().min(1).max(40),
    ids: z.array(z.string().min(1).max(80)).min(1).max(500),
    /** Typed by hand, exactly as the old cleanup tool required. */
    confirm: z.string().optional(),
});

/** The type rail: what exists, and how much of it. */
router.get(
    "/api/admin/record-bin/types",
    requireAdminAuth,
    requireSuperAdmin,
    async (_req: Request, res: Response) => {
        try {
            const counts = await candidateCounts();
            res.json({
                retentionHours: BIN_RETENTION_HOURS,
                types: Object.entries(ENTITY_DEFS).map(([key, def]) => ({
                    key,
                    label: def.label,
                    count: counts[key]?.count ?? 0,
                    total: counts[key]?.total ?? 0,
                    error: counts[key]?.error ?? null,
                })),
            });
        } catch (error) {
            console.error("[RecordBin] types failed:", (error as Error).message);
            res.status(500).json({ error: "Could not read the record types." });
        }
    },
);

/** Everything of one type that looks like test data, blocked rows included and marked. */
router.get(
    "/api/admin/record-bin/candidates/:type",
    requireAdminAuth,
    requireSuperAdmin,
    async (req: Request, res: Response) => {
        try {
            if (!ENTITY_DEFS[req.params.type]) {
                return res.status(400).json({ error: "Unknown record type." });
            }
            const search = typeof req.query.search === "string" ? req.query.search : undefined;
            const showAll = req.query.all === "1" || req.query.all === "true";
            res.json({ candidates: await listCandidates(req.params.type, { search, showAll }) });
        } catch (error) {
            console.error("[RecordBin] candidates failed:", (error as Error).message);
            res.status(500).json({ error: "Could not read those records." });
        }
    },
);

/**
 * Delete the named records into the bin.
 *
 * The confirmation word is checked on the server, not just the screen — the
 * screen is a convenience, the server is the rule.
 */
router.post(
    "/api/admin/record-bin/delete",
    requireAdminAuth,
    requireSuperAdmin,
    async (req: Request, res: Response) => {
        try {
            const parsed = idsSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ error: "Tell me which records to remove." });
            }
            if (parsed.data.confirm !== "DELETE") {
                return res.status(400).json({
                    error: 'Type DELETE to confirm.',
                    code: "CONFIRMATION_REQUIRED",
                });
            }
            const actor = (req as unknown as { user?: { id: string; name?: string; username?: string } }).user;
            const actorName = actor?.name || actor?.username || "Super Admin";

            const outcome = await deleteRecords(parsed.data.type, parsed.data.ids, {
                id: actor?.id,
                name: actorName,
            });

            await auditLogger.log({
                userId: actor?.id || "system",
                action: "TEST_RECORDS_DELETED",
                entity: parsed.data.type,
                entityId: outcome.deleted.join(",").slice(0, 500) || "none",
                details:
                    `${actorName} removed ${outcome.deleted.length} ${parsed.data.type} record(s) ` +
                    `and ${outcome.linkedRowsRemoved} linked row(s). ` +
                    `${outcome.refused.length} refused. Recoverable for ${BIN_RETENTION_HOURS}h.`,
                severity: "critical",
                req,
            }).catch(() => {});

            res.json(outcome);
        } catch (error) {
            console.error("[RecordBin] delete failed:", (error as Error).message);
            res.status(500).json({ error: "Could not remove those records." });
        }
    },
);

/** What is still restorable. */
router.get(
    "/api/admin/record-bin",
    requireAdminAuth,
    requireSuperAdmin,
    async (_req: Request, res: Response) => {
        try {
            res.json({ entries: await listBin(), retentionHours: BIN_RETENTION_HOURS });
        } catch (error) {
            console.error("[RecordBin] list failed:", (error as Error).message);
            res.status(500).json({ error: "Could not open the bin." });
        }
    },
);

/** One entry in full, so it can be read before being restored. */
router.get(
    "/api/admin/record-bin/entry/:id",
    requireAdminAuth,
    requireSuperAdmin,
    async (req: Request, res: Response) => {
        try {
            const entry = await getBinEntry(req.params.id);
            if (!entry) return res.status(404).json({ error: "That entry is not in the bin." });
            res.json(entry);
        } catch (error) {
            console.error("[RecordBin] entry failed:", (error as Error).message);
            res.status(500).json({ error: "Could not open that entry." });
        }
    },
);

router.post(
    "/api/admin/record-bin/restore",
    requireAdminAuth,
    requireSuperAdmin,
    async (req: Request, res: Response) => {
        try {
            const parsed = z.object({ binIds: z.array(z.string().min(1)).min(1).max(500) })
                .safeParse(req.body);
            if (!parsed.success) return res.status(400).json({ error: "Tell me what to restore." });

            const outcome = await restoreRecords(parsed.data.binIds);
            const actor = (req as unknown as { user?: { id: string; name?: string; username?: string } }).user;
            await auditLogger.log({
                userId: actor?.id || "system",
                action: "TEST_RECORDS_RESTORED",
                entity: "RecordBin",
                entityId: outcome.restored.join(",").slice(0, 500) || "none",
                details:
                    `${actor?.name || "Super Admin"} restored ${outcome.restored.length} entry(s), ` +
                    `${outcome.rowsRestored} row(s). ${outcome.refused.length} refused.`,
                severity: "critical",
                req,
            }).catch(() => {});
            res.json(outcome);
        } catch (error) {
            console.error("[RecordBin] restore failed:", (error as Error).message);
            res.status(500).json({ error: "Could not restore those records." });
        }
    },
);

/** Empty named entries early, or sweep the expired ones. */
router.post(
    "/api/admin/record-bin/purge",
    requireAdminAuth,
    requireSuperAdmin,
    async (req: Request, res: Response) => {
        try {
            const binIds = Array.isArray(req.body?.binIds) ? (req.body.binIds as string[]) : [];
            const removed = binIds.length > 0 ? await purgeNow(binIds) : await purgeExpired();
            const actor = (req as unknown as { user?: { id: string; name?: string } }).user;
            await auditLogger.log({
                userId: actor?.id || "system",
                action: "TEST_RECORDS_PURGED",
                entity: "RecordBin",
                entityId: binIds.join(",").slice(0, 500) || "expired",
                details: `${actor?.name || "Super Admin"} purged ${removed} bin entry(s) permanently.`,
                severity: "critical",
                req,
            }).catch(() => {});
            res.json({ purged: removed });
        } catch (error) {
            console.error("[RecordBin] purge failed:", (error as Error).message);
            res.status(500).json({ error: "Could not empty the bin." });
        }
    },
);

export default router;
