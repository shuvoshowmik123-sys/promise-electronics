import { Router } from "express";
import type { Request, Response } from "express";
import { disputesRepo, DisputeError } from "../repositories/disputes.repository.js";
import { auditLogger } from "../utils/auditLogger.js";
import { requireAdminAuth, requireGranularPermission } from "./middleware/auth.js";

const router = Router();

router.use("/api/disputes", requireAdminAuth);

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
  console.error(`[Disputes] ${logTag}:`, msg.slice(0, 200));
  return res.status(500).json({ error: "Internal server error" });
}

// ── List disputes ──────────────────────────────────────────────────────────

router.get("/api/disputes", requireGranularPermission("disputes.view"), async (req: Request, res: Response) => {
  try {
    const { status, dispute_type, phone, target_table, page = "1", limit = "20" } = req.query;
    const result = await disputesRepo.listDisputes({
      status: status as string,
      disputeType: dispute_type as string,
      phone: phone as string,
      targetTable: target_table as "pos" | "refund" | "warranty" | undefined,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });
    res.json(result);
  } catch (error) {
    return safe500(res, "list", error);
  }
});

// ── Get single dispute ─────────────────────────────────────────────────────

router.get("/api/disputes/:id", requireGranularPermission("disputes.view"), async (req: Request, res: Response) => {
  try {
    const dispute = await disputesRepo.getDispute(req.params.id);
    if (!dispute) return res.status(404).json({ error: "Dispute not found" });
    res.json(dispute);
  } catch (error) {
    return safe500(res, "get", error);
  }
});

// ── Get dispute notes ──────────────────────────────────────────────────────

router.get("/api/disputes/:id/notes", requireGranularPermission("disputes.view"), async (req: Request, res: Response) => {
  try {
    const dispute = await disputesRepo.getDispute(req.params.id);
    if (!dispute) return res.status(404).json({ error: "Dispute not found" });
    const notes = await disputesRepo.getDisputeNotes(req.params.id);
    res.json(notes);
  } catch (error) {
    return safe500(res, "get-notes", error);
  }
});

// ── Create dispute ─────────────────────────────────────────────────────────

router.post("/api/disputes", requireGranularPermission("disputes.create"), async (req: Request, res: Response) => {
  try {
    const { pos_transaction_id, refund_id, warranty_claim_id, dispute_type, description, customer, customer_phone } = req.body;

    // Exactly-one target validation (DB CHECK also enforces, but fail early with clear error)
    const targetCount = [pos_transaction_id, refund_id, warranty_claim_id].filter(Boolean).length;
    if (targetCount !== 1) {
      return res.status(400).json({ error: "Exactly one of pos_transaction_id, refund_id, or warranty_claim_id must be provided" });
    }

    // Validate target record exists
    let targetType: "pos" | "refund" | "warranty";
    let targetId: string;
    if (pos_transaction_id) { targetType = "pos"; targetId = pos_transaction_id; }
    else if (refund_id) { targetType = "refund"; targetId = refund_id; }
    else { targetType = "warranty"; targetId = warranty_claim_id; }

    const exists = await disputesRepo.validateTargetExists(targetType, targetId);
    if (!exists) {
      return res.status(404).json({ error: `Target ${targetType} record not found` });
    }

    if (!dispute_type || !description) {
      return res.status(400).json({ error: "dispute_type and description are required" });
    }

    const actor = actorOf(req);
    const dispute = await disputesRepo.createDispute({
      posTransactionId: pos_transaction_id || null,
      refundId: refund_id || null,
      warrantyClaimId: warranty_claim_id || null,
      disputeType: dispute_type,
      description,
      customer: customer || null,
      customerPhone: customer_phone || null,
    }, actor);

    await auditLogger.log({
      userId: actor.id,
      action: "CREATE",
      entity: "dispute",
      entityId: dispute.id,
      details: `Dispute created: ${dispute_type} targeting ${targetType} ${targetId}`,
      req,
    });

    res.status(201).json(dispute);
  } catch (error) {
    return safe500(res, "create", error);
  }
});

// ── Transition status ──────────────────────────────────────────────────────

router.patch("/api/disputes/:id/status", requireGranularPermission("disputes.resolve"), async (req: Request, res: Response) => {
  try {
    const { status, resolution_notes } = req.body;
    if (!status) {
      return res.status(400).json({ error: "status is required" });
    }

    const actor = actorOf(req);
    const dispute = await disputesRepo.transitionStatus(req.params.id, status, actor, resolution_notes);

    await auditLogger.log({
      userId: actor.id,
      action: "UPDATE",
      entity: "dispute",
      entityId: dispute.id,
      details: `Status transitioned to "${status}"`,
      req,
    });

    res.json(dispute);
  } catch (error) {
    if (error instanceof DisputeError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    return safe500(res, "transition", error);
  }
});

// ── Add note ───────────────────────────────────────────────────────────────

router.post("/api/disputes/:id/notes", requireGranularPermission("disputes.create"), async (req: Request, res: Response) => {
  try {
    const { content, note_type = "note" } = req.body;
    if (!content) {
      return res.status(400).json({ error: "content is required" });
    }

    // P2: Restrict note types — only human-note values allowed via API
    const ALLOWED_NOTE_TYPES = ["note", "internal"];
    if (!ALLOWED_NOTE_TYPES.includes(note_type)) {
      return res.status(400).json({
        error: `Invalid note_type "${note_type}". Allowed: ${ALLOWED_NOTE_TYPES.join(", ")}`,
      });
    }

    const dispute = await disputesRepo.getDispute(req.params.id);
    if (!dispute) return res.status(404).json({ error: "Dispute not found" });

    const actor = actorOf(req);
    const note = await disputesRepo.addNote({
      disputeId: req.params.id,
      noteType: note_type,
      content,
      authorId: actor.id,
      authorName: actor.name,
      authorRole: actor.role,
    });

    await auditLogger.log({
      userId: actor.id,
      action: "CREATE",
      entity: "dispute_note",
      entityId: note.id,
      details: `Note added to dispute ${req.params.id}`,
      req,
    });

    res.status(201).json(note);
  } catch (error) {
    return safe500(res, "add-note", error);
  }
});

// ── Resolve dispute (convenience) ──────────────────────────────────────────

router.post("/api/disputes/:id/resolve", requireGranularPermission("disputes.resolve"), async (req: Request, res: Response) => {
  try {
    const { resolution_notes } = req.body;
    if (!resolution_notes) {
      return res.status(400).json({ error: "resolution_notes is required" });
    }

    const actor = actorOf(req);
    const dispute = await disputesRepo.transitionStatus(req.params.id, "resolved", actor, resolution_notes);

    await auditLogger.log({
      userId: actor.id,
      action: "UPDATE",
      entity: "dispute",
      entityId: dispute.id,
      details: `Dispute resolved: ${resolution_notes.slice(0, 100)}`,
      req,
    });

    res.json(dispute);
  } catch (error) {
    if (error instanceof DisputeError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    return safe500(res, "resolve", error);
  }
});

export default router;
