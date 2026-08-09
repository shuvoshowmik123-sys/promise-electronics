/**
 * Reading a television model number without a database.
 *
 * Model numbers encode the brand and the screen size systematically, so most
 * of the time the answer is already in the string the customer typed. That is
 * worth doing before any lookup: it costs nothing, works offline, and covers
 * the international brands without a single row of data.
 *
 * The rule throughout is REMIND, NEVER CORRECT, and the parser is written to
 * be timid rather than clever. It reads only the two positional patterns the
 * major brands actually use, it accepts only numbers that are real television
 * sizes, and where there is any ambiguity it returns nothing and the caller
 * stays quiet.
 *
 * A missed reminder costs nothing. A confident wrong one tells a customer
 * their genuine model is invalid, which is the failure this whole feature
 * exists to prevent.
 */

/** Sizes a television is actually sold in. Anything else is not a size. */
export const TV_SIZES_INCHES = [
  24, 28, 32, 40, 42, 43, 49, 50, 55, 58, 60, 65, 70, 75, 80, 85, 86, 98,
] as const;

const SIZE_SET = new Set<number>(TV_SIZES_INCHES as readonly number[]);

/** UA55AU7700, ua55-au7700 and "UA55 AU7700" are the same television. */
export function normalizeModelInput(raw: unknown): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * The screen size, when the model number states it unambiguously.
 *
 * Two patterns, because these are the two the industry actually uses:
 *   - size first  — 55UP7500PTZ, 43UN7300, 55P615   (LG, TCL, Hisense)
 *   - size after a short letter prefix — UA55AU7700, KDL32W600D (Samsung, Sony)
 *
 * If both patterns fire and disagree, that is not knowledge, it is a coin
 * toss, so nothing is returned.
 */
export function sizeFromModel(raw: unknown): number | null {
  const m = normalizeModelInput(raw);
  if (m.length < 5) return null;

  const found: number[] = [];
  const add = (n: number) => { if (SIZE_SET.has(n) && !found.includes(n)) found.push(n); };

  const lead = m.match(/^(\d{2})(?=[A-Z])/);
  if (lead) add(Number(lead[1]));
  const prefixed = m.match(/^[A-Z]{2,4}(\d{2})(?=[A-Z0-9])/);
  if (prefixed) add(Number(prefixed[1]));

  return found.length === 1 ? found[0]! : null;
}

/**
 * The brand, for the prefixes that are genuinely distinctive.
 *
 * Deliberately short. Walton, Vision, Singer and Konka are absent because
 * their schemes are not regular enough to read safely — those are exactly the
 * brands the learned encyclopedia is for.
 */
export function brandFromModel(raw: unknown): string | null {
  const m = normalizeModelInput(raw);
  if (/^(UA|UE|UN|QA|QN|QE)\d{2}/.test(m)) return "Samsung";
  if (/^(KDL|KD|XR|XBR)\d{2}/.test(m)) return "Sony";
  if (/^\d{2}(UP|UQ|UR|UN|NANO|OLED|QNED)/.test(m)) return "LG";
  return null;
}

/** Looks like a model number at all, rather than prose. */
export function looksLikeModel(raw: unknown): boolean {
  const m = normalizeModelInput(raw);
  return m.length >= 4 && m.length <= 40 && /\d/.test(m);
}
