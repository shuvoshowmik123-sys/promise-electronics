/**
 * Allocation-safe refunds (SERVICE-LIFECYCLE-R1H2/R1H3/R1H4/R1H4-HOTFIX).
 * POS invoice is money authority. Job-scoped refunds only touch that job's allocation.
 * Processing uses persisted refund_allocations only.
 * R1H3: atomic reviewer decisions, allocation integrity guards, 2dp money boundary,
 * test-hook only when NODE_ENV=test.
 * R1H4: reject unpaid Due invoices; never cancel due_records via refund process.
 * R1H4-HOTFIX: collected-payment guard at create/approve/process; fail-closed unknown payment.
 */
import { db } from "../db.js";
import { eq, and, inArray, sql } from "drizzle-orm";
import * as schema from "../../shared/schema.js";
import { nanoid } from "../repositories/base.js";

export class RefundProcessError extends Error {
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

const RESERVE_OR_PROCESSED = ["pending", "approved", "processed"] as const;
const RESERVATIONS = ["pending", "approved"] as const;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Reject amounts with more than two decimal places (no silent rounding). */
export function assertMoneyAtMostTwoDecimals(raw: unknown): number {
  const amount = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RefundProcessError(400, "INVALID_AMOUNT", "Invalid refund amount");
  }
  const scaled = amount * 100;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-8) {
    throw new RefundProcessError(
      400,
      "INVALID_AMOUNT_PRECISION",
      "Refund amount must have at most two decimal places",
    );
  }
  return Math.round(scaled) / 100;
}

/** Test-only force-fail: active solely when NODE_ENV === "test". Never log the env name. */
function shouldForceTestFail(): boolean {
  return process.env.NODE_ENV === "test" && process.env.POS_R1H_FORCE_FAIL === "1";
}

/** Explicit paid collection methods (not Due / not credit). */
const COLLECTED_PAYMENT_METHODS = new Set([
  "cash",
  "bank",
  "bkash",
  "nagad",
  "card",
  "online",
  "rocket",
  "upay",
  "cheque",
  "check",
  "mfs",
]);

/** Explicit paid statuses. */
const COLLECTED_PAYMENT_STATUSES = new Set(["paid", "completed", "settled"]);

export type PosPaymentEvidence = {
  payment_method?: string | null;
  paymentMethod?: string | null;
  payment_status?: string | null;
  paymentStatus?: string | null;
};

/**
 * Classify POS payment evidence for refund safety.
 * - due: unpaid Due invoice
 * - collected: explicit paid method and/or paid status
 * - unverified: missing/legacy/unknown — fail closed
 */
export function classifyPosPaymentEvidence(txn: PosPaymentEvidence): "due" | "collected" | "unverified" {
  const method = String(txn.payment_method ?? txn.paymentMethod ?? "").trim().toLowerCase();
  const status = String(txn.payment_status ?? txn.paymentStatus ?? "").trim().toLowerCase();

  if (method === "due" || status === "due") return "due";

  const methodCollected = method.length > 0 && COLLECTED_PAYMENT_METHODS.has(method);
  const statusCollected = status.length > 0 && COLLECTED_PAYMENT_STATUSES.has(status);
  if (methodCollected || statusCollected) return "collected";

  return "unverified";
}

/**
 * Refunds require explicit collected payment.
 * Due → REFUND_REQUIRES_COLLECTED_PAYMENT.
 * Unknown/missing → REFUND_COLLECTED_PAYMENT_UNVERIFIED (fail closed; never guess paid).
 */
export function assertPosCollectedPayment(txn: PosPaymentEvidence): void {
  const kind = classifyPosPaymentEvidence(txn);
  if (kind === "due") {
    throw new RefundProcessError(
      409,
      "REFUND_REQUIRES_COLLECTED_PAYMENT",
      "Refunds require a collected payment. Unpaid Due invoices cannot be refunded; use a separate void/credit-note workflow.",
    );
  }
  if (kind === "unverified") {
    throw new RefundProcessError(
      409,
      "REFUND_COLLECTED_PAYMENT_UNVERIFIED",
      "Refund blocked: POS payment collection evidence is missing or unrecognized.",
    );
  }
}

/**
 * Sanitized diagnostic: count open refunds (pending/approved) linked to Due or unverified POS payment.
 * Logs counts only — no customer data, invoice numbers, or IDs.
 */
