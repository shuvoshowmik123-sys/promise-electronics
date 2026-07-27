/** JOB-CUSTOMER-WORKFLOW-01B — locked Model / Serial / Unit serial display rules. */

export function isCorporateJob(job: {
  corporateClientId?: string | null;
  corporateChallanId?: string | null;
} | null | undefined): boolean {
  return Boolean(job?.corporateClientId || job?.corporateChallanId);
}

function cleanText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

/** Model label source only — never tvSerialNumber. */
export function getJobModelDisplay(job: { modelNumber?: string | null } | null | undefined): string | null {
  return cleanText(job?.modelNumber);
}

/** Retail / walk-in serial — technician detail only. */
export function getJobSerialDisplay(job: { serialNumber?: string | null } | null | undefined): string | null {
  return cleanText(job?.serialNumber);
}

/**
 * Unit serial for corporate jobs only.
 * Non-corporate jobs hide tvSerialNumber (including legacy model-polluted rows).
 */
export function getJobUnitSerialDisplay(job: {
  tvSerialNumber?: string | null;
  corporateClientId?: string | null;
  corporateChallanId?: string | null;
} | null | undefined): string | null {
  if (!isCorporateJob(job)) return null;
  return cleanText(job?.tvSerialNumber);
}

export function hasAnyJobIdentity(job: any): boolean {
  return Boolean(
    cleanText(job?.device) ||
      cleanText(job?.screenSize) ||
      getJobModelDisplay(job) ||
      getJobSerialDisplay(job) ||
      getJobUnitSerialDisplay(job),
  );
}
