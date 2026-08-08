/**
 * JOB-CUSTOMER-WORKFLOW-01A — canonical job status transition + dual public projection.
 * Single owner path: job_tickets.status write + linked SR tracking + repair journey together.
 */
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import * as schema from "../../shared/schema.js";
import { JOB_STATUSES } from "../../shared/constants.js";
import type { JobTicket, ServiceRequest } from "../../shared/schema.js";
import { jobRepo, notificationRepo, settingsRepo } from "../repositories/index.js";
import { getProjectedRequestStatus, getProjectedTrackingStatus } from "./job.service.js";
import { type JourneyStage } from "./customer-repair-journey.service.js";
import { isNgProtectedStatus } from "./job-ng-protected.js";

export class JobStatusTransitionError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "JobStatusTransitionError";
    this.status = status;
    this.code = code;
  }
}

export type JobStatusTransitionReason =
  | "advance"
  | "set_outcome_repair_ok"
  | "set_outcome_needs_parts"
  | "confirm_testing"
  | "return_to_inspection"
  | "bulk"
  | "rollback"
  | "mobile"
  | "ng_submit"
  | "ng_verify"
  | "ng_return"
  | "ng_decline_cancel"
  | "write_off"
  | "abandon"
  | "forfeit"
  | "pos_complete"
  | "corporate"
  | "challan_deliver"
  | "system"
  | "work_hold"
  | "work_resume";

const JOB_STATUS_SET = new Set<string>(JOB_STATUSES as readonly string[]);

/** Canonical journey map (mirrors repairJourneyService; used for in-tx projection). */
const JOB_TO_JOURNEY: Record<string, { stage: JourneyStage; title: string; message: string }> = {
  Pending: { stage: "device_received", title: "Device Received", message: "Your device has been received and a work order has been created." },
  Diagnosing: { stage: "inspection_started", title: "Inspection Started", message: "Our technician has started inspecting your device." },
  "Pending Parts": { stage: "repair_in_progress", title: "Waiting for Parts", message: "We are sourcing the parts needed for your repair." },
  "Waiting on Parts": { stage: "repair_in_progress", title: "Parts Needed", message: "Your repair needs additional parts. Our team will update you when the parts are available." },
  "In Progress": { stage: "repair_in_progress", title: "Repair In Progress", message: "Your device is being repaired." },
  "On Workbench": { stage: "repair_in_progress", title: "Repair In Progress", message: "Your device is on the workbench." },
  Testing: {
    stage: "final_testing",
    title: "Final Testing",
    message: "Repair work is done. We are completing final testing before your device is ready for collection.",
  },
  Ready: {
    stage: "repair_completed",
    title: "Repair Completed",
    message: "Your device is ready! We will arrange delivery or you can pick it up.",
  },
  Completed: { stage: "repair_completed", title: "Repair Completed", message: "Your repair is complete." },
  Delivered: {
    stage: "delivered",
    title: "Delivered",
    message: "Your device has been delivered. Thank you for choosing Promise Electronics!",
  },
  Cancelled: { stage: "cancelled", title: "Cancelled", message: "This repair has been cancelled." },
  "NG Review Pending": {
    stage: "repair_in_progress",
    title: "Repair Update",
    message: "Our team is reviewing the next steps for your repair.",
  },
  "Awaiting Customer Decision": {
    stage: "repair_in_progress",
    title: "Decision Needed",
    message: "We will contact you about the next step for your repair.",
  },
  "Awaiting Quote Approval": {
    stage: "repair_in_progress",
    title: "Update In Progress",
    message: "We are waiting on a decision before continuing your repair.",
  },
  Abandoned: {
    stage: "cancelled",
    title: "Service Update",
    message: "Please contact the service center about your device.",
  },
  Forfeited: {
    stage: "cancelled",
    title: "Service Update",
    message: "Please contact the service center about your device.",
  },
  Closed: { stage: "cancelled", title: "Service Closed", message: "This service request has been closed." },
  "Not OK": {
    stage: "cancelled",
    title: "Service Update",
    message: "Please contact the service center about your device.",
  },
};

