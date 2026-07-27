/**
 * SERVICE-INTAKE-RELIABILITY-01D — workflow ownership for service_requests mutations.
 *
 * Generic admin PATCH must not forge quote/workflow state.
 * Legal transitions stay on their canonical owners (retail-quote, custody,
 * conversion, stage-transition, contextual action / adjust-progress).
 */

export const SERVICE_REQUEST_WORKFLOW_MANAGED = "SERVICE_REQUEST_WORKFLOW_MANAGED";

/** Fields owned by canonical workflow services — reject on generic PATCH. */
export const WORKFLOW_PROTECTED_FIELDS = [
  "status",
  "stage",
  "trackingStatus",
  "quoteStatus",
  "quoteAmount",
  "quoteNotes",
  "quotedAt",
  "quoteExpiresAt",
  "acceptedAt",
  "convertedJobId",
  "ticketNumber",
  "isQuote",
  "pickupTier",
  "pickupCost",
  "totalAmount",
  // Payment authority: POS / COD collect-payment (pos.processPayment) own this.
  // Generic PATCH must not mark an SR paid without a money transaction.
  "paymentStatus",
  // Intake-system columns — never client-writable via generic PATCH
  "phoneNormalized",
  "intakeSource",
  "clientRequestId",
  "idempotencyFingerprint",
  "source",
  "id",
  "createdAt",
  "expiresAt",
  "adminInteracted",
  "adminInteractedAt",
  "adminInteractedBy",
] as const;

export type WorkflowProtectedField = (typeof WORKFLOW_PROTECTED_FIELDS)[number];

/**
 * Safe non-workflow fields intentionally editable via PATCH
 * (customer contact corrections, notes, scheduling, payment flag).
 */
export const SAFE_SERVICE_REQUEST_PATCH_FIELDS = [
  "brand",
  "screenSize",
  "modelNumber",
  "primaryIssue",
  "symptoms",
  "description",
  "mediaUrls",
  "customerName",
  "phone",
  "address",
  "servicePreference",
  "serviceMode",
  "requestIntent",
  "serviceId",
  "serviceAreaId",
  "scheduledPickupDate",
  "estimatedDelivery",
  "expectedPickupDate",
  "expectedReturnDate",
  "expectedReadyDate",
  "intakeLocation",
  "physicalCondition",
  "customerSignatureUrl",
  "proofOfPurchase",
  "warrantyStatus",
  "agreedToPickup",
  "pickupAgreedAt",
  "customerId",
  "storeId",
  "corporateClientId",
  "corporateChallanId",
] as const;

export type SafeServiceRequestPatchField = (typeof SAFE_SERVICE_REQUEST_PATCH_FIELDS)[number];

export class WorkflowManagedError extends Error {
  status = 409;
  code = SERVICE_REQUEST_WORKFLOW_MANAGED;
  fields: string[];

  constructor(fields: string[]) {
    super("This field is managed by the service-request workflow and cannot be set here.");
    this.name = "WorkflowManagedError";
    this.fields = fields;
  }
}

/** True if the body includes any protected workflow key (including snake_case aliases). */
export function findProtectedWorkflowFields(body: Record<string, unknown> | null | undefined): string[] {
  if (!body || typeof body !== "object") return [];
  const found = new Set<string>();
  const snakeMap: Record<string, string> = {
    tracking_status: "trackingStatus",
    quote_status: "quoteStatus",
    quote_amount: "quoteAmount",
    quote_notes: "quoteNotes",
    quoted_at: "quotedAt",
    quote_expires_at: "quoteExpiresAt",
    accepted_at: "acceptedAt",
    converted_job_id: "convertedJobId",
    ticket_number: "ticketNumber",
    is_quote: "isQuote",
    pickup_tier: "pickupTier",
    pickup_cost: "pickupCost",
    total_amount: "totalAmount",
    payment_status: "paymentStatus",
    phone_normalized: "phoneNormalized",
    intake_source: "intakeSource",
    client_request_id: "clientRequestId",
    idempotency_fingerprint: "idempotencyFingerprint",
    created_at: "createdAt",
    expires_at: "expiresAt",
    admin_interacted: "adminInteracted",
    admin_interacted_at: "adminInteractedAt",
    admin_interacted_by: "adminInteractedBy",
  };

  for (const key of Object.keys(body)) {
    if ((WORKFLOW_PROTECTED_FIELDS as readonly string[]).includes(key)) {
      found.add(key);
      continue;
    }
    const mapped = snakeMap[key];
    if (mapped) found.add(mapped);
  }
  return Array.from(found);
}

/**
 * Reject body if any workflow-protected field is present.
 * Does not mutate the row — call before any write.
 */
export function assertNoWorkflowForge(body: Record<string, unknown> | null | undefined): void {
  const hit = findProtectedWorkflowFields(body);
  if (hit.length > 0) {
    throw new WorkflowManagedError(hit);
  }
}

/** Whitelist-only projection for generic PATCH. Unknown keys dropped. */
export function pickSafeServiceRequestPatch(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of SAFE_SERVICE_REQUEST_PATCH_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined) {
      out[key] = body[key];
    }
  }
  return out;
}

/** Ownership table for reports / agents (not runtime). */
export const WORKFLOW_FIELD_OWNERS: Record<string, string> = {
  status: "contextual action / adjust-progress / conversion / stage-derived",
  stage: "POST .../transition-stage, mobile advance (jobService.transitionStage)",
  trackingStatus: "stage transition + quote acceptance + intake initial only",
  quoteStatus: "retail-quote.service (send/price/accept/decline/convert/expire)",
  quoteAmount: "retail-quote.service sendOrPriceQuote",
  quoteNotes: "retail-quote.service sendOrPriceQuote",
  quotedAt: "retail-quote.service sendOrPriceQuote",
  quoteExpiresAt: "retail-quote.service sendOrPriceQuote",
  acceptedAt: "retail-quote.service acceptRetailQuote",
  convertedJobId: "verify-and-convert / convertRetailQuoteToJob",
  ticketNumber: "retail intake ticket generator (create only)",
  paymentStatus: "POS post-payment / COD collect-payment (pos.processPayment) — never generic PATCH",
  totalAmount: "retail-quote.service / conversion",
  pickupTier: "retail-quote.service acceptRetailQuote",
  pickupCost: "retail-quote.service acceptRetailQuote",
  isQuote: "retail intake / retail-quote.service",
  phoneNormalized: "intake / migration only",
  intakeSource: "intake only",
  clientRequestId: "intake only",
  idempotencyFingerprint: "intake only",
  source: "intake only",
  id: "system only",
  createdAt: "system only",
  expiresAt: "system only",
  adminInteracted: "mark-interacted route only",
  adminInteractedAt: "mark-interacted route only",
  adminInteractedBy: "mark-interacted route only",
};
