/**
 * Atomic retail POS billing with double-invoice prevention (SERVICE-LIFECYCLE-R1).
 *
 * Protection model:
 * - Single DB transaction for POS row + job allocations + job payment/completion/warranty fields
 *   + petty cash / drawer cash + due record.
 * - SELECT … FOR UPDATE on each linked job_tickets row before validation (serialization).
 * - Sum prior non-voided paid allocations from pos_transaction_area_allocations.
 * - Fully paid jobs → 409 JOB_ALREADY_FULLY_BILLED (no second full invoice).
 * - Partial/due allowed only when remaining amount > 0 under existing estimatedCost model.
 * - Actor + clientRequestId + request fingerprint for retry vs conflict (00C-B-HOTFIX-1).
 */
import { createHash } from "crypto";
import { db } from "../db.js";
import { sql, eq, and } from "drizzle-orm";
import * as schema from "../../shared/schema.js";
import { nanoid } from "../repositories/base.js";
import { inventoryRepo } from "../repositories/index.js";
import { getActiveServiceAreaById } from "../repositories/service-area.repository.js";
import { isNgProtectedStatus } from "./job-ng-protected.js";
import { repairJourneyService } from "./customer-repair-journey.service.js";
import { auditLogger } from "../utils/auditLogger.js";

export class PosBillingError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const PAID_METHODS = new Set(["Cash", "Bank", "bKash", "Nagad"]);

export type LinkedJobInput = {
  jobId: string;
  billedAmount: number;
  /**
   * Warranty chosen at the counter, in months, when the cashier set one.
   *
   * The period is negotiated per repair — none, one month, six — and the only
   * moment anyone knows which is the moment it is promised to the customer's
   * face. Left undefined the resolver's own answer stands, so a till that does
   * not offer the choice keeps behaving exactly as it did.
   *
   * Months rather than days because that is the unit the shop quotes in.
   */
  serviceWarrantyMonths?: number | null;
  partsWarrantyMonths?: number | null;
};

/** Months are what the counter promises; days are what the clock stores. */
const DAYS_PER_MONTH = 30;

function monthsToDays(months: unknown): number | null {
  const n = Number(months);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Bounded so a malformed payload cannot mint a decade of cover.
  return Math.min(12, Math.round(n)) * DAYS_PER_MONTH;
}

export type CreatePosSaleInput = {
  validated: schema.InsertPosTransaction;
  cartItems: any[];
  linkedJobs: LinkedJobInput[];
  actorUserId?: string;
  /** Actor-scoped idempotency key (optional). Replay returns original POS row. */
  clientRequestId?: string | null;
  req?: any;
};

