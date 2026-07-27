/**
 * Refund Management (SERVICE-LIFECYCLE-R1H2/R1H3)
 * POS-canonical bill correction, maker-checker, allocation-safe, non-blocking audit.
 * Mutations require pos.refund (or legacy refunds); Super Admin via *.
 * Approve/reject are single transactional decisions (R1H3).
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { settingsRepo, posRepo, warrantyRepo } from "../repositories/index.js";
import { auditLogger } from "../utils/auditLogger.js";
import { requireAdminAuth, requireGranularPermission } from "./middleware/auth.js";
import {
  createRefundRequestAtomic,
  processRefundAtomic,
  decideRefundAtomic,
  RefundProcessError,
} from "../services/refund-process.service.js";
import { derivePosRefundLifecycle } from "../services/pos-billing.service.js";
import { db } from "../db.js";
import { eq } from "drizzle-orm";
import * as schema from "../../shared/schema.js";

const router = Router();

router.use("/api/refunds", requireAdminAuth);
router.use("/api/refunds", requireGranularPermission("pos.refund"));

const REFUND_THRESHOLD_KEY = "refund_approval_threshold";
const DEFAULT_THRESHOLD = 2000;

async function getRefundThreshold(): Promise<number> {
  try {
    const settings = await settingsRepo.getAllSettings();
    const threshold = settings.find((s) => s.key === REFUND_THRESHOLD_KEY);
    return threshold?.value ? parseFloat(threshold.value) : DEFAULT_THRESHOLD;
  } catch {
    return DEFAULT_THRESHOLD;
  }
}

function actorOf(req: Request) {
  const u = (req as any).user;
  return {
    id: u?.id || req.session?.adminUserId || "",
    name: u?.name || "Admin",
    role: u?.role || "Staff",
  };
}

function safe500(res: Response, logTag: string, error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[Refund] ${logTag}:`, msg.slice(0, 200));
  return res.status(500).json({ error: "Internal server error" });
}

function softAudit(entry: Parameters<typeof auditLogger.log>[0]) {
  auditLogger.log(entry).catch(() => {});
}

router.get("/api/refunds", async (req: Request, res: Response) => {
  try {
    const { status, page = "1", limit = "20" } = req.query;
    const refunds = await warrantyRepo.getAllRefunds({
      status: status as string,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
    res.json(refunds);
  } catch (error) {
    return safe500(res, "list", error);
  }
});

router.get("/api/refunds/:id", async (req: Request, res: Response) => {
  try {
    const refund = await warrantyRepo.getRefund(req.params.id);
    if (!refund) return res.status(404).json({ error: "Refund not found" });
    res.json(refund);
  } catch (error) {
    return safe500(res, "get", error);
  }
});

router.post("/api/refunds", async (req: Request, res: Response) => {
  try {
    const actor = actorOf(req);
    const { type, referenceId, refundAmount, reason, notes, posTransactionId } = req.body;

    if (type === "warranty" || (req.body.originalAmount != null && type === "warranty")) {
      return res.status(400).json({
        error: "Warranty refunds are not supported until a canonical paid warranty-claim source exists.",
        code: "WARRANTY_REFUND_UNSUPPORTED",
      });
    }

    const result = await createRefundRequestAtomic({
      type,
      referenceId,
      posTransactionId: posTransactionId || null,
      refundAmount,
      reason: reason || "",
      notes: notes || null,
      requestedBy: actor.id,
      requestedByName: actor.name,
      requestedByRole: actor.role,
    });

    const threshold = await getRefundThreshold();
    const requiresSuperAdminApproval = result.refund.refundAmount > threshold;

    softAudit({
      userId: actor.id,
      action: "REQUEST_REFUND",
      entity: "refund",
      entityId: result.refund.id,
      details: `Refund ${result.refund.refundAmount} on pos:${result.refund.referenceId}`,
      req,
    });

    let allocations: any[] = [];
    try {
      allocations = await db
        .select()
        .from(schema.refundAllocations)
        .where(eq(schema.refundAllocations.refundId, result.refund.id));
    } catch {
      allocations = [];
    }

    res.status(201).json({
      ...result.refund,
      allocations,
      requiresSuperAdminApproval,
      threshold,
      message: requiresSuperAdminApproval
        ? `Refund amount exceeds ৳${threshold}. Requires Super Admin approval.`
        : "Refund request created. Awaiting Manager approval.",
    });
  } catch (error: any) {
    if (error instanceof RefundProcessError) {
      return res.status(error.status).json({ error: error.message, code: error.code, ...(error.details || {}) });
    }
    return safe500(res, "create", error);
  }
});

router.patch("/api/refunds/:id/approve", async (req: Request, res: Response) => {
  try {
    const actor = actorOf(req);
    const threshold = await getRefundThreshold();
    const { refund } = await decideRefundAtomic({
      refundId: req.params.id,
      decision: "approve",
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      threshold,
    });

    softAudit({
      userId: actor.id,
      action: "APPROVE_REFUND",
      entity: "refund",
      entityId: req.params.id,
      details: `Approved by ${actor.name}`,
      req,
    });

    res.json(refund);
  } catch (error: any) {
    if (error instanceof RefundProcessError) {
      return res.status(error.status).json({ error: error.message, code: error.code, ...(error.details || {}) });
    }
    return safe500(res, "approve", error);
  }
});

router.patch("/api/refunds/:id/reject", async (req: Request, res: Response) => {
  try {
    const actor = actorOf(req);
    const { rejectionReason } = req.body || {};
    const threshold = await getRefundThreshold();
    const { refund } = await decideRefundAtomic({
      refundId: req.params.id,
      decision: "reject",
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      rejectionReason: rejectionReason || "Rejected",
      threshold,
    });

    softAudit({
      userId: actor.id,
      action: "REJECT_REFUND",
      entity: "refund",
      entityId: req.params.id,
      details: `Rejected`,
      req,
    });

    res.json(refund);
  } catch (error: any) {
    if (error instanceof RefundProcessError) {
      return res.status(error.status).json({ error: error.message, code: error.code, ...(error.details || {}) });
    }
    return safe500(res, "reject", error);
  }
});

router.patch("/api/refunds/:id/process", async (req: Request, res: Response) => {
  try {
    const actor = actorOf(req);
    const { refundMethod } = req.body;

    if (!["Manager", "Super Admin"].includes(actor.role)) {
      return res.status(403).json({ error: "Only Manager or Super Admin can process refunds" });
    }

    const result = await processRefundAtomic({
      refundId: req.params.id,
      refundMethod: refundMethod || "cash",
      processedBy: actor.id,
      processedByName: actor.name,
      processedByRole: actor.role,
    });

    softAudit({
      userId: actor.id,
      action: "PROCESS_REFUND",
      entity: "refund",
      entityId: req.params.id,
      details: `Processed method=${refundMethod || "cash"} pettyCash=${result.pettyCashId}`,
      req,
    });

    let posLifecycle = null;
    const txn = await posRepo.getPosTransaction(result.refund.referenceId);
    if (txn) posLifecycle = derivePosRefundLifecycle(txn as any);

    res.json({
      refund: result.refund,
      pettyCashRecordId: result.pettyCashId,
      warrantyPolicy: result.warrantyPolicy,
      posLifecycle,
      message:
        result.warrantyPolicy === "UNCHANGED_POLICY_NEEDED"
          ? "Refund processed. Warranty left unchanged (void-on-full-refund policy not defined)."
          : "Refund processed successfully.",
    });
  } catch (error: any) {
    if (error instanceof RefundProcessError) {
      return res.status(error.status).json({ error: error.message, code: error.code, ...(error.details || {}) });
    }
    return safe500(res, "process", error);
  }
});

export default router;
