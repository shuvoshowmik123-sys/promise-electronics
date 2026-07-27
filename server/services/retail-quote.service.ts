/**
 * SYSTEM-UNIFICATION-00C-A — Canonical retail repair quote authority.
 * Storage: service_requests only. Formal quotations table is out of scope.
 */

import { db } from "../db.js";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../shared/schema.js";
import type { ServiceRequest, JobTicket } from "../../shared/schema.js";
import { serviceRequestRepo } from "../repositories/index.js";
import { allocateJobIdInTx } from "../repositories/job.repository.js";
import { auditLogger } from "../utils/auditLogger.js";
import { nanoid } from "../repositories/base.js";
import { normalizePhone } from "../utils/phone.js";

export const CANONICAL_QUOTE_STATES = [
  "pending_price",
  "sent",
  "accepted",
  "declined",
  "expired",
  "revised",
  "superseded",
  "converted",
] as const;

export type CanonicalQuoteState = (typeof CANONICAL_QUOTE_STATES)[number];

export class RetailQuoteError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "RetailQuoteError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type QuoteActor =
  | { kind: "customer"; id: string; name?: string }
  | { kind: "admin"; id: string; name?: string; role?: string };

function softAudit(entry: Parameters<typeof auditLogger.log>[0]) {
  auditLogger.log(entry).catch(() => {});
}

/** Retail quote evidence only — normal service requests without markers are not quotes. */
export function isRetailQuoteRow(row: ServiceRequest | null | undefined): boolean {
  if (!row) return false;
  if (row.isQuote === true) return true;
  if (String(row.requestIntent || "").toLowerCase() === "quote") return true;
  if (row.quoteStatus && String(row.quoteStatus).trim() !== "") return true;
  if (row.quoteAmount != null && Number(row.quoteAmount) > 0) return true;
  return false;
}

export function assertIsRetailQuoteRow(row: ServiceRequest | null | undefined): void {
  if (!isRetailQuoteRow(row)) {
    throw new RetailQuoteError(
      400,
      "NOT_QUOTE_REQUEST",
      "Cannot perform retail quote actions on a normal service request.",
    );
  }
}

const QUOTE_ACCEPT_STATUS_MARKERS = [
  "quote accepted",
  "quote_accepted",
  "accepted",
];
const QUOTE_DECLINE_STATUS_MARKERS = [
  "quote rejected",
  "quote declined",
  "quote_rejected",
  "quote_declined",
  "declined",
  "rejected",
];