const FRIENDLY: Record<string, string> = {
  device_received: "We have received your TV. It is safely in our queue.",
  inspection_started: "Inspection has started. We will share findings soon.",
  repair_in_progress: "Repair is in progress.",
  final_testing: "Repair work is done. We are completing final testing before your device is ready for collection.",
  repair_completed: "Your TV is ready! We will arrange delivery or you can pick it up.",
  delivered: "Your TV has been delivered. Thank you for choosing Promise Electronics!",
  cancelled: "This repair journey has been cancelled.",
};

const NEXT_ACTION: Record<string, { action: string; label: string } | null> = {
  repair_completed: { action: "arrange_delivery", label: "Arrange Delivery or Pickup" },
  final_testing: null,
};

export function isCanonicalJobStatus(status: string): boolean {
  return JOB_STATUS_SET.has(status);
}

export function assertCanonicalJobStatus(status: string): void {
  if (!isCanonicalJobStatus(status)) {
    throw new JobStatusTransitionError(400, "INVALID_JOB_STATUS", `Unknown job status: ${status}`);
  }
}

/** Mobile / free-form labels that map onto JOB_STATUSES (00B drift repair). */
export const MOBILE_STATUS_ALIASES: Record<string, string> = {
  "Parts Pending": "Waiting on Parts",
  "Ready for Delivery": "Ready",
  Assigned: "Pending",
  Approved: "Pending",
};

export function normalizeMobileJobStatus(status: string): string {
  return MOBILE_STATUS_ALIASES[status] || status;
}

export type TransitionActor = {
  id: string;
  name: string;
  role: string;
};

export type TransitionOptions = {
  jobId: string;
  toStatus: string;
  actor: TransitionActor;
  reason: JobStatusTransitionReason;
  /** Extra job columns set in the same write (repairOutcome, completedAt, notes, …). */
  extraPatch?: Record<string, unknown>;
  /** Required when toStatus is Ready from Testing on normal tech path. */
  testingConfirmed?: boolean;
  /** When true, do not rewrite job row (caller already wrote status inside another tx); only project. */
  projectOnly?: boolean;
  /** Job snapshot after caller write (required when projectOnly). */
  jobAfterWrite?: JobTicket;
  /** Skip ready notification even if Ready (e.g. bulk silent). */
  suppressReadyNotify?: boolean;
};

export type TransitionResult = {
  job: JobTicket;
  previousStatus: string;
  srChanged: boolean;
  trackingStatus?: string;
  requestStatus?: string;
  serviceRequestId?: string | null;
  journeyUpdated: boolean;
  journeyId?: string | null;
  readyNotifyEligible: boolean;
  readyNotified: boolean;
};

function isManagerOrAbove(role: string): boolean {
  return role === "Super Admin" || role === "Manager";
}

function isJobAssignedToActor(job: JobTicket, actor: TransitionActor): boolean {
  if (job.assignedTechnicianId && job.assignedTechnicianId === actor.id) return true;
  if (job.technician && actor.name && job.technician === actor.name) return true;
  return false;
}

/** Explicit boolean true only — never infer from status, string "true", or truthy defaults. */
export function isExplicitTestingConfirmed(value: unknown): boolean {
  return value === true;
}

/**
 * Authorization for normal customer-linked transitions (not NG internal, not scheduler).
 * Testing → Ready: assigned Technician + testingConfirmed===true, or Manager/Super Admin + testingConfirmed===true.
 * No empty role fallbacks.
 */
