/**
 * B2B-ACCOUNT-BATCH-01 — staff Corporate / Corporate Ltd. account-linked intake.
 */
import { Router, type Request, type Response } from "express";
import {
  requireAdminAuth,
  requireGranularPermission,
  userHasGranularPermission,
} from "./middleware/auth.js";
import { auditLogger } from "../utils/auditLogger.js";

const router = Router();

function logFail(op: string, error: any) {
  const code =
    typeof error?.code === "string"
      ? error.code
      : error?.name === "B2bAccountIntakeError"
        ? "B2B_INTAKE_ERROR"
        : "UNHANDLED";
  console.error(`[B2bAccountIntake] ${op} failed code=${code}`);
}

/**
 * GET /api/admin/b2b-account-intake/accounts?lane=corporate|limited_company&q=
 * Compact cards only: id, companyName, shortCode, clientType.
 */
router.get(
  "/api/admin/b2b-account-intake/accounts",
  requireAdminAuth,
  requireGranularPermission("jobs.create"),
  async (req: Request, res: Response) => {
    try {
      const {
        searchB2bAccountsForLane,
        B2B_LANE_CORPORATE,
        B2B_LANE_LIMITED,
        B2bAccountIntakeError,
      } = await import("../services/b2b-account-intake.service.js");

      const laneRaw = typeof req.query.lane === "string" ? req.query.lane : "";
      if (laneRaw !== B2B_LANE_CORPORATE && laneRaw !== B2B_LANE_LIMITED) {
        return res.status(400).json({
          error: "lane must be corporate or limited_company",
          code: "INVALID_LANE",
        });
      }
      const q = typeof req.query.q === "string" ? req.query.q : "";
      const items = await searchB2bAccountsForLane(laneRaw, q);
      return res.json({ items });
    } catch (error: any) {
      if (error?.name === "B2bAccountIntakeError") {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      logFail("search", error);
      return res.status(500).json({ error: "Failed to search B2B accounts" });
    }
  },
);

async function handleIntake(req: Request, res: Response, mode: "single" | "batch") {
  try {
    const creator = (req as any).user;
    if (!creator?.id) {
      return res.status(401).json({ error: "Admin authentication required" });
    }

    const { createB2bAccountIntake, B2bAccountIntakeError } = await import(
      "../services/b2b-account-intake.service.js"
    );

    const canAssign = userHasGranularPermission(creator, "jobs.assignTechnician");
    const result = await createB2bAccountIntake({
      body: req.body && typeof req.body === "object" ? { ...req.body } : {},
      mode,
      creator: { id: creator.id, name: creator.name || "Staff" },
      canAssignTechnician: canAssign,
    });

    await auditLogger
      .log({
        userId: creator.id,
        action: mode === "single" ? "B2B_ACCOUNT_INTAKE_SINGLE" : "B2B_ACCOUNT_INTAKE_BATCH",
        entity: mode === "single" ? "JobTicket" : "JobBatch",
        entityId:
          mode === "single" ? (result as any).job?.id : (result as any).batch?.id,
        details:
          mode === "single"
            ? `B2B ${result.lane} single intake`
            : `B2B ${result.lane} batch intake n=${(result as any).jobs?.length ?? 0}`,
        req,
      })
      .catch(() => {});

    return res.status(201).json(result);
  } catch (error: any) {
    if (error?.name === "B2bAccountIntakeError") {
      return res
        .status(error.status)
        .json({ error: error.message, code: error.code, details: error.details });
    }
    logFail(mode, error);
    return res.status(500).json({ error: "Failed to create B2B account intake" });
  }
}

router.post(
  "/api/admin/b2b-account-intake/single",
  requireAdminAuth,
  requireGranularPermission("jobs.create"),
  (req, res) => handleIntake(req, res, "single"),
);

router.post(
  "/api/admin/b2b-account-intake/batch",
  requireAdminAuth,
  requireGranularPermission("jobs.create"),
  (req, res) => handleIntake(req, res, "batch"),
);

export default router;
