/**
 * Retail customer lifecycle read model (SERVICE-LIFECYCLE-R1H2).
 * True totals independent of page size; refund_allocations authority for refunded shares;
 * outstandingDue only from real due/unpaid obligations (never fully-refunded paid invoices).
 */
import { db } from "../db.js";
import { eq, and } from "drizzle-orm";
import * as schema from "../../shared/schema.js";
import { storage } from "../storage.js";
import { serviceRequestRepo, jobRepo } from "../repositories/index.js";
import { getSafeJobDisplayRef } from "../../shared/job-display-utils.js";
import { derivePosRefundLifecycle } from "./pos-billing.service.js";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const d = String(phone).replace(/\D/g, "");
  if (d.length < 4) return "***";
  return `${d.slice(0, 3)}****${d.slice(-2)}`;
}

export type JobFinancialState =
  | "paid"
  | "partially_refunded"
  | "fully_refunded"
  | "due"
  | "partially_paid"
  | "unpaid";

type AllocRow = {
  jobTicketId: string | null;
  billedAmount: number;
  transactionId: string;
  invoiceNumber: string | null;
  total: number;
  refundedAmount: number;
  refundStatus: string | null;
  paymentMethod: string;
  paymentStatus: string;
};

type RefundAllocRow = {
  jobTicketId: string | null;
  transactionId: string;
  refundAmount: number;
  status: string;
};

async function loadAllocationsForJobs(jobIds: string[]): Promise<AllocRow[]> {
  const out: AllocRow[] = [];
  for (const jid of jobIds) {
    const rows = await db
      .select({
        jobTicketId: schema.posTransactionAreaAllocations.jobTicketId,
        billedAmount: schema.posTransactionAreaAllocations.billedAmount,
        transactionId: schema.posTransactions.id,
        invoiceNumber: schema.posTransactions.invoiceNumber,
        total: schema.posTransactions.total,
        refundedAmount: schema.posTransactions.refundedAmount,
        refundStatus: schema.posTransactions.refundStatus,
        paymentMethod: schema.posTransactions.paymentMethod,
        paymentStatus: schema.posTransactions.paymentStatus,
      })
      .from(schema.posTransactionAreaAllocations)
      .innerJoin(
        schema.posTransactions,
        eq(schema.posTransactionAreaAllocations.transactionId, schema.posTransactions.id),
      )
      .where(eq(schema.posTransactionAreaAllocations.jobTicketId, jid));
    out.push(...(rows as any[]));
  }
  return out;
}

/** Processed refund allocations only — financial authority for refunded totals. */
async function loadProcessedRefundAllocs(jobIds: string[]): Promise<RefundAllocRow[]> {
  if (!jobIds.length) return [];
  const out: RefundAllocRow[] = [];
  for (const jid of jobIds) {
    const rows = await db
      .select({
        jobTicketId: schema.refundAllocations.jobTicketId,
        transactionId: schema.refundAllocations.transactionId,
        refundAmount: schema.refundAllocations.refundAmount,
        status: schema.refunds.status,
      })
      .from(schema.refundAllocations)
      .innerJoin(schema.refunds, eq(schema.refundAllocations.refundId, schema.refunds.id))
      .where(
        and(eq(schema.refundAllocations.jobTicketId, jid), eq(schema.refunds.status, "processed")),
      );
    out.push(...(rows as any[]));
  }
  return out;
}

async function loadPendingDueForPhone(phone: string | null | undefined): Promise<number> {
  if (!phone) return 0;
  try {
    const rows = await db
      .select({
        amount: schema.dueRecords.amount,
        paidAmount: schema.dueRecords.paidAmount,
        status: schema.dueRecords.status,
      })
      .from(schema.dueRecords)
      .where(eq(schema.dueRecords.customerPhone, phone));
    return round2(
      rows
        .filter((r) => String(r.status || "").toLowerCase() === "pending")
        .reduce((s, r) => s + Math.max(0, Number(r.amount || 0) - Number(r.paidAmount || 0)), 0),
    );
  } catch {
    return 0;
  }
}

