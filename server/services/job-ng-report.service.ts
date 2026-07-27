/**
 * Canonical NG report + manager review (JOBS-NG-02A/02G).
 * Only path that may set NG Review Pending / Awaiting Customer Decision / not_repairable.
 */

import { createHash, randomUUID } from "crypto";
import ImageKit from "imagekit";
import { db } from "../db.js";
import * as schema from "../../shared/schema.js";
import { eq, sql, desc } from "drizzle-orm";
import { jobNgReportRepo } from "../repositories/job-ng-report.repository.js";
import { jobRepo, notificationRepo, userRepo } from "../repositories/index.js";
import { auditLogger } from "../utils/auditLogger.js";
import { publishJobTicketEvent } from "./admin-realtime.service.js";
import { notifyAdminUpdate } from "../routes/middleware/sse-broker.js";
import { userHasGranularPermission } from "../routes/middleware/auth.js";
import { getIKFolder } from "../utils/imagekit-folder.js";
import { getSafeJobDisplayRef } from "../../shared/job-display-utils.js";
import {
  JOB_NG_FAILED_REPAIR_TYPES,
  type JobNgReport,
  type JobTicket,
} from "../../shared/schema.js";
import {
  NG_ELIGIBLE_WORK_STATUSES,
  NG_STATUS_AWAITING_DECISION,
  NG_STATUS_REVIEW_PENDING,
} from "./job-ng-protected.js";

const JOB_REALTIME_TAGS = ["jobTickets", "jobOverview", "dashboardStats"] as const;
const MAX_EVIDENCE = 12;
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export class NgReportServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "NgReportServiceError";
  }
}

export type NgActor = {
  id: string;
  name: string;
  role: string;
};

export type NgEvidenceAttachment = {
  fileId: string;
  url: string;
  name?: string;
  thumbnailUrl?: string;
  size?: number;
  fileType?: string;
};

export type SubmitNgReportInput = {
  submissionId: string;
  failedRepairType: string;
  diagnosis: string;
  technicalNotes: string;
  evidenceAttachments: NgEvidenceAttachment[];
};

export type ReviewNgReportInput = {
  action: "verify" | "return_for_correction";
  reviewNotes?: string;
};

function actorSnapshot(actor: NgActor) {
  return { userId: actor.id, name: actor.name, role: actor.role };
}

function getImageKitClient(): ImageKit {
  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY?.trim();
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY?.trim();
  const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT?.trim();
  if (!publicKey || !privateKey || !urlEndpoint) {
    throw new NgReportServiceError(
      503,
      "ImageKit is not configured; evidence attachments cannot be accepted.",
      "IMAGEKIT_NOT_CONFIGURED",
    );
  }
  return new ImageKit({ publicKey, privateKey, urlEndpoint });
}

function normalizeFolderPath(path: string): string {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.replace(/\/+$/, "") || "/";
}

function urlsMatchCanonical(submitted: string, canonical: string): boolean {
  try {
    const a = new URL(submitted);
    const b = new URL(canonical);
    if (a.origin !== b.origin) return false;
    // Compare path without trailing slash; allow query params only on submitted if path matches
    const pathA = a.pathname.replace(/\/+$/, "") || "/";
    const pathB = b.pathname.replace(/\/+$/, "") || "/";
    return pathA === pathB;
  } catch {
    return false;
  }
}

function pathInNgEvidenceFolder(filePath: string): boolean {
  const required = normalizeFolderPath(getIKFolder("job-ng-evidence"));
  const actual = normalizeFolderPath(filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) || "/" : "/");
  // filePath from ImageKit is like /promise-electronics/job-ng-evidence/name.jpg
  const full = normalizeFolderPath(filePath.startsWith("/") ? filePath : `/${filePath}`);
  return full === required || full.startsWith(`${required}/`);
}