function normalizeStatusKey(status: unknown): string {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Deterministic customer-safe timeline projection for quote accept/decline events.
 * Does not mutate DB rows. Unrelated events pass through unchanged.
 */
export function filterCustomerVisibleTimelineEvents<T extends { message?: string | null; status?: string | null }>(
  events: T[],
): T[] {
  return events.map((ev) => {
    const statusKey = normalizeStatusKey(ev.status);
    if (QUOTE_ACCEPT_STATUS_MARKERS.some((m) => statusKey === m || statusKey.includes("quote accepted"))) {
      return { ...ev, message: "Quote accepted." };
    }
    if (
      QUOTE_DECLINE_STATUS_MARKERS.some(
        (m) => statusKey === m || statusKey.includes("quote reject") || statusKey.includes("quote declin"),
      )
    ) {
      return { ...ev, message: "Quote declined." };
    }
    return ev;
  });
}

function asDate(v: unknown): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Map legacy status / quoteStatus dialects + expiry into one canonical state.
 * Accepted-before-expiry stays accepted even after wall-clock expiry.
 */
export function resolveCanonicalQuoteState(
  row: ServiceRequest,
  now: Date = new Date(),
): CanonicalQuoteState {
  if (row.convertedJobId) return "converted";

  const qs = String(row.quoteStatus || "").trim();
  const st = String(row.status || "").trim();
  const qsLower = qs.toLowerCase();
  const stLower = st.toLowerCase();

  if (
    qsLower === "converted" ||
    stLower === "converted" ||
    st === "Work Order"
  ) {
    if (row.convertedJobId) return "converted";
  }

  if (
    qsLower === "declined" ||
    qs === "Declined" ||
    st === "Quote Rejected" ||
    stLower === "quote rejected"
  ) {
    return "declined";
  }

  const acceptedAt = asDate(row.acceptedAt);
  const expiresAt = asDate(row.quoteExpiresAt);
  const isAcceptedMarker =
    Boolean(acceptedAt) ||
    qsLower === "accepted" ||
    qs === "Accepted" ||
    st === "Quote Accepted" ||
    stLower === "quote accepted";

  if (isAcceptedMarker) {
    return "accepted";
  }

  if (qsLower === "superseded") return "superseded";
  if (qsLower === "revised" || qs === "Revised") return "revised";

  const hasPrice = row.quoteAmount != null && Number(row.quoteAmount) > 0;
  const isSentMarker =
    hasPrice &&
    (qsLower === "sent" ||
      qs === "Quoted" ||
      qs === "quoted" ||
      qsLower === "quoted" ||
      st === "Quote Sent" ||
      stLower === "quote sent" ||
      Boolean(asDate(row.quotedAt)));

  if (isSentMarker || (hasPrice && qsLower !== "pending" && qsLower !== "pending_price")) {
    if (expiresAt && now.getTime() > expiresAt.getTime()) {
      return "expired";
    }
    if (qsLower === "revised") return "revised";
    return "sent";
  }

  if (qsLower === "expired" || stLower === "quote expired") return "expired";

  return "pending_price";
}

function legacyStatusFor(state: CanonicalQuoteState): string {
  switch (state) {
    case "pending_price":
      return "Pending";
    case "sent":
    case "revised":
      return "Quote Sent";
    case "accepted":
      return "Quote Accepted";
    case "declined":
      return "Quote Rejected";
    case "expired":
      return "Quote Expired";
    case "converted":
      return "Work Order";
    case "superseded":
      return "Quote Superseded";
    default:
      return "Pending";
  }
}

function assertPositiveAmount(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new RetailQuoteError(400, "INVALID_QUOTE_AMOUNT", "A valid positive quote amount is required");
  }
  return Math.round(n * 100) / 100;
}

