/**
 * redact.ts - Utility for masking sensitive information in server logs.
 */

const SENSITIVE_KEYS = [
    'password',
    'token',
    'secret',
    'authorization',
    'refreshtoken',
    'accesstoken',
    'email',
    'phone',
    'portalpassword',
    'creditcard',
    'cvv'
];

/**
 * Deeply clones and redacts sensitive keys from an object or array.
 * @param data The data to redact
 * @returns Redacted data
 */
export function redactLogData(data: any): any {
    if (data === null || data === undefined) return data;

    if (Array.isArray(data)) {
        return data.map(item => redactLogData(item));
    }

    if (typeof data === 'object') {
        const redacted: Record<string, any> = {};
        for (const [key, value] of Object.entries(data)) {
            const lowerKey = key.toLowerCase();
            if (SENSITIVE_KEYS.some(k => lowerKey.includes(k))) {
                redacted[key] = '[REDACTED]';
            } else {
                redacted[key] = redactLogData(value);
            }
        }
        return redacted;
    }

    return data;
}