/** Verify each fileId via ImageKit API; store canonical metadata only. */
export async function validateNgEvidenceAttachments(raw: unknown): Promise<NgEvidenceAttachment[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new NgReportServiceError(
      400,
      "At least one evidence attachment is required (ImageKit fileId + url).",
      "EVIDENCE_REQUIRED",
    );
  }
  if (raw.length > MAX_EVIDENCE) {
    throw new NgReportServiceError(400, "Maximum 12 evidence attachments allowed.", "EVIDENCE_LIMIT");
  }

  let imagekit: ImageKit;
  try {
    imagekit = getImageKitClient();
  } catch (err) {
    if (err instanceof NgReportServiceError) throw err;
    throw new NgReportServiceError(503, "ImageKit verification unavailable.", "IMAGEKIT_NOT_CONFIGURED");
  }

  const out: NgEvidenceAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      throw new NgReportServiceError(400, "Invalid evidence attachment item.", "EVIDENCE_INVALID");
    }
    const fileId = String((item as any).fileId || "").trim();
    const submittedUrl = String((item as any).url || "").trim();
    if (!fileId || fileId.length < 4) {
      throw new NgReportServiceError(400, "Each evidence item requires a valid ImageKit fileId.", "EVIDENCE_FILE_ID");
    }
    if (!submittedUrl.startsWith("https://")) {
      throw new NgReportServiceError(400, "Evidence URLs must be HTTPS ImageKit URLs.", "EVIDENCE_URL");
    }
    let submittedParsed: URL;
    try {
      submittedParsed = new URL(submittedUrl);
    } catch {
      throw new NgReportServiceError(400, "Evidence URL is not a valid absolute URL.", "EVIDENCE_URL");
    }
    const endpointOrigin = new URL(process.env.IMAGEKIT_URL_ENDPOINT!.replace(/\/+$/, "") + "/").origin;
    if (submittedParsed.origin !== endpointOrigin) {
      throw new NgReportServiceError(
        400,
        "Evidence URL must use the configured ImageKit endpoint. External URLs are not allowed.",
        "EVIDENCE_HOST",
      );
    }

    let details: any;
    try {
      details = await imagekit.getFileDetails(fileId);
    } catch {
      throw new NgReportServiceError(
        400,
        "Evidence file could not be verified with ImageKit. Re-upload and try again.",
        "EVIDENCE_NOT_FOUND",
      );
    }

    const file = (details as any)?.fileId ? details : (details as any)?.data || details;
    if (!file?.fileId) {
      throw new NgReportServiceError(400, "Evidence file could not be verified with ImageKit.", "EVIDENCE_NOT_FOUND");
    }
    if (String(file.fileId) !== fileId) {
      throw new NgReportServiceError(400, "Evidence fileId does not match ImageKit record.", "EVIDENCE_FILE_ID_MISMATCH");
    }
    if (file.fileType && String(file.fileType).toLowerCase() !== "image") {
      throw new NgReportServiceError(400, "Evidence must be an image file.", "EVIDENCE_NOT_IMAGE");
    }
    const size = Number(file.size ?? 0);
    if (!Number.isFinite(size) || size <= 0) {
      throw new NgReportServiceError(400, "Evidence file size is invalid.", "EVIDENCE_SIZE");
    }
    if (size > MAX_EVIDENCE_BYTES) {
      throw new NgReportServiceError(400, "Evidence file exceeds 10 MB limit.", "EVIDENCE_SIZE");
    }
    const filePath = String(file.filePath || "");
    if (!pathInNgEvidenceFolder(filePath)) {
      throw new NgReportServiceError(
        400,
        "Evidence must be uploaded to the job-ng-evidence folder.",
        "EVIDENCE_FOLDER",
      );
    }
    const canonicalUrl = String(file.url || "");
    if (!canonicalUrl || !urlsMatchCanonical(submittedUrl, canonicalUrl)) {
      throw new NgReportServiceError(
        400,
        "Evidence URL does not match the verified ImageKit file.",
        "EVIDENCE_URL_MISMATCH",
      );
    }

    out.push({
      fileId: String(file.fileId),
      url: canonicalUrl,
      name: file.name ? String(file.name).slice(0, 200) : undefined,
      thumbnailUrl: file.thumbnail ? String(file.thumbnail) : undefined,
      size,
      fileType: file.mime ? String(file.mime).slice(0, 80) : file.fileType ? String(file.fileType) : "image",
    });
  }
  return out;
}

