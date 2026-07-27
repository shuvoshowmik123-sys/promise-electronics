/** CORPORATE-JOB-STATUS-01A — intake declaration helpers (never customer-ready). */

export const CORPORATE_DECLARATIONS = [
  "received",
  "checking",
  "declared_ok",
  "declared_ng",
  "pending_hold",
] as const;

export type CorporateDeclaration = (typeof CORPORATE_DECLARATIONS)[number];

const LEGACY_TO_DECLARATION: Record<string, CorporateDeclaration> = {
  received: "received",
  checking: "checking",
  "declared ok": "declared_ok",
  declared_ok: "declared_ok",
  "declared ng": "declared_ng",
  "declared not ok": "declared_ng",
  declared_ng: "declared_ng",
  pending: "pending_hold",
  pending_hold: "pending_hold",
};

export class CorporateDeclarationError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "CorporateDeclarationError";
    this.status = status;
    this.code = code;
  }
}

/** Normalize free text to declaration key; null if not a declaration input. */
export function mapLegacyTextToDeclaration(raw: string | null | undefined): CorporateDeclaration | null {
  if (raw == null) return null;
  const key = String(raw).trim().toLowerCase();
  if (!key) return null;
  return LEGACY_TO_DECLARATION[key] ?? null;
}

/**
 * Parse corporate status endpoint body.
 * Ready → 409 CORPORATE_READY_REQUIRES_TESTING.
 * Lifecycle / unknown → 400 CORPORATE_DECLARATION_ONLY.
 */
export function parseCorporateStatusEndpointInput(raw: string): CorporateDeclaration {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    throw new CorporateDeclarationError(400, "CORPORATE_DECLARATION_ONLY", "Declaration required");
  }
  if (/^ready$/i.test(trimmed)) {
    throw new CorporateDeclarationError(
      409,
      "CORPORATE_READY_REQUIRES_TESTING",
      "Corporate Ready requires Final Testing confirmation on the job. Use Testing → Ready with testingConfirmed.",
    );
  }
  const mapped = mapLegacyTextToDeclaration(trimmed);
  if (!mapped) {
    throw new CorporateDeclarationError(
      400,
      "CORPORATE_DECLARATION_ONLY",
      "Corporate status endpoint accepts intake declarations only (Checking, Declared OK, Declared NG, Received, Pending).",
    );
  }
  return mapped;
}

export function displayCorporateDeclaration(value: string | null | undefined): string {
  switch (value) {
    case "received":
      return "Received";
    case "checking":
      return "Checking";
    case "declared_ok":
      return "Declared OK (intake)";
    case "declared_ng":
      return "Declared NG (intake)";
    case "pending_hold":
      return "Pending hold";
    default:
      return value ? String(value) : "—";
  }
}
