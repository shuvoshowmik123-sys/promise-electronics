/**
 * Canonical NG customer decision (SYSTEM-UNIFICATION-00C-C).
 * Only path that may set repairOutcome=customer_declined + status=Cancelled.
 * Other decision types keep Awaiting Customer Decision status (no new ad-hoc statuses).
 */

import { createHash, randomUUID } from "crypto";
import { db } from "../db.js";
import * as schema from "../../shared/schema.js";
import { eq, sql } from "drizzle-orm";
import { jobNgCustomerDecisionRepo } from "../repositories/job-ng-customer-decision.repository.js";
import { jobNgReportRepo } from "../repositories/job-ng-report.repository.js";
import { jobRepo } from "../repositories/index.js";
import { auditLogger } from "../utils/auditLogger.js";
import { publishJobTicketEvent } from "./admin-realtime.service.js";
import {
  JOB_NG_CUSTOMER_DECISION_CHANNELS,
  JOB_NG_CUSTOMER_DECISION_TYPES,
  type JobNgCustomerDecision,
  type JobNgReport,
  type JobTicket,
} from "../../shared/schema.js";
import { NG_STATUS_AWAITING_DECISION } from "./job-ng-protected.js";

const JOB_REALTIME_TAGS = ["jobTickets", "jobOverview", "dashboardStats"] as const;

export class NgCustomerDecisionServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "NgCustomerDecisionServiceError";
  }
}

export type NgActor = {
  id: string;
  name: string;
  role: string;
};

export type RecordNgCustomerDecisionInput = {
  submissionId: string;
  decisionType: string;
  contactChannel: string;
  decisionNotes: string;
};

export type NgCustomerDecisionResult = {
  decision: JobNgCustomerDecision;
  job: JobTicket;
  idempotent: boolean;
};

function actorSnapshot(actor: NgActor) {
  return { userId: actor.id, name: actor.name, role: actor.role };
}

function ngReportSnapshot(report: JobNgReport) {
  return {
    id: report.id,
    submissionId: report.submissionId,
    failedRepairType: report.failedRepairType,
    reportStatus: report.reportStatus,
    revision: report.revision,
    reportedByUserId: report.reportedByUserId,
    reviewedByUserId: report.reviewedByUserId,
  };
}

export function validateDecisionFields(input: RecordNgCustomerDecisionInput): void {
  const sid = String(input.submissionId || "").trim();
  if (!sid || sid.length < 8 || sid.length > 128) {
    throw new NgCustomerDecisionServiceError(400, "submissionId must be 8–128 characters.", "SUBMISSION_ID");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(sid)) {
    throw new NgCustomerDecisionServiceError(
      400,
      "submissionId may only contain letters, numbers, underscore, hyphen.",
      "SUBMISSION_ID",
    );
  }
  if (!(JOB_NG_CUSTOMER_DECISION_TYPES as readonly string[]).includes(input.decisionType)) {
    throw new NgCustomerDecisionServiceError(
      400,
      `decisionType must be one of: ${JOB_NG_CUSTOMER_DECISION_TYPES.join(", ")}`,
      "DECISION_TYPE",
    );
  }
  if (!(JOB_NG_CUSTOMER_DECISION_CHANNELS as readonly string[]).includes(input.contactChannel)) {
    throw new NgCustomerDecisionServiceError(
      400,
      `contactChannel must be one of: ${JOB_NG_CUSTOMER_DECISION_CHANNELS.join(", ")}`,
      "CONTACT_CHANNEL",
    );
  }
  const notes = String(input.decisionNotes || "").trim();
  if (notes.length < 10) {
    throw new NgCustomerDecisionServiceError(400, "decisionNotes must be at least 10 characters.", "DECISION_NOTES");
  }
  if (notes.length > 8000) {
    throw new NgCustomerDecisionServiceError(400, "decisionNotes is too long.", "DECISION_NOTES");
  }
}

