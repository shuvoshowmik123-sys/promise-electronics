/**
 * FCM Push Notification Service (admin portal).
 *
 * Tokens are persisted in device_tokens via pushService (same path as customers).
 * Staff-only selection joins users on role (see pushService.listActiveStaffDeviceTokens).
 */

import admin from 'firebase-admin';
import {
    registerDeviceToken as persistDeviceToken,
    deactivateToken,
    deactivateUserOwnedToken,
    listActiveStaffDeviceTokens,
} from '../pushService.js';

// Imported for its side effect: services/firebase.ts initializes the default
// Firebase app, and every send below relies on that app existing.
//
// This module used to run a second, independent initializer that looked only
// for server/firebase-service-account.json. That file is gitignored and
// untracked, so it never reaches Render, and the production build copies only
// dist/ anyway — meaning this path always failed there and logged
// "push notifications disabled", which was alarming and wrong. The real
// credential arrives through FIREBASE_SERVICE_ACCOUNT_BASE64 or the Render
// secret file at /etc/secrets, both of which services/firebase.ts handles.
//
// Importing it here also removes an ordering hazard: sends no longer depend on
// some other module having imported firebase.ts first.
import './firebase.js';

interface PushPayload {
    title: string;
    body: string;
    data?: Record<string, string>;
}

/**
 * Persist an admin device token (DB). Replaces the old in-memory Map.
 */
export async function registerAdminDeviceToken(
    userId: string,
    token: string,
    platform: string,
): Promise<void> {
    if (!userId) {
        throw new Error('adminUserId is required to register a push token');
    }
    await persistDeviceToken(userId, token, platform);
    console.log(`[FCM] Registered admin device token for user ${userId}`);
}

/**
 * Deactivate a token only if it belongs to this admin.
 * @returns whether a row was updated
 */
export async function unregisterAdminDeviceToken(userId: string, token: string): Promise<boolean> {
    return deactivateUserOwnedToken(userId, token);
}

/**
 * Active staff-portal device tokens from the database (not customer tokens).
 */
export async function getAllDeviceTokens(requiredPermissions?: string[]): Promise<string[]> {
    return listActiveStaffDeviceTokens(requiredPermissions);
}

/** @deprecated use unregisterAdminDeviceToken for ownership-safe unregister */
export async function unregisterDeviceTokens(tokens: string[]): Promise<void> {
    for (const token of tokens) {
        await deactivateToken(token);
    }
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
            /**
             * The admin panel is a browser PWA, and until now this message
             * carried delivery options for Android only. Web push has its own
             * block, and without it the message goes at FCM's default urgency —
             * which browser push services are permitted to batch and hold
             * rather than wake the device for.
             *
             * Urgency "high" asks for immediate delivery instead of coalescing
             * with whenever the browser next wakes. TTL bounds how long an
             * alert about a NEW repair request is still worth showing: four
             * hours, not FCM's default four weeks, so nobody is greeted by a
             * pile of yesterday's notifications on launch.
             *
             * fcmOptions.link is what makes a click open the right screen.
             */
            webpush: {
                headers: {
                    Urgency: 'high',
                    TTL: String(4 * 60 * 60),
                },
                notification: {
                    title: payload.title,
                    body: payload.body,
                    icon: '/notification-icon.png',
                    // Monochrome silhouette, not favicon.png. Android discards colour
                    // in the badge and fills every opaque pixel, so the full-colour
                    // favicon rendered as a solid white dot. An FCM message carrying
                    // its own webpush.notification bypasses the service worker, so
                    // fixing sw.js alone did not cover this path.
                    badge: '/notification-badge.png',
                    requireInteraction: false,
                },
                fcmOptions: payload.data?.url ? { link: payload.data.url } : undefined,
            },
        };

        await admin.messaging().send(message);
        console.log('[FCM] Push sent');
        return true;
    } catch {
        console.error('[FCM] Push failed');
        return false;
    }
}

/**
 * Send push notification to all registered admin/staff devices
 */
export async function sendPushToAllAdmins(
    payload: PushPayload,
    requiredPermissions?: string[],
): Promise<number> {
    if (!admin.apps.length) {
        console.log('[FCM] Firebase not initialized, skipping push');
        return 0;
    }

    const tokens = await getAllDeviceTokens(requiredPermissions);

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
            /**
             * The admin panel is a browser PWA, and until now this message
             * carried delivery options for Android only. Web push has its own
             * block, and without it the message goes at FCM's default urgency —
             * which browser push services are permitted to batch and hold
             * rather than wake the device for.
             *
             * Urgency "high" asks for immediate delivery instead of coalescing
             * with whenever the browser next wakes. TTL bounds how long an
             * alert about a NEW repair request is still worth showing: four
             * hours, not FCM's default four weeks, so nobody is greeted by a
             * pile of yesterday's notifications on launch.
             *
             * fcmOptions.link is what makes a click open the right screen.
             */
            webpush: {
                headers: {
                    Urgency: 'high',
                    TTL: String(4 * 60 * 60),
                },
                notification: {
                    title: payload.title,
                    body: payload.body,
                    icon: '/notification-icon.png',
                    // Monochrome silhouette, not favicon.png. Android discards colour
                    // in the badge and fills every opaque pixel, so the full-colour
                    // favicon rendered as a solid white dot. An FCM message carrying
                    // its own webpush.notification bypasses the service worker, so
                    // fixing sw.js alone did not cover this path.
                    badge: '/notification-badge.png',
                    requireInteraction: false,
                },
                fcmOptions: payload.data?.url ? { link: payload.data.url } : undefined,
            },
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`[FCM] Push sent to ${response.successCount}/${tokens.length} devices`);

        // Clean up invalid tokens in the database
        if (response.failureCount > 0) {
            const invalidTokens: string[] = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    // The error code is the whole diagnosis when push "does not
                    // work": registration-token-not-registered means the browser
                    // dropped the subscription, invalid-argument means the
                    // message shape was wrong, third-party-auth-error means the
                    // VAPID key does not match the project. Without it, a
                    // failure was indistinguishable from a delivery that simply
                    // never displayed.
                    console.error(
                        `[FCM] Send failed for token ${idx + 1}/${tokens.length}:`,
                        (resp.error as any)?.code || resp.error?.message || 'unknown',
                    );
                    invalidTokens.push(tokens[idx]);
                }
            });
            if (invalidTokens.length > 0) {
                for (const t of invalidTokens) {
                    await deactivateToken(t);
                }
                console.log(`[FCM] Deactivated ${invalidTokens.length} invalid tokens`);
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
    /**
     * Who this concerns. Without it the push reaches every staff device,
     * including drivers and technicians with no involvement in the event.
     */
    requiredPermissions?: string[];
}): Promise<void> {
    await sendPushToAllAdmins({
        title: payload.title,
        body: payload.body,
        data: {
            type: payload.type,
            ...payload.data,
        },
    }, payload.requiredPermissions);
}