export async function logLegacyUnsafeRefundCounts(): Promise<{ dueLinked: number; unverifiedLinked: number }> {
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (
          WHERE lower(coalesce(p.payment_method, '')) = 'due'
             OR lower(coalesce(p.payment_status, '')) = 'due'
        )::int AS due_linked,
        COUNT(*) FILTER (
          WHERE lower(coalesce(p.payment_method, '')) <> 'due'
            AND lower(coalesce(p.payment_status, '')) <> 'due'
            AND NOT (
              lower(coalesce(p.payment_method, '')) IN (
                'cash','bank','bkash','nagad','card','online','rocket','upay','cheque','check','mfs'
              )
              OR lower(coalesce(p.payment_status, '')) IN ('paid','completed','settled')
            )
        )::int AS unverified_linked
      FROM refunds r
      INNER JOIN pos_transactions p ON p.id = r.reference_id
      WHERE r.status IN ('pending', 'approved')
    `);
    const rows = (r as any).rows ?? r;
    const dueLinked = Number(rows[0]?.due_linked ?? 0);
    const unverifiedLinked = Number(rows[0]?.unverified_linked ?? 0);
    if (dueLinked > 0 || unverifiedLinked > 0) {
      console.warn(
        `[Refund] Legacy open refunds needing manual review: dueLinked=${dueLinked} unverifiedLinked=${unverifiedLinked} (no auto-mutation)`,
      );
    } else {
      console.log(`[Refund] Legacy open refund scan: dueLinked=0 unverifiedLinked=0`);
    }
    return { dueLinked, unverifiedLinked };
  } catch (e) {
    console.warn(`[Refund] Legacy open refund scan skipped`);
    return { dueLinked: -1, unverifiedLinked: -1 };
  }
}

/** Sum refund amounts reserved/processed against a POS invoice (via refunds.referenceId). */
export async function sumActiveRefundsForPos(
  txOrDb: any,
  posTransactionId: string,
  excludeRefundId?: string,
  modes: "reservations" | "all" = "all",
): Promise<number> {
  const statuses = modes === "reservations" ? RESERVATIONS : RESERVE_OR_PROCESSED;
  const rows = await txOrDb
    .select({
      refundAmount: schema.refunds.refundAmount,
      id: schema.refunds.id,
    })
    .from(schema.refunds)
    .where(
      and(eq(schema.refunds.referenceId, posTransactionId), inArray(schema.refunds.status, [...statuses])),
    );
  return rows
    .filter((r: any) => !excludeRefundId || r.id !== excludeRefundId)
    .reduce((s: number, r: any) => s + Number(r.refundAmount || 0), 0);
}

/** Sum refund_allocations for a job on a POS invoice (all active refund statuses). */
export async function sumJobRefundedOnInvoice(
  txOrDb: any,
  transactionId: string,
  jobTicketId: string,
  excludeRefundId?: string,
): Promise<number> {
  const rows = await txOrDb
    .select({
      amount: schema.refundAllocations.refundAmount,
      refundId: schema.refundAllocations.refundId,
      status: schema.refunds.status,
    })
    .from(schema.refundAllocations)
    .innerJoin(schema.refunds, eq(schema.refundAllocations.refundId, schema.refunds.id))
    .where(
      and(
        eq(schema.refundAllocations.transactionId, transactionId),
        eq(schema.refundAllocations.jobTicketId, jobTicketId),
        inArray(schema.refunds.status, [...RESERVE_OR_PROCESSED]),
      ),
    );
  return rows
    .filter((r: any) => !excludeRefundId || r.refundId !== excludeRefundId)
    .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
}

export async function sumActiveRefundsForReference(
  referenceId: string,
  excludeRefundId?: string,
): Promise<number> {
  return sumActiveRefundsForPos(db, referenceId, excludeRefundId);
}

/**
 * Split refundAmount across jobs by remaining net refundable, last row gets remainder.
 */
export function distributeInvoiceRefund(
  jobNets: Array<{ jobTicketId: string; netRefundable: number }>,
  refundAmount: number,
): Array<{ jobTicketId: string; refundAmount: number }> {
  const totalNet = round2(jobNets.reduce((s, j) => s + j.netRefundable, 0));
  if (totalNet <= 0) return [];
  if (refundAmount > totalNet + 0.001) {
    throw new RefundProcessError(409, "REFUND_EXCEEDS_NET", "Refund exceeds net refundable on invoice");
  }
  const eligible = jobNets.filter((j) => j.netRefundable > 0.0001);
  const out: Array<{ jobTicketId: string; refundAmount: number }> = [];
  let remaining = round2(refundAmount);
  for (let i = 0; i < eligible.length; i++) {
    const j = eligible[i]!;
    const isLast = i === eligible.length - 1;
    let share: number;
    if (isLast) {
      share = remaining;
    } else {
      share = round2((j.netRefundable / totalNet) * refundAmount);
      share = Math.min(share, j.netRefundable, remaining);
    }
    share = Math.min(share, j.netRefundable);
    share = round2(share);
    if (share > 0) {
      out.push({ jobTicketId: j.jobTicketId, refundAmount: share });
      remaining = round2(remaining - share);
    }
  }
  if (Math.abs(remaining) >= 0.01 && out.length) {
    const last = out[out.length - 1]!;
    last.refundAmount = round2(last.refundAmount + remaining);
  }
  const sum = round2(out.reduce((s, x) => s + x.refundAmount, 0));
  if (Math.abs(sum - round2(refundAmount)) > 0.02) {
    throw new RefundProcessError(500, "ALLOCATION_SUM_MISMATCH", "Internal allocation sum mismatch");
  }
  return out;
}

async function loadPosJobLines(tx: any, transactionId: string) {
  return tx
    .select({
      jobTicketId: schema.posTransactionAreaAllocations.jobTicketId,
      billedAmount: schema.posTransactionAreaAllocations.billedAmount,
    })
    .from(schema.posTransactionAreaAllocations)
    .where(eq(schema.posTransactionAreaAllocations.transactionId, transactionId));
}

function mapRefundRow(raw: any): {
  id: string;
  type: string;
  referenceId: string;
  refundAmount: number;
  originalAmount: number;
  status: string;
  requestedBy: string;
  scope: string;
  targetJobTicketId: string | null;
  reason: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectionReason: string | null;
} {
  return {
    id: raw.id,
    type: raw.type,
    referenceId: raw.reference_id ?? raw.referenceId,
    refundAmount: Number(raw.refund_amount ?? raw.refundAmount),
    originalAmount: Number(raw.original_amount ?? raw.originalAmount),
    status: raw.status,
    requestedBy: raw.requested_by ?? raw.requestedBy,
    scope: raw.scope || "invoice",
    targetJobTicketId: raw.target_job_ticket_id ?? raw.targetJobTicketId ?? null,
    reason: raw.reason,
    approvedBy: raw.approved_by ?? raw.approvedBy ?? null,
    approvedAt: raw.approved_at ?? raw.approvedAt ?? null,
    rejectionReason: raw.rejection_reason ?? raw.rejectionReason ?? null,
  };
}

/**
 * Validate persisted allocation rows before any financial mutation.
 */
export async function validatePersistedAllocations(
  tx: any,
  refund: { id: string; referenceId: string; refundAmount: number; scope: string; targetJobTicketId: string | null },
  allocs: Array<{
    transactionId: string;
    jobTicketId: string | null;
    refundAmount: number | null;
  }>,
): Promise<void> {
  if (!allocs.length) {
    throw new RefundProcessError(500, "MISSING_REFUND_ALLOCATIONS", "Refund has no persisted allocations");
  }

  const posId = refund.referenceId;
  for (const a of allocs) {
    if (String(a.transactionId) !== String(posId)) {
      throw new RefundProcessError(
        409,
        "CORRUPT_REFUND_ALLOCATION",
        "Allocation transaction does not match refund invoice",
      );
    }
    const amt = Number(a.refundAmount || 0);
    if (!(amt > 0)) {
      throw new RefundProcessError(409, "CORRUPT_REFUND_ALLOCATION", "Allocation amount must be positive");
    }
  }

  const lines = await loadPosJobLines(tx, posId);
  const jobsOnInvoice = new Set(
    lines.map((l: any) => l.jobTicketId).filter((id: string | null | undefined) => !!id),
  );

  for (const a of allocs) {
    if (a.jobTicketId && !jobsOnInvoice.has(a.jobTicketId)) {
      throw new RefundProcessError(
        409,
        "CORRUPT_REFUND_ALLOCATION",
        "Allocation job is not on the refund invoice",
      );
    }
  }

  if (refund.scope === "job_allocation") {
    if (allocs.length !== 1) {
      throw new RefundProcessError(
        409,
        "CORRUPT_REFUND_ALLOCATION",
        "Job-allocation refund must have exactly one allocation row",
      );
    }
    if (!refund.targetJobTicketId || allocs[0]!.jobTicketId !== refund.targetJobTicketId) {
      throw new RefundProcessError(
        409,
        "CORRUPT_REFUND_ALLOCATION",
        "Job-allocation target does not match allocation row",
      );
    }
  } else {
    // invoice scope
    const nullJobs = allocs.filter((a) => !a.jobTicketId);
    const withJobs = allocs.filter((a) => !!a.jobTicketId);
    if (nullJobs.length && withJobs.length) {
      throw new RefundProcessError(
        409,
        "CORRUPT_REFUND_ALLOCATION",
        "Invoice refund cannot mix null-job and job allocations",
      );
    }
    if (nullJobs.length > 1) {
      throw new RefundProcessError(
        409,
        "CORRUPT_REFUND_ALLOCATION",
        "Standalone invoice refund may have only one null-job allocation",
      );
    }
    if (!nullJobs.length && !withJobs.length) {
      throw new RefundProcessError(500, "CORRUPT_REFUND_ALLOCATION", "Invoice refund has empty allocation set");
    }
  }

  const allocSum = round2(allocs.reduce((s, a) => s + Number(a.refundAmount || 0), 0));
  if (Math.abs(allocSum - round2(refund.refundAmount)) > 0.01) {
    throw new RefundProcessError(
      409,
      "ALLOCATION_SUM_MISMATCH",
      "Persisted allocations do not sum to refund amount",
    );
  }
}

export async function createRefundRequestAtomic(opts: {
  type: string;
  referenceId: string;
  posTransactionId?: string | null;
  refundAmount: number;
  reason: string;
  notes?: string | null;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: string;
}): Promise<{ refund: schema.Refund }> {
  if (opts.type === "warranty") {
    throw new RefundProcessError(
      400,
      "WARRANTY_REFUND_UNSUPPORTED",
      "Warranty refunds are not supported until a canonical paid warranty-claim source exists.",
    );
  }
  const amount = assertMoneyAtMostTwoDecimals(opts.refundAmount);
  if (!opts.reason?.trim()) {
    throw new RefundProcessError(400, "REASON_REQUIRED", "Non-empty reason is required");
  }

  return db.transaction(async (tx) => {
    let posId: string;
    let scope: "invoice" | "job_allocation";
    let targetJobTicketId: string | null = null;
    let customer = "Unknown";
    let customerPhone: string | null = null;
    let invoiceNumber: string | null = null;
    let originalAmount = 0;

    if (opts.type === "pos") {
      const tlock = await tx.execute(sql`SELECT * FROM pos_transactions WHERE id = ${opts.referenceId} FOR UPDATE`);
      const txn = ((tlock as any).rows ?? tlock)[0];
      if (!txn) throw new RefundProcessError(404, "POS_NOT_FOUND", "POS transaction not found");
      assertPosCollectedPayment(txn);
      posId = txn.id;
      originalAmount = Number(txn.total);
      customer = txn.customer || "Unknown";
      customerPhone = txn.customer_phone ?? txn.customerPhone ?? null;
      invoiceNumber = txn.invoice_number ?? txn.invoiceNumber ?? null;
      scope = "invoice";
    } else if (opts.type === "job") {
      const jlock = await tx.execute(sql`SELECT * FROM job_tickets WHERE id = ${opts.referenceId} FOR UPDATE`);
      const job = ((jlock as any).rows ?? jlock)[0];
      if (!job) throw new RefundProcessError(404, "JOB_NOT_FOUND", "Job not found");

      const lines = await tx
        .select({
          transactionId: schema.posTransactionAreaAllocations.transactionId,
          billedAmount: schema.posTransactionAreaAllocations.billedAmount,
          invoiceNumber: schema.posTransactions.invoiceNumber,
          total: schema.posTransactions.total,
          customer: schema.posTransactions.customer,
          customerPhone: schema.posTransactions.customerPhone,
        })
        .from(schema.posTransactionAreaAllocations)
        .innerJoin(
          schema.posTransactions,
          eq(schema.posTransactionAreaAllocations.transactionId, schema.posTransactions.id),
        )
        .where(eq(schema.posTransactionAreaAllocations.jobTicketId, opts.referenceId));

      if (!lines.length) {
        throw new RefundProcessError(
          404,
          "NO_POS_FOR_JOB",
          "No POS invoice allocation is linked to this job.",
        );
      }
      const distinct = Array.from(new Set(lines.map((l: any) => String(l.transactionId))));
      let chosen = opts.posTransactionId ? String(opts.posTransactionId) : null;
      if (chosen) {
        if (!distinct.includes(chosen)) {
          throw new RefundProcessError(400, "POS_NOT_LINKED_TO_JOB", "posTransactionId is not linked to this job");
        }
      } else if (distinct.length === 1) {
        chosen = distinct[0]!;
      } else {
        throw new RefundProcessError(
          409,
          "AMBIGUOUS_INVOICE",
          "Multiple POS invoices are linked to this job. Provide posTransactionId.",
          {
            invoices: lines.map((a: any) => ({
              posTransactionId: a.transactionId,
              invoiceNumber: a.invoiceNumber,
              billedAmount: a.billedAmount,
            })),
          },
        );
      }

      const tlock = await tx.execute(sql`SELECT * FROM pos_transactions WHERE id = ${chosen} FOR UPDATE`);
      const txn = ((tlock as any).rows ?? tlock)[0];
      if (!txn) throw new RefundProcessError(404, "POS_NOT_FOUND", "POS transaction not found");
      assertPosCollectedPayment(txn);
      const line = lines.find((l: any) => String(l.transactionId) === chosen)!;
      posId = chosen!;
      originalAmount = Number(txn.total ?? line.total);
      customer = txn.customer || line.customer || job.customer || "Unknown";
      customerPhone =
        txn.customer_phone ?? txn.customerPhone ?? line.customerPhone ?? job.customer_phone ?? job.customerPhone ?? null;
      invoiceNumber = txn.invoice_number ?? txn.invoiceNumber ?? line.invoiceNumber ?? null;
      scope = "job_allocation";
      targetJobTicketId = opts.referenceId;
    } else {
      throw new RefundProcessError(400, "INVALID_REFUND_TYPE", 'type must be "pos" or "job"');
    }

    if (scope === "invoice") {
      const prior = await sumActiveRefundsForPos(tx, posId);
      const net = round2(originalAmount - prior);
      if (amount > net + 0.001) {
        throw new RefundProcessError(409, "REFUND_EXCEEDS_NET", `Refund exceeds invoice net (৳${net.toFixed(2)})`, {
          netRefundable: net,
        });
      }
    } else {
      const lines = await loadPosJobLines(tx, posId);
      const jobLine = lines.find((l: any) => l.jobTicketId === targetJobTicketId);
      if (!jobLine) {
        throw new RefundProcessError(400, "JOB_NOT_ON_INVOICE", "Job has no allocation on this invoice");
      }
      const billed = Number(jobLine.billedAmount || 0);
      const already = await sumJobRefundedOnInvoice(tx, posId, targetJobTicketId!);
      const net = round2(billed - already);
      if (amount > net + 0.001) {
        throw new RefundProcessError(
          409,
          "REFUND_EXCEEDS_JOB_ALLOCATION",
          `Refund exceeds this job's allocation net (৳${net.toFixed(2)})`,
          { netRefundable: net, jobBilled: billed, alreadyRefunded: already },
        );
      }
      const invPrior = await sumActiveRefundsForPos(tx, posId);
      const invNet = round2(originalAmount - invPrior);
      if (amount > invNet + 0.001) {
        throw new RefundProcessError(409, "REFUND_EXCEEDS_NET", "Refund exceeds invoice net", { netRefundable: invNet });
      }
    }

    let splits: Array<{ jobTicketId: string | null; refundAmount: number }>;
    if (scope === "job_allocation") {
      splits = [{ jobTicketId: targetJobTicketId, refundAmount: amount }];
    } else {
      const lines = await loadPosJobLines(tx, posId);
      const jobNets: Array<{ jobTicketId: string; netRefundable: number }> = [];
      for (const line of lines) {
        if (!line.jobTicketId) continue;
        const billed = Number(line.billedAmount || 0);
        const already = await sumJobRefundedOnInvoice(tx, posId, line.jobTicketId);
        jobNets.push({ jobTicketId: line.jobTicketId, netRefundable: round2(Math.max(0, billed - already)) });
      }
      if (!jobNets.length) {
        splits = [{ jobTicketId: null, refundAmount: amount }];
      } else {
        splits = distributeInvoiceRefund(jobNets, amount);
      }
    }

    const refundId = nanoid();
    const [created] = await tx
      .insert(schema.refunds)
      .values({
        id: refundId,
        type: "pos",
        referenceId: posId,
        referenceInvoice: invoiceNumber,
        scope,
        targetJobTicketId,
        customer,
        customerPhone,
        originalAmount,
        refundAmount: amount,
        reason: opts.reason.trim(),
        status: "pending",
        requestedBy: opts.requestedBy,
        requestedByName: opts.requestedByName,
        requestedByRole: opts.requestedByRole,
        requestedAt: new Date(),
        notes: opts.notes || null,
      } as any)
      .returning();

    if (splits.length) {
      await tx.insert(schema.refundAllocations).values(
        splits.map((s) => ({
          id: nanoid(),
          refundId,
          transactionId: posId,
          jobTicketId: s.jobTicketId,
          refundAmount: s.refundAmount,
        })),
      );
    }

    return { refund: created };
  });
}

