import { Preferences } from '@capacitor/preferences';

const AUTH_KEY = 'promise_auth_session';

interface StoredAuth {
    customerId: string;
    phone: string;
    timestamp: number;
}

/**
 * Store authentication data persistently using Capacitor Preferences.
 * This data survives app restarts.
 */
export async function storeAuthSession(customerId: string, phone: string): Promise<void> {
    const data: StoredAuth = {
        customerId,
        phone,
        timestamp: Date.now(),
    };
    await Preferences.set({
        key: AUTH_KEY,
        value: JSON.stringify(data),
    });
}

/**
 * Retrieve stored authentication data.
 * Returns null if no auth data is stored or if it's invalid.
 */
export async function getStoredAuthSession(): Promise<StoredAuth | null> {
    try {
        const { value } = await Preferences.get({ key: AUTH_KEY });
        if (!value) return null;

        const data: StoredAuth = JSON.parse(value);

        // Optional: Check if session is too old (e.g., 7 days)
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - data.timestamp > sevenDaysMs) {
            await clearAuthSession();
            return null;
        }

        return data;
    } catch {
        return null;
    }
}

/**
 * Clear stored authentication data (used on logout).
 */
export async function clearAuthSession(): Promise<void> {
    await Preferences.remove({ key: AUTH_KEY });
}

/**
 * Check if there's a stored auth session.
 */
export async function hasStoredAuthSession(): Promise<boolean> {
    const session = await getStoredAuthSession();
    return session !== null;
}
