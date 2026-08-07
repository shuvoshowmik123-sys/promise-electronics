/**
 * POS (Point of Sale) Routes
 * Atomic retail sale + double-bill prevention (SERVICE-LIFECYCLE-R1).
 */

import { Router, Request, Response } from "express";
import { posRepo } from "../repositories/index.js";
import { insertPosTransactionSchema } from "../../shared/schema.js";
import { requireAdminAuth, requirePermission, requireGranularPermission } from "./middleware/auth.js";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import {
  createPosSaleAtomic,
  derivePosRefundLifecycle,
  findPosByClientRequest,
  awaitPosByClientRequest,
  fingerprintFromValidated,
  assertIdempotentReplay,
  PosBillingError,
} from "../services/pos-billing.service.js";

const router = Router();

router.get("/api/pos-transactions", requireAdminAuth, requirePermission("pos"), async (req: Request, res: Response) => {
  try {
    const { page, limit, search, paymentMethod, from, to } = req.query;
    const transactions = await posRepo.getAllPosTransactions({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search: search as string,
      paymentMethod: paymentMethod as string,
      from: from as string,
      to: to as string,
    });
    res.json(transactions);
  } catch {
    res.status(500).json({ error: "Failed to fetch POS transactions" });
  }
});

router.get("/api/pos-transactions/summary", requireAdminAuth, requirePermission("pos"), async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const summary = await posRepo.getPosTransactionSummary({
      from: from as string,
      to: to as string,
    });
    res.json(summary);
  } catch {
    res.status(500).json({ error: "Failed to fetch POS summary" });
  }
});

router.get("/api/pos-transactions/:id", requireAdminAuth, requirePermission("pos"), async (req: Request, res: Response) => {
  try {
    const transaction = await posRepo.getPosTransaction(req.params.id);
    if (!transaction) {
      return res.status(404).json({ error: "POS transaction not found" });
    }
    const lifecycle = derivePosRefundLifecycle(transaction as any);
    res.json({ ...transaction, ...lifecycle });
  } catch {
    res.status(500).json({ error: "Failed to fetch POS transaction" });
  }
});

/**
 * POST /api/pos-transactions
 * Atomic create: POS + allocations + job payment/completion/warranty fields + ledger.
 * Requires: pos.processPayment (legacy process_payment maps via granular middleware).
 * Fully paid jobs → 409 JOB_ALREADY_FULLY_BILLED.
 */
router.post(
  "/api/pos-transactions",
  requireAdminAuth,
  requireGranularPermission("pos.processPayment"),
  async (req: Request, res: Response) => {
    try {
      const body = {
        taxRate: 5,
        discount: 0,
        paymentStatus: "Paid",
        ...req.body,
      };
      const validated = insertPosTransactionSchema.parse(body);

      let cartItems: any[] = [];
      let linkedJobs: any[] = [];
      try {
        if (validated.items) cartItems = JSON.parse(validated.items);
        if ((validated as any).linkedJobs) linkedJobs = JSON.parse((validated as any).linkedJobs);
      } catch {
        return res.status(400).json({ error: "Malformed items or linkedJobs payload" });
      }
      if (!Array.isArray(cartItems)) cartItems = [];
      if (!Array.isArray(linkedJobs)) linkedJobs = [];

      /**
       * The warranty chosen at the counter has to survive normalisation.
       *
       * This mapped only jobId and billedAmount, so anything the till sent
       * about warranty was silently dropped one line before the billing
       * service could act on it. Kept nullable: "no warranty" is a real answer
       * and must not be confused with "the till did not say".
       */
      const normalizedLinks = linkedJobs.map((l: any) => ({
        jobId: String(l.jobId || ""),
        billedAmount: Number(l.billedAmount),
        serviceWarrantyMonths: l.serviceWarrantyMonths != null ? Number(l.serviceWarrantyMonths) : null,
        partsWarrantyMonths: l.partsWarrantyMonths != null ? Number(l.partsWarrantyMonths) : null,
      }));

      const actor = (req as any).user;
      const actorUserId = actor?.id || req.session?.adminUserId;
      const clientRequestId =
        (req.body?.clientRequestId as string | undefined) ||
        (req.body?.saleId as string | undefined) ||
        (validated as any).clientRequestId ||
        null;

      const fingerprint = fingerprintFromValidated(validated, cartItems, normalizedLinks);

      // Idempotent replay before create (fingerprint-aware)
      if (clientRequestId && actorUserId) {
        const prior = await findPosByClientRequest(String(actorUserId), String(clientRequestId));
        if (prior) {
          assertIdempotentReplay(prior, fingerprint, String(clientRequestId));
          const lifecycle = derivePosRefundLifecycle(prior as any);
          return res.status(200).json({ ...prior, ...lifecycle, idempotent: true });
        }
      }

      const sale = await createPosSaleAtomic({
        validated,
        cartItems,
        linkedJobs: normalizedLinks,
        actorUserId,
        clientRequestId,
        req,
      });

      const lifecycle = derivePosRefundLifecycle(sale.transaction as any);
      if (sale.idempotent) {
        return res.status(200).json({ ...sale.transaction, ...lifecycle, idempotent: true });
      }
      res.status(201).json({ ...sale.transaction, ...lifecycle, idempotent: false });
    } catch (error: any) {
      if (error instanceof PosBillingError) {
        // Never expose internal IDEMPOTENCY_RACE — complete via bounded re-read only
        if (error.code === "IDEMPOTENCY_RACE" && error.details?.clientRequestId && error.details?.requestFingerprint) {
          const actorUserId = (req as any).user?.id || req.session?.adminUserId;
          if (actorUserId) {
            try {
              const prior = await awaitPosByClientRequest(
                String(actorUserId),
                String(error.details.clientRequestId),
                String(error.details.requestFingerprint),
              );
              const lifecycle = derivePosRefundLifecycle(prior as any);
              return res.status(200).json({ ...prior, ...lifecycle, idempotent: true });
            } catch (replayErr: any) {
              if (replayErr instanceof PosBillingError) {
                const code =
                  replayErr.code === "IDEMPOTENCY_RACE"
                    ? "IDEMPOTENCY_IN_FLIGHT"
                    : replayErr.code;
                return res.status(replayErr.status).json({
                  error:
                    code === "IDEMPOTENCY_IN_FLIGHT"
                      ? "A concurrent sale with this clientRequestId has not committed yet; retry the identical request"
                      : replayErr.message,
                  code,
                });
              }
            }
          }
          return res.status(409).json({
            error: "A concurrent sale with this clientRequestId has not committed yet; retry the identical request",
            code: "IDEMPOTENCY_IN_FLIGHT",
          });
        }
        if (error.code === "IDEMPOTENCY_RACE") {
          return res.status(409).json({
            error: "A concurrent sale with this clientRequestId has not committed yet; retry the identical request",
            code: "IDEMPOTENCY_IN_FLIGHT",
          });
        }
        return res.status(error.status).json({
          error: error.message,
          code: error.code,
          ...(error.details
            ? { details: sanitizePosErrorDetails(error.details as Record<string, unknown>) }
            : {}),
        });
      }
      if (error?.name === "ZodError") {
        return res.status(400).json({ error: "Invalid POS transaction data" });
      }
      console.error("[POS] transaction failed:", error?.message || error);
      res.status(500).json({ error: "Failed to create POS transaction" });
    }
  },
);

