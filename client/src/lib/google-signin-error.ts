/**
 * Turn any Google sign-in failure into something a customer can act on.
 *
 * The login page originally surfaced `error.message` directly. That text comes
 * from Firebase or our own API and is written for developers: it can carry
 * provider internals, response bodies, and token or configuration detail. None
 * of it helps someone who wants to sign in, and some of it should not be on a
 * customer's screen at all.
 *
 * So this maps to a closed set of TRANSLATION KEYS and never interpolates the
 * original message. Returning a key rather than a sentence keeps the copy in
 * the customer language system, so these messages appear in Bangla for a Bangla
 * customer like every other string on the page.
 *
 * If a case is not recognised the generic key is correct — an unrecognised
 * error is precisely the one whose text we should not be showing.
 *
 * Input is `unknown` on purpose: rejections are not guaranteed to be Errors,
 * and typing it `any` would let raw fields be read without a check.
 */

export const GOOGLE_SIGNIN_MESSAGE_KEYS = {
    cancelled: "login.googleCancelled",
    popupBlocked: "login.googlePopupBlocked",
    network: "login.googleNetwork",
    accountSetupRequired: "login.googleSetupRequired",
    generic: "login.googleGeneric",
} as const;

export type GoogleSignInMessageKey =
    (typeof GOOGLE_SIGNIN_MESSAGE_KEYS)[keyof typeof GOOGLE_SIGNIN_MESSAGE_KEYS];

/** Read a string field off an unknown value without assuming its shape. */
function readString(value: unknown, key: string): string {
    if (!value || typeof value !== "object") return "";
    const raw = (value as Record<string, unknown>)[key];
    return typeof raw === "string" ? raw : "";
}

export function classifyGoogleSignInError(error: unknown): GoogleSignInMessageKey {
    // Firebase puts the stable identifier on `code`; our API uses `code` too.
    const code = readString(error, "code");
    // `message` is used ONLY for matching, never for display.
    const haystack = `${code} ${readString(error, "message")}`.toLowerCase();

    const has = (needle: string) => haystack.includes(needle);

    // The customer closed the popup, or a second popup superseded the first.
    if (has("popup-closed-by-user") || has("cancelled-popup-request") || has("popup_closed")) {
        return GOOGLE_SIGNIN_MESSAGE_KEYS.cancelled;
    }

    if (has("popup-blocked")) {
        return GOOGLE_SIGNIN_MESSAGE_KEYS.popupBlocked;
    }

    if (
        has("network-request-failed") ||
        has("failed to fetch") ||
        has("networkerror") ||
        has("timeout") ||
        has("timed out")
    ) {
        return GOOGLE_SIGNIN_MESSAGE_KEYS.network;
    }

    // Server refuses sign-in for an account that has never been activated. The
    // customer cannot resolve this themselves, so point them at the shop.
    if (has("account_setup_required")) {
        return GOOGLE_SIGNIN_MESSAGE_KEYS.accountSetupRequired;
    }

    return GOOGLE_SIGNIN_MESSAGE_KEYS.generic;
}
