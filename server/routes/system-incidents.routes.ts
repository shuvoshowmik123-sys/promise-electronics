import { Router, Request, Response } from "express";
import { requireAdminAuth, requireSuperAdmin } from "./middleware/auth.js";
import {
  acknowledgeIncident,
  getIncidentSummary,
  listIncidents,
  resolveIncident,
  testOnlyRecordFixedCode,
} from "../services/system-incidents.service.js";
import { auditLogger } from "../utils/auditLogger.js";

const router = Router();

router.get(
  "/api/admin/system-incidents",
  requireAdminAuth,
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const offset = req.query.offset ? Number(req.query.offset) : 0;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const data = await listIncidents({ status, limit, offset });
      res.json(data);
    } catch {
      res.status(503).json({ error: "Incident list unavailable", code: "INCIDENTS_UNAVAILABLE" });
    }
  },
);

router.get(
  "/api/admin/system-incidents/summary",
  requireAdminAuth,
  requireSuperAdmin,
  async (_req: Request, res: Response) => {
    try {
      const summary = await getIncidentSummary();
      res.json(summary);
    } catch {
      res.status(503).json({ error: "Incident summary unavailable", code: "INCIDENTS_UNAVAILABLE" });
    }
  },
);

router.post(
  "/api/admin/system-incidents/:id/acknowledge",
  requireAdminAuth,
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || (req.session as any)?.user;
      const actorId = user?.id || "unknown";
      const result = await acknowledgeIncident(req.params.id, actorId);
      if (!result.ok) {
        return res.status(404).json({ error: "Incident not found or not open", code: "INCIDENT_NOT_FOUND" });
      }
      await auditLogger.log({
        userId: actorId,
        action: "ACKNOWLEDGE",
        entity: "SystemIncident",
        entityId: req.params.id,
        details: "Super Admin acknowledged system incident",
        req,
        severity: "info",
      });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to acknowledge incident" });
    }
  },
);

router.post(
  "/api/admin/system-incidents/:id/resolve",
  requireAdminAuth,
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user || (req.session as any)?.user;
      const actorId = user?.id || "unknown";
      const result = await resolveIncident(req.params.id, actorId);
      if (!result.ok) {
        return res.status(404).json({ error: "Incident not found or already resolved", code: "INCIDENT_NOT_FOUND" });
      }
      await auditLogger.log({
        userId: actorId,
        action: "RESOLVE",
        entity: "SystemIncident",
        entityId: req.params.id,
        details: "Super Admin resolved system incident",
        req,
        severity: "info",
      });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to resolve incident" });
    }
  },
);

/** NODE_ENV=test only — fixed-code seam for QA (no free text). */
router.post(
  "/api/admin/system-incidents/test/record-fixed",
  requireAdminAuth,
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    if (process.env.NODE_ENV !== "test") {
      return res.status(404).json({ error: "Not found" });
    }
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const result = await testOnlyRecordFixedCode(code);
    if (!result.ok) return res.status(400).json({ error: "Rejected", code: result.reason });
    res.status(201).json({ ok: true });
  },
);

export default router;