function sanitizePosErrorDetails(details: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (k === "requestFingerprint") continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

/**
 * Sourced parts billed today whose buying price is still outstanding.
 *
 * Scoped to the caller by default: the person who billed a part is the only
 * one who knows what it cost, and this is the list the 19:00 nudge points at.
 * A manager settling on someone's behalf passes ?all=true, which needs the
 * finance permission — seeing what every biller owes is a supervisory view,
 * not a personal one.
 */
router.get(
  "/api/pos/pending-part-costs",
  requireAdminAuth,
  requireGranularPermission("pos.processPayment"),
  async (req: Request, res: Response) => {
    try {
      const actorUserId = (req as any).user?.id || req.session?.adminUserId;
      const wantsAll = String(req.query.all || "") === "true";
      const canSeeAll = ["Super Admin", "Manager"].includes(String((req as any).user?.role || ""));
      const scopeAll = wantsAll && canSeeAll;

      const rows = await db.execute(sql`
        SELECT id,
               pos_transaction_id AS "posTransactionId",
               job_ticket_id      AS "jobTicketId",
               part_name          AS "partName",
               selling_price      AS "sellingPrice",
               quantity,
               warranty_days      AS "warrantyDays",
               billed_by          AS "billedBy",
               billed_by_name     AS "billedByName",
               created_at         AS "createdAt"
        FROM pending_part_costs
        WHERE settled_at IS NULL
          ${scopeAll ? sql`` : sql`AND billed_by = ${String(actorUserId)}`}
        ORDER BY created_at DESC
        LIMIT 200
      `);
      res.json(((rows as any).rows ?? rows));
    } catch {
      res.status(500).json({ error: "Failed to load pending part costs" });
    }
  },
);

/**
 * Settle one outstanding cost.
 *
 * Refuses a second settlement rather than overwriting: the margin on a sale
 * that has already been reconciled must not move quietly, and a repeated tap
 * on a slow connection should be harmless.
 */
router.patch(
  "/api/pos/pending-part-costs/:id",
  requireAdminAuth,
  requireGranularPermission("pos.processPayment"),
  async (req: Request, res: Response) => {
    try {
      const actorUserId = (req as any).user?.id || req.session?.adminUserId;
      const cost = Number(req.body?.costPrice);
      if (!Number.isFinite(cost) || cost < 0) {
        return res.status(400).json({ error: "costPrice must be a number of zero or more" });
      }

      const updated = await db.execute(sql`
        UPDATE pending_part_costs
        SET cost_price = ${cost}, settled_at = NOW(), settled_by = ${String(actorUserId)}
        WHERE id = ${req.params.id} AND settled_at IS NULL
        RETURNING id
      `);
      if ((updated as any).rowCount === 0) {
        return res.status(409).json({ error: "Already settled", code: "ALREADY_SETTLED" });
      }
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to settle part cost" });
    }
  },
);

export default router;
