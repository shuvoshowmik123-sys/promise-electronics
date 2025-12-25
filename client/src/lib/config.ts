import { Capacitor } from '@capacitor/core';

/**
 * Environment-aware API configuration for mobile and web
 */

// Check if running in native app
export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'android', 'ios', or 'web'

// Detect if we're in production build
const isProduction = import.meta.env.PROD;

/**
 * API Base URL Configuration
 * 
 * Development:
 *   - Web Browser: http://localhost:5083 (via Vite proxy, use empty string)
 *   - Android Emulator: http://10.0.2.2:5083 (special alias for host machine)
 *   - Physical Device: http://YOUR_IP:5083 (replace with your local IP)
 * 
 * Production:
 *   - All platforms: https://promiseelectronics.com
 */

// Development URLs
const DEV_API_URL_EMULATOR = 'http://10.0.2.2:5083'; // Android Emulator
const DEV_API_URL_WEB = ''; // Web uses Vite proxy

// Production URL
const PROD_API_URL = 'https://promiseelectronics.com';

// Determine the correct API URL
const getApiBaseUrl = (): string => {
    if (isProduction) {
        // Production build - always use production URL
        return isNative ? PROD_API_URL : '';
    }

    // Development build
    if (isNative) {
        // Native app in dev mode - use emulator URL
        // For physical device testing, change this to your computer's IP
        // e.g., 'http://192.168.0.103:5083'
        return DEV_API_URL_EMULATOR;
    }

    // Web in dev mode - use Vite proxy (empty string)
    return DEV_API_URL_WEB;
};

export const API_BASE_URL = getApiBaseUrl();

// Log configuration on startup (development only)
if (!isProduction) {
    console.log(`[Config] Platform: ${platform}`);
    console.log(`[Config] Native: ${isNative}`);
    console.log(`[Config] API Base URL: ${API_BASE_URL || '(same-origin)'}`);
}

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
    appName: 'TV ডাক্তার',
    appVersion: '1.0.0',
    supportEmail: 'support@promiseelectronics.com',
    supportPhone: '+880 1700-000000',
};
