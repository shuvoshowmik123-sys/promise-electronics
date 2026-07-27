/**
 * SYSTEM-UNIFICATION-00C-B — Retail money settlement adapters.
 * Canonical writer: createPosSaleAtomic only. Job paid fields are projections.
 */

import { db } from "../db.js";
import { eq, and } from "drizzle-orm";
import * as schema from "../../shared/schema.js";
import { jobRepo } from "../repositories/index.js";
import {
  createPosSaleAtomic,
  findPosByClientRequest,
  assertIdempotentReplay,
  fingerprintFromValidated,
  PosBillingError,
  derivePosRefundLifecycle,
} from "./pos-billing.service.js";
import { isNgProtectedStatus } from "./job-ng-protected.js";
import { getSafeJobDisplayRef } from "../../shared/job-display-utils.js";

export class RetailMoneyError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "RetailMoneyError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const PAID_METHODS = new Set(["Cash", "Bank", "bKash", "Nagad"]);

/** Map legacy/manual method strings to POS paymentMethod. */
export function mapToPosPaymentMethod(raw: string): string | null {
  const m = String(raw || "").trim();
  if (PAID_METHODS.has(m)) return m;
  const lower = m.toLowerCase().replace(/[\s-]+/g, "_");
  if (lower === "cash") return "Cash";
  if (lower === "bank") return "Bank";
  if (lower === "bkash" || lower === "bkash_send_money") return "bKash";
  if (lower === "nagad" || lower === "nagad_send_money") return "Nagad";
  if (lower === "due" || lower === "credit") return "Due";
  return null;
}

export async function jobHasPosAllocation(jobId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.posTransactionAreaAllocations.id })
    .from(schema.posTransactionAreaAllocations)
    .where(eq(schema.posTransactionAreaAllocations.jobTicketId, jobId))
    .limit(1);
  return rows.length > 0;
}

export async function detectLegacyHistoryIncomplete(jobId: string): Promise<boolean> {
  const job = await jobRepo.getJobTicket(jobId);
  if (!job) return false;
  const paid = Number(job.paidAmount || 0);
  if (paid <= 0.001 && String(job.billingStatus || "") !== "invoiced") return false;
  const hasAlloc = await jobHasPosAllocation(jobId);
  return !hasAlloc && paid > 0.001;
}

async function findAllocationForJob(posId: string, jobId: string) {
  const rows = await db
    .select()
    .from(schema.posTransactionAreaAllocations)
    .where(
      and(
        eq(schema.posTransactionAreaAllocations.transactionId, posId),
        eq(schema.posTransactionAreaAllocations.jobTicketId, jobId),
      ),
    )
    .limit(1);
  return rows[0];
}

export type SettleJobViaPosInput = {
  jobId: string;
  amount: number;
  method: string;
  /** Prefer existing POS id when replaying; also used as clientRequestId for new sales. */
  paymentId?: string | null;
  clientRequestId?: string | null;
  actorUserId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  req?: unknown;
  /** When true, allow Due method (creates Due POS without paid increase). Default false for adapters. */
  allowDue?: boolean;
};

export type SettleJobViaPosResult = {
  job: schema.JobTicket;
  posTransaction: schema.PosTransaction;
  reused: boolean;
  deprecatedRoute?: boolean;
  legacyHistoryIncomplete: boolean;
};

/**
 * Canonical settlement for a single retail job via POS sale atomic path.
 */
