/**
 * TECHNICIAN-QR-TRACKING-01 — public external QR resolve + staff print-target issue.
 */
import { Router, type Request, type Response } from "express";
import {
  requireAdminAuth,
  requireGranularPermission,
} from "./middleware/auth.js";

const router = Router();

const NOT_FOUND = { error: "Not found" };

/**
 * GET /api/public/external-track/:token
 * Resolve opaque QR credential → safe job or batch status DTO only.
 */
router.get("/api/public/external-track/:token", async (req: Request, res: Response) => {
  try {
    const token = typeof req.params.token === "string" ? req.params.token.trim() : "";
    const { publicResolveExternalQr } = await import(
      "../services/external-qr-tracking.service.js"
    );
    const payload = await publicResolveExternalQr(token);
    if (!payload) {
      return res.status(404).json(NOT_FOUND);
    }
    return res.json(payload);
  } catch {
    return res.status(404).json(NOT_FOUND);
  }
});

/**
 * POST /api/admin/external-qr/print-target
 * Staff-only: issue a new opaque print URL for an external job or batch slip.
 * Does not revoke prior credentials — earlier printed slips stay valid.
 * Body: { jobId } | { batchId }
 */
router.post(
  "/api/admin/external-qr/print-target",
  requireAdminAuth,
  requireGranularPermission("jobs.create"),
  async (req: Request, res: Response) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
      const batchId = typeof body.batchId === "string" ? body.batchId.trim() : "";

      if ((jobId && batchId) || (!jobId && !batchId)) {
        return res.status(400).json({ error: "Provide exactly one of jobId or batchId" });
      }

      const {
        issuePrintTargetForJob,
        issuePrintTargetForBatch,
      } = await import("../services/external-qr-tracking.service.js");

      const issued = jobId
        ? await issuePrintTargetForJob(jobId)
        : await issuePrintTargetForBatch(batchId);

      if (!issued) {
        return res.status(404).json(NOT_FOUND);
      }

      const origin =
        typeof req.headers.origin === "string" && req.headers.origin
          ? req.headers.origin
          : undefined;
      const publicUrl = origin ? `${origin}${issued.path}` : issued.path;

      return res.json({
        path: issued.path,
        publicUrl,
        entityType: issued.entityType,
        entityId: issued.entityId,
      });
    } catch {
      return res.status(500).json({ error: "Failed to issue print target" });
    }
  },
);

export default router;
