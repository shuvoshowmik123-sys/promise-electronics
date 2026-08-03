/**
 * Contact validation for desktop /repair-request.
 * Usable phone/name is required regardless of auth — auth does not imply profile complete.
 */

export function profileHasUsablePhone(
  customer: { phone?: string | null } | null | undefined,
): boolean {
  return Boolean(customer?.phone?.trim());
}

export function profileHasUsableName(
  customer: { name?: string | null } | null | undefined,
): boolean {
  return Boolean(customer?.name?.trim());
}

/** When true, account summary is enough; otherwise show inline name/phone fields. */
export function canUseSavedContactSummary(
  customer: { name?: string | null; phone?: string | null } | null | undefined,
): boolean {
  return profileHasUsableName(customer) && profileHasUsablePhone(customer);
}

export function validateRepairContactFields(input: {
  customerName: string;
  phone: string;
}): { ok: true } | { ok: false; missing: string[]; errors: Record<string, boolean> } {
  const errors: Record<string, boolean> = {};
  const missing: string[] = [];

  if (!input.customerName.trim()) {
    errors.customerName = true;
    missing.push("Full Name");
  }

  const digits = input.phone.replace(/\D/g, "");
  if (!input.phone.trim() || digits.length < 10) {
    errors.phone = true;
    missing.push("Phone Number");
  }

  if (missing.length > 0) {
    return { ok: false, missing, errors };
  }
  return { ok: true };
}
