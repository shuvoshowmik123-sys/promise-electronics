/**
 * JOB-QUALITY-GATE-01B — durable final-test evidence for Ready gate.
 * Append-only runs; never store serials, customer data, free diagnosis, or customer copy.
 */
import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import * as schema from "../../shared/schema.js";
import type { JobTicket } from "../../shared/schema.js";
import { jobRepo } from "../repositories/index.js";

export const FINAL_TEST_CHECK_CODES = [
  "power_on",
  "picture",
  "sound",
  "ports",
  "remote",
  "menu",
  "backlight",
  "panel_basic",
] as const;

export const FINAL_TEST_REINSPECTION_REASONS = [
  "picture_issue",
  "sound_issue",
  "intermittent",
  "customer_request",
  "manager_recheck",
  "other_allowlisted",
] as const;

const CHECK_SET = new Set<string>(FINAL_TEST_CHECK_CODES);
const REASON_SET = new Set<string>(FINAL_TEST_REINSPECTION_REASONS);

export class FinalTestServiceError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "FinalTestServiceError";
    this.status = status;
    this.code = code;
  }
}

export type FinalTestActor = {
  id: string;
  name: string;
  role: string;
};

function isManagerOrAbove(role: string): boolean {
  return role === "Super Admin" || role === "Manager";
}

function isAssigned(job: JobTicket, actor: FinalTestActor): boolean {
  if (job.assignedTechnicianId && job.assignedTechnicianId === actor.id) return true;
  if (job.technician && actor.name && job.technician === actor.name) return true;
  return false;
}

function normalizeCheckCodes(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new FinalTestServiceError(400, "CHECK_CODES_REQUIRED", "At least one allowlisted check code is required");
  }
  const codes: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const c = String(item || "").trim();
    if (!c || !CHECK_SET.has(c)) {
      throw new FinalTestServiceError(400, "CHECK_CODE_NOT_ALLOWLISTED", "One or more check codes are not allowlisted");
    }
    if (seen.has(c)) continue;
    seen.add(c);
    codes.push(c);
  }
  if (codes.length === 0) {
    throw new FinalTestServiceError(400, "CHECK_CODES_REQUIRED", "At least one allowlisted check code is required");
  }
  return codes;
}

export type FinalTestRunDto = {
  id: string;
  jobId: string;
  outcome: "pass" | "fail";
  checkCodes: string[];
  reinspectionReason: string | null;
  recordedBy: string;
  recordedAt: string | null;
  supersededAt: string | null;
  supersededByRunId: string | null;
  supersedeReason: string | null;
};

function rowToDto(row: any): FinalTestRunDto {
  const codes = Array.isArray(row.check_codes)
    ? row.check_codes
    : Array.isArray(row.checkCodes)
      ? row.checkCodes
      : [];
  return {
    id: String(row.id),
    jobId: String(row.job_id ?? row.jobId),
    outcome: row.outcome === "fail" ? "fail" : "pass",
    checkCodes: codes.map(String),
    reinspectionReason: row.reinspection_reason ?? row.reinspectionReason ?? null,
    recordedBy: String(row.recorded_by ?? row.recordedBy),
    recordedAt: row.recorded_at
      ? new Date(row.recorded_at).toISOString()
      : row.recordedAt
        ? new Date(row.recordedAt).toISOString()
        : null,
    supersededAt: row.superseded_at
      ? new Date(row.superseded_at).toISOString()
      : row.supersededAt
        ? new Date(row.supersededAt).toISOString()
        : null,
    supersededByRunId: row.superseded_by_run_id ?? row.supersededByRunId ?? null,
    supersedeReason: row.supersede_reason ?? row.supersedeReason ?? null,
  };
}

/** Supersede all non-superseded runs for a job inside an open transaction (raw client or drizzle tx). */
export async function supersedeCurrentFinalTestRunsInTx(
  tx: { execute: (q: any) => Promise<any> },
  jobId: string,
  reason: string,
  byRunId?: string | null,
): Promise<number> {
  const res = await tx.execute(sql`
    UPDATE job_final_test_runs
    SET superseded_at = NOW(),
        supersede_reason = ${reason},
        superseded_by_run_id = ${byRunId ?? null}
    WHERE job_id = ${jobId}
      AND superseded_at IS NULL
    RETURNING id
  `);
  const rows = (res as any).rows ?? res ?? [];
  return Array.isArray(rows) ? rows.length : 0;
}

export async function getCurrentFinalTestPass(jobId: string): Promise<FinalTestRunDto | null> {
  const res = await db.execute(sql`
    SELECT * FROM job_final_test_runs
    WHERE job_id = ${jobId}
      AND superseded_at IS NULL
      AND outcome = 'pass'
    ORDER BY recorded_at DESC
    LIMIT 1
  `);
  const row = (res as any).rows?.[0] ?? (res as any)[0];
  return row ? rowToDto(row) : null;
}