/**
 * Atomic approve/reject: single transaction, FOR UPDATE, pending-only, maker-checker.
 * Concurrent second decision → 409 REFUND_DECISION_STALE.
 */
export async function decideRefundAtomic(opts: {
  refundId: string;
  decision: "approve" | "reject";
  actorId: string;
  actorName: string;
  actorRole: string;
  rejectionReason?: string | null;
  threshold: number;
}): Promise<{ refund: schema.Refund }> {
  if (!["Manager", "Super Admin"].includes(opts.actorRole)) {
    throw new RefundProcessError(403, "FORBIDDEN", "Only Manager or Super Admin can decide refunds");
  }

  return db.transaction(async (tx) => {
    const rlock = await tx.execute(sql`SELECT * FROM refunds WHERE id = ${opts.refundId} FOR UPDATE`);
    const raw = ((rlock as any).rows ?? rlock)[0];
    if (!raw) throw new RefundProcessError(404, "REFUND_NOT_FOUND", "Refund not found");

    const refund = mapRefundRow(raw);

    if (refund.status !== "pending") {
      throw new RefundProcessError(
        409,
        "REFUND_DECISION_STALE",
        "Refund is no longer pending; decision already recorded",
        { currentStatus: refund.status },
      );
    }

    if (refund.requestedBy && refund.requestedBy === opts.actorId) {
      throw new RefundProcessError(
        403,
        "SELF_APPROVAL_FORBIDDEN",
        `Requester cannot ${opts.decision} their own refund`,
      );
    }

    if (opts.decision === "approve") {
      if (refund.refundAmount > opts.threshold && opts.actorRole !== "Super Admin") {
        throw new RefundProcessError(
          403,
          "SUPER_ADMIN_REQUIRED",
          `Refunds over ৳${opts.threshold} require Super Admin approval`,
        );
      }

      // Lock canonical POS; collected-payment guard before capacity checks or writes
      const tlock = await tx.execute(
        sql`SELECT * FROM pos_transactions WHERE id = ${refund.referenceId} FOR UPDATE`,
      );
      const txn = ((tlock as any).rows ?? tlock)[0];
      if (!txn) throw new RefundProcessError(404, "POS_NOT_FOUND", "POS transaction not found");
      assertPosCollectedPayment(txn);

      const total = Number(txn.total ?? refund.originalAmount);
      const prior = await sumActiveRefundsForPos(tx, refund.referenceId, refund.id, "all");
      if (prior + refund.refundAmount > total + 0.01) {
        throw new RefundProcessError(409, "REFUND_EXCEEDS_NET", "Refund would exceed net refundable", {
          netRefundable: round2(total - prior),
        });
      }

      const [updated] = await tx
        .update(schema.refunds)
        .set({
          status: "approved",
          approvedBy: opts.actorId,
          approvedByName: opts.actorName,
          approvedByRole: opts.actorRole,
          approvedAt: new Date(),
        } as any)
        .where(and(eq(schema.refunds.id, opts.refundId), eq(schema.refunds.status, "pending")))
        .returning();

      if (!updated) {
        throw new RefundProcessError(409, "REFUND_DECISION_STALE", "Refund decision already recorded");
      }
      return { refund: updated };
    }

    // reject — allowed even for Due/unverified POS (manual maker-checker closure)
    const [updated] = await tx
      .update(schema.refunds)
      .set({
        status: "rejected",
        approvedBy: opts.actorId,
        approvedByName: opts.actorName,
        approvedByRole: opts.actorRole,
        approvedAt: new Date(),
        rejectionReason: (opts.rejectionReason || "Rejected").slice(0, 500),
      } as any)
      .where(and(eq(schema.refunds.id, opts.refundId), eq(schema.refunds.status, "pending")))
      .returning();

    if (!updated) {
      throw new RefundProcessError(409, "REFUND_DECISION_STALE", "Refund decision already recorded");
    }
    return { refund: updated };
  });
}

