/**
 * CUSTOMER-FEEDBACK-01A / 01A-HOTFIX-1 — customer ownership + staff recovery/public permissions.
 * No UI. No legacy customer_reviews. No live notifications.
 */
import { Router, type Request, type Response } from "express";
import {
  requireAdminAuth,
  requireCustomerAuth,
  requireGranularPermission,
  requireAnyGranularPermission,
  getCustomerId,
} from "./middleware/auth.js";
import { auditLogger } from "../utils/auditLogger.js";

const router = Router();

/** Stable failure log only — never customer comments, SQL, or raw provider text. */
function logFeedbackFail(op: string, error: any) {
  const code =
    typeof error?.code === "string"
      ? error.code
      : error?.name === "ServiceFeedbackError"
        ? "SERVICE_FEEDBACK_ERROR"
        : "UNHANDLED";
  console.error(`[ServiceFeedback] ${op} failed code=${code}`);
}

// ── Public featured feed (anonymous, read-only) — HOTFIX-2 ────────────────

/**
 * GET /api/public/service-feedback/featured
 * Homepage testimonials from the new service-feedback authority only.
 * Not connected to legacy /api/reviews or customer_reviews.
 */
router.get("/api/public/service-feedback/featured", async (_req: Request, res: Response) => {
  try {
    const { listPublicFeaturedTestimonials } = await import(
      "../services/service-feedback.service.js"
    );
    const result = await listPublicFeaturedTestimonials();
    return res.json(result);
  } catch (error: any) {
    logFeedbackFail("public_featured", error);
    return res.status(500).json({ error: "Failed to fetch featured reviews" });
  }
});

// ── Customer ──────────────────────────────────────────────────────────────

router.get(
  "/api/customer/service-feedback",
  requireCustomerAuth,
  async (req: Request, res: Response) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) return res.status(401).json({ error: "Customer authentication required" });
      const { listCustomerFeedbackOpportunities } = await import(
        "../services/service-feedback.service.js"
      );
      const result = await listCustomerFeedbackOpportunities(customerId);
      return res.json(result);
    } catch (error: any) {
      logFeedbackFail("list_customer", error);
      return res.status(500).json({ error: "Failed to list feedback" });
    }
  },
);

router.get(
  "/api/customer/service-feedback/:id",
  requireCustomerAuth,
  async (req: Request, res: Response) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) return res.status(401).json({ error: "Customer authentication required" });
      const { getCustomerFeedbackOpportunity, ServiceFeedbackError } = await import(
        "../services/service-feedback.service.js"
      );
      const result = await getCustomerFeedbackOpportunity(req.params.id, customerId);
      return res.json(result);
    } catch (error: any) {
      if (error?.name === "ServiceFeedbackError") {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      logFeedbackFail("get_customer", error);
      return res.status(500).json({ error: "Failed to get feedback" });
    }
  },
);

router.post(
  "/api/customer/service-feedback/:id/submit",
  requireCustomerAuth,
  async (req: Request, res: Response) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) return res.status(401).json({ error: "Customer authentication required" });
      const { submitCustomerFeedback, ServiceFeedbackError } = await import(
        "../services/service-feedback.service.js"
      );
      const result = await submitCustomerFeedback({
        opportunityId: req.params.id,
        customerId,
        rating: req.body?.rating,
        comment: req.body?.comment,
        publicConsent: req.body?.publicConsent,
      });
      return res.status(201).json(result);
    } catch (error: any) {
      if (error?.name === "ServiceFeedbackError") {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      logFeedbackFail("submit", error);
      return res.status(500).json({ error: "Failed to submit feedback" });
    }
  },
);

