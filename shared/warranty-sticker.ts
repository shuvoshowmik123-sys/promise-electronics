/**
 * Warranty stickers: proof that a repair is ours.
 *
 * The shop's problem is a customer arriving with a television claiming a
 * warranty repair that was never done here, or done here on a different set.
 * The answer is a sticker carrying a code the shop can check, and the whole
 * value of it rests on that code being impossible to invent. "Job 4471" printed
 * on a label is not evidence — anyone can print a label with a number on it.
 *
 * Two stickers go on every repair and they carry DIFFERENT codes:
 *
 *   outer   on the back of the set, visible, usually across a seam or screw
 *   inner   beside the actual repair, only seen when the set is opened
 *
 * Same job, two codes, on purpose. One code on both would only ever answer
 * "this is job X". Two answers a sharper question: if the outer sticker scans
 * to one job and the hidden one scans to another, a sticker has been moved
 * between televisions, and that is exactly the fraud this exists to catch.
 */

export const STICKER_PLACEMENTS = ["outer", "inner"] as const;
export type StickerPlacement = (typeof STICKER_PLACEMENTS)[number];

export const PLACEMENT_LABEL: Record<StickerPlacement, string> = {
  outer: "Outside the TV",
  inner: "Inside, at the repair",
};

/**
 * The alphabet a code is drawn from.
 *
 * No 0/O, no 1/I/L. A warranty sticker gets read off a scratched panel in bad
 * light and sometimes typed by hand when the camera will not focus, and a code
 * that cannot survive being read aloud is a code that generates false
 * accusations of fraud.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Long enough that guessing is hopeless: 31^12 is about 7.8e17. */
export const CODE_LENGTH = 12;

export const STICKER_CODE_PATTERN = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

/**
 * A code, from crypto-grade randomness.
 *
 * Math.random() is seeded from the clock and is predictable given a few
 * samples; a forger who can predict the next code can print a sticker before
 * the shop does. The caller supplies the bytes so this stays usable on both
 * sides without importing node:crypto into the browser.
 */
export function codeFromBytes(bytes: Uint8Array | number[]): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    // Modulo bias across 31 symbols from a 256-value byte is under 1%, which
    // costs a fraction of a bit against an 18-digit search space.
    out += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length];
  }
  return out;
}

/** Grouped for a human to read aloud: XXXX-XXXX-XXXX. */
export function formatCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1-");
}

/** Accepts what a person types: spaces, dashes, lower case. */
export function normaliseCode(raw: unknown): string {
  return String(raw ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export type ScanResult =
  /** The code is ours and points at a job. */
  | "genuine"
  /** Well-formed but not in our records — a forgery, or a misread. */
  | "unknown"
  /** Ours, but the sticker was voided when the job was re-stickered. */
  | "voided";

/**
 * Whether a warranty is still live on a given day.
 *
 * Service and parts cover run separately and expire separately — a fitted panel
 * can still be covered months after the labour warranty has lapsed — so a
 * single yes/no would refuse claims the published terms allow.
 */
export function warrantyStanding(
  job: {
    warrantyExpiryDate?: Date | string | null;
    partsWarrantyExpiryDate?: Date | string | null;
    gracePeriodDays?: number | null;
  },
  now: Date = new Date(),
): { service: boolean; parts: boolean; any: boolean; serviceUntil: Date | null; partsUntil: Date | null } {
  const at = (v: Date | string | null | undefined): Date | null => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  // The grace period is part of what the shop promised, so it belongs in the
  // answer the counter reads rather than in somebody's head.
  const graceMs = Math.max(0, Number(job.gracePeriodDays ?? 0)) * 24 * 60 * 60 * 1000;
  const serviceUntil = at(job.warrantyExpiryDate);
  const partsUntil = at(job.partsWarrantyExpiryDate);
  const service = serviceUntil !== null && now.getTime() <= serviceUntil.getTime() + graceMs;
  const parts = partsUntil !== null && now.getTime() <= partsUntil.getTime() + graceMs;
  return { service, parts, any: service || parts, serviceUntil, partsUntil };
}

/**
 * Does this job deserve stickers at all?
 *
 * Stickers are issued automatically wherever there is cover to prove, because
 * the day somebody forgets is the day a fraudster gets a free claim. A job that
 * carries no warranty has nothing to prove and gets nothing.
 */
export function jobCarriesWarranty(job: {
  warrantyDays?: number | null;
  partsWarrantyDays?: number | null;
  warrantyExpiryDate?: Date | string | null;
  partsWarrantyExpiryDate?: Date | string | null;
}): boolean {
  return Boolean(
    (job.warrantyDays && job.warrantyDays > 0) ||
    (job.partsWarrantyDays && job.partsWarrantyDays > 0) ||
    job.warrantyExpiryDate ||
    job.partsWarrantyExpiryDate,
  );
}