export function validateSubmitFields(input: SubmitNgReportInput): void {
  const sid = String(input.submissionId || "").trim();
  if (!sid || sid.length < 8 || sid.length > 128) {
    throw new NgReportServiceError(400, "submissionId must be 8–128 characters.", "SUBMISSION_ID");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(sid)) {
    throw new NgReportServiceError(400, "submissionId may only contain letters, numbers, underscore, hyphen.", "SUBMISSION_ID");
  }
  if (!(JOB_NG_FAILED_REPAIR_TYPES as readonly string[]).includes(input.failedRepairType)) {
    throw new NgReportServiceError(
      400,
      `failedRepairType must be one of: ${JOB_NG_FAILED_REPAIR_TYPES.join(", ")}`,
      "FAILED_REPAIR_TYPE",
    );
  }
  const diagnosis = String(input.diagnosis || "").trim();
  if (diagnosis.length < 10) {
    throw new NgReportServiceError(400, "diagnosis must be at least 10 characters.", "DIAGNOSIS");
  }
  if (diagnosis.length > 4000) {
    throw new NgReportServiceError(400, "diagnosis is too long.", "DIAGNOSIS");
  }
  const notes = String(input.technicalNotes || "").trim();
  if (notes.length < 10) {
    throw new NgReportServiceError(400, "technicalNotes must be at least 10 characters.", "TECHNICAL_NOTES");
  }
  if (notes.length > 8000) {
    throw new NgReportServiceError(400, "technicalNotes is too long.", "TECHNICAL_NOTES");
  }
}

export function buildPayloadFingerprint(input: {
  failedRepairType: string;
  diagnosis: string;
  technicalNotes: string;
  evidenceFileIds: string[];
}): string {
  const payload = JSON.stringify({
    failedRepairType: input.failedRepairType,
    diagnosis: input.diagnosis.trim(),
    technicalNotes: input.technicalNotes.trim(),
    evidenceFileIds: [...input.evidenceFileIds].sort(),
  });
  return createHash("sha256").update(payload).digest("hex");
}

function buildPartsSnapshot(job: JobTicket): Record<string, unknown> {
  let productLines: unknown = [];
  let partsLineitems: unknown = [];
  try {
    productLines = typeof job.productLines === "string" ? JSON.parse(job.productLines || "[]") : job.productLines || [];
  } catch {
    productLines = [];
  }
  partsLineitems = (job as any).partsLineitems ?? [];
  return {
    productLines,
    partsLineitems,
    charges: job.charges ?? [],
    estimatedCost: job.estimatedCost ?? null,
    capturedAt: new Date().toISOString(),
  };
}

function canMutateAsTechnician(
  actor: NgActor,
  job: { assignedTechnicianId?: string | null; technician?: string | null },
): boolean {
  if (actor.role !== "Technician") return true;
  return jobRepo.isJobAssignedToUser(job as any, actor.id, actor.name);
}

function canAccessAsTechnician(
  actor: NgActor,
  job: { assignedTechnicianId?: string | null; technician?: string | null; createdByUserId?: string | null },
): boolean {
  if (actor.role !== "Technician") return true;
  if (jobRepo.isJobAssignedToUser(job as any, actor.id, actor.name)) return true;
  if (jobRepo.isJobCreatedByUser(job as any, actor.id)) return true;
  return false;
}