router.post(
  "/api/customer/service-feedback/:id/withdraw-consent",
  requireCustomerAuth,
  async (req: Request, res: Response) => {
    try {
      const customerId = getCustomerId(req);
      if (!customerId) return res.status(401).json({ error: "Customer authentication required" });
      const { withdrawCustomerConsent, ServiceFeedbackError } = await import(
        "../services/service-feedback.service.js"
      );
      const result = await withdrawCustomerConsent(req.params.id, customerId);
      return res.json(result);
    } catch (error: any) {
      if (error?.name === "ServiceFeedbackError") {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      logFeedbackFail("withdraw_consent", error);
      return res.status(500).json({ error: "Failed to withdraw consent" });
    }
  },
);

// ── Staff recovery ────────────────────────────────────────────────────────

router.get(
  "/api/admin/service-feedback/recovery",
  requireAdminAuth,
  requireAnyGranularPermission([
    "feedback.recovery.viewAll",
    "feedback.recovery.viewAssigned",
  ]),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { listRecoveryCases, ServiceFeedbackError } = await import(
        "../services/service-feedback.service.js"
      );
      const result = await listRecoveryCases(user, {
        status: typeof req.query.status === "string" ? req.query.status : undefined,
      });
      return res.json(result);
    } catch (error: any) {
      if (error?.name === "ServiceFeedbackError") {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      logFeedbackFail("recovery_list", error);
      return res.status(500).json({ error: "Failed to list recovery cases" });
    }
  },
);

router.patch(
  "/api/admin/service-feedback/recovery/:id",
  requireAdminAuth,
  requireGranularPermission("feedback.recovery.updateAssigned"),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { updateRecoveryCase, ServiceFeedbackError } = await import(
        "../services/service-feedback.service.js"
      );
      const result = await updateRecoveryCase(user, req.params.id, {
        staffNotes: req.body?.staffNotes,
        status: req.body?.status,
        assignedToUserId: req.body?.assignedToUserId,
        assignmentScope: req.body?.assignmentScope,
        logisticsTaskId: req.body?.logisticsTaskId,
      });
      await auditLogger
        .log({
          userId: user.id,
          action: "FEEDBACK_RECOVERY_UPDATE",
          entity: "ServiceFeedbackRecovery",
          entityId: req.params.id,
          details: "Recovery case updated",
          req,
        })
        .catch(() => {});
      return res.json(result);
    } catch (error: any) {
      if (error?.name === "ServiceFeedbackError") {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      logFeedbackFail("recovery_update", error);
      return res.status(500).json({ error: "Failed to update recovery case" });
    }
  },
);

router.post(
  "/api/admin/service-feedback/recovery/:id/resolve",
  requireAdminAuth,
  requireGranularPermission("feedback.recovery.resolve"),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { resolveRecoveryCase, ServiceFeedbackError } = await import(
        "../services/service-feedback.service.js"
      );
      const result = await resolveRecoveryCase(user, req.params.id, req.body?.note);
      await auditLogger
        .log({
          userId: user.id,
          action: "FEEDBACK_RECOVERY_RESOLVE",
          entity: "ServiceFeedbackRecovery",
          entityId: req.params.id,
          details: "Recovery case resolved",
          req,
        })
        .catch(() => {});
      return res.json(result);
    } catch (error: any) {
      if (error?.name === "ServiceFeedbackError") {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      logFeedbackFail("recovery_resolve", error);
      return res.status(500).json({ error: "Failed to resolve recovery case" });
    }
  },
);

// ── Public moderation / feature / retention ───────────────────────────────

router.get(
  "/api/admin/service-feedback/public-queue",
  requireAdminAuth,
  requireGranularPermission("feedback.public.moderate"),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { listPublicModerationQueue, ServiceFeedbackError } = await import(
        "../services/service-feedback.service.js"
      );
      return res.json(await listPublicModerationQueue(user));
    } catch (error: any) {
      if (error?.name === "ServiceFeedbackError") {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      logFeedbackFail("public_queue", error);
      return res.status(500).json({ error: "Failed to list public queue" });
    }
  },
);

