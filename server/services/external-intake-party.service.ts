/**
 * JOB-INTAKE-UNIFICATION-01A-A — external Technician/shop party foundation.
 * Dedicated store only. Never customers, users, jobs, batches, journeys, or SRs.
 */
import { and, eq, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import {
  EXTERNAL_INTAKE_PARTY_KIND,
  externalIntakeParties,
  type ExternalIntakeParty,
} from "../../shared/schema.js";
import { normalizePhone } from "../utils/phone.js";

export const EXTERNAL_PARTY_KIND = EXTERNAL_INTAKE_PARTY_KIND;

export class ExternalIntakePartyError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ExternalIntakePartyError";
    this.status = status;
    this.code = code;
  }
}

export type ExternalPartyCompactCard = {
  id: string;
  name: string;
  phone: string;
  shortAddress: string | null;
};

const SEARCH_LIMIT = 20;
const NAME_MIN = 2;
const NAME_MAX = 120;
const ADDRESS_MAX = 200;
const BD_MOBILE_RE = /^1\d{9}$/;

function assertExternalKind(kind: string | null | undefined): void {
  if (kind !== EXTERNAL_PARTY_KIND) {
    throw new ExternalIntakePartyError(
      400,
      "INVALID_PARTY_KIND",
      "Only external_technician parties are supported.",
    );
  }
}

export function toCompactCard(row: ExternalIntakeParty): ExternalPartyCompactCard {
  assertExternalKind(row.kind);
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    shortAddress: row.shortAddress ?? null,
  };
}

function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new ExternalIntakePartyError(400, "INVALID_NAME", "Name is required.");
  }
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    throw new ExternalIntakePartyError(400, "INVALID_NAME", "Name length is invalid.");
  }
  return name;
}

function sanitizePhone(raw: unknown): { phone: string; phoneNormalized: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new ExternalIntakePartyError(400, "INVALID_PHONE", "Phone is required.");
  }
  const phoneNormalized = normalizePhone(raw);
  if (!phoneNormalized || !BD_MOBILE_RE.test(phoneNormalized)) {
    throw new ExternalIntakePartyError(400, "INVALID_PHONE", "Phone must be a valid mobile number.");
  }
  return { phone: raw.trim(), phoneNormalized };
}

function sanitizeShortAddress(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") {
    throw new ExternalIntakePartyError(400, "INVALID_ADDRESS", "Address is invalid.");
  }
  const a = raw.trim().replace(/\s+/g, " ");
  if (a.length > ADDRESS_MAX) {
    throw new ExternalIntakePartyError(400, "INVALID_ADDRESS", "Address is too long.");
  }
  return a || null;
}

export async function createExternalIntakeParty(input: {
  name: unknown;
  phone: unknown;
  shortAddress?: unknown;
  kind?: unknown;
}): Promise<ExternalPartyCompactCard> {
  if (input.kind !== undefined && input.kind !== null && input.kind !== "") {
    assertExternalKind(String(input.kind));
  }
  const name = sanitizeName(input.name);
  const { phone, phoneNormalized } = sanitizePhone(input.phone);
  const shortAddress = sanitizeShortAddress(input.shortAddress);

  const id = `ext_${nanoid(12)}`;
  try {
    const [row] = await db
      .insert(externalIntakeParties)
      .values({
        id,
        kind: EXTERNAL_PARTY_KIND,
        name,
        phone,
        phoneNormalized,
        shortAddress,
        isActive: true,
      })
      .returning();
    return toCompactCard(row);
  } catch (err: any) {
    if (err?.code === "23505") {
      throw new ExternalIntakePartyError(
        409,
        "PARTY_PHONE_EXISTS",
        "An external technician party with this phone already exists.",
      );
    }
    throw err;
  }
}

export async function searchExternalIntakeParties(qRaw: unknown): Promise<ExternalPartyCompactCard[]> {
  if (typeof qRaw !== "string" || !qRaw.trim()) {
    return [];
  }
  const q = qRaw.trim().slice(0, 80);
  const phoneNorm = normalizePhone(q);
  // Escape LIKE metacharacters; keep other characters (e.g. underscore in tags).
  const escaped = q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const namePattern = `%${escaped}%`;

  const conditions = [eq(externalIntakeParties.isActive, true), eq(externalIntakeParties.kind, EXTERNAL_PARTY_KIND)];

  const matchParts = [
    sql`${externalIntakeParties.name} ILIKE ${namePattern} ESCAPE '\\'`,
  ];
  if (phoneNorm && phoneNorm.length >= 3) {
    matchParts.push(sql`${externalIntakeParties.phoneNormalized} LIKE ${phoneNorm + "%"}`);
  }

  const rows = await db
    .select()
    .from(externalIntakeParties)
    .where(and(...conditions, or(...matchParts)))
    .limit(SEARCH_LIMIT);

  return rows.map(toCompactCard);
}