function deriveJobFinancialState(opts: {
  billedTotal: number;
  refundedTotal: number;
  netCollected: number;
  hasDueInvoice: boolean;
  paidAmountOnJob: number;
}): JobFinancialState {
  const { billedTotal, refundedTotal, netCollected, hasDueInvoice, paidAmountOnJob } = opts;
  if (billedTotal > 0.001 && refundedTotal + 0.01 >= billedTotal) return "fully_refunded";
  if (refundedTotal > 0.001 && netCollected > 0.001) return "partially_refunded";
  if (refundedTotal > 0.001 && netCollected <= 0.001) return "fully_refunded";
  if (hasDueInvoice && netCollected + 0.01 < billedTotal) {
    return netCollected > 0.001 ? "partially_paid" : "due";
  }
  if (billedTotal <= 0.001 && paidAmountOnJob <= 0.001) return "unpaid";
  if (netCollected + 0.01 >= billedTotal && billedTotal > 0) return "paid";
  if (netCollected > 0.001) return "partially_paid";
  if (billedTotal > 0.001) return "unpaid";
  return paidAmountOnJob > 0.001 ? "partially_paid" : "unpaid";
}

function mapJob(
  job: any,
  serviceRequests: any[],
  allocations: AllocRow[],
  refundAllocs: RefundAllocRow[],
  now: Date,
) {
  const jobAllocs = allocations.filter((a) => a.jobTicketId === job.id);
  const jobRefunds = refundAllocs.filter((r) => r.jobTicketId === job.id);

  let billedTotal = 0;
  let refundedTotal = 0;
  let collectedFromPaidInvoices = 0;
  let hasDueInvoice = false;
  const invoices: Array<{
    invoiceNumber: string | null;
    transactionRef: string;
    billed: number;
    refunded: number;
    net: number;
    lifecycle: string;
    paymentMethod: string;
  }> = [];

  const refundByTxn = new Map<string, number>();
  for (const r of jobRefunds) {
    const k = r.transactionId;
    refundByTxn.set(k, round2((refundByTxn.get(k) || 0) + Number(r.refundAmount || 0)));
  }

  for (const a of jobAllocs) {
    const billed = Number(a.billedAmount || 0);
    billedTotal += billed;
    const isDueLine = a.paymentMethod === "Due" || a.paymentStatus === "Due";
    if (isDueLine) hasDueInvoice = true;

    // Prefer persisted refund_allocations; fallback proportional only when no rows (legacy)
    let jobRefundShare = refundByTxn.get(a.transactionId);
    if (jobRefundShare == null) {
      const hasAnyAllocForJob = jobRefunds.length > 0;
      if (hasAnyAllocForJob) {
        jobRefundShare = 0;
      } else {
        const txnTotal = Number(a.total || 0) || 1;
        const refunded = Number(a.refundedAmount || 0);
        const share = Math.min(1, billed / txnTotal);
        jobRefundShare = refunded * share;
      }
    }
    jobRefundShare = Math.min(billed, Number(jobRefundShare || 0));
    refundedTotal += jobRefundShare;
    const lineNet = Math.max(0, billed - jobRefundShare);
    // Due invoices are obligations, not cash collected
    if (!isDueLine) collectedFromPaidInvoices += lineNet;

    const life = derivePosRefundLifecycle({
      total: a.total,
      refundedAmount: a.refundedAmount,
      refundStatus: a.refundStatus,
      paymentStatus: a.paymentStatus,
    });
    invoices.push({
      invoiceNumber: a.invoiceNumber,
      transactionRef: a.invoiceNumber || `TXN-…${String(a.transactionId).slice(-6)}`,
      billed: round2(billed),
      refunded: round2(jobRefundShare),
      net: round2(isDueLine ? 0 : lineNet),
      lifecycle: life.lifecycle,
      paymentMethod: a.paymentMethod,
    });
  }

  billedTotal = round2(billedTotal);
  refundedTotal = round2(Math.min(billedTotal, refundedTotal));
  collectedFromPaidInvoices = round2(collectedFromPaidInvoices);

  // After process path, job.paidAmount is reduced by allocation shares.
  const paidAmount = Number(job.paidAmount || 0);
  let netCollected: number;
  if (jobAllocs.length) {
    if (refundedTotal > 0.001) {
      // Trust job cash after refund process when present
      netCollected = round2(Math.max(0, paidAmount));
    } else {
      netCollected = collectedFromPaidInvoices;
    }
  } else {
    netCollected = round2(paidAmount);
  }

  const financialState = deriveJobFinancialState({
    billedTotal,
    refundedTotal,
    netCollected,
    hasDueInvoice,
    paidAmountOnJob: paidAmount,
  });

  // Legacy paymentState for older clients; never call fully_refunded "unpaid"
  let paymentState = job.paymentStatus || "unpaid";
  if (financialState === "fully_refunded") paymentState = "fully_refunded";
  else if (financialState === "partially_refunded") paymentState = "partially_refunded";
  else if (financialState === "paid") paymentState = "paid";
  else if (financialState === "due") paymentState = "due";
  else if (financialState === "partially_paid") paymentState = "partial";
  else paymentState = "unpaid";

  const warrantyDays = Number(job.warrantyDays || 0);
  const expiry = job.warrantyExpiryDate ? new Date(job.warrantyExpiryDate) : null;
  let warrantyStatus: "none" | "active" | "expired" | "unknown" = "none";
  if (warrantyDays > 0 && job.status === "Completed" && expiry) {
    warrantyStatus = expiry > now ? "active" : "expired";
  } else if (warrantyDays > 0 && job.status === "Completed" && !expiry) {
    warrantyStatus = "unknown";
  }

  const sourceSr = serviceRequests.find((s) => s.convertedJobId === job.id);
  const hasAlloc = jobAllocs.length > 0;
  const legacyHistoryIncomplete = !hasAlloc && (paidAmount > 0 || job.billingStatus === "invoiced");

  // Real unpaid balance for Due invoices only (not refunded paid sales)
  let unpaidBalance = 0;
  if (financialState === "due" || (hasDueInvoice && financialState === "partially_paid")) {
    unpaidBalance = round2(Math.max(0, billedTotal - netCollected));
  }

  return {
    id: job.id,
    displayRef: getSafeJobDisplayRef({ id: job.id }),
    device: job.device,
    status: job.status,
    sourceRequestTicket: sourceSr?.ticketNumber || null,
    billedTotal,
    collectedTotal: netCollected,
    refundedTotal,
    netCollected,
    unpaidBalance,
    paymentState,
    financialState,
    invoices,
    legacyHistoryIncomplete,
    warranty:
      warrantyDays > 0
        ? {
            category: "service_warranty",
            durationDays: warrantyDays,
            startDate: job.completedAt || job.paidAt || null,
            expiryDate: job.warrantyExpiryDate || null,
            status: warrantyStatus,
            linkedJobRef: getSafeJobDisplayRef({ id: job.id }),
            linkedInvoices: invoices.map((i) => i.invoiceNumber).filter(Boolean),
            note:
              warrantyStatus === "unknown"
                ? "Warranty days set but expiry not stamped; validity not fully derivable"
                : undefined,
          }
        : null,
  };
}