export function assertTransitionAuthorized(
  job: JobTicket,
  toStatus: string,
  actor: TransitionActor,
  opts: { testingConfirmed?: boolean; reason: JobStatusTransitionReason },
): void {
  const from = job.status;
  const tech = actor.role === "Technician";
  const manager = isManagerOrAbove(actor.role);

  if (opts.reason === "bulk" && toStatus === "Ready") {
    throw new JobStatusTransitionError(
      409,
      "BULK_READY_FORBIDDEN",
      "Cannot bulk-set Ready. Confirm testing on each job individually with testingConfirmed.",
    );
  }

  if (opts.reason === "return_to_inspection") {
    if (manager) return;
    if (tech && isJobAssignedToActor(job, actor) && from === "Testing") return;
    throw new JobStatusTransitionError(
      403,
      "RETURN_FORBIDDEN",
      "Only assigned technician (from Testing) or manager may return to inspection",
    );
  }

  // Testing → Ready (advance / confirm_testing / mobile) and rollback targeting Ready
  const testingToReady = from === "Testing" && toStatus === "Ready";
  const rollbackToReady = opts.reason === "rollback" && toStatus === "Ready";
  if (testingToReady || opts.reason === "confirm_testing" || rollbackToReady) {
    if (!isExplicitTestingConfirmed(opts.testingConfirmed)) {
      throw new JobStatusTransitionError(
        400,
        "TESTING_CONFIRMATION_REQUIRED",
        "Explicit testing confirmation (testingConfirmed: true) is required to mark Ready",
      );
    }
    if (manager) return;
    if (rollbackToReady) {
      throw new JobStatusTransitionError(
        403,
        "READY_OVERRIDE_FORBIDDEN",
        "Only Manager or Super Admin may rollback a job to Ready",
      );
    }
    if (tech && isJobAssignedToActor(job, actor)) return;
    throw new JobStatusTransitionError(
      403,
      "READY_CONFIRM_FORBIDDEN",
      "Only the assigned technician or Manager/Super Admin may confirm testing to Ready",
    );
  }

  if (tech && !isJobAssignedToActor(job, actor)) {
    throw new JobStatusTransitionError(403, "NOT_ASSIGNED", "Read-only: this job is not assigned to you yet");
  }
}

async function projectSurfacesInTx(
  tx: any,
  job: JobTicket,
  actorName: string,
  opts?: { returnToInspection?: boolean },
): Promise<{
  srChanged: boolean;
  trackingStatus?: string;
  requestStatus?: string;
  serviceRequestId?: string | null;
  journeyUpdated: boolean;
  journeyId?: string | null;
}> {
  let srChanged = false;
  let trackingStatus: string | undefined;
  let requestStatus: string | undefined;
  let serviceRequestId: string | null = null;

  const srRows = await tx.execute(sql`
    SELECT id, status, tracking_status AS "trackingStatus",
           service_preference AS "servicePreference", service_mode AS "serviceMode",
           customer_id AS "customerId"
    FROM service_requests
    WHERE converted_job_id = ${job.id}
    LIMIT 1
  `);
  const sr = (srRows.rows?.[0] ?? srRows[0]) as any;
  if (sr) {
    serviceRequestId = sr.id;
    const fakeRequest = {
      servicePreference: sr.servicePreference,
      serviceMode: sr.serviceMode,
      trackingStatus: sr.trackingStatus,
      status: sr.status,
    } as ServiceRequest;
    trackingStatus = opts?.returnToInspection
      ? "Repairing"
      : getProjectedTrackingStatus(fakeRequest, job);
    requestStatus = getProjectedRequestStatus(job);
    const updates: Record<string, unknown> = {};
    if (sr.trackingStatus !== trackingStatus) updates.trackingStatus = trackingStatus;
    if (sr.status !== requestStatus && sr.status !== "Closed") updates.status = requestStatus;
    if (Object.keys(updates).length > 0) {
      if (updates.trackingStatus !== undefined) {
        await tx.execute(sql`
          UPDATE service_requests
          SET tracking_status = ${trackingStatus}
          WHERE id = ${sr.id}
        `);
      }
      if (updates.status !== undefined) {
        await tx.execute(sql`
          UPDATE service_requests
          SET status = ${requestStatus}
          WHERE id = ${sr.id} AND status IS DISTINCT FROM 'Closed'
        `);
      }
      const eventId = nanoid();
      const msg = opts?.returnToInspection
        ? `Your device needs a bit more attention. Our team is continuing inspection.`
        : `Customer status projected from Job ${job.id}: ${trackingStatus}.`;
      await tx.execute(sql`
        INSERT INTO service_request_events (id, service_request_id, status, message, actor, occurred_at)
        VALUES (${eventId}, ${sr.id}, ${trackingStatus}, ${msg}, ${actorName}, NOW())
      `);
      srChanged = true;
    }
  }

  let journeyUpdated = false;
  let journeyId: string | null = null;
  const jRows = await tx.execute(sql`
    SELECT id FROM customer_repair_journeys WHERE job_ticket_id = ${job.id} LIMIT 1
  `);
  journeyId = ((jRows.rows?.[0] ?? jRows[0]) as any)?.id ?? null;

  if (journeyId) {
    const mapping = opts?.returnToInspection
      ? {
          stage: "repair_in_progress" as JourneyStage,
          title: "Additional Inspection",
          message: "Your device needs a bit more attention. Our team is continuing inspection.",
        }
      : JOB_TO_JOURNEY[job.status];

    if (mapping) {
      const friendly = FRIENDLY[mapping.stage] || mapping.message;
      const next = NEXT_ACTION[mapping.stage] || null;
      await tx.execute(sql`
        UPDATE customer_repair_journeys
        SET current_stage = ${mapping.stage},
            customer_friendly_status = ${friendly},
            next_action = ${next?.action || null},
            next_action_label = ${next?.label || null},
            updated_at = NOW()
        WHERE id = ${journeyId}
      `);
      const evId = nanoid();
      const eventType = opts?.returnToInspection
        ? "return_to_inspection"
        : `job_${job.status.toLowerCase().replace(/\s+/g, "_")}`;
      await tx.execute(sql`
        INSERT INTO customer_repair_journey_events
          (id, journey_id, event_type, title, message, actor_type, actor_id, metadata, is_customer_visible, created_at)
        VALUES (
          ${evId}, ${journeyId}, ${eventType}, ${mapping.title}, ${mapping.message},
          'system', null, '{}'::jsonb, true, NOW()
        )
      `);
      journeyUpdated = true;
    }
  }

  /**
   * A warranty claim closes when the repair it asked for is finished.
   *
   * create-job set the claim to in_repair and pointed new_job_id at the
   * re-service job, but nothing ever moved it on. Claims piled up at in_repair
   * whether the television went home a week ago or was still on the bench, so
   * the claims list could not answer the only question it exists to answer:
   * what is still outstanding.
   *
   * It lives here, with the SR and journey projections, because this runs
   * inside the same transaction as the status write on every path that
   * completes a job — advance-status, POS billing, the NG flow. A hook on one
   * route would have closed claims finished one way and not another.
   *
   * The WHERE clause is the whole guard: only a claim still in_repair moves,
   * so a re-opened or already-closed claim is left alone, and re-running the
   * transition is a no-op rather than a second closure.
   */
  if (job.status === "Completed") {
    await tx.execute(sql`
      UPDATE warranty_claims
      SET status = 'completed',
          notes = COALESCE(notes, ${`Closed automatically: re-service job ${job.id} completed.`}),
          updated_at = NOW()
      WHERE new_job_id = ${job.id} AND status = 'in_repair'
    `);
  }

  return { srChanged, trackingStatus, requestStatus, serviceRequestId, journeyUpdated, journeyId };
}

