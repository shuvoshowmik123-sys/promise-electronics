import { db } from "../db.js";
import * as schema from "../../shared/schema.js";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import type { JobNgReport } from "../../shared/schema.js";

export async function getBySubmissionId(submissionId: string): Promise<JobNgReport | undefined> {
  const [row] = await db
    .select()
    .from(schema.jobNgReports)
    .where(eq(schema.jobNgReports.submissionId, submissionId))
    .limit(1);
  return row;
}

export async function getById(id: string): Promise<JobNgReport | undefined> {
  const [row] = await db
    .select()
    .from(schema.jobNgReports)
    .where(eq(schema.jobNgReports.id, id))
    .limit(1);
  return row;
}

export async function getActiveForJob(jobId: string): Promise<JobNgReport | undefined> {
  const [row] = await db
    .select()
    .from(schema.jobNgReports)
    .where(
      and(
        eq(schema.jobNgReports.jobId, jobId),
        inArray(schema.jobNgReports.reportStatus, ["pending_review", "verified"]),
      ),
    )
    .orderBy(desc(schema.jobNgReports.createdAt))
    .limit(1);
  return row;
}

export async function getLatestForJob(jobId: string): Promise<JobNgReport | undefined> {
  const [row] = await db
    .select()
    .from(schema.jobNgReports)
    .where(eq(schema.jobNgReports.jobId, jobId))
    .orderBy(desc(schema.jobNgReports.revision), desc(schema.jobNgReports.createdAt))
    .limit(1);
  return row;
}

export async function getMaxRevisionForJob(jobId: string): Promise<number> {
  const [row] = await db
    .select({ maxRev: sql<number>`coalesce(max(${schema.jobNgReports.revision}), 0)` })
    .from(schema.jobNgReports)
    .where(eq(schema.jobNgReports.jobId, jobId));
  return Number(row?.maxRev || 0);
}

export const jobNgReportRepo = {
  getBySubmissionId,
  getById,
  getActiveForJob,
  getLatestForJob,
  getMaxRevisionForJob,
};