function roundMoney(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Deterministic server-side fingerprint of material POS request content. */
export function buildPosSaleFingerprint(input: {
  paymentMethod: string;
  paymentStatus?: string | null;
  total: number;
  tax: number;
  discount: number;
  subtotal: number;
  customer?: string | null;
  customerPhone?: string | null;
  serviceAreaId?: string | null;
  cartItems: any[];
  linkedJobs: LinkedJobInput[];
}): string {
  const lines = (input.cartItems || [])
    .map((it: any) => ({
      id: it?.id != null && String(it.id).length ? String(it.id) : null,
      name: String(it?.name || "").trim(),
      quantity: roundMoney(Number(it?.quantity || 0)),
      price: roundMoney(Number(it?.price || 0)),
      itemType: String(it?.itemType || ""),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

  const linkedJobs = [...(input.linkedJobs || [])]
    .map((j) => ({
      jobId: String(j.jobId || ""),
      billedAmount: roundMoney(Number(j.billedAmount || 0)),
    }))
    .sort((a, b) => a.jobId.localeCompare(b.jobId) || a.billedAmount - b.billedAmount);

  const paymentMethod = String(input.paymentMethod || "");
  // Canonical status follows method (Due is never "Paid")
  const paymentStatus =
    paymentMethod === "Due" ? "Due" : String(input.paymentStatus || "Paid");
  const payload = {
    paymentMethod,
    paymentStatus,
    total: roundMoney(Number(input.total)),
    tax: roundMoney(Number(input.tax)),
    discount: roundMoney(Number(input.discount || 0)),
    subtotal: roundMoney(Number(input.subtotal)),
    customer: String(input.customer || "").trim().toLowerCase(),
    customerPhone: String(input.customerPhone || "").replace(/\D/g, ""),
    serviceAreaId: input.serviceAreaId ? String(input.serviceAreaId) : null,
    lines,
    linkedJobs,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function fingerprintFromValidated(
  validated: schema.InsertPosTransaction | Record<string, unknown>,
  cartItems: any[],
  linkedJobs: LinkedJobInput[],
): string {
  const v = validated as any;
  return buildPosSaleFingerprint({
    paymentMethod: String(v.paymentMethod || ""),
    paymentStatus: v.paymentStatus,
    total: Number(v.total),
    tax: Number(v.tax || 0),
    discount: Number(v.discount || 0),
    subtotal: Number(v.subtotal || 0),
    customer: v.customer,
    customerPhone: v.customerPhone,
    serviceAreaId: v.serviceAreaId || null,
    cartItems,
    linkedJobs,
  });
}

export function assertIdempotentReplay(
  prior: schema.PosTransaction,
  fingerprint: string,
  clientRequestId?: string | null,
): schema.PosTransaction {
  const stored =
    (prior as any).idempotencyFingerprint ?? (prior as any).idempotency_fingerprint ?? null;
  if (stored && stored !== fingerprint) {
    throw new PosBillingError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "clientRequestId already used for a different financial request",
      { clientRequestId: clientRequestId || prior.clientRequestId },
    );
  }
  if (!stored) {
    // Pre-fingerprint row: rebuild from stored financial fields
    let cartItems: any[] = [];
    let linkedJobs: LinkedJobInput[] = [];
    try {
      cartItems = prior.items ? JSON.parse(prior.items) : [];
    } catch {
      cartItems = [];
    }
    try {
      const raw = prior.linkedJobs ? JSON.parse(prior.linkedJobs) : [];
      linkedJobs = Array.isArray(raw)
        ? raw.map((l: any) => ({ jobId: String(l.jobId || ""), billedAmount: Number(l.billedAmount) }))
        : [];
    } catch {
      linkedJobs = [];
    }
    const rebuilt = buildPosSaleFingerprint({
      paymentMethod: prior.paymentMethod,
      paymentStatus: prior.paymentStatus,
      total: Number(prior.total),
      tax: Number(prior.tax || 0),
      discount: Number(prior.discount || 0),
      subtotal: Number(prior.subtotal || 0),
      customer: prior.customer,
      customerPhone: prior.customerPhone,
      serviceAreaId: prior.serviceAreaId,
      cartItems,
      linkedJobs,
    });
    if (rebuilt !== fingerprint) {
      throw new PosBillingError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "clientRequestId already used for a different financial request",
        { clientRequestId: clientRequestId || prior.clientRequestId },
      );
    }
  }
  return prior;
}

export async function findPosByClientRequest(
  actorUserId: string,
  clientRequestId: string,
): Promise<schema.PosTransaction | undefined> {
  const rows = await db
    .select()
    .from(schema.posTransactions)
    .where(
      and(
        eq(schema.posTransactions.createdByUserId, actorUserId),
        eq(schema.posTransactions.clientRequestId, clientRequestId),
      ),
    )
    .limit(1);
  return rows[0];
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * HOTFIX-2: After unique-key conflict, re-read the committed POS row (read-only).
 * Never re-runs sale/stock/allocation/job/drawer logic.
 * Same fingerprint → original row. Different fingerprint → IDEMPOTENCY_CONFLICT.
 * Missing after bounded wait → IDEMPOTENCY_IN_FLIGHT (retry-safe 409).
 */
export async function awaitPosByClientRequest(
  actorUserId: string,
  clientRequestId: string,
  fingerprint: string,
  opts?: { maxAttempts?: number; initialDelayMs?: number },
): Promise<schema.PosTransaction> {
  const maxAttempts = opts?.maxAttempts ?? 12;
  let delay = opts?.initialDelayMs ?? 25;
  for (let i = 0; i < maxAttempts; i++) {
    const prior = await findPosByClientRequest(actorUserId, clientRequestId);
    if (prior) {
      assertIdempotentReplay(prior, fingerprint, clientRequestId);
      return prior;
    }
    if (i < maxAttempts - 1) {
      await sleepMs(delay);
      delay = Math.min(200, Math.floor(delay * 1.45));
    }
  }
  throw new PosBillingError(
    409,
    "IDEMPOTENCY_IN_FLIGHT",
    "A concurrent sale with this clientRequestId has not committed yet; retry the identical request",
    { clientRequestId },
  );
}

export type CreatePosSaleResult = {
  transaction: schema.PosTransaction;
  idempotent: boolean;
};

function isPaidMethod(method: string) {
  return PAID_METHODS.has(method);
}

function isFullyPaidJob(job: schema.JobTicket, priorPaidAllocated: number): boolean {
  if (String(job.paymentStatus || "").toLowerCase() === "paid") return true;
  const paid = Number(job.paidAmount || 0);
  const remaining = job.remainingAmount;
  if (paid > 0 && remaining != null && Number(remaining) <= 0.001) return true;
  const estimate = Number(job.estimatedCost || 0);
  if (estimate > 0 && paid + 0.001 >= estimate) return true;
  // No estimate: any prior paid POS allocation means fully billed for retail integrity
  if (estimate <= 0 && priorPaidAllocated > 0.001) return true;
  return false;
}

async function sumJobAllocations(
  tx: any,
  jobId: string,
): Promise<{ paidAllocated: number; dueAllocated: number; totalAllocated: number }> {
  const rows = await tx
    .select({
      billedAmount: schema.posTransactionAreaAllocations.billedAmount,
      settlementKind: schema.posTransactionAreaAllocations.settlementKind,
      refundedAmount: schema.posTransactions.refundedAmount,
      total: schema.posTransactions.total,
      refundStatus: schema.posTransactions.refundStatus,
      paymentMethod: schema.posTransactions.paymentMethod,
    })
    .from(schema.posTransactionAreaAllocations)
    .innerJoin(
      schema.posTransactions,
      eq(schema.posTransactionAreaAllocations.transactionId, schema.posTransactions.id),
    )
    .where(eq(schema.posTransactionAreaAllocations.jobTicketId, jobId));

  let paidAllocated = 0;
  let dueAllocated = 0;
  for (const r of rows) {
    const billed = Number(r.billedAmount || 0);
    const txnTotal = Number(r.total || 0) || 1;
    const refunded = Number(r.refundedAmount || 0);
    // Pro-rate refunds against this allocation share of the invoice
    const share = Math.min(1, billed / txnTotal);
    const net = Math.max(0, billed - refunded * share);
    if (String(r.refundStatus) === "full") continue;
    if (String(r.settlementKind) === "due" || r.paymentMethod === "Due") {
      dueAllocated += net;
    } else {
      paidAllocated += net;
    }
  }
  return { paidAllocated, dueAllocated, totalAllocated: paidAllocated + dueAllocated };
}

export async function createPosSaleAtomic(input: CreatePosSaleInput): Promise<CreatePosSaleResult> {
  const paymentMethod = String((input.validated as any).paymentMethod || "");
  const customer = input.validated.customer;
  const isPaid = isPaidMethod(paymentMethod);
  const isDue = paymentMethod === "Due";
  const clientRequestId = input.clientRequestId
    ? String(input.clientRequestId).trim().slice(0, 128)
    : String((input.validated as any).clientRequestId || "").trim().slice(0, 128) || null;
  const actorUserId = input.actorUserId ? String(input.actorUserId) : null;
  const requestFingerprint = fingerprintFromValidated(
    input.validated,
    input.cartItems,
    input.linkedJobs,
  );

  // Idempotent replay: same actor + clientRequestId + fingerprint only
  if (clientRequestId && actorUserId) {
    const prior = await findPosByClientRequest(actorUserId, clientRequestId);
    if (prior) {
      assertIdempotentReplay(prior, requestFingerprint, clientRequestId);
      return { transaction: prior, idempotent: true };
    }
  }

  if (isDue && (!customer || !String(customer).trim())) {
    throw new PosBillingError(400, "DUE_REQUIRES_CUSTOMER", "Customer name is required for Due/Credit payments");
  }
  if (!isPaid && !isDue) {
    throw new PosBillingError(400, "INVALID_PAYMENT_METHOD", "Invalid payment method");
  }

  // Stock check before txn (read-only)
  for (const item of input.cartItems) {
    if (item?.id && item?.quantity) {
      const inv = await inventoryRepo.getInventoryItem(item.id);
      if (inv && inv.itemType !== "service" && item.quantity > (inv.stock ?? 0)) {
        throw new PosBillingError(409, "INSUFFICIENT_STOCK", `Insufficient stock for "${inv.name}"`, {
          available: inv.stock ?? 0,
          requested: item.quantity,
        });
      }
    }
  }

  const linkedBilledTotal = input.linkedJobs.reduce((s, j) => s + Number(j.billedAmount || 0), 0);
  if (linkedBilledTotal > Number(input.validated.total) + 0.01) {
    throw new PosBillingError(400, "LINKED_BILLED_EXCEEDS_TOTAL", "Linked job billed amounts cannot exceed the transaction total.");
  }

  const signalIdempotencyReplay = () => {
    throw new PosBillingError(409, "IDEMPOTENCY_RACE", "Concurrent duplicate clientRequestId; resolve via re-read", {
      clientRequestId,
      requestFingerprint,
    });
  };

  const result = await db.transaction(async (tx) => {
    // After we may wait on job locks, re-check committed concurrent sale (read-only, outside this insert)
    if (clientRequestId && actorUserId) {
      const priorLocked = await findPosByClientRequest(actorUserId, clientRequestId);
      if (priorLocked) {
        assertIdempotentReplay(priorLocked, requestFingerprint, clientRequestId);
        signalIdempotencyReplay();
      }
    }

    const lockedJobs: schema.JobTicket[] = [];
    const allocations: Array<{
      job: schema.JobTicket;
      billedAmount: number;
      priorPaid: number;
      serviceWarrantyMonths?: number | null;
      partsWarrantyMonths?: number | null;
    }> = [];

    for (const linked of input.linkedJobs) {
      const billedAmount = Number(linked.billedAmount);
      if (!linked.jobId || !Number.isFinite(billedAmount) || billedAmount < 0) {
        throw new PosBillingError(400, "INVALID_LINKED_JOB", "Each linked job requires a valid non-negative billed amount.");
      }

      const lock = await tx.execute(sql`SELECT * FROM job_tickets WHERE id = ${linked.jobId} FOR UPDATE`);
      const rows = (lock as any).rows ?? lock;
      const job = Array.isArray(rows) ? rows[0] : undefined;
      if (!job) {
        throw new PosBillingError(400, "LINKED_JOB_NOT_FOUND", "A linked job does not exist.", { jobId: linked.jobId });
      }

      // Map snake_case row to camel if needed
      const jobRow: schema.JobTicket = {
        ...(job as any),
        id: job.id,
        paymentStatus: job.payment_status ?? job.paymentStatus,
        paidAmount: job.paid_amount ?? job.paidAmount,
        remainingAmount: job.remaining_amount ?? job.remainingAmount,
        estimatedCost: job.estimated_cost ?? job.estimatedCost,
        billingStatus: job.billing_status ?? job.billingStatus,
        corporateClientId: job.corporate_client_id ?? job.corporateClientId,
        corporateChallanId: job.corporate_challan_id ?? job.corporateChallanId,
        serviceAreaId: job.service_area_id ?? job.serviceAreaId,
        status: job.status,
        warrantyDays: job.warranty_days ?? job.warrantyDays,
        warrantyExpiryDate: job.warranty_expiry_date ?? job.warrantyExpiryDate,
        device: job.device,
      } as any;

      if (jobRow.corporateClientId || jobRow.corporateChallanId) {
        throw new PosBillingError(400, "CORPORATE_JOB_NOT_RETAIL", "Corporate jobs cannot be billed through retail POS.", {
          jobId: jobRow.id,
        });
      }
      if (isNgProtectedStatus(jobRow.status)) {
        throw new PosBillingError(409, "NG_WORKFLOW_LOCKED", "A linked job is locked in the NG workflow.", {
          jobId: jobRow.id,
        });
      }

      const { paidAllocated, totalAllocated } = await sumJobAllocations(tx, jobRow.id);
      if (isPaid && isFullyPaidJob(jobRow, paidAllocated)) {
        // Concurrent same-key sale may have just committed — prefer idempotent replay over "already billed"
        if (clientRequestId && actorUserId) {
          const priorPaid = await findPosByClientRequest(actorUserId, clientRequestId);
          if (priorPaid) {
            assertIdempotentReplay(priorPaid, requestFingerprint, clientRequestId);
            signalIdempotencyReplay();
          }
        }
        throw new PosBillingError(409, "JOB_ALREADY_FULLY_BILLED", "This job is already fully billed/paid and cannot accept another POS invoice allocation.", {
          jobId: jobRow.id,
          paidAmount: jobRow.paidAmount,
          paymentStatus: jobRow.paymentStatus,
          priorPaidAllocated: paidAllocated,
        });
      }

      const estimate = Number(jobRow.estimatedCost || 0);
      if (isPaid && estimate > 0) {
        const room = Math.max(0, estimate - Number(jobRow.paidAmount || 0));
        if (billedAmount > room + 0.01) {
          throw new PosBillingError(409, "JOB_OVERBILL", "Billed amount exceeds remaining balance on job.", {
            jobId: jobRow.id,
            remaining: room,
            billedAmount,
          });
        }
      }
      // Due invoices: do not allow stacking unlimited due if already fully paid
      if (isDue && isFullyPaidJob(jobRow, paidAllocated)) {
        throw new PosBillingError(409, "JOB_ALREADY_FULLY_BILLED", "This job is already fully paid; due invoice not allowed.", {
          jobId: jobRow.id,
        });
      }
      // If no estimate and already has any allocation (paid or due), reject second invoice
      if (estimate <= 0 && totalAllocated > 0.001) {
        throw new PosBillingError(409, "JOB_ALREADY_FULLY_BILLED", "Job already has a POS allocation and no estimated remaining balance is defined.", {
          jobId: jobRow.id,
          priorAllocated: totalAllocated,
        });
      }

      lockedJobs.push(jobRow);
      allocations.push({
        job: jobRow,
        billedAmount,
        priorPaid: paidAllocated,
        serviceWarrantyMonths: linked.serviceWarrantyMonths ?? null,
        partsWarrantyMonths: linked.partsWarrantyMonths ?? null,
      });
    }

    // Resolve service area
    let serviceAreaId: string | null = (input.validated as any).serviceAreaId || null;
    if (allocations.length > 0) {
      const withArea = allocations.find((a) => Boolean(a.job.serviceAreaId));
      serviceAreaId = withArea ? (withArea.job.serviceAreaId as string) : null;
    } else if (serviceAreaId) {
      const area = await getActiveServiceAreaById(serviceAreaId);
      if (!area) {
        throw new PosBillingError(400, "INVALID_SERVICE_AREA", "Selected service area is not active or does not exist.");
      }
    }

    // Invoice sequence: advisory lock + numeric MAX of suffix (not lexicographic ORDER BY)
    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const lockKey = `pos_invoice_${datePrefix}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const likePattern = `INV-${datePrefix}-%`;
    const maxRes = await tx.execute(sql`
      SELECT COALESCE(MAX(
        CASE
          WHEN invoice_number ~ ${`^INV-${datePrefix}-[0-9]+$`}
          THEN CAST(substring(invoice_number from '[0-9]+$') AS INTEGER)
          ELSE NULL
        END
      ), 0) AS max_seq
      FROM pos_transactions
      WHERE invoice_number LIKE ${likePattern}
    `);
    const maxRows = (maxRes as any).rows ?? maxRes;
    const maxSeq = Number(Array.isArray(maxRows) ? maxRows[0]?.max_seq : 0) || 0;
    const nextSeq = maxSeq + 1;
    const invoiceNumber = `INV-${datePrefix}-${nextSeq.toString().padStart(4, "0")}`;
    const txnId = (input.validated as any).id || nanoid();

    let transaction: schema.PosTransaction;
    try {
      const [inserted] = await tx
        .insert(schema.posTransactions)
        .values({
          ...input.validated,
          id: txnId,
          invoiceNumber,
          serviceAreaId: serviceAreaId as any,
          refundedAmount: 0,
          refundStatus: "none",
          paymentStatus: isDue ? "Due" : "Paid",
          clientRequestId: clientRequestId || null,
          createdByUserId: actorUserId,
          idempotencyFingerprint: clientRequestId ? requestFingerprint : null,
        } as any)
        .returning();
      transaction = inserted;
    } catch (err: any) {
      const msg = String(err?.message || err);
      // Concurrent same clientRequestId only (not invoice_number collisions).
      // Abort this txn; outer recovery does read-only re-reads (never re-runs sale logic).
      if (
        clientRequestId &&
        actorUserId &&
        /unique|duplicate/i.test(msg) &&
        /client_request|uidx_pos_txn_client/i.test(msg)
      ) {
        throw new PosBillingError(409, "IDEMPOTENCY_RACE", "Concurrent duplicate clientRequestId; resolve via re-read", {
          clientRequestId,
          requestFingerprint,
        });
      }
      throw err;
    }

    if (allocations.length > 0) {
      await tx.insert(schema.posTransactionAreaAllocations).values(
        allocations.map((a) => ({
          id: nanoid(),
          transactionId: transaction.id,
          jobTicketId: a.job.id,
          serviceAreaId: (a.job.serviceAreaId as string) || null,
          billedAmount: a.billedAmount,
          settlementKind: isDue ? "due" : "paid",
        })),
      );
    }

    /**
     * Sourced parts sold without a buying price become an IOU.
     *
     * Written inside the same transaction as the sale, so a bill can never
     * exist without its outstanding cost being recorded — that gap is exactly
     * how a margin goes missing unnoticed. The evening sweep reads these and
     * nudges the one person who knows the number: whoever billed it.
     *
     * Parts sold WITH a cost need no row; nothing is owed.
     */
    const sourcedNeedingCost = (input.cartItems || []).filter(
      (item: any) => item?.isSourced && (item.sourcedCostPrice == null || Number(item.sourcedCostPrice) <= 0),
    );
    if (sourcedNeedingCost.length > 0 && input.actorUserId) {
      const billedByName = String(
        (input.req as any)?.user?.name || (input.req as any)?.user?.username || "Staff",
      );
      // A counter sale has no job; a job-linked sale attributes to the first.
      const jobTicketId = allocations[0]?.job?.id ?? null;
      await tx.insert(schema.pendingPartCosts).values(
        sourcedNeedingCost.map((item: any) => ({
          id: nanoid(),
          posTransactionId: transaction.id,
          jobTicketId,
          partName: String(item.name || "Sourced part"),
          sellingPrice: Number(item.price) || 0,
          quantity: Number(item.quantity) || 1,
          warrantyDays: item.sourcedWarrantyDays != null ? Number(item.sourcedWarrantyDays) : null,
          billedBy: String(input.actorUserId),
          billedByName,
          costPrice: null,
          storeId: (input.validated as any).storeId ?? null,
        })),
      );
    }

    // Inventory stock updates inside same transaction
    for (const item of input.cartItems) {
      if (item?.id && item?.quantity) {
        await tx
          .update(schema.inventoryItems)
          .set({
            stock: sql`GREATEST(0, COALESCE(${schema.inventoryItems.stock}, 0) - ${item.quantity})`,
          })
          .where(eq(schema.inventoryItems.id, item.id));
      }
    }

    // Petty cash / due / drawer
    if (isDue && customer) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);
      await tx.insert(schema.dueRecords).values({
        id: nanoid(),
        customer: String(customer),
        amount: Number(input.validated.total),
        status: "Pending",
        invoice: transaction.invoiceNumber || transaction.id,
        dueDate,
        customerPhone: (input.validated as any).customerPhone || null,
        source: "pos",
      } as any);
    } else if (isPaid) {
      await tx.insert(schema.pettyCashRecords).values({
        id: nanoid(),
        description: `POS Sale - Invoice ${transaction.invoiceNumber || transaction.id}`,
        category: "Sales",
        amount: Number(input.validated.total),
        type: "Income",
      } as any);

      if (paymentMethod === "Cash") {
        const drawers = await tx
          .select()
          .from(schema.drawerSessions)
          .where(eq(schema.drawerSessions.status, "open"))
          .limit(1);
        const active = drawers[0];
        if (active) {
          await tx
            .update(schema.drawerSessions)
            .set({
              expectedCash: sql`COALESCE(${schema.drawerSessions.expectedCash}, 0) + ${Number(input.validated.total)}`,
            })
            .where(eq(schema.drawerSessions.id, active.id));
        }
      }
    }

    // Job payment + completion + warranty fields
    for (const a of allocations) {
      const job = a.job;
      if (isPaid) {
        const newPaid = Number(job.paidAmount || 0) + a.billedAmount;
        const estimate = Number(job.estimatedCost || 0);
        const remaining = estimate > 0 ? Math.max(0, estimate - newPaid) : 0;
        let paymentStatus: "unpaid" | "paid" | "partial" = "partial";
        if (estimate <= 0 || remaining <= 0) paymentStatus = "paid";
        else if (newPaid <= 0) paymentStatus = "unpaid";

        const warrantyDays = Number((job as any).warrantyDays ?? 30);
        const completionPatch: Record<string, unknown> = {
          paidAmount: newPaid,
          remainingAmount: remaining,
          paymentStatus,
          lastPaymentAt: new Date(),
          billingStatus: "invoiced",
        };
        if (!job.paidAmount || Number(job.paidAmount) === 0) {
          completionPatch.paymentId = transaction.id;
          completionPatch.paidAt = new Date();
        }
        /**
         * Both warranty clocks, from the one resolver.
         *
         * The labour expiry was computed inline here and again in jobs.routes,
         * the same six lines twice. The parts clock had no writer anywhere, so
         * parts_warranty_expiry_date stayed NULL and every parts claim was
         * judged against the labour period.
         *
         * One `completedAt` is shared by both so they cannot disagree by a day
         * across a midnight boundary. Neither expiry is overwritten if already
         * set — paying an already-completed job must not extend a warranty the
         * customer has been running down.
         */
        const jobCompletedAt = new Date();
        const { resolveJobWarranty } = await import("./job-warranty.service.js");
        const resolvedWarranty = await resolveJobWarranty(job as any, jobCompletedAt);

        if (job.status !== "Completed") {
          completionPatch.status = "Completed";
          completionPatch.completedAt = jobCompletedAt;
        }
        /**
         * A period chosen at the counter wins over the resolver's default.
         *
         * The resolver infers parts cover from what was fitted and falls back to
         * a 30 day labour default. Neither knows what was actually said to the
         * customer. When the cashier picked a period, that is the promise, and
         * it is what must be recorded — otherwise a customer told "six months"
         * holds a card that says one.
         *
         * Still never overwrites an expiry already set: paying an
         * already-completed job must not extend a warranty being run down.
         */
        const chosenServiceDays = monthsToDays(a.serviceWarrantyMonths);
        const chosenPartsDays = monthsToDays(a.partsWarrantyMonths);
        const addDays = (from: Date, days: number) => {
          const d = new Date(from);
          d.setDate(d.getDate() + days);
          return d;
        };

        /**
         * A choice made at the counter beats a default the system guessed.
         *
         * The original guard was "never overwrite an existing expiry", which
         * silently dropped every counter choice. Marking a job Completed
         * already stamps a 30-day labour default (jobs.routes, via
         * resolveJobWarranty), so by the time the cashier picks three months
         * the expiry exists and the whole block was skipped. The customer was
         * told three months and issued thirty days.
         *
         * The guard could not tell a default written seconds ago from a
         * warranty a customer has been running down for weeks. `firstBilling`
         * is that distinction: until this job has taken any money, nothing has
         * been promised in writing and the counter is still deciding. Once it
         * is invoiced the period is fixed, so re-paying a partially-paid job
         * can never extend cover.
         */
        const firstBilling = Number(job.paidAmount || 0) <= 0;
        const mayOverride = (existing: unknown) => !existing || firstBilling;

        if (mayOverride((job as any).warrantyExpiryDate)) {
          if (chosenServiceDays) {
            completionPatch.warrantyDays = chosenServiceDays;
            completionPatch.warrantyExpiryDate = addDays(jobCompletedAt, chosenServiceDays);
          } else if (!(job as any).warrantyExpiryDate && warrantyDays > 0 && resolvedWarranty.warrantyExpiryDate) {
            completionPatch.warrantyExpiryDate = resolvedWarranty.warrantyExpiryDate;
          }
        }

        if (mayOverride((job as any).partsWarrantyExpiryDate)) {
          if (chosenPartsDays) {
            completionPatch.partsWarrantyDays = chosenPartsDays;
            completionPatch.partsWarrantyExpiryDate = addDays(jobCompletedAt, chosenPartsDays);
          } else if (!(job as any).partsWarrantyExpiryDate && resolvedWarranty.partsWarrantyExpiryDate) {
            completionPatch.partsWarrantyExpiryDate = resolvedWarranty.partsWarrantyExpiryDate;
            completionPatch.partsWarrantyDays = resolvedWarranty.partsWarrantyDays;
          }
        }

        await tx
          .update(schema.jobTickets)
          .set(completionPatch as any)
          .where(eq(schema.jobTickets.id, job.id));
      } else if (isDue) {
        // Due: mark billed pending without increasing paidAmount
        await tx
          .update(schema.jobTickets)
          .set({
            billingStatus: "billed",
          } as any)
          .where(eq(schema.jobTickets.id, job.id));
      }
    }

    // Test-only harness: only when NODE_ENV=test and explicit AT=pos_create (never default refund QA)
    if (
      process.env.NODE_ENV === "test" &&
      process.env.POS_R1H_FORCE_FAIL === "1" &&
      process.env.POS_R1H_FORCE_FAIL_AT === "pos_create"
    ) {
      throw new PosBillingError(500, "FORCED_TEST_FAIL", "Forced rollback for QA harness");
    }

    return { transaction, allocations, isPaid };
  }).catch(async (err) => {
    // Internal race marker → bounded read-only recovery (never re-run sale)
    if (err instanceof PosBillingError && err.code === "IDEMPOTENCY_RACE" && clientRequestId && actorUserId) {
      const prior = await awaitPosByClientRequest(actorUserId, clientRequestId, requestFingerprint);
      return { transaction: prior, allocations: [] as any[], isPaid: true, replay: true as const };
    }
    throw err;
  });

  if ((result as any).replay) {
    return { transaction: result.transaction, idempotent: true };
  }

  // Post-commit best-effort journey/audit (must not reverse committed money)
  for (const a of result.allocations) {
    repairJourneyService
      .syncBillToJourney({
        jobId: a.job.id,
        invoiceNumber: result.transaction.invoiceNumber || undefined,
        transactionId: result.transaction.id,
        amount: a.billedAmount,
        paymentMethod,
      })
      .catch((err) => console.error("[RepairJourney] Bill sync failed:", (err as Error).message));

    if (result.isPaid) {
      import("./job-status-transition.service.js")
        .then(({ projectJobStatusAfterExternalWrite }) =>
          projectJobStatusAfterExternalWrite(a.job.id, "POS Settlement", {
            suppressReadyNotify: true,
          }),
        )
        .catch((err) => console.error("[POS] Dual projection failed:", (err as Error).message));

      repairJourneyService
        .syncPaymentToJourney({
          jobId: a.job.id,
          paymentStatus: "paid",
          amount: a.billedAmount,
        })
        .catch(() => {});
    }
  }

  if (input.actorUserId) {
    auditLogger
      .log({
        userId: input.actorUserId,
        action: "POS_TRANSACTION_CREATE",
        entity: "PosTransaction",
        entityId: result.transaction.id,
        details: `Invoice ${result.transaction.invoiceNumber} total=${result.transaction.total} method=${paymentMethod} jobs=${input.linkedJobs.map((j) => j.jobId).join(",")}`,
        req: input.req,
      })
      .catch(() => {});
  }

  return { transaction: result.transaction, idempotent: false };
}

export function derivePosRefundLifecycle(txn: {
  total: number;
  refundedAmount?: number | null;
  refundStatus?: string | null;
  paymentStatus?: string | null;
}) {
  const total = Number(txn.total || 0);
  const refunded = Number(txn.refundedAmount || 0);
  const net = Math.max(0, total - refunded);
  let lifecycle: "paid" | "partially_refunded" | "fully_refunded" | "due" = "paid";
  if (txn.paymentStatus === "Due") lifecycle = "due";
  if (refunded > 0.001 && refunded + 0.001 < total) lifecycle = "partially_refunded";
  if (refunded + 0.001 >= total && total > 0) lifecycle = "fully_refunded";
  if (txn.refundStatus === "full") lifecycle = "fully_refunded";
  if (txn.refundStatus === "partial") lifecycle = "partially_refunded";
  // Paid invoices have no due outstanding; Due invoices' unpaid remainder is net
  const outstandingDue = txn.paymentStatus === "Due" ? net : 0;
  return {
    lifecycle,
    originalTotal: total,
    refundedTotal: refunded,
    netCollectedTotal: net,
    netCollected: net,
    outstandingDue,
  };
}
