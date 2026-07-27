/**
 * TECHNICIAN-QR-TRACKING-01 — opaque printed QR credentials for external technician jobs/batches.
 * Store only SHA-256 of raw token. Raw token returned once at issue time (never persisted).
 * Multiple active credentials may exist per entity — normal print/reprint must not invalidate
 * earlier slips. Revocation is reserved for an explicit staff action (future feature).
 */
import { createHash, randomBytes, randomUUID } from "crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "../db.js";
import {
  EXTERNAL_QR_ENTITY_BATCH,
  EXTERNAL_QR_ENTITY_JOB,
  externalQrCredentials,
  jobBatches,
  jobTickets,
} from "../../shared/schema.js";
import { getSafeJobDisplayRef } from "../../shared/job-display-utils.js";
import { isExternalTechnicianJob } from "./external-technician-intake.service.js";

export type ExternalQrEntityType =
  | typeof EXTERNAL_QR_ENTITY_JOB
  | typeof EXTERNAL_QR_ENTITY_BATCH;

const RAW_TOKEN_HEX_RE = /^[a-f0-9]{64}$/;
const PUBLIC_PATH_PREFIX = "/ext-track";

export type SafeExternalJobStatus = {
  slipId: string;
  device: string | null;
  ticketType: string | null;
  status: string;
  createdAt: Date | string | null;
  completedAt: Date | string | null;
  badges: {
    panelOnly: boolean;
    partsOnly: boolean;
  };
};

export type SafeExternalJobTrackResponse = {
  kind: "job";
} & SafeExternalJobStatus;

export type SafeExternalBatchTrackResponse = {
  kind: "batch";
  slipId: string;
  status: string;
  totalItems: number;
  createdAt: Date | string | null;
  jobs: SafeExternalJobStatus[];
};

