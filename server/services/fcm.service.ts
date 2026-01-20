/**
 * FCM Push Notification Service
 * 
 * Handles sending push notifications to admin devices via Firebase Cloud Messaging.
 */

import admin from 'firebase-admin';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In-memory storage for device tokens
// In production, you might want to use Redis or persist to database
const adminDeviceTokens: Map<string, { token: string; platform: string; userId: string }> = new Map();

// Check if Firebase Admin is already initialized
if (!admin.apps.length) {
    const serviceAccountPath = join(__dirname, '..', 'firebase-service-account.json');

    if (existsSync(serviceAccountPath)) {
        try {
            const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
            console.log('[FCM] Firebase Admin initialized with service account');
        } catch (e: any) {
            console.error('[FCM] Failed to initialize Firebase Admin:', e.message);
        }
    } else {
        console.log('[FCM] firebase-service-account.json not found - push notifications disabled');
    }
}

interface PushPayload {
    title: string;
    body: string;
    data?: Record<string, string>;
}

/**
 * Register a device token for push notifications
 */
export function registerDeviceToken(userId: string, token: string, platform: string): void {
    adminDeviceTokens.set(token, { token, platform, userId });
    console.log(`[FCM] Registered token for user ${userId}, total tokens: ${adminDeviceTokens.size}`);
}

/**
 * Unregister device tokens
 */
export function unregisterDeviceTokens(tokens: string[]): void {
    for (const token of tokens) {
        adminDeviceTokens.delete(token);
    }
    console.log(`[FCM] Unregistered ${tokens.length} tokens, remaining: ${adminDeviceTokens.size}`);
}

/**
 * Get all registered device tokens
 */
export function getAllDeviceTokens(): string[] {
    return Array.from(adminDeviceTokens.values()).map(t => t.token);
}

/**
 * Send push notification to a specific device token
 */
export async function sendPushToDevice(token: string, payload: PushPayload): Promise<boolean> {
    if (!admin.apps.length) {
        console.log('[FCM] Firebase not initialized, skipping push');
        return false;
    }

    try {
        const message: admin.messaging.Message = {
            token,
            notification: {
                title: payload.title,
                body: payload.body,
            },
            data: payload.data,
            android: {
                priority: 'high',
                notification: {
                    channelId: 'admin_notifications',
                    priority: 'high',
                    defaultSound: true,
                },
            },
        };

        const response = await admin.messaging().send(message);
        console.log('[FCM] Push sent:', response);
        return true;
    } catch (error: any) {
        console.error('[FCM] Push failed:', error.message);
        return false;
    }
}

/**
 * Send push notification to all registered admin devices
 */
export async function sendPushToAllAdmins(payload: PushPayload): Promise<number> {
    if (!admin.apps.length) {
        console.log('[FCM] Firebase not initialized, skipping push');
        return 0;
    }

    const tokens = getAllDeviceTokens();

    if (tokens.length === 0) {
        console.log('[FCM] No admin device tokens registered');
        return 0;
    }

    try {
        const message: admin.messaging.MulticastMessage = {
            tokens,
            notification: {
                title: payload.title,
                body: payload.body,
            },
            data: payload.data,
            android: {
                priority: 'high',
                notification: {
                    channelId: 'admin_notifications',
                    priority: 'high',
                    defaultSound: true,
                },
            },
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`[FCM] Push sent to ${response.successCount}/${tokens.length} devices`);

        // Clean up invalid tokens
        if (response.failureCount > 0) {
            const invalidTokens: string[] = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    invalidTokens.push(tokens[idx]);
                }
            });
            if (invalidTokens.length > 0) {
                unregisterDeviceTokens(invalidTokens);
                console.log(`[FCM] Removed ${invalidTokens.length} invalid tokens`);
            }
        }

        return response.successCount;
    } catch (error: any) {
        console.error('[FCM] Multicast push failed:', error.message);
        return 0;
    }
}

/**
 * Helper to send admin notification with FCM
 */
export async function notifyAdminsWithPush(payload: {
    type: string;
    title: string;
    body: string;
    data?: Record<string, string>;
}): Promise<void> {
    await sendPushToAllAdmins({
        title: payload.title,
        body: payload.body,
        data: {
            type: payload.type,
            ...payload.data,
        },
    });
}
