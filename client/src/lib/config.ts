import { Capacitor } from '@capacitor/core';

/**
 * Environment-aware API configuration for mobile and web
 */

// Check if running in native app
export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'android', 'ios', or 'web'

// API base URL - for native apps, point to production server
// For web, use same-origin (empty string)
export const API_BASE_URL = isNative
    ? 'https://promiseelectronics.com'
    : '';

/**
 * Get the full API URL for a given path
 * @param path - API path (e.g., '/api/users')
 * @returns Full URL for native or relative path for web
 */
export const getApiUrl = (path: string): string => {
    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${API_BASE_URL}${normalizedPath}`;
};

/**
 * App configuration constants
 */
export const APP_CONFIG = {
    appName: 'Promise Electronics',
    appVersion: '1.0.0',
    supportEmail: 'support@promiseelectronics.com',
    supportPhone: '+880 1700-000000',
};
