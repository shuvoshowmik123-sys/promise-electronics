/**
 * Warranty periods the counter may promise.
 *
 * One definition shared by the till, the settings screen and the billing
 * service, because these three disagreeing is how a customer ends up told six
 * months and issued one.
 *
 * Months, not days: months are the unit the shop quotes in and the customer
 * remembers. Days are an implementation detail of the expiry clock.
 *
 * Parts run to six months — a replaced panel is a new component and is covered
 * like one. Service is capped at three, because it covers workmanship on the
 * specific fault repaired rather than the television as a whole. A different
 * fault later is chargeable, at a discount the shop decides case by case; that
 * judgement is deliberately NOT encoded here.
 *
 * "No warranty" is a real answer and must stay selectable. Some repairs carry
 * none, and forcing a period would put a promise on the record that nobody
 * made.
 */

export const WARRANTY_SETTING_KEYS = {
    partsMonths: "warranty.partsMonthOptions",
    serviceMonths: "warranty.serviceMonthOptions",
} as const;

/** 1–6 months for parts. */
export const DEFAULT_PARTS_MONTH_OPTIONS = [1, 2, 3, 4, 5, 6];

/** 1–3 months for service — workmanship on what was actually repaired. */
export const DEFAULT_SERVICE_MONTH_OPTIONS = [1, 2, 3];

/** Hard ceiling, so a bad settings value cannot mint years of cover. */
export const MAX_WARRANTY_MONTHS = 12;

/**
 * Read an option list out of the settings key/value store.
 *
 * Falls back to the defaults on anything unexpected. A malformed setting must
 * leave the counter able to promise a warranty, not present an empty list.
 */
export function parseMonthOptions(raw: string | null | undefined, fallback: number[]): number[] {
    if (!raw) return fallback;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return fallback;
        const months = parsed
            .map((v) => Number(v))
            .filter((v) => Number.isInteger(v) && v > 0 && v <= MAX_WARRANTY_MONTHS);
        return months.length > 0 ? Array.from(new Set(months)).sort((a, b) => a - b) : fallback;
    } catch {
        return fallback;
    }
}

/** How a period reads to a human. Used on the till and the customer's card. */
export function formatWarrantyMonths(months: number | null | undefined): string {
    const n = Number(months);
    if (!Number.isFinite(n) || n <= 0) return "No warranty";
    return n === 1 ? "1 month" : `${n} months`;
}
