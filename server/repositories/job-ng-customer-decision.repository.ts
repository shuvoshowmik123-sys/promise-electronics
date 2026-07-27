import { db } from "../db.js";
import * as schema from "../../shared/schema.js";
import { eq, sql } from "drizzle-orm";
import type { JobNgCustomerDecision } from "../../shared/schema.js";

export async function getBySubmissionId(
  submissionId: string,
): Promise<JobNgCustomerDecision | undefined> {
  const [row] = await db
    .select()
    .from(schema.jobNgCustomerDecisions)
    .where(eq(schema.jobNgCustomerDecisions.submissionId, submissionId))
    .limit(1);
  return row;
}

export async function getById(id: string): Promise<JobNgCustomerDecision | undefined> {
  const [row] = await db
    .select()
    .from(schema.jobNgCustomerDecisions)
    .where(eq(schema.jobNgCustomerDecisions.id, id))
    .limit(1);
  return row;
}

export async function getForJob(jobId: string): Promise<JobNgCustomerDecision | undefined> {
  const [row] = await db
    .select()
    .from(schema.jobNgCustomerDecisions)
    .where(eq(schema.jobNgCustomerDecisions.jobId, jobId))
    .limit(1);
  return row;
}

export async function countAll(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.jobNgCustomerDecisions);
  return Number(row?.count || 0);
}

export async function deleteAll(): Promise<number> {
  const result = await db.delete(schema.jobNgCustomerDecisions);
  return Number((result as any).rowCount || 0);
}

export const jobNgCustomerDecisionRepo = {
  getBySubmissionId,
  getById,
  getForJob,
  countAll,
  deleteAll,
};