async function notifyReviewers(job: JobTicket): Promise<void> {
  try {
    const recipients: { id: string }[] = [];
    let page = 1;
    const limit = 100;
    let pages = 1;
    while (page <= pages && page <= 50) {
      const result = await userRepo.getAllUsers(page, limit);
      pages = result.pagination.pages || 1;
      for (const u of result.items || []) {
        if ((u as any).status && (u as any).status !== "Active") continue;
        if (userHasGranularPermission(u as any, "jobs.reviewOutcome")) {
          recipients.push({ id: u.id });
        }
      }
      page += 1;
    }

    const device = job.device || "Device";
    const displayRef = getSafeJobDisplayRef(job);
    await Promise.all(
      recipients.slice(0, 200).map(async (m) => {
        await notificationRepo.createNotification({
          userId: m.id,
          title: "NG report pending review",
          message: `${device} — ${displayRef} needs manager NG review.`,
          type: "job",
          jobId: job.id,
          link: `/admin?tab=jobs&job=${job.id}`,
          contextType: "ng_report_review",
        } as any);
      }),
    );
    try {
      notifyAdminUpdate({
        type: "job",
        jobId: job.id,
        message: `NG report pending review for ${displayRef}`,
      });
    } catch (err) {
      console.error("[NgReport] SSE notify failed:", (err as Error).message);
    }
  } catch (err) {
    console.error("[NgReport] Manager notify failed:", (err as Error).message);
  }
}

function safePublishJobEvent(payload: Parameters<typeof publishJobTicketEvent>[0]): void {
  try {
    publishJobTicketEvent(payload);
  } catch (err) {
    console.error("[NgReport] Realtime publish failed:", (err as Error).message);
  }
}