export function buildDecisionFingerprint(input: {
  decisionType: string;
  contactChannel: string;
  decisionNotes: string;
  ngReportId: string;
}): string {
  const payload = JSON.stringify({
    decisionType: input.decisionType,
    contactChannel: input.contactChannel,
    decisionNotes: input.decisionNotes.trim(),
    ngReportId: input.ngReportId,
  });
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Replay an existing decision by submissionId. Validates actor, job binding, and
 * payload fingerprint BEFORE checking job status or verified report — so a replay
 * still works after a decline changed the job to Cancelled.
 */
function replayExisting(
  existing: JobNgCustomerDecision,
  actor: NgActor,
  jobId: string,
  fingerprint: string,
): NgCustomerDecisionServiceError | null {
  if (existing.jobId !== jobId) {
    return new NgCustomerDecisionServiceError(
      409,
      "submissionId already used for a different job.",
      "SUBMISSION_CONFLICT",
    );
  }
  if (existing.recordedByUserId !== actor.id) {
    return new NgCustomerDecisionServiceError(
      403,
      "This submissionId belongs to another recorder.",
      "SUBMISSION_ACTOR",
    );
  }
  const existingFp = (existing as any).payloadFingerprint as string | null | undefined;
  if (existingFp && existingFp !== fingerprint) {
    return new NgCustomerDecisionServiceError(
      409,
      "submissionId already used with a different payload. Use a new submissionId for changes.",
      "SUBMISSION_PAYLOAD_MISMATCH",
    );
  }
  return null;
}

export async function recordNgCustomerDecision(
  jobId: string,
  actor: NgActor,
  rawInput: RecordNgCustomerDecisionInput,
  req?: unknown,
): Promise<NgCustomerDecisionResult> {
  const submissionId = String(rawInput.submissionId || "").trim();
  validateDecisionFields({ ...rawInput, submissionId });

  if (actor.role === "Technician") {
    throw new NgCustomerDecisionServiceError(403, "Technicians cannot record customer decisions.", "TECH_CANNOT_RECORD");
  }

  const jobPre = await jobRepo.getJobTicket(jobId);
  if (!jobPre) throw new NgCustomerDecisionServiceError(404, "Job ticket not found", "NOT_FOUND");

  const decisionType = rawInput.decisionType;
  const contactChannel = rawInput.contactChannel;
  const decisionNotes = String(rawInput.decisionNotes).trim();

  // Check existing submission FIRST (before status/verified-report gates) so
  // idempotent replay works even after decline changed the job to Cancelled.
  const existingBySub = await jobNgCustomerDecisionRepo.getBySubmissionId(submissionId);
  if (existingBySub) {
    // Need a verified report to compute the fingerprint for comparison.
    const verifiedReportForFp = await jobNgReportRepo.getById((existingBySub as any).ngReportId);
    const fpNgReportId = verifiedReportForFp?.id ?? "";
    const fingerprint = buildDecisionFingerprint({
      decisionType,
      contactChannel,
      decisionNotes,
      ngReportId: fpNgReportId,
    });
    const replayErr = replayExisting(existingBySub, actor, jobId, fingerprint);
    if (replayErr instanceof NgCustomerDecisionServiceError) throw replayErr;
    // Valid replay — return the existing decision + current job state.
    const [currentJob] = await db.select().from(schema.jobTickets).where(eq(schema.jobTickets.id, jobId)).limit(1);
    return { decision: existingBySub, job: currentJob!, idempotent: true };
  }

  // New decision — require verified NG report + correct job status.
  const verifiedReport = await jobNgReportRepo.getActiveForJob(jobId);
  if (!verifiedReport || verifiedReport.reportStatus !== "verified") {
    throw new NgCustomerDecisionServiceError(
      409,
      "No verified NG report found for this job. Manager review must verify the NG report first.",
      "NO_VERIFIED_NG_REPORT",
    );
  }

  if (jobPre.status !== NG_STATUS_AWAITING_DECISION) {
    throw new NgCustomerDecisionServiceError(
      409,
      `Job is not in Awaiting Customer Decision (current: ${jobPre.status}).`,
      "JOB_STATUS_MISMATCH",
    );
  }

  const existingForJob = await jobNgCustomerDecisionRepo.getForJob(jobId);
  if (existingForJob) {
    throw new NgCustomerDecisionServiceError(
      409,
      "A customer decision has already been recorded for this job (different submissionId).",
      "NG_CUSTOMER_DECISION_ALREADY_RECORDED",
    );
  }

  const fingerprint = buildDecisionFingerprint({
    decisionType,
    contactChannel,
    decisionNotes,
    ngReportId: verifiedReport.id,
  });

  let result: { decision: JobNgCustomerDecision; job: JobTicket; auditAction: string | null; idempotent: boolean };

  try {
    result = await db.transaction(async (tx) => {
      const lockRows = await tx.execute(sql`
        SELECT id, status FROM job_tickets WHERE id = ${jobId} FOR UPDATE
      `);
      const jobRow = ((lockRows as any).rows ?? lockRows)[0] as any;
      if (!jobRow) {
        throw new NgCustomerDecisionServiceError(404, "Job ticket not found", "NOT_FOUND");
      }

      // Check for an existing decision matching this submissionId BEFORE
      // the status gate. This ensures that a concurrent duplicate request
      // (which lost the race) resolves to an idempotent replay instead of
      // a 409 JOB_STATUS_MISMATCH after the winner changed the job status.
      const subLockRows = await tx.execute(sql`
        SELECT * FROM job_ng_customer_decisions WHERE submission_id = ${submissionId} LIMIT 1 FOR UPDATE
      `);
      const subRow = ((subLockRows as any).rows ?? subLockRows)[0] as any;
      if (subRow) {
        if (subRow.job_id !== jobId) {
          throw new NgCustomerDecisionServiceError(
            409,
            "submissionId already used for a different job.",
            "SUBMISSION_CONFLICT",
          );
        }
        if (subRow.recorded_by_user_id !== actor.id) {
          throw new NgCustomerDecisionServiceError(
            403,
            "This submissionId belongs to another recorder.",
            "SUBMISSION_ACTOR",
          );
        }
        const existingFp = subRow.payload_fingerprint as string | null | undefined;
        if (existingFp && existingFp !== fingerprint) {
          throw new NgCustomerDecisionServiceError(
            409,
            "submissionId already used with a different payload. Use a new submissionId for changes.",
            "SUBMISSION_PAYLOAD_MISMATCH",
          );
        }
        const [existing] = await tx
          .select()
          .from(schema.jobNgCustomerDecisions)
          .where(eq(schema.jobNgCustomerDecisions.submissionId, submissionId))
          .limit(1);
        const [job] = await tx.select().from(schema.jobTickets).where(eq(schema.jobTickets.id, jobId)).limit(1);
        return { decision: existing!, job: job!, auditAction: null, idempotent: true };
      }

      // No existing decision for this submissionId — check for a different
      // submissionId that already recorded a decision for this job.
      const decisionLock = await tx.execute(sql`
        SELECT submission_id FROM job_ng_customer_decisions
        WHERE job_id = ${jobId}
        LIMIT 1
        FOR UPDATE
      `);
      const decisionRow = ((decisionLock as any).rows ?? decisionLock)[0] as any;
      if (decisionRow) {
        throw new NgCustomerDecisionServiceError(
          409,
          "A customer decision has already been recorded for this job (different submissionId).",
          "NG_CUSTOMER_DECISION_ALREADY_RECORDED",
        );
      }

      // Genuinely new decision — now enforce the status + verified report gates.
      if (jobRow.status !== NG_STATUS_AWAITING_DECISION) {
        throw new NgCustomerDecisionServiceError(
          409,
          `Job is not in Awaiting Customer Decision (current: ${jobRow.status}).`,
          "JOB_STATUS_MISMATCH",
        );
      }

      const reportLock = await tx.execute(sql`
        SELECT * FROM job_ng_reports
        WHERE job_id = ${jobId}
          AND report_status = 'verified'
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `);
      const reportRow = ((reportLock as any).rows ?? reportLock)[0] as any;
      if (!reportRow) {
        throw new NgCustomerDecisionServiceError(409, "No verified NG report found for this job.", "NO_VERIFIED_NG_REPORT");
      }

      const decisionId = randomUUID();
      const now = new Date();
      const snap = actorSnapshot(actor);
      const repSnap = ngReportSnapshot(verifiedReport);

      const [decision] = await tx
        .insert(schema.jobNgCustomerDecisions)
        .values({
          id: decisionId,
          jobId,
          submissionId,
          decisionType,
          contactChannel,
          decisionNotes,
          payloadFingerprint: fingerprint,
          ngReportId: verifiedReport.id,
          ngReportSnapshot: repSnap,
          recordedByUserId: actor.id,
          recordedBySnapshot: snap,
          recordedAt: now,
          createdAt: now,
          updatedAt: now,
        } as any)
        .returning();

      let auditAction: string;
      let finalJob: JobTicket;

      if (decisionType === "decline") {
        const [updatedJob] = await tx
          .update(schema.jobTickets)
          .set({
            status: "Cancelled",
            repairOutcome: "customer_declined",
          } as any)
          .where(eq(schema.jobTickets.id, jobId))
          .returning();
        finalJob = updatedJob!;
        auditAction = "NG_CUSTOMER_DECISION_DECLINE_CANCELLED";
      } else {
        // Non-decline: do NOT mutate the job. Select current row inside the same tx.
        const [currentJob] = await tx
          .select()
          .from(schema.jobTickets)
          .where(eq(schema.jobTickets.id, jobId))
          .limit(1);
        finalJob = currentJob!;
        auditAction = `NG_CUSTOMER_DECISION_${decisionType.toUpperCase()}`;
      }

      return { decision: decision!, job: finalJob, auditAction, idempotent: false };
    });
  } catch (err: any) {
    // Map unique-constraint races to stable business responses.
    const pgCode = err?.code as string | undefined;
    if (pgCode === "23505") {
      const constraint = String(err?.constraint || err?.constraint_name || "");
      if (constraint.includes("submission_id")) {
        throw new NgCustomerDecisionServiceError(
          409,
          "submissionId already used for a different job.",
          "SUBMISSION_CONFLICT",
        );
      }
      throw new NgCustomerDecisionServiceError(
        409,
        "A customer decision has already been recorded for this job (different submissionId).",
        "NG_CUSTOMER_DECISION_ALREADY_RECORDED",
      );
    }
    if (err instanceof NgCustomerDecisionServiceError) throw err;
    console.error("[NgCustomerDecision] transaction failed:", (err as Error).message);
    throw new NgCustomerDecisionServiceError(500, "Failed to record customer decision", "DB_ERROR");
  }

  // Post-commit side effects — must never cause an HTTP 500.
  if (result.auditAction) {
    auditLogger
      .log({
        userId: actor.id,
        action: result.auditAction,
        entity: "JobNgCustomerDecision",
        entityId: result.decision.id,
        details: `Customer decision recorded for job ${jobId} (type ${decisionType}, channel ${contactChannel})`,
        oldValue: { status: NG_STATUS_AWAITING_DECISION },
        newValue: {
          decisionType,
          contactChannel,
          jobStatus: result.job.status,
          repairOutcome: result.job.repairOutcome,
        },
        req,
      })
      .catch((err: unknown) => {
        console.error("[NgCustomerDecision] Audit log failed:", (err as Error).message);
      });

    try {
      publishJobTicketEvent({
        action: "status_changed",
        entityId: jobId,
        invalidate: [...JOB_REALTIME_TAGS],
        permissions: ["jobs"],
        payload: { jobId, status: result.job.status },
      });
    } catch (err) {
      console.error("[NgCustomerDecision] Realtime publish failed:", (err as Error).message);
    }

    if (decisionType === "decline") {
      try {
        const { projectJobStatusAfterExternalWrite } = await import("./job-status-transition.service.js");
        await projectJobStatusAfterExternalWrite(jobId, actor.name || "System Projection", {
          suppressReadyNotify: true,
        });
      } catch (err) {
        console.error("[NgCustomerDecision] Customer projection failed:", (err as Error).message);
      }
    }
  }

  return { decision: result.decision, job: result.job, idempotent: result.idempotent };
}

export async function getActiveNgCustomerDecision(
  jobId: string,
): Promise<JobNgCustomerDecision | undefined> {
  return jobNgCustomerDecisionRepo.getForJob(jobId);
}

/**
 * Assert that an actor may view the customer decision for this job.
 * Applies the same policy as NG report visibility: technicians may only view
 * jobs assigned to them or that they created; all other roles pass.
 * Throws NgCustomerDecisionServiceError(403) on denial — never returns empty 404.
 */
export async function assertCanViewNgCustomerDecision(
  actor: NgActor,
  job: JobTicket,
): Promise<void> {
  if (actor.role !== "Technician") return;
  const assigned = jobRepo.isJobAssignedToUser(job as any, actor.id, actor.name);
  const creator = jobRepo.isJobCreatedByUser(job as any, actor.id);
  if (!assigned && !creator) {
    throw new NgCustomerDecisionServiceError(403, "Access denied", "ACCESS_DENIED");
  }
}