async function maybeReadyNotify(job: JobTicket, suppress?: boolean): Promise<boolean> {
  if (suppress || job.status !== "Ready") return false;
  try {
    const settings = await settingsRepo.getAllSettings();
    const triggerEnabled = settings.find?.((s: any) => s.key === "trigger_notify_ready");
    if (triggerEnabled && String(triggerEnabled.value) !== "true") {
      return false;
    }
    const customerId = (job as any).customerId;
    if (!customerId) return false;
    await notificationRepo.createNotification({
      userId: customerId,
      title: "Your device is ready!",
      message: `${(job as any).device || "Your device"} is ready for pickup. Job #${job.id?.slice?.(-6)?.toUpperCase?.() || job.id}`,
      type: "job_ready",
      jobId: job.id,
    } as any);
    return true;
  } catch (err) {
    console.error("[JobStatusTransition] Ready notify failed:", (err as Error).message);
    return false;
  }
}

/**
 * Canonical transition: job status + SR tracking + journey in one DB transaction.
 * Ready notification is post-commit only when status is Ready.
 */
export async function transitionJobStatus(opts: TransitionOptions): Promise<TransitionResult> {
  assertCanonicalJobStatus(opts.toStatus);

  if (opts.projectOnly) {
    if (!opts.jobAfterWrite) {
      throw new JobStatusTransitionError(500, "PROJECT_ONLY_REQUIRES_JOB", "projectOnly requires jobAfterWrite");
    }
    const job = opts.jobAfterWrite;
    const previousStatus = job.status; // already new
    const projected = await db.transaction(async (tx) => {
      if (process.env.NODE_ENV === "test" && process.env.JOB_STATUS_FORCE_FAIL === "1") {
        throw new JobStatusTransitionError(500, "FORCED_PROJECTION_FAIL", "Forced projection failure for QA");
      }
      return projectSurfacesInTx(tx, job, opts.actor.name || "System");
    });
    const readyNotifyEligible = job.status === "Ready" && !opts.suppressReadyNotify;
    const readyNotified = readyNotifyEligible ? await maybeReadyNotify(job, opts.suppressReadyNotify) : false;
    return {
      job,
      previousStatus,
      ...projected,
      readyNotifyEligible,
      readyNotified,
    };
  }

  const existing = await jobRepo.getJobTicket(opts.jobId);
  if (!existing) {
    throw new JobStatusTransitionError(404, "JOB_NOT_FOUND", "Job ticket not found");
  }
  const previousStatus = existing.status;

  if (previousStatus === opts.toStatus && !opts.extraPatch) {
    return {
      job: existing,
      previousStatus,
      srChanged: false,
      journeyUpdated: false,
      readyNotifyEligible: false,
      readyNotified: false,
    };
  }

  // Ordinary paths must not forge into/out of NG without NG services — those call with reason ng_*
  const ngReasons = new Set(["ng_submit", "ng_verify", "ng_return", "ng_decline_cancel"]);
  if (!ngReasons.has(opts.reason)) {
    if (isNgProtectedStatus(previousStatus) && previousStatus !== opts.toStatus) {
      throw new JobStatusTransitionError(
        409,
        "NG_WORKFLOW_LOCKED",
        "This job is locked in the NG workflow. Use NG review APIs.",
      );
    }
    if (isNgProtectedStatus(opts.toStatus) && !ngReasons.has(opts.reason)) {
      throw new JobStatusTransitionError(
        409,
        "NG_WORKFLOW_LOCKED",
        "Cannot set NG workflow status via ordinary transition.",
      );
    }
  }

  // Generic non-NG hold must never forge NG protected statuses
  if (opts.reason === "work_hold" || opts.reason === "work_resume") {
    const {
      isWorkableStatus,
      isBlockedWorkStatus,
      isTerminalWorkStatus,
      STATUS_AWAITING_QUOTE_APPROVAL,
    } = await import("./technician-queue.service.js");

    if (isNgProtectedStatus(opts.toStatus) || isNgProtectedStatus(previousStatus)) {
      throw new JobStatusTransitionError(
        409,
        "NG_HOLD_FORBIDDEN",
        "Generic work holds cannot enter or leave protected NG decision statuses.",
      );
    }
    if (opts.reason === "work_hold") {
      if (opts.toStatus !== STATUS_AWAITING_QUOTE_APPROVAL) {
        throw new JobStatusTransitionError(
          400,
          "INVALID_HOLD_STATUS",
          "Generic hold target must be Awaiting Quote Approval.",
        );
      }
      // Separate-blocker model: only workable sources may enter generic quote hold.
      // Reject Pending Parts / Waiting on Parts / NG holds / terminals / already on quote hold.
      if (
        !isWorkableStatus(previousStatus) ||
        isBlockedWorkStatus(previousStatus) ||
        isTerminalWorkStatus(previousStatus)
      ) {
        throw new JobStatusTransitionError(
          409,
          "HOLD_SOURCE_NOT_WORKABLE",
          `Cannot place a generic work hold from status "${previousStatus}". Source must be workable (not parts-waiting, NG-blocked, terminal, or already on hold).`,
        );
      }
    }
    if (opts.reason === "work_resume") {
      if (previousStatus !== STATUS_AWAITING_QUOTE_APPROVAL) {
        throw new JobStatusTransitionError(
          400,
          "INVALID_RESUME",
          "Only Awaiting Quote Approval can be resumed via work_resume.",
        );
      }
      if (!isWorkableStatus(opts.toStatus)) {
        throw new JobStatusTransitionError(
          409,
          "INVALID_RESUME_TARGET",
          "Resume target must be a workable (non-blocked, non-terminal) status.",
        );
      }
    }
  } else if (opts.toStatus === "Awaiting Quote Approval") {
    throw new JobStatusTransitionError(
      409,
      "HOLD_PERMISSION_PATH",
      "Awaiting Quote Approval requires the work-hold API (jobs.manageWorkHolds).",
    );
  }

  // External/system writers skip interactive auth (NG/POS/abandonment/corporate/write_off).
  const skipInteractiveAuth = new Set<JobStatusTransitionReason>([
    "ng_submit",
    "ng_verify",
    "ng_return",
    "ng_decline_cancel",
    "abandon",
    "forfeit",
    "pos_complete",
    "write_off",
    "corporate",
    "challan_deliver",
    "system",
    "work_hold",
    "work_resume",
  ]);
  if (!skipInteractiveAuth.has(opts.reason)) {
    assertTransitionAuthorized(existing, opts.toStatus, opts.actor, {
      testingConfirmed: opts.testingConfirmed,
      reason: opts.reason,
    });
  }

  // JOB-QUALITY-GATE-01B: every path into Ready requires a current durable pass.
  if (opts.toStatus === "Ready" && previousStatus !== "Ready") {
    try {
      const { assertCurrentFinalTestPassForReady } = await import("./job-final-test.service.js");
      await assertCurrentFinalTestPassForReady(existing, opts.actor);
    } catch (err: any) {
      if (err?.name === "FinalTestServiceError" || typeof err?.code === "string") {
        throw new JobStatusTransitionError(
          err.status || 409,
          err.code || "FINAL_TEST_PASS_REQUIRED",
          err.message || "A current passing final test is required before Ready",
        );
      }
      throw err;
    }
  }

  const returnToInspection = opts.reason === "return_to_inspection";

  const result = await db.transaction(async (tx) => {
    const lock = await tx.execute(sql`SELECT id, status FROM job_tickets WHERE id = ${opts.jobId} FOR UPDATE`);
    const row = (lock.rows?.[0] ?? (lock as any)[0]) as { id: string; status: string } | undefined;
    if (!row) {
      throw new JobStatusTransitionError(404, "JOB_NOT_FOUND", "Job ticket not found");
    }

    // Re-check Ready evidence under lock (race-safe)
    if (opts.toStatus === "Ready" && row.status !== "Ready") {
      const passCheck = await tx.execute(sql`
        SELECT id, recorded_by AS "recordedBy" FROM job_final_test_runs
        WHERE job_id = ${opts.jobId}
          AND superseded_at IS NULL
          AND outcome = 'pass'
        ORDER BY recorded_at DESC
        LIMIT 1
      `);
      const passRow = (passCheck as any).rows?.[0] ?? (passCheck as any)[0];
      if (!passRow) {
        throw new JobStatusTransitionError(
          409,
          "FINAL_TEST_PASS_REQUIRED",
          "A current passing final test is required before Ready",
        );
      }
      if (opts.actor.role === "Technician" && String(passRow.recordedBy) !== opts.actor.id) {
        throw new JobStatusTransitionError(
          403,
          "FINAL_TEST_PASS_NOT_OWNED",
          "Technician may only confirm Ready using their own current final-test pass",
        );
      }
    }

    if (returnToInspection) {
      const { supersedeCurrentFinalTestRunsInTx } = await import("./job-final-test.service.js");
      await supersedeCurrentFinalTestRunsInTx(tx, opts.jobId, "return_to_inspection", null);
    }

    const { activeWorkTimerPatch } = await import("./technician-queue.service.js");
    const timerPatch = activeWorkTimerPatch(row.status, opts.toStatus, new Date());

    const patch: Record<string, unknown> = {
      status: opts.toStatus,
      ...timerPatch,
      ...(opts.extraPatch || {}),
    };

    // Build dynamic update via drizzle
    const [updated] = await tx
      .update(schema.jobTickets)
      .set(patch as any)
      .where(eq(schema.jobTickets.id, opts.jobId))
      .returning();

    if (!updated) {
      throw new JobStatusTransitionError(500, "UPDATE_FAILED", "Failed to update job status");
    }

    if (process.env.NODE_ENV === "test" && process.env.JOB_STATUS_FORCE_FAIL === "1") {
      throw new JobStatusTransitionError(500, "FORCED_PROJECTION_FAIL", "Forced projection failure for QA");
    }

    const projected = await projectSurfacesInTx(tx, updated, opts.actor.name || "System Projection", {
      returnToInspection,
    });

    // CUSTOMER-FEEDBACK-01A: create opportunity only on first transition into Delivered.
    if (opts.toStatus === "Delivered" && row.status !== "Delivered") {
      const { ensureFeedbackOpportunityForDelivered } = await import("./service-feedback.service.js");
      await ensureFeedbackOpportunityForDelivered({
        job: updated as JobTicket,
        handoverKind: "retail_job_delivered",
        handoverSourceId: null,
        handoverAt: (updated as JobTicket).completedAt || new Date(),
        tx,
      });
    }

    return { job: updated as JobTicket, projected };
  });

  const readyNotifyEligible = result.job.status === "Ready" && !opts.suppressReadyNotify;
  const readyNotified = readyNotifyEligible
    ? await maybeReadyNotify(result.job, opts.suppressReadyNotify)
    : false;

  return {
    job: result.job,
    previousStatus,
    srChanged: result.projected.srChanged,
    trackingStatus: result.projected.trackingStatus,
    requestStatus: result.projected.requestStatus,
    serviceRequestId: result.projected.serviceRequestId,
    journeyUpdated: result.projected.journeyUpdated,
    journeyId: result.projected.journeyId,
    readyNotifyEligible,
    readyNotified,
  };
}