export type ExternalQrIssueResult = {
  token: string;
  path: string;
  entityType: ExternalQrEntityType;
  entityId: string;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function hashExternalQrToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function buildExternalQrPublicPath(rawToken: string): string {
  return `${PUBLIC_PATH_PREFIX}/${rawToken}`;
}

function mintRawToken(): string {
  return randomBytes(32).toString("hex");
}

function isWellFormedToken(raw: string): boolean {
  return typeof raw === "string" && RAW_TOKEN_HEX_RE.test(raw);
}

function ticketBadges(ticketType: string | null | undefined) {
  return {
    panelOnly: ticketType === "panel_only",
    partsOnly: ticketType === "parts_only",
  };
}

export function toSafeExternalJobStatus(job: {
  id: string;
  corporateJobNumber?: string | null;
  device?: string | null;
  ticketType?: string | null;
  status: string;
  createdAt?: Date | string | null;
  completedAt?: Date | string | null;
}): SafeExternalJobStatus {
  return {
    slipId: getSafeJobDisplayRef(job),
    device: job.device ?? null,
    ticketType: job.ticketType ?? null,
    status: job.status,
    createdAt: job.createdAt ?? null,
    completedAt: job.completedAt ?? null,
    badges: ticketBadges(job.ticketType),
  };
}

/**
 * Issue a new opaque credential for an entity without revoking prior active credentials.
 * Intake and staff print both use this — a second print must leave the first slip valid.
 * Returns raw token once — never persisted.
 */
export async function issueExternalQrCredential(
  entityType: ExternalQrEntityType,
  entityId: string,
  executor?: Tx,
): Promise<ExternalQrIssueResult> {
  const run = async (tx: Tx | typeof db): Promise<ExternalQrIssueResult> => {
    const token = mintRawToken();
    const credentialHash = hashExternalQrToken(token);
    await tx.insert(externalQrCredentials).values({
      id: randomUUID(),
      credentialHash,
      entityType,
      entityId,
      revokedAt: null,
    });
    return {
      token,
      path: buildExternalQrPublicPath(token),
      entityType,
      entityId,
    };
  };

  if (executor) return run(executor);
  return db.transaction(async (tx) => run(tx));
}

export async function resolveExternalQrCredential(rawToken: string): Promise<{
  entityType: ExternalQrEntityType;
  entityId: string;
} | null> {
  if (!isWellFormedToken(rawToken)) return null;
  const credentialHash = hashExternalQrToken(rawToken);
  const [row] = await db
    .select({
      entityType: externalQrCredentials.entityType,
      entityId: externalQrCredentials.entityId,
      revokedAt: externalQrCredentials.revokedAt,
    })
    .from(externalQrCredentials)
    .where(eq(externalQrCredentials.credentialHash, credentialHash))
    .limit(1);
  if (!row || row.revokedAt) return null;
  if (row.entityType !== EXTERNAL_QR_ENTITY_JOB && row.entityType !== EXTERNAL_QR_ENTITY_BATCH) {
    return null;
  }
  return { entityType: row.entityType, entityId: row.entityId };
}

export async function loadSafeTrackPayload(
  entityType: ExternalQrEntityType,
  entityId: string,
): Promise<SafeExternalJobTrackResponse | SafeExternalBatchTrackResponse | null> {
  if (entityType === EXTERNAL_QR_ENTITY_JOB) {
    const [job] = await db
      .select({
        id: jobTickets.id,
        corporateJobNumber: jobTickets.corporateJobNumber,
        device: jobTickets.device,
        ticketType: jobTickets.ticketType,
        status: jobTickets.status,
        createdAt: jobTickets.createdAt,
        completedAt: jobTickets.completedAt,
        source: jobTickets.source,
        intakePartyKind: jobTickets.intakePartyKind,
        externalPartyId: jobTickets.externalPartyId,
      })
      .from(jobTickets)
      .where(eq(jobTickets.id, entityId))
      .limit(1);
    if (!job || !isExternalTechnicianJob(job)) return null;
    return {
      kind: "job",
      ...toSafeExternalJobStatus(job),
    };
  }

  const [batch] = await db
    .select({
      id: jobBatches.id,
      batchNumber: jobBatches.batchNumber,
      batchStatus: jobBatches.batchStatus,
      totalItems: jobBatches.totalItems,
      createdAt: jobBatches.createdAt,
      intakePartyKind: jobBatches.intakePartyKind,
      externalPartyId: jobBatches.externalPartyId,
      clientClass: jobBatches.clientClass,
    })
    .from(jobBatches)
    .where(eq(jobBatches.id, entityId))
    .limit(1);

  if (!batch) return null;
  if (!batch.externalPartyId && batch.intakePartyKind !== "external_technician") {
    return null;
  }

  const jobs = await db
    .select({
      id: jobTickets.id,
      corporateJobNumber: jobTickets.corporateJobNumber,
      device: jobTickets.device,
      ticketType: jobTickets.ticketType,
      status: jobTickets.status,
      createdAt: jobTickets.createdAt,
      completedAt: jobTickets.completedAt,
      source: jobTickets.source,
      intakePartyKind: jobTickets.intakePartyKind,
      externalPartyId: jobTickets.externalPartyId,
      batchId: jobTickets.batchId,
    })
    .from(jobTickets)
    .where(eq(jobTickets.batchId, batch.id))
    .orderBy(asc(jobTickets.createdAt));

  const safeJobs = jobs
    .filter((j) => isExternalTechnicianJob(j) && j.batchId === batch.id)
    .map(toSafeExternalJobStatus);

  return {
    kind: "batch",
    slipId: batch.batchNumber?.trim() || `BATCH-${batch.id.slice(-6).toUpperCase()}`,
    status: batch.batchStatus,
    totalItems: batch.totalItems ?? safeJobs.length,
    createdAt: batch.createdAt,
    jobs: safeJobs,
  };
}

/** Public resolve: malformed/unknown/revoked/ineligible all look the same to the caller (null). */
export async function publicResolveExternalQr(
  rawToken: string,
): Promise<SafeExternalJobTrackResponse | SafeExternalBatchTrackResponse | null> {
  const cred = await resolveExternalQrCredential(rawToken);
  if (!cred) return null;
  return loadSafeTrackPayload(cred.entityType, cred.entityId);
}

export async function assertEligibleExternalJob(jobId: string): Promise<{
  id: string;
  batchId: string | null;
} | null> {
  const [job] = await db
    .select({
      id: jobTickets.id,
      batchId: jobTickets.batchId,
      source: jobTickets.source,
      intakePartyKind: jobTickets.intakePartyKind,
      externalPartyId: jobTickets.externalPartyId,
    })
    .from(jobTickets)
    .where(eq(jobTickets.id, jobId))
    .limit(1);
  if (!job || !isExternalTechnicianJob(job)) return null;
  return { id: job.id, batchId: job.batchId ?? null };
}

export async function assertEligibleExternalBatch(batchId: string): Promise<{ id: string } | null> {
  const [batch] = await db
    .select({
      id: jobBatches.id,
      intakePartyKind: jobBatches.intakePartyKind,
      externalPartyId: jobBatches.externalPartyId,
    })
    .from(jobBatches)
    .where(eq(jobBatches.id, batchId))
    .limit(1);
  if (!batch) return null;
  if (!batch.externalPartyId && batch.intakePartyKind !== "external_technician") return null;
  return { id: batch.id };
}

/**
 * Staff print target for a job slip: single external job → job QR;
 * batch member → batch QR (one batch slip).
 */
export async function issuePrintTargetForJob(jobId: string): Promise<ExternalQrIssueResult | null> {
  const job = await assertEligibleExternalJob(jobId);
  if (!job) return null;
  if (job.batchId) {
    return issueExternalQrCredential(EXTERNAL_QR_ENTITY_BATCH, job.batchId);
  }
  return issueExternalQrCredential(EXTERNAL_QR_ENTITY_JOB, job.id);
}

export async function issuePrintTargetForBatch(batchId: string): Promise<ExternalQrIssueResult | null> {
  const batch = await assertEligibleExternalBatch(batchId);
  if (!batch) return null;
  return issueExternalQrCredential(EXTERNAL_QR_ENTITY_BATCH, batch.id);
}
