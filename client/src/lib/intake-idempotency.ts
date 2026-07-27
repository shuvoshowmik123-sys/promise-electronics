/**
 * Client-side material payload identity for retail intake.
 * Same material → reuse Idempotency-Key; material edit → fresh key before resubmit.
 * Normalization mirrors server fingerprint material parts (NFKC + lower + collapse ws).
 */
export function canonicalMaterialPart(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function materialIntakeKey(data: {
  brand?: string | null;
  primaryIssue?: string | null;
  phone?: string | null;
  modelNumber?: string | null;
  screenSize?: string | null;
  servicePreference?: string | null;
  serviceMode?: string | null;
  address?: string | null;
  requestIntent?: string | null;
  serviceId?: string | null;
  customerName?: string | null;
}): string {
  return [
    canonicalMaterialPart(data.phone),
    canonicalMaterialPart(data.requestIntent),
    canonicalMaterialPart(data.serviceId),
    canonicalMaterialPart(data.brand),
    canonicalMaterialPart(data.modelNumber),
    canonicalMaterialPart(data.screenSize),
    canonicalMaterialPart(data.primaryIssue),
    canonicalMaterialPart(data.serviceMode || data.servicePreference),
    canonicalMaterialPart(data.address),
    canonicalMaterialPart(data.customerName),
  ].join("|");
}

/** Returns a stable key for unchanged material; rotates when material changes. */
export function resolveIntakeIdempotencyKey(
  material: string,
  keyRef: { current: string | null },
  materialRef: { current: string | null },
): string {
  if (materialRef.current !== material) {
    keyRef.current = crypto.randomUUID();
    materialRef.current = material;
  }
  if (!keyRef.current) {
    keyRef.current = crypto.randomUUID();
  }
  return keyRef.current;
}