export async function buildCustomerLifecycle(
  customerId: string,
  opts: { limit?: number; offset?: number } = {},
) {
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 50));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const user = await storage.getUser(customerId);
  if (!user || user.role !== "Customer") return null;

  const serviceRequests = await serviceRequestRepo.getServiceRequestsByCustomerId(user.id);
  const allJobs = (await jobRepo.getJobTicketsByCustomerPhone(user.phone || "")).filter(
    (j) => !j.corporateClientId && !j.corporateChallanId,
  );
  const totalRepairJobs = allJobs.length;
  const jobIds = allJobs.map((j) => j.id);

  const [allAllocations, refundAllocs, pendingDueTotal] = await Promise.all([
    loadAllocationsForJobs(jobIds),
    loadProcessedRefundAllocs(jobIds),
    loadPendingDueForPhone(user.phone),
  ]);

  const now = new Date();
  const allMapped = allJobs.map((j) => mapJob(j, serviceRequests, allAllocations, refundAllocs, now));

  const pageJobs = allMapped.slice(offset, offset + limit);

  // outstandingDue: canonical pending due_records + Due-invoice unpaid balances not already covered
  const dueFromJobs = round2(
    allMapped.reduce((s, j) => {
      if (j.financialState === "due" || (j.financialState === "partially_paid" && j.unpaidBalance > 0)) {
        // Only Due-origin unpaid; mapJob already zeroed unpaidBalance for non-due
        return s + j.unpaidBalance;
      }
      return s;
    }, 0),
  );
  // Prefer max of due records vs derived Due balances (avoid double-count when both exist)
  // When due_records present, they are authority for outstandingDue.
  const outstandingDue = pendingDueTotal > 0 ? pendingDueTotal : dueFromJobs;

  const summary = {
    totalRepairJobs,
    activeWarranties: allMapped.filter((j) => j.warranty?.status === "active").length,
    totalBilled: round2(allMapped.reduce((s, j) => s + j.billedTotal, 0)),
    totalCollected: round2(allMapped.reduce((s, j) => s + j.collectedTotal, 0)),
    totalRefunded: round2(allMapped.reduce((s, j) => s + j.refundedTotal, 0)),
    netCollected: round2(allMapped.reduce((s, j) => s + j.netCollected, 0)),
    outstandingDue,
    pendingDueRecordsTotal: pendingDueTotal,
    legacyHistoryIncompleteCount: allMapped.filter((j) => j.legacyHistoryIncomplete).length,
    financialStateCounts: {
      paid: allMapped.filter((j) => j.financialState === "paid").length,
      partially_refunded: allMapped.filter((j) => j.financialState === "partially_refunded").length,
      fully_refunded: allMapped.filter((j) => j.financialState === "fully_refunded").length,
      due: allMapped.filter((j) => j.financialState === "due").length,
      partially_paid: allMapped.filter((j) => j.financialState === "partially_paid").length,
      unpaid: allMapped.filter((j) => j.financialState === "unpaid").length,
    },
    warrantyDefaultDays: 30,
    warrantyPolicyNote:
      "Default warrantyDays=30 on job convert/POS complete. No repair-category rule. Full-refund warranty void policy is NOT defined.",
  };

  const requests = serviceRequests.map((sr) => ({
    ticketNumber: sr.ticketNumber,
    status: sr.status,
    stage: sr.stage,
    trackingStatus: sr.trackingStatus,
    primaryIssue: sr.primaryIssue,
    brand: sr.brand,
    convertedJobRef: sr.convertedJobId ? getSafeJobDisplayRef({ id: sr.convertedJobId }) : null,
    createdAt: sr.createdAt,
  }));

  return {
    identity: {
      displayName: user.name,
      phoneMasked: maskPhone(user.phone),
      phoneAuthorized: user.phone || null,
      address: user.address || null,
      status: user.status,
    },
    serviceRequests: requests,
    jobs: pageJobs,
    warranties: pageJobs.map((j) => j.warranty).filter(Boolean),
    summary,
    pagination: {
      total: totalRepairJobs,
      limit,
      offset,
      returned: pageJobs.length,
      hasMore: offset + pageJobs.length < totalRepairJobs,
    },
    corporateExcluded: true,
    legacyHistoryIncomplete: summary.legacyHistoryIncompleteCount > 0,
  };
}