async function loadForUpdate(tx: any, id: string): Promise<any | null> {
  const lock = await tx.execute(sql`SELECT * FROM service_requests WHERE id = ${id} FOR UPDATE`);
  const rows = (lock as any).rows ?? lock;
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

function mapLockedRow(raw: any): ServiceRequest {
  return {
    id: raw.id,
    ticketNumber: raw.ticket_number ?? raw.ticketNumber,
    customerId: raw.customer_id ?? raw.customerId,
    brand: raw.brand,
    screenSize: raw.screen_size ?? raw.screenSize,
    modelNumber: raw.model_number ?? raw.modelNumber,
    primaryIssue: raw.primary_issue ?? raw.primaryIssue,
    symptoms: raw.symptoms,
    description: raw.description,
    mediaUrls: raw.media_urls ?? raw.mediaUrls,
    customerName: raw.customer_name ?? raw.customerName,
    phone: raw.phone,
    address: raw.address,
    servicePreference: raw.service_preference ?? raw.servicePreference,
    status: raw.status,
    trackingStatus: raw.tracking_status ?? raw.trackingStatus,
    estimatedDelivery: raw.estimated_delivery ?? raw.estimatedDelivery,
    paymentStatus: raw.payment_status ?? raw.paymentStatus,
    createdAt: raw.created_at ?? raw.createdAt,
    expiresAt: raw.expires_at ?? raw.expiresAt,
    convertedJobId: raw.converted_job_id ?? raw.convertedJobId,
    requestIntent: raw.request_intent ?? raw.requestIntent,
    serviceMode: raw.service_mode ?? raw.serviceMode,
    stage: raw.stage,
    isQuote: raw.is_quote ?? raw.isQuote,
    serviceId: raw.service_id ?? raw.serviceId,
    quoteStatus: raw.quote_status ?? raw.quoteStatus,
    quoteAmount: raw.quote_amount ?? raw.quoteAmount,
    quoteNotes: raw.quote_notes ?? raw.quoteNotes,
    quotedAt: raw.quoted_at ?? raw.quotedAt,
    quoteExpiresAt: raw.quote_expires_at ?? raw.quoteExpiresAt,
    acceptedAt: raw.accepted_at ?? raw.acceptedAt,
    pickupTier: raw.pickup_tier ?? raw.pickupTier,
    pickupCost: raw.pickup_cost ?? raw.pickupCost,
    totalAmount: raw.total_amount ?? raw.totalAmount,
    scheduledPickupDate: raw.scheduled_pickup_date ?? raw.scheduledPickupDate,
    expectedPickupDate: raw.expected_pickup_date ?? raw.expectedPickupDate,
    expectedReturnDate: raw.expected_return_date ?? raw.expectedReturnDate,
    expectedReadyDate: raw.expected_ready_date ?? raw.expectedReadyDate,
    intakeLocation: raw.intake_location ?? raw.intakeLocation,
    physicalCondition: raw.physical_condition ?? raw.physicalCondition,
    customerSignatureUrl: raw.customer_signature_url ?? raw.customerSignatureUrl,
    proofOfPurchase: raw.proof_of_purchase ?? raw.proofOfPurchase,
    warrantyStatus: raw.warranty_status ?? raw.warrantyStatus,
    agreedToPickup: raw.agreed_to_pickup ?? raw.agreedToPickup,
    pickupAgreedAt: raw.pickup_agreed_at ?? raw.pickupAgreedAt,
    adminInteracted: raw.admin_interacted ?? raw.adminInteracted,
    adminInteractedAt: raw.admin_interacted_at ?? raw.adminInteractedAt,
    adminInteractedBy: raw.admin_interacted_by ?? raw.adminInteractedBy,
    storeId: raw.store_id ?? raw.storeId,
    corporateClientId: raw.corporate_client_id ?? raw.corporateClientId,
    corporateChallanId: raw.corporate_challan_id ?? raw.corporateChallanId,
    serviceAreaId: raw.service_area_id ?? raw.serviceAreaId,
  } as ServiceRequest;
}

export function attachCanonicalQuoteView<T extends ServiceRequest>(row: T, now = new Date()) {
  const canonicalQuoteStatus = resolveCanonicalQuoteState(row, now);
  return { ...row, canonicalQuoteStatus };
}

export type SendPriceInput = {
  quoteAmount: number;
  quoteNotes?: string | null;
  quoteValidDays?: number;
};

/**
 * Send or revise price. Same path for send-quote and /api/admin/quotes/:id/price.
 */
export async function sendOrPriceQuote(
  id: string,
  input: SendPriceInput,
  actor: QuoteActor,
  req?: unknown,
): Promise<{ serviceRequest: ServiceRequest; canonicalQuoteStatus: CanonicalQuoteState; revised: boolean; idempotent: boolean }> {
  const amount = assertPositiveAmount(input.quoteAmount);
  const validDays = Number(input.quoteValidDays);
  const days = Number.isFinite(validDays) && validDays > 0 ? Math.min(365, Math.floor(validDays)) : 7;
  const notes = input.quoteNotes != null ? String(input.quoteNotes) : null;

  const result = await db.transaction(async (tx) => {
    const raw = await loadForUpdate(tx, id);
    if (!raw) throw new RetailQuoteError(404, "NOT_FOUND", "Quote not found");
    const row = mapLockedRow(raw);
    assertIsRetailQuoteRow(row);

    const now = new Date();
    const state = resolveCanonicalQuoteState(row, now);
    if (state === "converted" || row.convertedJobId) {
      throw new RetailQuoteError(409, "ALREADY_CONVERTED", "Quote already converted to a job.");
    }
    if (state === "declined") {
      throw new RetailQuoteError(409, "QUOTE_DECLINED", "Declined quotes cannot be re-priced without a new quote request.");
    }

    const priorAmount = row.quoteAmount != null ? Number(row.quoteAmount) : null;
    const sameAmount = priorAmount != null && Math.abs(priorAmount - amount) < 0.001;
    const priorNotes = row.quoteNotes ?? null;
    const sameNotes = (notes ?? null) === priorNotes;

    if (state === "sent" && sameAmount && sameNotes) {
      return { row, revised: false, idempotent: true, audit: null as string | null };
    }

    let revised = false;
    if (state === "accepted" || (priorAmount != null && !sameAmount && (state === "sent" || state === "expired"))) {
      revised = !sameAmount || state === "accepted";
    }
    if (state === "accepted" && sameAmount && sameNotes) {
      // Re-send same accepted amount without change — still require re-accept only if we clear acceptance on any re-price call
      // Contract: revision requires re-accept. Re-posting identical price is idempotent keep accepted.
      return { row, revised: false, idempotent: true, audit: null as string | null };
    }

    const expires = new Date(now);
    expires.setDate(expires.getDate() + days);

    const clearAcceptance = state === "accepted" || (revised && Boolean(row.acceptedAt));
    const nextState: CanonicalQuoteState = revised ? "sent" : "sent";
    // Store revised flag via quoteStatus then normalize to sent after revision event
    const storeStatus = revised ? "revised" : "sent";

    const [updated] = await tx
      .update(schema.serviceRequests)
      .set({
        isQuote: true,
        requestIntent: row.requestIntent || "quote",
        quoteAmount: amount,
        quoteNotes: notes ?? row.quoteNotes,
        quoteStatus: storeStatus === "revised" ? "sent" : "sent",
        quotedAt: now,
        quoteExpiresAt: expires,
        status: legacyStatusFor("sent"),
        acceptedAt: clearAcceptance ? null : row.acceptedAt,
        totalAmount: amount,
      } as any)
      .where(eq(schema.serviceRequests.id, id))
      .returning();

    await tx.insert(schema.serviceRequestEvents).values({
      id: nanoid(),
      serviceRequestId: id,
      status: revised ? "Quote Revised" : "Quote Sent",
      message: revised
        ? `Quote revised to ৳${amount}. Prior acceptance cleared; customer re-acceptance required.`
        : `Quote sent for ৳${amount}. Notes: ${notes || "None"}`,
      actor: actor.kind === "admin" ? actor.name || "Admin" : "System",
    });

    return {
      row: updated,
      revised,
      idempotent: false,
      audit: revised ? "RETAIL_QUOTE_REVISED" : "RETAIL_QUOTE_SENT",
    };
  });

  if (result.audit) {
    softAudit({
      userId: actor.id || "system",
      action: result.audit,
      entity: "ServiceRequest",
      entityId: id,
      details: result.revised ? "Retail quote price revised" : "Retail quote sent",
      newValue: {
        quoteAmount: result.row.quoteAmount,
        ticketNumber: result.row.ticketNumber || null,
        revised: result.revised,
      },
      req,
    });
  }

  const canonicalQuoteStatus = resolveCanonicalQuoteState(result.row, new Date());
  return {
    serviceRequest: result.row,
    canonicalQuoteStatus,
    revised: result.revised,
    idempotent: result.idempotent,
  };
}

export type AcceptInput = {
  confirmationNote?: string;
  pickupTier?: string | null;
  address?: string;
  servicePreference?: string;
  scheduledVisitDate?: Date | null;
};

export async function acceptRetailQuote(
  id: string,
  actor: QuoteActor,
  input: AcceptInput = {},
  req?: unknown,
): Promise<{ serviceRequest: ServiceRequest; canonicalQuoteStatus: CanonicalQuoteState; idempotent: boolean }> {
  const result = await db.transaction(async (tx) => {
    const raw = await loadForUpdate(tx, id);
    if (!raw) throw new RetailQuoteError(404, "NOT_FOUND", "Quote not found");
    const row = mapLockedRow(raw);
    assertIsRetailQuoteRow(row);
    const now = new Date();
    const state = resolveCanonicalQuoteState(row, now);

    if (actor.kind === "customer") {
      if (!row.customerId || row.customerId !== actor.id) {
        throw new RetailQuoteError(403, "NOT_OWNER", "Forbidden: You can only manage your own quote");
      }
    }

    if (state === "converted" || row.convertedJobId) {
      throw new RetailQuoteError(409, "ALREADY_CONVERTED", "Quote already converted.");
    }
    if (state === "declined") {
      throw new RetailQuoteError(409, "QUOTE_DECLINED", "Quote was declined.");
    }
    if (state === "expired") {
      throw new RetailQuoteError(409, "QUOTE_EXPIRED", "Quote has expired and cannot be accepted.");
    }
    if (state === "pending_price" || state === "revised") {
      throw new RetailQuoteError(400, "QUOTE_NOT_SENT", "Quote is not awaiting acceptance.");
    }

    if (state === "accepted") {
      return { row, idempotent: true, audit: false, confirmationNote: null as string | null };
    }

    if (state !== "sent") {
      throw new RetailQuoteError(400, "QUOTE_NOT_SENT", "This request is not awaiting a quote response.");
    }

    let confirmationNote: string | null = null;
    if (actor.kind === "admin") {
      confirmationNote = String(input.confirmationNote || "").trim();
      if (confirmationNote.length < 5) {
        throw new RetailQuoteError(
          400,
          "CONFIRMATION_NOTE_REQUIRED",
          "Admin acceptance requires a customer-contact confirmation note (min 5 characters).",
        );
      }
    }

    const patch: Record<string, unknown> = {
      quoteStatus: "accepted",
      status: legacyStatusFor("accepted"),
      acceptedAt: now,
    };

    if (input.servicePreference) patch.servicePreference = input.servicePreference;
    if (input.pickupTier !== undefined) patch.pickupTier = input.pickupTier;
    if (input.address) patch.address = input.address;
    if (input.scheduledVisitDate) patch.scheduledPickupDate = input.scheduledVisitDate;

    const [updated] = await tx
      .update(schema.serviceRequests)
      .set(patch as any)
      .where(eq(schema.serviceRequests.id, id))
      .returning();

    // Customer-visible timeline: never include admin confirmation note text
    await tx.insert(schema.serviceRequestEvents).values({
      id: nanoid(),
      serviceRequestId: id,
      status: "Quote Accepted",
      message: "Quote accepted.",
      actor: actor.kind === "admin" ? "Staff" : "Customer",
    });

    // Admin-only durable confirmation (not returned on customer routes)
    if (actor.kind === "admin" && confirmationNote) {
      await tx.insert(schema.retailQuoteAdminAcceptances).values({
        id: nanoid(),
        serviceRequestId: id,
        adminUserId: actor.id,
        adminName: actor.name || null,
        confirmationNote,
        acceptedAt: now,
        createdAt: now,
      });
    }

    return { row: updated, idempotent: false, audit: true, confirmationNote };
  });

  if (result.audit) {
    softAudit({
      userId: actor.id || "system",
      action: "RETAIL_QUOTE_ACCEPTED",
      entity: "ServiceRequest",
      entityId: id,
      details:
        actor.kind === "admin"
          ? "Admin accepted retail quote with customer-contact confirmation (note stored admin-only)"
          : "Customer accepted retail quote",
      newValue: {
        actorKind: actor.kind,
        acceptedAt: result.row.acceptedAt,
        quoteAmount: result.row.quoteAmount,
        hasConfirmationNote: actor.kind === "admin",
        // Note stored only in retail_quote_admin_acceptances — not echoed to logs/audit body
        ticketNumber: result.row.ticketNumber || null,
      },
      req,
    });
  }

  return {
    serviceRequest: result.row,
    canonicalQuoteStatus: resolveCanonicalQuoteState(result.row),
    idempotent: result.idempotent,
  };
}

export async function declineRetailQuote(
  id: string,
  actor: QuoteActor,
  req?: unknown,
): Promise<{ serviceRequest: ServiceRequest; canonicalQuoteStatus: CanonicalQuoteState; idempotent: boolean }> {
  const result = await db.transaction(async (tx) => {
    const raw = await loadForUpdate(tx, id);
    if (!raw) throw new RetailQuoteError(404, "NOT_FOUND", "Quote not found");
    const row = mapLockedRow(raw);
    assertIsRetailQuoteRow(row);
    const now = new Date();
    const state = resolveCanonicalQuoteState(row, now);

    if (actor.kind === "customer") {
      if (!row.customerId || row.customerId !== actor.id) {
        throw new RetailQuoteError(403, "NOT_OWNER", "Forbidden: You can only manage your own quote");
      }
    }

    if (state === "converted" || row.convertedJobId) {
      throw new RetailQuoteError(409, "ALREADY_CONVERTED", "Quote already converted.");
    }
    if (state === "declined") {
      return { row, idempotent: true, audit: false };
    }
    if (state === "accepted") {
      throw new RetailQuoteError(409, "ALREADY_ACCEPTED", "Accepted quotes cannot be declined; revise price first if needed.");
    }
    if (state === "expired") {
      throw new RetailQuoteError(409, "QUOTE_EXPIRED", "Expired quote cannot be declined (already inactive).");
    }
    if (state !== "sent" && state !== "revised") {
      throw new RetailQuoteError(400, "QUOTE_NOT_SENT", "This request is not awaiting a quote response.");
    }

    const [updated] = await tx
      .update(schema.serviceRequests)
      .set({
        quoteStatus: "declined",
        status: legacyStatusFor("declined"),
      } as any)
      .where(eq(schema.serviceRequests.id, id))
      .returning();

    await tx.insert(schema.serviceRequestEvents).values({
      id: nanoid(),
      serviceRequestId: id,
      status: "Quote Rejected",
      message: "Quote declined.",
      actor: actor.kind === "admin" ? "Staff" : "Customer",
    });

    return { row: updated, idempotent: false, audit: true };
  });

  if (result.audit) {
    softAudit({
      userId: actor.id || "system",
      action: "RETAIL_QUOTE_DECLINED",
      entity: "ServiceRequest",
      entityId: id,
      details: "Retail quote declined",
      newValue: { actorKind: actor.kind, ticketNumber: result.row.ticketNumber || null },
      req,
    });
  }

  return {
    serviceRequest: result.row,
    canonicalQuoteStatus: "declined",
    idempotent: result.idempotent,
  };
}

/**
 * Convert accepted retail quote → single linked job. Idempotent under concurrency.
 */
export async function convertRetailQuoteToJob(
  id: string,
  actor: QuoteActor,
  req?: unknown,
): Promise<{
  serviceRequest: ServiceRequest;
  jobTicket: JobTicket;
  canonicalQuoteStatus: CanonicalQuoteState;
  idempotent: boolean;
}> {
  if (actor.kind !== "admin") {
    throw new RetailQuoteError(403, "ADMIN_ONLY", "Only staff may convert a quote to a job.");
  }

  const result = await db.transaction(async (tx) => {
    const raw = await loadForUpdate(tx, id);
    if (!raw) throw new RetailQuoteError(404, "NOT_FOUND", "Quote not found");
    const row = mapLockedRow(raw);
    assertIsRetailQuoteRow(row);
    const now = new Date();
    let state = resolveCanonicalQuoteState(row, now);

    // Already converted — return existing job
    if (row.convertedJobId) {
      const [job] = await tx
        .select()
        .from(schema.jobTickets)
        .where(eq(schema.jobTickets.id, row.convertedJobId))
        .limit(1);
      if (!job) {
        throw new RetailQuoteError(409, "LINKED_JOB_MISSING", "Quote marked converted but job is missing.");
      }
      return { row, job, idempotent: true, audit: false };
    }

    if (state === "expired") {
      throw new RetailQuoteError(
        409,
        "QUOTE_EXPIRED",
        "Expired unaccepted quote cannot convert. Send a new price or accept before expiry.",
      );
    }
    if (state !== "accepted") {
      throw new RetailQuoteError(
        409,
        "QUOTE_NOT_ACCEPTED",
        `Quote must be accepted before conversion (current: ${state}).`,
      );
    }

    const amount = Number(row.quoteAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new RetailQuoteError(400, "INVALID_QUOTE_AMOUNT", "Accepted quote has no valid amount snapshot.");
    }

    // Accepted-before-expiry remains convertible even if now past quote_expires_at (state already accepted)

    // Generate job id inside txn with advisory lock
    const year = now.getFullYear();
    const jobId = await allocateJobIdInTx(tx, year);

    const sourceTicket = row.ticketNumber || row.id;
    const [job] = await tx
      .insert(schema.jobTickets)
      .values({
        id: jobId,
        customer: row.customerName,
        customerPhone: row.phone,
        customerPhoneNormalized: normalizePhone(row.phone),
        customerAddress: row.address || undefined,
        device: `${row.brand} TV`,
        // DEVICE-IDENTITY-01A: model never writes into tvSerialNumber (unit serial is corporate-only)
        modelNumber: row.modelNumber || undefined,
        issue: row.primaryIssue,
        status: "Pending",
        priority: "Medium",
        technician: "Unassigned",
        screenSize: row.screenSize || undefined,
        notes: `Converted from retail quote ${sourceTicket}. Accepted amount ৳${amount}.`,
        warrantyDays: 30,
        gracePeriodDays: 7,
        estimatedCost: amount,
        parentJobId: row.id,
        serviceAreaId: row.corporateClientId ? undefined : row.serviceAreaId || undefined,
        createdByUserId: actor.id || undefined,
        createdByName: actor.name || "Admin",
      } as any)
      .returning();

    const [updated] = await tx
      .update(schema.serviceRequests)
      .set({
        convertedJobId: jobId,
        quoteStatus: "converted",
        status: "Work Order",
        totalAmount: amount,
      } as any)
      .where(eq(schema.serviceRequests.id, id))
      .returning();

    await tx.insert(schema.serviceRequestEvents).values({
      id: nanoid(),
      serviceRequestId: id,
      status: "Work Order",
      message: `Retail quote converted to job ${jobId}. Estimate snapshot ৳${amount}.`,
      actor: actor.name || "Admin",
    });

    return { row: updated, job, idempotent: false, audit: true };
  });

  if (result.audit) {
    softAudit({
      userId: actor.id || "system",
      action: "RETAIL_QUOTE_CONVERTED",
      entity: "ServiceRequest",
      entityId: id,
      details: `Converted retail quote to job ${result.job.id}`,
      newValue: {
        jobId: result.job.id,
        estimatedCost: result.job.estimatedCost,
        ticketNumber: result.row.ticketNumber || null,
      },
      req,
    });
  }

  return {
    serviceRequest: result.row,
    jobTicket: result.job,
    canonicalQuoteStatus: "converted",
    idempotent: result.idempotent,
  };
}

export async function listAdminAcceptancesForServiceRequest(serviceRequestId: string) {
  return db
    .select({
      id: schema.retailQuoteAdminAcceptances.id,
      serviceRequestId: schema.retailQuoteAdminAcceptances.serviceRequestId,
      adminUserId: schema.retailQuoteAdminAcceptances.adminUserId,
      adminName: schema.retailQuoteAdminAcceptances.adminName,
      confirmationNote: schema.retailQuoteAdminAcceptances.confirmationNote,
      acceptedAt: schema.retailQuoteAdminAcceptances.acceptedAt,
      createdAt: schema.retailQuoteAdminAcceptances.createdAt,
    })
    .from(schema.retailQuoteAdminAcceptances)
    .where(eq(schema.retailQuoteAdminAcceptances.serviceRequestId, serviceRequestId));
}

/** Soft-mark expired on read (no cron). Persists quoteStatus when still stored as sent. */
export async function materializeExpiryIfNeeded(id: string): Promise<ServiceRequest | undefined> {
  const row = await serviceRequestRepo.getServiceRequest(id);
  if (!row) return undefined;
  const state = resolveCanonicalQuoteState(row);
  if (state !== "expired") return row;
  if (String(row.quoteStatus || "").toLowerCase() === "expired") return row;
  if (row.convertedJobId || row.acceptedAt) return row;

  const [updated] = await db
    .update(schema.serviceRequests)
    .set({ quoteStatus: "expired", status: legacyStatusFor("expired") } as any)
    .where(eq(schema.serviceRequests.id, id))
    .returning();

  if (updated) {
    softAudit({
      userId: "system",
      action: "RETAIL_QUOTE_EXPIRED",
      entity: "ServiceRequest",
      entityId: id,
      details: "Quote recognized as expired on read/mutation path",
      newValue: { ticketNumber: updated.ticketNumber || null },
    });
  }
  return updated || row;
}