export async function settleJobPaymentViaPos(input: SettleJobViaPosInput): Promise<SettleJobViaPosResult> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RetailMoneyError(400, "INVALID_AMOUNT", "A positive amount is required");
  }

  const posMethod = mapToPosPaymentMethod(input.method);
  if (!posMethod) {
    throw new RetailMoneyError(400, "INVALID_PAYMENT_METHOD", "Unrecognized payment method for retail POS settlement");
  }
  if (posMethod === "Due" && !input.allowDue) {
    throw new RetailMoneyError(
      400,
      "DUE_NOT_ALLOWED_ON_ADAPTER",
      "Due/credit settlements must go through POS with explicit Due method; adapter rejects Due by default",
    );
  }

  const job = await jobRepo.getJobTicket(input.jobId);
  if (!job) throw new RetailMoneyError(404, "JOB_NOT_FOUND", "Job ticket not found");

  if (job.corporateClientId || job.corporateChallanId) {
    throw new RetailMoneyError(400, "CORPORATE_JOB_NOT_RETAIL", "Corporate jobs cannot be settled through retail POS");
  }
  if (isNgProtectedStatus(job.status)) {
    throw new RetailMoneyError(409, "NG_WORKFLOW_LOCKED", "Job is locked in NG workflow");
  }

  const legacyHistoryIncomplete = await detectLegacyHistoryIncomplete(job.id);
  const actorUserId = input.actorUserId;
  const paymentId = input.paymentId ? String(input.paymentId).trim() : "";
  const clientRequestId = (input.clientRequestId || paymentId || "").trim().slice(0, 128) || null;

  // 1) Explicit existing POS id with allocation to this job → reuse (no money write)
  if (paymentId) {
    const [existingPos] = await db
      .select()
      .from(schema.posTransactions)
      .where(eq(schema.posTransactions.id, paymentId))
      .limit(1);
    if (existingPos) {
      const alloc = await findAllocationForJob(existingPos.id, job.id);
      if (!alloc) {
        throw new RetailMoneyError(
          409,
          "POS_NOT_ALLOCATED_TO_JOB",
          "Referenced POS transaction is not allocated to this job",
        );
      }
      const freshJob = await jobRepo.getJobTicket(job.id);
      return {
        job: freshJob!,
        posTransaction: existingPos,
        reused: true,
        deprecatedRoute: true,
        legacyHistoryIncomplete,
      };
    }
  }

  // 2) Create constrained job-linked POS settlement through canonical sale
  // Idempotency (retry vs conflict) is enforced inside createPosSaleAtomic via fingerprint.
  const customer =
    input.customerName || job.customer || (posMethod === "Due" ? "Due customer" : "Walk-in");
  const displayRef = getSafeJobDisplayRef({
    id: job.id,
    corporateJobNumber: (job as any).corporateJobNumber,
  });
  const cartItems = [
    {
      name: `Job settlement ${displayRef}`,
      quantity: 1,
      price: amount,
      itemType: "service",
    },
  ];
  const linkedJobsArr = [{ jobId: job.id, billedAmount: amount }];
  const items = JSON.stringify(cartItems);
  const linkedJobs = JSON.stringify(linkedJobsArr);

  // Pre-check: same clientRequestId already used for a different job allocation → conflict
  if (clientRequestId && actorUserId) {
    const prior = await findPosByClientRequest(actorUserId, clientRequestId);
    if (prior) {
      const validatedPreview = {
        items,
        linkedJobs,
        subtotal: amount,
        tax: 0,
        taxRate: 0,
        discount: 0,
        total: amount,
        paymentMethod: posMethod,
        paymentStatus: posMethod === "Due" ? "Due" : "Paid",
        customer: String(customer),
        customerPhone: input.customerPhone || job.customerPhone || null,
      };
      const fp = fingerprintFromValidated(validatedPreview as any, cartItems, linkedJobsArr);
      try {
        assertIdempotentReplay(prior, fp, clientRequestId);
      } catch (err) {
        if (err instanceof PosBillingError) {
          throw new RetailMoneyError(err.status, err.code, err.message, err.details);
        }
        throw err;
      }
      const alloc = await findAllocationForJob(prior.id, job.id);
      if (!alloc) {
        throw new RetailMoneyError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "clientRequestId already used for a different settlement",
          { clientRequestId },
        );
      }
      const freshJob = await jobRepo.getJobTicket(job.id);
      return {
        job: freshJob!,
        posTransaction: prior,
        reused: true,
        deprecatedRoute: true,
        legacyHistoryIncomplete,
      };
    }
  }

  try {
    const sale = await createPosSaleAtomic({
      validated: {
        items,
        linkedJobs,
        subtotal: amount,
        tax: 0,
        taxRate: 0,
        discount: 0,
        total: amount,
        paymentMethod: posMethod,
        paymentStatus: posMethod === "Due" ? "Due" : "Paid",
        customer: String(customer),
        customerPhone: input.customerPhone || job.customerPhone || null,
      } as any,
      cartItems,
      linkedJobs: linkedJobsArr,
      actorUserId,
      clientRequestId,
      req: input.req,
    });

    const freshJob = await jobRepo.getJobTicket(job.id);
    return {
      job: freshJob!,
      posTransaction: sale.transaction,
      reused: sale.idempotent,
      deprecatedRoute: true,
      legacyHistoryIncomplete,
    };
  } catch (err) {
    if (err instanceof PosBillingError) {
      throw new RetailMoneyError(err.status, err.code, err.message, err.details);
    }
    throw err;
  }
}

export function withPosLifecycle(txn: schema.PosTransaction) {
  return { ...txn, ...derivePosRefundLifecycle(txn as any) };
}
