/** CORPORATE-JOB-STATUS-01B — atomic challan handover validation helpers. */

export class CorporateHandoverError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "CorporateHandoverError";
    this.status = status;
    this.code = code;
  }
}

export const HANDOVER_MAX_JOBS = 100;

export function normalizeHandoverJobIds(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new CorporateHandoverError(
      400,
      "HANDOVER_EMPTY",
      "At least one job id is required for handover.",
    );
  }
  if (raw.length > HANDOVER_MAX_JOBS) {
    throw new CorporateHandoverError(
      400,
      "HANDOVER_LIMIT",
      `Handover accepts at most ${HANDOVER_MAX_JOBS} jobs.`,
    );
  }
  const ids = raw.map((id) => String(id ?? "").trim()).filter(Boolean);
  if (ids.length !== raw.length) {
    throw new CorporateHandoverError(
      400,
      "HANDOVER_INVALID_ID",
      "Job ids must be non-empty strings.",
    );
  }
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    throw new CorporateHandoverError(
      400,
      "HANDOVER_DUPLICATE",
      "Duplicate job ids are not allowed.",
    );
  }
  return ids;
}

export function isPartsOnlyTicket(ticketType: string | null | undefined): boolean {
  return ticketType === "parts_only";
}

/** Repairable jobs must be Ready. parts_only is the only direct-delivery exception. */
export function assertJobEligibleForHandover(
  job: {
    id: string;
    status?: string | null;
    corporateClientId?: string | null;
    ticketType?: string | null;
  },
  corporateClientId: string,
): void {
  const jobClient = job.corporateClientId != null ? String(job.corporateClientId).trim() : "";
  if (!jobClient || jobClient !== String(corporateClientId).trim()) {
    throw new CorporateHandoverError(
      400,
      "HANDOVER_CROSS_CLIENT",
      "Every job must belong to the supplied corporate client.",
    );
  }
  if (isPartsOnlyTicket(job.ticketType)) {
    if (job.status === "Delivered" || job.status === "Cancelled" || job.status === "Closed") {
      throw new CorporateHandoverError(
        400,
        "HANDOVER_JOB_NOT_READY",
        "This parts-only job is already closed or delivered.",
      );
    }
    return;
  }
  if (job.status !== "Ready") {
    throw new CorporateHandoverError(
      400,
      "HANDOVER_JOB_NOT_READY",
      "Repairable corporate jobs can hand over only from Ready (after final testing).",
    );
  }
}
