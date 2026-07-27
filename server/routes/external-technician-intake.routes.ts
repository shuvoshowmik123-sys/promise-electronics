/**
 * JOB-INTAKE-UNIFICATION-01A-B — external Technician single/batch intake.
 * Requires jobs.create. Never uses POST /api/job-tickets.
 */
import { Router, type Request, type Response } from "express";
import {
  requireAdminAuth,
  requireGranularPermission,
  userHasGranularPermission,
} from "./middleware/auth.js";
import { auditLogger } from "../utils/auditLogger.js";

const router = Router();

function logIntakeFail(op: string, error: any) {
  const code =
    typeof error?.code === "string"
      ? error.code
      : error?.name === "ExternalTechnicianIntakeError"
        ? "EXTERNAL_INTAKE_ERROR"
        : "UNHANDLED";
  console.error(`[ExternalTechnicianIntake] ${op} failed code=${code}`);
}

async function handleIntake(req: Request, res: Response, mode: "single" | "batch") {
  try {
    const creator = (req as any).user;
    if (!creator?.id) {
      return res.status(401).json({ error: "Admin authentication required" });
    }

    const { createExternalTechnicianIntake, ExternalTechnicianIntakeError } = await import(
      "../services/external-technician-intake.service.js"
    );

    const canAssign = userHasGranularPermission(creator, "jobs.assignTechnician");
    const result = await createExternalTechnicianIntake({
      body: req.body && typeof req.body === "object" ? { ...req.body } : {},
      mode,
      creator: { id: creator.id, name: creator.name || "Staff" },
      canAssignTechnician: canAssign,
    });

    if ("requiresConfirmation" in result && result.requiresConfirmation) {
      return res.status(409).json({
        error: "Duplicate signals require confirmation",
        code: result.code,
        requiresConfirmation: true,
        signals: result.signals,
      });
    }

    await auditLogger
      .log({
        userId: creator.id,
        action: mode === "single" ? "EXTERNAL_TECH_INTAKE_SINGLE" : "EXTERNAL_TECH_INTAKE_BATCH",
        entity: mode === "single" ? "JobTicket" : "JobBatch",
        entityId:
          mode === "single"
            ? (result as any).job?.id
            : (result as any).batch?.id,
        details:
          mode === "single"
            ? "External technician single unit intake"
            : `External technician batch intake n=${(result as any).jobs?.length ?? 0}`,
        req,
      })
      .catch(() => {});

    return res.status(201).json(result);
  } catch (error: any) {
    if (error?.name === "ExternalTechnicianIntakeError") {
      if (error.code === "DUPLICATE_CONFIRMATION_REQUIRED") {
        return res.status(409).json({
          error: error.message,
          code: error.code,
          requiresConfirmation: true,
          signals: (error.details as any)?.signals ?? [],
        });
      }
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    logIntakeFail(mode, error);
    return res.status(500).json({ error: "Failed to create external technician intake" });
  }
}

router.post(
  "/api/admin/external-technician-intake/single",
  requireAdminAuth,
  requireGranularPermission("jobs.create"),
  (req, res) => handleIntake(req, res, "single"),
);

router.post(
  "/api/admin/external-technician-intake/batch",
  requireAdminAuth,
  requireGranularPermission("jobs.create"),
  (req, res) => handleIntake(req, res, "batch"),
);

export default router;
