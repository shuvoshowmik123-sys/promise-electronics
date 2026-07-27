/**
 * POS (Point of Sale) Routes
 * Atomic retail sale + double-bill prevention (SERVICE-LIFECYCLE-R1).
 */

import { Router, Request, Response } from "express";
import { posRepo } from "../repositories/index.js";
import { insertPosTransactionSchema } from "../../shared/schema.js";
import { requireAdminAuth, requirePermission, requireGranularPermission } from "./middleware/auth.js";
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

      const normalizedLinks = linkedJobs.map((l: any) => ({
        jobId: String(l.jobId || ""),
        billedAmount: Number(l.billedAmount),
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

export default router;
