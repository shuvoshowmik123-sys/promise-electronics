/**
 * Phone helpers that mirror server/utils/phone.ts.
 *
 * The server stores `phone_normalized` as the last 10 digits with any +880,
 * 880 or leading 0 removed, and login resolves accounts against that column.
 * The client needs the same rule to answer one question honestly: "is the
 * number in this form the same number the account already has?"
 *
 * Getting that wrong is not cosmetic. The desktop repair form keeps its input
 * stripped of the country code and compared it directly against the stored
 * "+8801712345678", so the two were never equal, every submission counted as a
 * change, and the account phone was rewritten with the bare local part.
 */

/** Last 10 digits, prefixes removed. Returns "" when there is nothing usable. */
export function normalizeLocalPhone(raw: string | null | undefined): string {
    if (!raw) return "";

    let digits = String(raw).replace(/\D/g, "");
    if (digits.startsWith("880")) digits = digits.slice(3);
    if (digits.startsWith("0")) digits = digits.slice(1);

    return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * True when both values denote the same subscriber number, regardless of how
 * either one is written. Two blanks are NOT "the same number" — an absent phone
 * is not a match, it is an absence.
 */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
    const left = normalizeLocalPhone(a);
    const right = normalizeLocalPhone(b);
    if (!left || !right) return false;
    return left === right;
}

/** Storage/display form used everywhere else in the system. */
export function toE164Bd(raw: string | null | undefined): string | null {
    const local = normalizeLocalPhone(raw);
    return local ? `+880${local}` : null;
}