export async function submitNgReport(
  jobId: string,
  actor: NgActor,
  rawInput: SubmitNgReportInput,
  req?: unknown,
): Promise<{ report: JobNgReport; job: JobTicket; idempotent: boolean }> {
  const submissionId = String(rawInput.submissionId || "").trim();
  validateSubmitFields({ ...rawInput, submissionId });

  // Authorize assignment before ImageKit (no write yet)
  const jobPre = await jobRepo.getJobTicket(jobId);
  if (!jobPre) throw new NgReportServiceError(404, "Job ticket not found", "NOT_FOUND");
  if (!canMutateAsTechnician(actor, jobPre as any)) {
    throw new NgReportServiceError(403, "Read-only: this job is not assigned to you yet", "NOT_ASSIGNED");
  }

  const existingBySubEarly = await jobNgReportRepo.getBySubmissionId(submissionId);
  if (existingBySubEarly) {
    if (existingBySubEarly.jobId !== jobId) {
      throw new NgReportServiceError(409, "submissionId already used for a different job.", "SUBMISSION_CONFLICT");
    }
    if (existingBySubEarly.reportedByUserId !== actor.id) {
      throw new NgReportServiceError(403, "This submissionId belongs to another reporter.", "SUBMISSION_ACTOR");
    }
  }

  // ImageKit verification before any write
  const evidence = await validateNgEvidenceAttachments(rawInput.evidenceAttachments);
  const diagnosis = String(rawInput.diagnosis).trim();
  const technicalNotes = String(rawInput.technicalNotes).trim();
  const failedRepairType = rawInput.failedRepairType;
  const fingerprint = buildPayloadFingerprint({
    failedRepairType,
    diagnosis,
    technicalNotes,
    evidenceFileIds: evidence.map((e) => e.fileId),
  });

  const existingBySub = existingBySubEarly;
  if (existingBySub) {
    const existingFp = (existingBySub as any).payloadFingerprint as string | null | undefined;
    if (existingFp && existingFp !== fingerprint) {
      throw new NgReportServiceError(
        409,
        "submissionId already used with a different payload. Use a new submissionId for changes.",
        "SUBMISSION_PAYLOAD_MISMATCH",
      );
    }
    return { report: existingBySub, job: jobPre, idempotent: true };
  }

  const result = await db.transaction(async (tx) => {
    const lockRows = await tx.execute(sql`
      SELECT * FROM job_tickets WHERE id = ${jobId} FOR UPDATE
    `);
    const row = ((lockRows as any).rows ?? lockRows)[0] as any;
    if (!row) {
      throw new NgReportServiceError(404, "Job ticket not found", "NOT_FOUND");
    }

    const jobLike = {
      id: row.id,
      status: row.status,
      assignedTechnicianId: row.assigned_technician_id ?? row.assignedTechnicianId,
      technician: row.technician,
      productLines: row.product_lines ?? row.productLines,
      partsLineitems: row.parts_lineitems ?? row.partsLineitems,
      charges: row.charges,
      estimatedCost: row.estimated_cost ?? row.estimatedCost,
      device: row.device,
      problemFound: row.problem_found ?? row.problemFound ?? null,
    };

    if (!canMutateAsTechnician(actor, jobLike)) {
      throw new NgReportServiceError(403, "Read-only: this job is not assigned to you yet", "NOT_ASSIGNED");
    }

    const active = await tx
      .select()
      .from(schema.jobNgReports)
      .where(
        sql`${schema.jobNgReports.jobId} = ${jobId}
          AND ${schema.jobNgReports.reportStatus} IN ('pending_review', 'verified')`,
      )
      .limit(1);

    if (active[0]) {
      throw new NgReportServiceError(
        409,
        "This job already has an active NG report. Wait for manager review or use the same submissionId for retries.",
        "ACTIVE_REPORT_EXISTS",
      );
    }

    if (!(NG_ELIGIBLE_WORK_STATUSES as readonly string[]).includes(jobLike.status)) {
      throw new NgReportServiceError(
        400,
        `NG report only allowed from Diagnosing / In Progress / On Workbench (current: ${jobLike.status})`,
        "INVALID_STATUS",
      );
    }

    const maxRevRows = await tx
      .select({ maxRev: sql<number>`coalesce(max(${schema.jobNgReports.revision}), 0)` })
      .from(schema.jobNgReports)
      .where(eq(schema.jobNgReports.jobId, jobId));
    const revision = Number(maxRevRows[0]?.maxRev || 0) + 1;

    const partsSnapshot = buildPartsSnapshot(jobLike as any);
    const reportId = randomUUID();
    const now = new Date();
    const sourceProblemFound =
      jobLike.problemFound != null && String(jobLike.problemFound).length > 0
        ? String(jobLike.problemFound)
        : null;

    const [report] = await tx
      .insert(schema.jobNgReports)
      .values({
        id: reportId,
        jobId,
        submissionId,
        failedRepairType,
        diagnosis,
        technicalNotes,
        evidenceAttachments: evidence,
        partsSnapshot,
        sourceJobStatus: jobLike.status,
        sourceProblemFound,
        payloadFingerprint: fingerprint,
        reportStatus: "pending_review",
        reportedByUserId: actor.id,
        reportedBySnapshot: actorSnapshot(actor),
        reportedAt: now,
        revision,
        createdAt: now,
        updatedAt: now,
      } as any)
      .returning();

    const [updatedJob] = await tx
      .update(schema.jobTickets)
      .set({
        status: NG_STATUS_REVIEW_PENDING,
        repairOutcome: "not_repairable",
        problemFound: diagnosis.slice(0, 2000),
      } as any)
      .where(eq(schema.jobTickets.id, jobId))
      .returning();

    return { report, job: updatedJob };
  });

  await auditLogger.log({
    userId: actor.id,
    action: "NG_REPORT_SUBMITTED",
    entity: "JobNgReport",
    entityId: result.report.id,
    details: `NG report submitted for job ${jobId} (revision ${result.report.revision}, type ${failedRepairType})`,
    oldValue: { status: result.report.sourceJobStatus },
    newValue: {
      status: NG_STATUS_REVIEW_PENDING,
      repairOutcome: "not_repairable",
      reportStatus: "pending_review",
      revision: result.report.revision,
      evidenceCount: evidence.length,
    },
    req,
  });

  safePublishJobEvent({
    action: "status_changed",
    entityId: jobId,
    invalidate: [...JOB_REALTIME_TAGS],
    permissions: ["jobs"],
    payload: { jobId, status: NG_STATUS_REVIEW_PENDING },
  });

  void notifyReviewers(result.job);

  // Dual public projection (job already committed with NG report)
  try {
    const { projectJobStatusAfterExternalWrite } = await import("./job-status-transition.service.js");
    await projectJobStatusAfterExternalWrite(jobId, actor.name || "System Projection", {
      suppressReadyNotify: true,
    });
  } catch (err) {
    console.error("[NgReport] Customer projection failed:", (err as Error).message);
  }

  return { report: result.report, job: result.job, idempotent: false };
}

