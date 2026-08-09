/**
 * What the customer already told the fault simulator, on its way to the form.
 *
 * The service request form and the homepage simulator are two screens with one
 * conversation between them. Anything the customer answered on the first must
 * arrive filled in on the second, or the form reads as having lost it — and a
 * customer who is asked twice stops believing the first answer went anywhere.
 *
 * Read by both the mobile wizard and the desktop form so the two cannot drift.
 */

export type CarriedAnswers = {
  /** The Settings symptom row — what the form's card list selects by. */
  issue: string | null;
  /** The finer label, e.g. "Horizontal Lines" where issue is "Lines on Screen". */
  detail: string | null;
  brand: string | null;
  size: string | null;
  model: string | null;
  /** What the customer answered to the one diagnostic question. */
  answer: string | null;
  /** The range shown on the homepage, as [low, high] in taka. */
  estimate: [number, number] | null;
};

export const EMPTY_CARRIED: CarriedAnswers = {
  issue: null, detail: null, brand: null, size: null, model: null, answer: null, estimate: null,
};

const clean = (v: string | null): string | null => {
  if (v == null) return null;
  const s = decodeURIComponent(v).trim();
  // A query string is customer-controlled and lands in a record staff read.
  return s.length > 0 && s.length <= 120 ? s : null;
};

export function readCarriedAnswers(search: string): CarriedAnswers {
  const p = new URLSearchParams(search);
  const est = clean(p.get("est"));
  let estimate: [number, number] | null = null;
  if (est) {
    const [lo, hi] = est.split("-").map((n) => Number.parseInt(n, 10));
    // Only a sane, ordered pair. A hand-edited URL must not put an invented
    // price in front of a customer or into the record staff quote against.
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi >= lo && hi <= 1_000_000) {
      estimate = [lo, hi];
    }
  }
  return {
    issue: clean(p.get("issue")),
    detail: clean(p.get("detail")),
    brand: clean(p.get("brand")),
    size: clean(p.get("size")),
    model: clean(p.get("model")),
    answer: clean(p.get("answer")),
    estimate,
  };
}

export const hasCarriedAnswers = (c: CarriedAnswers): boolean =>
  Boolean(c.issue || c.brand || c.size || c.model);

export const formatTaka = (n: number): string => `৳${n.toLocaleString("en-US")}`;

/**
 * The facts, as lines for the request's `symptoms` column.
 *
 * They go there rather than into the free-text notes box because the customer
 * owns that box and can clear it. Losing the detail line would lose the
 * vertical-versus-horizontal distinction, which is the difference between a
 * T-Con repair and a new panel, and losing the estimate line would leave the
 * counter arguing from memory about a number the customer can still see on
 * their phone.
 *
 * `symptoms` is an existing text column holding a JSON array of strings, so
 * this needs no migration.
 */
export function carriedAsSymptomLines(c: CarriedAnswers): string[] {
  const lines: string[] = [];
  if (c.detail) lines.push(`Reported on the website: ${c.detail}`);
  if (c.answer) lines.push(`Customer's answer: ${c.answer}`);
  if (c.estimate) {
    lines.push(`Estimate shown online: ${formatTaka(c.estimate[0])} – ${formatTaka(c.estimate[1])} (before inspection)`);
  }
  return lines;
}
