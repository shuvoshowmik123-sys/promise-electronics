/**
 * How long a quote stands.
 *
 * Panels, boards and cables are bought from a local market whose prices move
 * week to week. A price quoted today and honoured a month later is a promise
 * made against a cost the shop no longer knows — and refusing it at the counter
 * after the customer has travelled in is the worst possible moment to discover
 * the disagreement. Fifteen days is long enough for a customer to think it over
 * and short enough that the market has not moved underneath it.
 *
 * Fixed rather than configurable, on purpose. A validity the caller passes in is
 * a validity that differs between screens: the quote said seven days on one
 * path and thirty on another, and the customer reads whichever number they were
 * shown. One rule, one number, printed on the quote the customer holds.
 */

export const QUOTE_VALID_DAYS = 15;

/** When a quote sent now stops being honoured. */
export function quoteExpiryFrom(sentAt: Date = new Date()): Date {
    const expires = new Date(sentAt);
    expires.setDate(expires.getDate() + QUOTE_VALID_DAYS);
    return expires;
}

/**
 * Whole days remaining, floored, never negative.
 *
 * Floored so "1 day left" means at least a full day remains — telling somebody
 * they have a day when they have twenty minutes is how a customer arrives to
 * find the price gone.
 */
export function quoteDaysLeft(expiresAt: Date | string | null | undefined, now: Date = new Date()): number | null {
    if (!expiresAt) return null;
    const end = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    if (Number.isNaN(end.getTime())) return null;
    return Math.max(0, Math.floor((end.getTime() - now.getTime()) / 86_400_000));
}

export function isQuoteExpired(expiresAt: Date | string | null | undefined, now: Date = new Date()): boolean {
    if (!expiresAt) return false;
    const end = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    if (Number.isNaN(end.getTime())) return false;
    return now.getTime() > end.getTime();
}

/**
 * What the customer is told, in one line.
 *
 * The wording changes with urgency because "expires in 15 days" and "expires
 * today" should not read the same at a glance.
 */
export function quoteValidityLabel(expiresAt: Date | string | null | undefined, now: Date = new Date()): string {
    if (!expiresAt) return `Valid for ${QUOTE_VALID_DAYS} days`;
    if (isQuoteExpired(expiresAt, now)) return "This quote has expired";
    const left = quoteDaysLeft(expiresAt, now);
    if (left === null) return `Valid for ${QUOTE_VALID_DAYS} days`;
    if (left === 0) return "Expires today";
    if (left === 1) return "Expires tomorrow";
    return `Expires in ${left} days`;
}
