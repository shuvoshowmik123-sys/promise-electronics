/**
 * Warranty sticker routes.
 *
 * Every one of these requires an admin login. The shop chose staff-only
 * verification deliberately: a public page would let anyone standing next to a
 * television learn when it was repaired and whether the cover has run out,
 * which is the first thing a person planning a false claim would want to know.
 */
import { Router, type Request, type Response } from "express";

import { requireAdminAuth, requireGranularPermission } from "./middleware/auth.js";
import { userRepo } from "../repositories/index.js";
import { auditLogger } from "../utils/auditLogger.js";
import {
    StickerError,
    ensureStickersForJob,
    recentScans,
    verifySticker,
} from "../services/warranty-sticker.service.js";

const router = Router();

/** Attribution comes from the session; a caller-supplied name proves nothing. */
async function resolveActor(req: Request): Promise<{ id: string; name: string }> {
    const id = (req as any).user?.id || req.session?.adminUserId || "system";
    let name = (req as any).user?.name || "Staff";
    if (id && id !== "system") {
        try {
            const admin = await userRepo.getUser(id);
            if (admin?.name) name = admin.name;
        } catch { /* the scan record still carries the id */ }
    }
    return { id, name };
}

/**
 * POST /api/warranty-stickers/verify — is this ours, and is it still covered?
 *
 * POST rather than GET with the code in the path, so the code never lands in a
 * server access log or a browser history. A warranty code in a log file is a
 * warranty code somebody can print.
 */
router.post("/api/warranty-stickers/verify", requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const actor = await resolveActor(req);
        const outcome = await verifySticker(String(req.body?.code ?? ""), actor);
        res.json(outcome);
    } catch (error) {
        console.error("[WarrantySticker] Verification failed:", error);
        res.status(500).json({ error: "Could not check that code" });
    }
});

/**
 * GET /api/jobs/:id/warranty-stickers — the two stickers for a job.
 *
 * Creates them on first ask. Printing is the only way to get a sticker onto a
 * television, so the moment somebody asks to print is the moment the codes are
 * guaranteed to exist — no completion hook to miss.
 */
router.get("/api/jobs/:id/warranty-stickers", requireAdminAuth, requireGranularPermission("jobs.view"), async (req: Request, res: Response) => {
    try {
        const actor = await resolveActor(req);
        const stickers = await ensureStickersForJob(req.params.id, actor);
        res.json(stickers);
    } catch (error) {
        if (error instanceof StickerError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error("[WarrantySticker] Issue failed:", error);
        res.status(500).json({ error: "Could not prepare the warranty stickers" });
    }
});

/**
 * GET /api/warranty-stickers/scans — recent checks, including the failures.
 *
 * The failures are the point. A run of unknown codes is the earliest sign that
 * somebody is printing their own stickers.
 */
router.get("/api/warranty-stickers/scans", requireAdminAuth, requireGranularPermission("warranty.view"), async (req: Request, res: Response) => {
    try {
        res.json(await recentScans(Number(req.query.limit) || 50));
    } catch (error) {
        console.error("[WarrantySticker] Scan history failed:", error);
        res.status(500).json({ error: "Could not load scan history" });
    }
});

export default router;