router.post(
  "/api/admin/service-feedback/:id/publish",
  requireAdminAuth,
  requireGranularPermission("feedback.public.moderate"),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { setPublication, ServiceFeedbackError } = await import(
        "../services/service-feedback.service.js"
      );
      // Ignore body.excerpt / any staff-supplied replacement text (HOTFIX-1).
      const result = await setPublication(user, req.params.id, "publish");
      await auditLogger
        .log({
          userId: user.id,
          action: "FEEDBACK_PUBLISH",
          entity: "ServiceFeedback",
          entityId: req.params.id,
          details: "Published consented feedback",
          req,
        })
        .catch(() => {});
      return res.json(result);
    } catch (error: any) {
      if (error?.name === "ServiceFeedbackError") {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      logFeedbackFail("publish", error);
      return res.status(500).json({ error: "Failed to publish" });
    }
  },
);

router.post(
  "/api/admin/service-feedback/:id/hide",
  requireAdminAuth,
  requireGranularPermission("feedback.public.moderate"),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { setPublication, ServiceFeedbackError } = await import(
        "../services/service-feedback.service.js"
      );
      const result = await setPublication(user, req.params.id, "hide");
      await auditLogger
        .log({
          userId: user.id,
          action: "FEEDBACK_HIDE",
          entity: "ServiceFeedback",
          entityId: req.params.id,
          details: "Hidden public feedback display",
          req,
        })
        .catch(() => {});
      return res.json(result);
    } catch (error: any) {
      if (error?.name === "ServiceFeedbackError") {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      logFeedbackFail("hide", error);
      return res.status(500).json({ error: "Failed to hide" });
    }
  },
);

router.post(
  "/api/admin/service-feedback/:id/feature",
  requireAdminAuth,
  requireGranularPermission("feedback.public.feature"),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { setFeatured, ServiceFeedbackError } = await import(
        "../services/service-feedback.service.js"
      );
      const featured = req.body?.featured !== false;
      const result = await setFeatured(user, req.params.id, featured);
      await auditLogger
        .log({
          userId: user.id,
          action: featured ? "FEEDBACK_FEATURE" : "FEEDBACK_UNFEATURE",
          entity: "ServiceFeedback",
          entityId: req.params.id,
          details: featured ? "Featured homepage review" : "Unfeatured homepage review",
          req,
        })
        .catch(() => {});
      return res.json(result);
    } catch (error: any) {
      if (error?.name === "ServiceFeedbackError") {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      logFeedbackFail("feature", error);
      return res.status(500).json({ error: "Failed to feature" });
    }
  },
);

router.get(
  "/api/admin/service-feedback/retention-due",
  requireAdminAuth,
  requireGranularPermission("feedback.retention.review"),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { listRetentionDue, ServiceFeedbackError } = await import(
        "../services/service-feedback.service.js"
      );
      return res.json(await listRetentionDue(user));
    } catch (error: any) {
      if (error?.name === "ServiceFeedbackError") {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      logFeedbackFail("retention_due", error);
      return res.status(500).json({ error: "Failed to list retention due" });
    }
  },
);

router.post(
  "/api/admin/service-feedback/:id/retention",
  requireAdminAuth,
  requireGranularPermission("feedback.retention.review"),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const decision = String(req.body?.decision || "");
      if (decision !== "renew" && decision !== "hide" && decision !== "archive_anonymize") {
        return res.status(400).json({
          error: "decision must be renew, hide, or archive_anonymize",
          code: "INVALID_DECISION",
        });
      }
      const { retentionDecision, ServiceFeedbackError } = await import(
        "../services/service-feedback.service.js"
      );
      const result = await retentionDecision(user, req.params.id, decision);
      await auditLogger
        .log({
          userId: user.id,
          action: "FEEDBACK_RETENTION",
          entity: "ServiceFeedback",
          entityId: req.params.id,
          details: `Retention decision: ${decision}`,
          req,
        })
        .catch(() => {});
      return res.json(result);
    } catch (error: any) {
      if (error?.name === "ServiceFeedbackError") {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      logFeedbackFail("retention", error);
      return res.status(500).json({ error: "Failed to apply retention decision" });
    }
  },
);

export default router;