export async function reviewNgReport(
  jobId: string,
  actor: NgActor,
  input: ReviewNgReportInput,
  req?: unknown,
): Promise<{ report: JobNgReport; job: JobTicket; idempotent: boolean }> {
  if (actor.role === "Technician") {
    throw new NgReportServiceError(403, "Technicians cannot review NG reports.", "TECH_CANNOT_REVIEW");
  }

  const action = input.action;
  if (action !== "verify" && action !== "return_for_correction") {
    throw new NgReportServiceError(400, 'action must be "verify" or "return_for_correction"', "INVALID_ACTION");
  }

  if (action === "return_for_correction") {
    const notes = String(input.reviewNotes || "").trim();
    if (notes.length < 5) {
      throw new NgReportServiceError(400, "reviewNotes is required when returning for correction (min 5 characters).", "REVIEW_NOTES");
    }
  }

  const result = await db.transaction(async (tx) => {
    const lockRows = await tx.execute(sql`
      SELECT id, status FROM job_tickets WHERE id = ${jobId} FOR UPDATE
    `);
    const jobRow = ((lockRows as any).rows ?? lockRows)[0] as any;
    if (!jobRow) {
      throw new NgReportServiceError(404, "Job ticket not found", "NOT_FOUND");
    }

    const reportLock = await tx.execute(sql`
      SELECT *
      FROM job_ng_reports
      WHERE job_id = ${jobId}
        AND report_status IN ('pending_review', 'verified', 'returned')
      ORDER BY
        CASE report_status
          WHEN 'pending_review' THEN 0
          WHEN 'verified' THEN 1
          ELSE 2
        END,
        created_at DESC
      LIMIT 1
      FOR UPDATE
    `);
    const reportRow = ((reportLock as any).rows ?? reportLock)[0] as any;
    if (!reportRow) {
      throw new NgReportServiceError(404, "No NG report found for this job.", "NO_REPORT");
    }

    const reportStatus = reportRow.report_status as string;
    const reportId = reportRow.id as string;
    const reportedByUserId = reportRow.reported_by_user_id as string;
    const sourceJobStatus = reportRow.source_job_status as string;
    const sourceProblemFound = reportRow.source_problem_found as string | null;

    if (reportedByUserId === actor.id) {
      throw new NgReportServiceError(403, "You cannot review your own NG report.", "SELF_REVIEW");
    }

    if (reportStatus === "verified") {
      if (action === "verify") {
        const [job] = await tx.select().from(schema.jobTickets).where(eq(schema.jobTickets.id, jobId)).limit(1);
        const [report] = await tx.select().from(schema.jobNgReports).where(eq(schema.jobNgReports.id, reportId)).limit(1);
        return { report: report!, job: job!, idempotent: true, auditAction: null as string | null };
      }
      throw new NgReportServiceError(409, "Verified NG reports are immutable.", "IMMUTABLE");
    }

    if (reportStatus === "returned") {
      if (action === "return_for_correction") {
        const [job] = await tx.select().from(schema.jobTickets).where(eq(schema.jobTickets.id, jobId)).limit(1);
        const [report] = await tx.select().from(schema.jobNgReports).where(eq(schema.jobNgReports.id, reportId)).limit(1);
        return { report: report!, job: job!, idempotent: true, auditAction: null as string | null };
      }
      throw new NgReportServiceError(
        409,
        "This report was already returned. Technician must submit a new NG report.",
        "ALREADY_RETURNED",
      );
    }

    if (jobRow.status !== NG_STATUS_REVIEW_PENDING) {
      throw new NgReportServiceError(
        409,
        `Job is not in NG Review Pending (current: ${jobRow.status}).`,
        "JOB_STATUS_MISMATCH",
      );
    }

    const now = new Date();
    const reviewNotes = input.reviewNotes ? String(input.reviewNotes).trim() : null;
    const snap = actorSnapshot(actor);

    if (action === "verify") {
      const [report] = await tx
        .update(schema.jobNgReports)
        .set({
          reportStatus: "verified",
          reviewedByUserId: actor.id,
          reviewedBySnapshot: snap,
          reviewedAt: now,
          reviewNotes,
          updatedAt: now,
        })
        .where(eq(schema.jobNgReports.id, reportId))
        .returning();

      const [job] = await tx
        .update(schema.jobTickets)
        .set({ status: NG_STATUS_AWAITING_DECISION } as any)
        .where(eq(schema.jobTickets.id, jobId))
        .returning();

      return { report: report!, job: job!, idempotent: false, auditAction: "NG_REPORT_VERIFIED" };
    }

    const restoreStatus = (NG_ELIGIBLE_WORK_STATUSES as readonly string[]).includes(sourceJobStatus)
      ? sourceJobStatus
      : "In Progress";

    const [report] = await tx
      .update(schema.jobNgReports)
      .set({
        reportStatus: "returned",
        reviewedByUserId: actor.id,
        reviewedBySnapshot: snap,
        reviewedAt: now,
        reviewNotes,
        updatedAt: now,
      })
      .where(eq(schema.jobNgReports.id, reportId))
      .returning();

    const [job] = await tx
      .update(schema.jobTickets)
      .set({
        status: restoreStatus,
        repairOutcome: null,
        problemFound: sourceProblemFound,
      } as any)
      .where(eq(schema.jobTickets.id, jobId))
      .returning();

    return { report: report!, job: job!, idempotent: false, auditAction: "NG_REPORT_RETURNED" };
  });

  if (result.auditAction) {
    await auditLogger.log({
      userId: actor.id,
      action: result.auditAction,
      entity: "JobNgReport",
      entityId: result.report.id,
      details:
        result.auditAction === "NG_REPORT_VERIFIED"
          ? `NG report verified for job ${jobId}`
          : `NG report returned for correction on job ${jobId}`,
      oldValue: { reportStatus: "pending_review" },
      newValue: {
        reportStatus: result.report.reportStatus,
        jobStatus: result.job.status,
        hasReviewNotes: Boolean(result.report.reviewNotes),
      },
      req,
    });

    safePublishJobEvent({
      action: "status_changed",
      entityId: jobId,
      invalidate: [...JOB_REALTIME_TAGS],
      permissions: ["jobs"],
      payload: { jobId, status: result.job.status },
    });

    try {
      const { projectJobStatusAfterExternalWrite } = await import("./job-status-transition.service.js");
      await projectJobStatusAfterExternalWrite(jobId, actor.name || "System Projection", {
        suppressReadyNotify: true,
      });
    } catch (err) {
      console.error("[NgReport] Review customer projection failed:", (err as Error).message);
    }
  }

  return { report: result.report, job: result.job, idempotent: result.idempotent };
}

export async function getActiveNgReport(jobId: string): Promise<JobNgReport | undefined> {
  return jobNgReportRepo.getActiveForJob(jobId);
}

export async function getLatestNgReport(jobId: string): Promise<JobNgReport | undefined> {
  return jobNgReportRepo.getLatestForJob(jobId);
}

export async function assertCanViewNgReport(
  actor: NgActor,
  job: JobTicket,
): Promise<void> {
  if (!canAccessAsTechnician(actor, job as any)) {
    throw new NgReportServiceError(403, "Access denied", "ACCESS_DENIED");
  }
}
