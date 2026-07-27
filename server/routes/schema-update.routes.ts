/**
 * Protected schema-update control plane (Super Admin only).
 *
 * Creates durable update requests and returns redacted status derived from the
 * canonical MAIN ledger (promise_schema_migrations / verifyMainSchemaLedger).
 * NEVER executes DDL, shell commands, npm, child processes, or migration SQL
 * on the Express request path.
 */
import { Router, type Request, type Response } from "express";
import { requireAdminAuth, requireSuperAdmin } from "./middleware/auth.js";
import { storage } from "../storage.js";
import {
  createSchemaUpdateRequest,
  getRunById,
  getSchemaUpdateStatus,
  projectCanonicalLedgerForBrowser,
  redactAnyBrowserPayload,
  redactRun,
} from "../services/schema-update-run.service.js";
import type { LedgerVerification } from "../services/main-schema-migrate.service.js";

const router = Router();

/**
 * GET /api/admin/schema-updates/status
 * Safe status only — no secrets, SQL, hashes, or runner credentials.
 * Ledger projection uses the canonical verifyMainSchemaLedger authority.
 */
router.get(
  "/api/admin/schema-updates/status",
  requireAdminAuth,
  requireSuperAdmin,
  async (_req: Request, res: Response) => {
    try {
      const status = await getSchemaUpdateStatus();
      res.json(redactAnyBrowserPayload(status));
    } catch {
      res.status(500).json({
        error: "Unable to load schema update status.",
        code: "STATUS_UNAVAILABLE",
      });
    }
  }
);

/**
 * POST /api/admin/schema-updates/requests
 * Super Admin only. Requires confirm=true + password re-auth.
 * Records a durable request; does not execute migrations.
 */
router.post(
  "/api/admin/schema-updates/requests",
  requireAdminAuth,
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user || user.role !== "Super Admin") {
        return res.status(403).json({ error: "Super Admin access required" });
      }

      const fullUser = await storage.getUser(user.id);
      if (!fullUser || fullUser.role !== "Super Admin" || !fullUser.password) {
        return res.status(403).json({ error: "Super Admin access required" });
      }

      const { confirm, password } = req.body ?? {};
      const result = await createSchemaUpdateRequest({
        userId: fullUser.id,
        password: typeof password === "string" ? password : "",
        passwordHash: fullUser.password,
        confirm: confirm === true,
        req,
      });

      if (!result.ok) {
        return res.status(result.status).json(
          redactAnyBrowserPayload({
            error: result.error,
            code: result.code,
          })
        );
      }

      return res.status(result.duplicate ? 200 : 201).json(
        redactAnyBrowserPayload({
          run: redactRun(result.run),
          duplicate: result.duplicate,
          message: result.duplicate
            ? "An active schema update request already exists."
            : "Schema update request recorded. A protected runner must process it.",
        })
      );
    } catch {
      return res.status(500).json({
        error: "Unable to create schema update request.",
        code: "REQUEST_FAILED",
      });
    }
  }
);

/**
 * GET /api/admin/schema-updates/runs/:id
 */
router.get(
  "/api/admin/schema-updates/runs/:id",
  requireAdminAuth,
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const run = await getRunById(String(req.params.id));
      if (!run) {
        return res.status(404).json({ error: "Run not found", code: "NOT_FOUND" });
      }
      return res.json(redactAnyBrowserPayload({ run: redactRun(run) }));
    } catch {
      return res.status(500).json({
        error: "Unable to load schema update run.",
        code: "RUN_UNAVAILABLE",
      });
    }
  }
);

/** Pure helper for tests: project a LedgerVerification without DB I/O. */
export function projectLedgerVerificationForBrowser(verification: LedgerVerification) {
  return projectCanonicalLedgerForBrowser(verification);
}

export default router;
