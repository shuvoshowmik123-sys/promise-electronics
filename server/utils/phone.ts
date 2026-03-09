/**
 * Normalizes a phone number to the last 10 digits.
 * Removes all non-numeric characters.
 * Handles +880, 880, and leading 0 prefixes.
 * 
 * @param phone The raw phone number string
 * @returns The last 10 digits or empty string if invalid
 */
export function normalizePhone(phone: string | null | undefined): string | null {
    if (!phone) return null;

    // Remove all non-numeric characters
    let digits = phone.replace(/\D/g, '');

    // Handle prefixes
    if (digits.startsWith('880')) {
        digits = digits.slice(3);
    }
    if (digits.startsWith('0')) {
        digits = digits.slice(1);
    }

    // Return last 10 digits if we have at least 10, otherwise just return what we have (though it might be invalid)
    // For strict 10 digit enforcement:
    if (digits.length > 10) {
        return digits.slice(-10);
    }

    return digits || null;
}