export async function processRefundAtomic(opts: {
  refundId: string;
  refundMethod: string;
  processedBy: string;
  processedByName: string;
  processedByRole: string;
}): Promise<{ refund: schema.Refund; pettyCashId: string; warrantyPolicy: string }> {
  const method = String(opts.refundMethod || "").toLowerCase();
  if (!["cash", "bank", "bkash", "nagad", "adjustment"].includes(method)) {
    throw new RefundProcessError(400, "INVALID_REFUND_METHOD", "refundMethod must be cash|bank|bkash|nagad|adjustment");
  }

  return db.transaction(async (tx) => {
    const rlock = await tx.execute(sql`SELECT * FROM refunds WHERE id = ${opts.refundId} FOR UPDATE`);
    const raw = ((rlock as any).rows ?? rlock)[0];
    if (!raw) throw new RefundProcessError(404, "REFUND_NOT_FOUND", "Refund not found");

    const refund = mapRefundRow(raw);

    if (refund.status === "processed") {
      throw new RefundProcessError(409, "REFUND_ALREADY_PROCESSED", "Refund already processed");
    }
    if (refund.status !== "approved") {
      throw new RefundProcessError(400, "REFUND_NOT_APPROVED", "Only approved refunds can be processed");
    }
    if (refund.requestedBy && refund.requestedBy === opts.processedBy) {
      throw new RefundProcessError(403, "SELF_APPROVAL_FORBIDDEN", "Requester cannot process their own refund");
    }

    const tlock = await tx.execute(sql`SELECT * FROM pos_transactions WHERE id = ${refund.referenceId} FOR UPDATE`);
    const txn = ((tlock as any).rows ?? tlock)[0];
    if (!txn) throw new RefundProcessError(404, "POS_NOT_FOUND", "POS transaction not found");

    // Fail closed before any financial write (blocks legacy Due/unverified approved rows)
    assertPosCollectedPayment(txn);

    const total = Number(txn.total);
    const prevRefunded = Number(txn.refunded_amount ?? txn.refundedAmount ?? 0);
    const reservedOthers = await sumActiveRefundsForPos(tx, refund.referenceId, refund.id, "reservations");
    const nextRefunded = round2(prevRefunded + refund.refundAmount);
    if (nextRefunded > total + 0.01) {
      throw new RefundProcessError(409, "REFUND_EXCEEDS_NET", "Refund would exceed invoice net");
    }
    if (prevRefunded + reservedOthers + refund.refundAmount > total + 0.01) {
      throw new RefundProcessError(409, "REFUND_EXCEEDS_NET", "Concurrent refund reservations exceed invoice net");
    }

    const allocs = await tx
      .select()
      .from(schema.refundAllocations)
      .where(eq(schema.refundAllocations.refundId, refund.id));

    await validatePersistedAllocations(tx, refund, allocs as any);

    if (method === "cash") {
      const drawers = await tx
        .select()
        .from(schema.drawerSessions)
        .where(eq(schema.drawerSessions.status, "open"))
        .limit(1);
      const session = drawers[0];
      if (!session) {
        throw new RefundProcessError(400, "NO_ACTIVE_DRAWER", "No active cash drawer for cash refund");
      }
      const balance = Number(session.expectedCash ?? session.startingFloat ?? 0);
      if (balance < refund.refundAmount) {
        throw new RefundProcessError(400, "INSUFFICIENT_DRAWER", "Insufficient drawer balance");
      }
      await tx
        .update(schema.drawerSessions)
        .set({ expectedCash: sql`COALESCE(${schema.drawerSessions.expectedCash}, 0) - ${refund.refundAmount}` })
        .where(eq(schema.drawerSessions.id, session.id));
    }

    const pettyId = nanoid();
    await tx.insert(schema.pettyCashRecords).values({
      id: pettyId,
      type: "Expense",
      description: `REFUND: ${refund.reason} (pos: ${refund.referenceId})`,
      category: "Refund",
      amount: refund.refundAmount,
    } as any);

    let refundStatus = "partial";
    if (nextRefunded + 0.01 >= total) refundStatus = "full";
    if (nextRefunded <= 0.001) refundStatus = "none";

    await tx
      .update(schema.posTransactions)
      .set({ refundedAmount: nextRefunded, refundStatus } as any)
      .where(eq(schema.posTransactions.id, refund.referenceId));

    for (const alloc of allocs) {
      if (!alloc.jobTicketId) continue;
      const jobRefundShare = Number(alloc.refundAmount);
      await tx.execute(sql`SELECT id FROM job_tickets WHERE id = ${alloc.jobTicketId} FOR UPDATE`);
      const jrows = await tx.select().from(schema.jobTickets).where(eq(schema.jobTickets.id, alloc.jobTicketId)).limit(1);
      const job = jrows[0];
      if (!job) continue;
      const paid = Number(job.paidAmount || 0);
      const newPaid = round2(Math.max(0, paid - jobRefundShare));
      const estimate = Number(job.estimatedCost || 0);
      const remaining = estimate > 0 ? round2(Math.max(0, estimate - newPaid)) : 0;
      let paymentStatus = "partial";
      if (newPaid <= 0.001 && jobRefundShare > 0.001) paymentStatus = "refunded";
      else if (newPaid <= 0.001) paymentStatus = "unpaid";
      else if (estimate > 0 && remaining <= 0.001) paymentStatus = "paid";

      await tx
        .update(schema.jobTickets)
        .set({ paidAmount: newPaid, remainingAmount: remaining, paymentStatus } as any)
        .where(eq(schema.jobTickets.id, alloc.jobTicketId));
    }

    // R1H4: never cancel due_records from refund processing.
    // Unpaid Due invoices are rejected at create; void/credit-note is a separate workflow.

    // After all financial writes; only active under NODE_ENV=test
    if (shouldForceTestFail()) {
      throw new RefundProcessError(500, "FORCED_TEST_FAIL", "Forced rollback for QA harness");
    }

    const [updated] = await tx
      .update(schema.refunds)
      .set({
        status: "processed",
        processedBy: opts.processedBy,
        processedByName: opts.processedByName,
        processedByRole: opts.processedByRole,
        processedAt: new Date(),
        refundMethod: method,
        pettyCashRecordId: pettyId,
      } as any)
      .where(eq(schema.refunds.id, opts.refundId))
      .returning();

    return {
      refund: updated,
      pettyCashId: pettyId,
      warrantyPolicy: "UNCHANGED_POLICY_NEEDED",
    };
  });
}

export async function resolveCanonicalPosSource(
  tx: any,
  opts: { type: string; referenceId: string; posTransactionId?: string | null },
) {
  if (opts.type === "warranty") {
    throw new RefundProcessError(400, "WARRANTY_REFUND_UNSUPPORTED", "Warranty refunds unsupported");
  }
  if (opts.type === "pos" || !opts.type) {
    const tlock = await tx.execute(sql`SELECT * FROM pos_transactions WHERE id = ${opts.referenceId} FOR UPDATE`);
    const txn = ((tlock as any).rows ?? tlock)[0];
    if (!txn) throw new RefundProcessError(404, "POS_NOT_FOUND", "POS transaction not found");
    return { posTransactionId: txn.id, originalAmount: Number(txn.total) };
  }
  throw new RefundProcessError(400, "INVALID_REFUND_TYPE", "Invalid type");
}