export async function listFinalTestRunsForJob(jobId: string, limit = 20): Promise<FinalTestRunDto[]> {
  const lim = Math.min(Math.max(limit, 1), 50);
  const res = await db.execute(sql`
    SELECT * FROM job_final_test_runs
    WHERE job_id = ${jobId}
    ORDER BY recorded_at DESC
    LIMIT ${lim}
  `);
  const rows = (res as any).rows ?? res ?? [];
  return (Array.isArray(rows) ? rows : []).map(rowToDto);
}

/**
 * Record a final-test run while Job is Testing.
 * Pass requires allowlisted check codes; fail requires allowlisted reinspection reason.
 */
export async function recordFinalTestRun(opts: {
  jobId: string;
  outcome: "pass" | "fail";
  checkCodes?: unknown;
  reinspectionReason?: unknown;
  actor: FinalTestActor;
}): Promise<FinalTestRunDto> {
  const outcome = opts.outcome === "fail" ? "fail" : opts.outcome === "pass" ? "pass" : null;
  if (!outcome) {
    throw new FinalTestServiceError(400, "INVALID_OUTCOME", "outcome must be pass or fail");
  }
  if (!opts.actor?.id) {
    throw new FinalTestServiceError(401, "AUTH_REQUIRED", "Actor required");
  }

  const job = await jobRepo.getJobTicket(opts.jobId);
  if (!job) {
    throw new FinalTestServiceError(404, "JOB_NOT_FOUND", "Job ticket not found");
  }
  if (job.status !== "Testing") {
    throw new FinalTestServiceError(
      409,
      "FINAL_TEST_NOT_IN_TESTING",
      "Final test can only be recorded while the job is in Testing",
    );
  }

  const manager = isManagerOrAbove(opts.actor.role);
  const tech = opts.actor.role === "Technician";
  if (!manager) {
    if (!tech) {
      throw new FinalTestServiceError(403, "FINAL_TEST_FORBIDDEN", "Not allowed to record final test");
    }
    if (!isAssigned(job, opts.actor)) {
      throw new FinalTestServiceError(
        403,
        "NOT_ASSIGNED",
        "Technicians may only record final test on their assigned jobs",
      );
    }
  }

  let checkCodes: string[] = [];
  let reinspectionReason: string | null = null;
  if (outcome === "pass") {
    checkCodes = normalizeCheckCodes(opts.checkCodes);
  } else {
    // fail still accepts optional check codes if allowlisted; reason required
    if (opts.checkCodes !== undefined && opts.checkCodes !== null) {
      try {
        checkCodes = normalizeCheckCodes(opts.checkCodes);
      } catch {
        checkCodes = [];
      }
    }
    const reason = String(opts.reinspectionReason || "").trim();
    if (!reason || !REASON_SET.has(reason)) {
      throw new FinalTestServiceError(
        400,
        "REINSPECTION_REASON_REQUIRED",
        "Fail requires an allowlisted reinspection reason",
      );
    }
    reinspectionReason = reason;
  }

  const runId = randomUUID();

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM job_tickets WHERE id = ${opts.jobId} FOR UPDATE`);
    await supersedeCurrentFinalTestRunsInTx(tx, opts.jobId, "superseded_by_new_run", runId);
    await tx.insert(schema.jobFinalTestRuns).values({
      id: runId,
      jobId: opts.jobId,
      outcome,
      checkCodes,
      reinspectionReason,
      recordedBy: opts.actor.id,
      recordedAt: new Date(),
    } as any);
  });

  const created = await db.execute(sql`SELECT * FROM job_final_test_runs WHERE id = ${runId} LIMIT 1`);
  const row = (created as any).rows?.[0] ?? (created as any)[0];
  if (!row) {
    throw new FinalTestServiceError(500, "WRITE_FAILED", "Failed to read recorded final test");
  }
  return rowToDto(row);
}

/**
 * Ready-path gate: current non-superseded pass must exist.
 * Technician confirming Ready must own that pass (recorded_by = actor.id) and be assigned.
 * Manager/SA may use any current pass.
 */
export async function assertCurrentFinalTestPassForReady(
  job: JobTicket,
  actor: FinalTestActor,
): Promise<FinalTestRunDto> {
  const pass = await getCurrentFinalTestPass(job.id);
  if (!pass) {
    throw new FinalTestServiceError(
      409,
      "FINAL_TEST_PASS_REQUIRED",
      "A current passing final test is required before Ready",
    );
  }
  if (isManagerOrAbove(actor.role)) {
    return pass;
  }
  if (actor.role === "Technician") {
    if (!isAssigned(job, actor)) {
      throw new FinalTestServiceError(403, "NOT_ASSIGNED", "Read-only: this job is not assigned to you yet");
    }
    if (pass.recordedBy !== actor.id) {
      throw new FinalTestServiceError(
        403,
        "FINAL_TEST_PASS_NOT_OWNED",
        "Technician may only confirm Ready using their own current final-test pass",
      );
    }
    return pass;
  }
  throw new FinalTestServiceError(403, "READY_CONFIRM_FORBIDDEN", "Not allowed to confirm Ready");
}
