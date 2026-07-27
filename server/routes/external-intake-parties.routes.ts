/**
 * JOB-INTAKE-UNIFICATION-01A-A — staff-only external Technician/shop party lookup + create.
 * Permission: jobs.create only (not role-name Admin bypass; Technician Basic has no create).
 */
import { Router, type Request, type Response } from "express";
import { requireAdminAuth, requireGranularPermission } from "./middleware/auth.js";
import { auditLogger } from "../utils/auditLogger.js";

const router = Router();

function logPartyFail(op: string, error: any) {
  const code =
    typeof error?.code === "string"
      ? error.code
      : error?.name === "ExternalIntakePartyError"
        ? "EXTERNAL_PARTY_ERROR"
        : "UNHANDLED";
  console.error(`[ExternalIntakeParty] ${op} failed code=${code}`);
}

/**
 * GET /api/admin/external-intake-parties?q=
 * Compact cards from external_intake_parties only — never customers/users.
 */
router.get(
  "/api/admin/external-intake-parties",
  requireAdminAuth,
  requireGranularPermission("jobs.create"),
  async (req: Request, res: Response) => {
    try {
      const { searchExternalIntakeParties } = await import(
        "../services/external-intake-party.service.js"
      );
      const items = await searchExternalIntakeParties(req.query.q);
      return res.json({ items });
    } catch (error: any) {
      if (error?.name === "ExternalIntakePartyError") {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      logPartyFail("search", error);
      return res.status(500).json({ error: "Failed to search external parties" });
    }
  },
);

/**
 * POST /api/admin/external-intake-parties
 * Create external_technician party only. No job/batch/customer/user side effects.
 */
router.post(
  "/api/admin/external-intake-parties",
  requireAdminAuth,
  requireGranularPermission("jobs.create"),
  async (req: Request, res: Response) => {
    try {
      const { createExternalIntakeParty } = await import(
        "../services/external-intake-party.service.js"
      );
      const card = await createExternalIntakeParty({
        name: req.body?.name,
        phone: req.body?.phone,
        shortAddress: req.body?.shortAddress ?? req.body?.short_address,
        kind: req.body?.kind,
      });

      const actor = (req as any).user;
      await auditLogger
        .log({
          userId: actor?.id || req.session?.adminUserId || "system",
          action: "CREATE_EXTERNAL_INTAKE_PARTY",
          entity: "ExternalIntakeParty",
          entityId: card.id,
          details: "Created external technician intake party",
          req,
        })
        .catch(() => {});

      return res.status(201).json(card);
    } catch (error: any) {
      if (error?.name === "ExternalIntakePartyError") {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      logPartyFail("create", error);
      return res.status(500).json({ error: "Failed to create external party" });
    }
  },
);

export default router;