/**
 * Project SR/journey using the single JOB_TO_JOURNEY map inside an existing transaction.
 * Used by atomic corporate handover (01B). Callers own commit/rollback.
 */
export async function projectJobSurfacesInTransaction(
  tx: any,
  job: JobTicket,
  actorName: string,
  opts?: { returnToInspection?: boolean },
): Promise<{
  srChanged: boolean;
  trackingStatus?: string;
  requestStatus?: string;
  serviceRequestId?: string | null;
  journeyUpdated: boolean;
  journeyId?: string | null;
}> {
  if (process.env.NODE_ENV === "test" && process.env.JOB_STATUS_FORCE_FAIL === "1") {
    throw new JobStatusTransitionError(500, "FORCED_PROJECTION_FAIL", "Forced projection failure for QA");
  }
  return projectSurfacesInTx(tx, job, actorName, { returnToInspection: opts?.returnToInspection });
}

/**
 * Project after an external writer already committed job status (NG/POS/abandonment CAS).
 * Prefer in-tx use of transitionJobStatus or projectJobSurfacesInTransaction; this is the dual-projection catch-up path.
 * Not used by corporate challan handover (01B atomic path).
 */
export async function projectJobStatusAfterExternalWrite(
  jobId: string,
  actorName: string,
  opts?: { suppressReadyNotify?: boolean; returnToInspection?: boolean },
): Promise<TransitionResult> {
  const job = await jobRepo.getJobTicket(jobId);
  if (!job) {
    throw new JobStatusTransitionError(404, "JOB_NOT_FOUND", "Job ticket not found");
  }

  const projected = await db.transaction(async (tx) => {
    return projectJobSurfacesInTransaction(tx, job, actorName, {
      returnToInspection: opts?.returnToInspection,
    });
  });

  const readyNotifyEligible = job.status === "Ready" && !opts?.suppressReadyNotify;
  const readyNotified = readyNotifyEligible ? await maybeReadyNotify(job, opts?.suppressReadyNotify) : false;

  return {
    job,
    previousStatus: job.status,
    ...projected,
    readyNotifyEligible,
    readyNotified,
  };
}

/** Outcome map — repair_ok enters Testing, never Ready. */
export function statusForRepairOutcome(outcome: "repair_ok" | "needs_parts"): string {
  if (outcome === "repair_ok") return "Testing";
  return "Waiting on Parts";
}

/** Linear advance map for non-work statuses (work statuses use set-outcome). */
export function nextLinearStatus(current: string): string | null {
  const map: Record<string, string> = {
    Pending: "In Progress",
    Diagnosing: "In Progress",
    "Pending Parts": "In Progress",
    "Waiting on Parts": "In Progress",
    Testing: "Ready",
    Ready: "Completed",
  };
  return map[current] ?? null;
}
