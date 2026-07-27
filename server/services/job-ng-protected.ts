/**
 * JOBS-NG protected workflow integrity.
 * Distinguishes entering protected states vs leaving them / mutating while protected.
 * Only job-ng-report.service may enter/leave protected statuses via its own tx updates.
 */

export const NG_PROTECTED_STATUSES = [
  "NG Review Pending",
  "Awaiting Customer Decision",
] as const;

export type NgProtectedStatus = (typeof NG_PROTECTED_STATUSES)[number];

export const NG_STATUS_REVIEW_PENDING = "NG Review Pending" as const;
export const NG_STATUS_AWAITING_DECISION = "Awaiting Customer Decision" as const;

export const NG_ELIGIBLE_WORK_STATUSES = [
  "Diagnosing",
  "In Progress",
  "On Workbench",
] as const;

/** Fields that must not change while a job is in a protected NG status (ordinary writers). */
export const NG_LOCKED_FIELDS = [
  "status",
  "repairOutcome",
  "problemFound",
  "closureReason",
  "completedAt",
  "warrantyExpiryDate",
  "warrantyDays",
  "warrantyTermsAccepted",
  "paymentStatus",
  "billingStatus",
  "paidAmount",
  "remainingAmount",
  "paymentId",
  "paidAt",
  "lastPaymentAt",
  "writeOffReason",
  "writeOffBy",
  "writeOffAt",
  "assignedTechnicianId",
  "technician",
  "productLines",
  "charges",
  "partsLineitems",
  "serviceLines",
  "panelItems",
] as const;

export class ProtectedJobFieldError extends Error {
  status = 400;
  code = "PROTECTED_JOB_FIELD";

  constructor(message: string) {
    super(message);
    this.name = "ProtectedJobFieldError";
  }
}

export class NgWorkflowLockedError extends Error {
  status = 409;
  code = "NG_WORKFLOW_LOCKED";

  constructor(
    message = "This job is locked in the NG workflow. Complete Manager review (or return) before other status or settlement changes.",
  ) {
    super(message);
    this.name = "NgWorkflowLockedError";
  }
}

export function isNgProtectedStatus(status: unknown): boolean {
  return typeof status === "string" && (NG_PROTECTED_STATUSES as readonly string[]).includes(status);
}

/**
 * Reject client/route patches that try to forge protected NG *target* values.
 */
export function assertJobPatchNotProtected(updates: Record<string, unknown> | null | undefined): void {
  if (!updates || typeof updates !== "object") return;

  if (isNgProtectedStatus(updates.status)) {
    throw new ProtectedJobFieldError(
      `Status "${updates.status}" can only be set via the NG report workflow (POST /api/job-tickets/:id/ng-report or .../ng-report/review).`,
    );
  }

  if (updates.repairOutcome === "not_repairable") {
    throw new ProtectedJobFieldError(
      'repairOutcome "not_repairable" can only be set via POST /api/job-tickets/:id/ng-report.',
    );
  }

  if (updates.repairOutcome === "customer_declined") {
    throw new ProtectedJobFieldError(
      'repairOutcome "customer_declined" can only be set via POST /api/job-tickets/:id/ng-customer-decision (SYSTEM-UNIFICATION-00C-C).',
    );
  }
}

export function assertCorporateStatusNotProtected(status: string): void {
  if (isNgProtectedStatus(status)) {
    throw new ProtectedJobFieldError(
      `Corporate status "${status}" is reserved for the NG report workflow and cannot be set via this endpoint.`,
    );
  }
}

function hasLockedFieldChange(updates: Record<string, unknown>): boolean {
  for (const key of NG_LOCKED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(updates, key) && updates[key as string] !== undefined) {
      return true;
    }
  }
  // snake_case aliases from raw SQL writers
  const snakeAliases = [
    "repair_outcome",
    "problem_found",
    "closure_reason",
    "completed_at",
    "warranty_expiry_date",
    "warranty_days",
    "payment_status",
    "billing_status",
    "paid_amount",
    "remaining_amount",
    "payment_id",
    "write_off_reason",
    "write_off_by",
    "write_off_at",
    "assigned_technician_id",
    "product_lines",
    "parts_lineitems",
    "service_lines",
    "panel_items",
  ];
  for (const key of snakeAliases) {
    if (Object.prototype.hasOwnProperty.call(updates, key) && updates[key] !== undefined) {
      return true;
    }
  }
  return false;
}

/**
 * When current job status is protected, reject ordinary mutations that change
 * workflow-sensitive fields (including leaving the protected status).
 */
export function assertNgCurrentStateAllowsMutation(
  currentStatus: string | null | undefined,
  updates: Record<string, unknown> | null | undefined,
): void {
  if (!isNgProtectedStatus(currentStatus)) return;
  if (!updates || typeof updates !== "object") return;

  // Status change away from current protected value
  if (
    Object.prototype.hasOwnProperty.call(updates, "status") &&
    updates.status !== undefined &&
    updates.status !== currentStatus
  ) {
    throw new NgWorkflowLockedError();
  }

  if (hasLockedFieldChange(updates)) {
    // status same value is still "locked field" if explicitly set — treat as locked
    throw new NgWorkflowLockedError();
  }
}

/**
 * Full pre-mutation check for ordinary writers.
 */
export function assertOrdinaryJobMutationAllowed(
  currentStatus: string | null | undefined,
  updates: Record<string, unknown> | null | undefined,
): void {
  assertJobPatchNotProtected(updates);
  assertNgCurrentStateAllowsMutation(currentStatus, updates);
}

export function assertJobNotNgProtected(currentStatus: string | null | undefined, context?: string): void {
  if (isNgProtectedStatus(currentStatus)) {
    throw new NgWorkflowLockedError(
      context
        ? `This job is locked in the NG workflow (${context}). Complete Manager review first.`
        : undefined,
    );
  }
}

export function isNgWorkflowError(err: unknown): err is ProtectedJobFieldError | NgWorkflowLockedError {
  return err instanceof ProtectedJobFieldError || err instanceof NgWorkflowLockedError;
}
