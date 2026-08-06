import { nanoid } from "nanoid";
import { db } from "./db.js";
import { eq, and, inArray } from "drizzle-orm";
import * as schema from "../shared/schema.js";

import { firebaseAdmin as admin } from './services/firebase.js';
import { getEffectivePermissionsForUser } from './routes/middleware/auth.js';
import { resolveGranularPermission } from '../shared/permission-catalog.js';

/** Staff portal roles that may receive admin push (not Customer / Corporate). */
const STAFF_PORTAL_ROLES = ["Super Admin", "Manager", "Cashier", "Technician", "Driver"] as const;

export interface PushNotificationPayload {
    title: string;
    body: string;
    data?: Record<string, string>;
    icon?: string;
}

// Send push notification to a single device
async function sendToDevice(token: string, payload: PushNotificationPayload): Promise<boolean> {
    try {
        if (!admin.apps.length) {
            console.warn("[Push] Firebase Admin not initialized, skipping push");
            return false;
        }

        await admin.messaging().send({
            token: token,
            notification: {
                title: payload.title,
                body: payload.body,
            },
            data: payload.data || {},
            android: {
                priority: 'high',
                notification: {
                    color: '#0f172a',
                    sound: 'default'
                }
            },
            /**
             * Browser PWA delivery — this was missing entirely.
             *
             * The android block above only governs the native app. Staff use the
             * admin panel as a browser PWA, so their pushes went at FCM's
             * DEFAULT urgency, which browser push services are permitted to
             * batch and hold rather than wake the device for. The result is a
             * notification that arrives late and silently, or only when the app
             * is next opened — exactly the "no sound, nothing happened"
             * symptom.
             *
             * Urgency high asks for immediate delivery. TTL bounds staleness at
             * four hours instead of FCM's four-week default, so nobody opens the
             * app to a pile of yesterday's assignments.
             *
             * The badge must be the monochrome silhouette: Android discards
             * colour and fills every opaque pixel, so a full-colour icon renders
             * as a solid white dot. See client/public/sw.js.
             */
            webpush: {
                headers: {
                    Urgency: 'high',
                    TTL: String(4 * 60 * 60),
                },
                notification: {
                    title: payload.title,
                    body: payload.body,
                    icon: '/logo.png',
                    badge: '/notification-badge.png',
                    requireInteraction: false,
                },
                fcmOptions: payload.data?.url ? { link: String(payload.data.url) } : undefined,
            },
        });

        console.log(`[Push] Notification sent successfully to ${token.substring(0, 20)}...`);
        return true;
    } catch (error: any) {
        console.error("[Push] Error sending notification:", error);

        // If token is invalid, mark it as inactive
        if (error.code === 'messaging/registration-token-not-registered' ||
            error.code === 'messaging/invalid-registration-token') {
            await deactivateToken(token);
        }
        return false;
    }
}

// Send push notification to all devices of a user
export async function sendToUser(userId: string, payload: PushNotificationPayload): Promise<number> {
    const tokens = await db
        .select()
        .from(schema.deviceTokens)
        .where(and(eq(schema.deviceTokens.userId, userId), eq(schema.deviceTokens.isActive, true)));

    let successCount = 0;
    for (const tokenRecord of tokens) {
        const success = await sendToDevice(tokenRecord.token, payload);
        if (success) {
            successCount++;
            // Update last used
            await db
                .update(schema.deviceTokens)
                .set({ lastUsedAt: new Date() })
                .where(eq(schema.deviceTokens.id, tokenRecord.id));
        }
    }

    return successCount;
}

// Register a device token for a user
export async function registerDeviceToken(userId: string, token: string, platform: string = "android"): Promise<void> {
    // Check if token already exists
    const [existing] = await db
        .select()
        .from(schema.deviceTokens)
        .where(eq(schema.deviceTokens.token, token));

    if (existing) {
        // Update existing token (might be for a different user who logged out)
        await db
            .update(schema.deviceTokens)
            .set({
                userId,
                platform,
                isActive: true,
                lastUsedAt: new Date()
            })
            .where(eq(schema.deviceTokens.id, existing.id));
        console.log(`[Push] Updated existing token for user ${userId}`);
    } else {
        // Create new token
        await db
            .insert(schema.deviceTokens)
            .values({
                id: nanoid(),
                userId,
                token,
                platform,
                isActive: true,
            });
        console.log(`[Push] Registered new token for user ${userId}`);
    }
}

// Deactivate a token (e.g., when FCM says it's invalid)
export async function deactivateToken(token: string): Promise<void> {
    await db
        .update(schema.deviceTokens)
        .set({ isActive: false })
        .where(eq(schema.deviceTokens.token, token));
    console.log(`[Push] Deactivated invalid token`);
}

/**
 * Deactivate a token only if it belongs to userId.
 * Returns true when a matching active/inactive row was updated.
 */
export async function deactivateUserOwnedToken(userId: string, token: string): Promise<boolean> {
    const updated = await db
        .update(schema.deviceTokens)
        .set({ isActive: false })
        .where(and(
            eq(schema.deviceTokens.userId, userId),
            eq(schema.deviceTokens.token, token),
        ))
        .returning({ id: schema.deviceTokens.id });
    return updated.length > 0;
}

/**
 * Active device tokens for staff portal users only.
 *
 * Step-3 finding: customer session customerId and admin session adminUserId both
 * point at `users.id` (same table, unique PK). Roles partition the space, so
 * joining device_tokens.user_id → users and filtering staff roles excludes
 * customer tokens without a portal column.
 */
export async function listActiveStaffDeviceTokens(
    requiredPermissions?: string[],
): Promise<string[]> {
    const rows = await db
        .select({
            token: schema.deviceTokens.token,
            role: schema.users.role,
            permissions: schema.users.permissions,
        })
        .from(schema.deviceTokens)
        .innerJoin(schema.users, eq(schema.deviceTokens.userId, schema.users.id))
        .where(and(
            eq(schema.deviceTokens.isActive, true),
            inArray(schema.users.role, [...STAFF_PORTAL_ROLES]),
        ));

    if (!requiredPermissions || requiredPermissions.length === 0) {
        return rows.map((r) => r.token);
    }

    /**
     * Narrow a staff-wide push to the people it concerns.
     *
     * STAFF_PORTAL_ROLES includes Driver, Technician and Cashier, so an
     * unfiltered broadcast buzzed every one of them for every new service
     * request — a driver woken for a walk-in drop-off they will never touch, a
     * technician woken for a pickup. That is not a confidentiality problem
     * (staff may see this data) but it is noise, and constant irrelevant alerts
     * are how people learn to ignore the one that is actually theirs.
     *
     * Filtered in JS rather than SQL because permissions are a JSON column and
     * the precedence rules — Super Admin wildcard, legacy coarse keys,
     * deprecated expansions — already live in resolveGranularPermission. Doing
     * it here means one implementation of the rule, not two.
     */
    return rows
        .filter((r) => {
            const effective = getEffectivePermissionsForUser({
                role: r.role,
                permissions: r.permissions,
            });
            return requiredPermissions.some((p) => resolveGranularPermission(effective, p));
        })
        .map((r) => r.token);
}

// Remove all tokens for a user (on logout)
export async function removeUserTokens(userId: string, token?: string): Promise<void> {
    if (token) {
        // Remove specific token
        await db
            .delete(schema.deviceTokens)
            .where(and(eq(schema.deviceTokens.userId, userId), eq(schema.deviceTokens.token, token)));
    } else {
        // Remove all tokens for user
        await db
            .delete(schema.deviceTokens)
            .where(eq(schema.deviceTokens.userId, userId));
    }
}

// ============ Notification Templates ============

export async function notifyOrderStatusChange(userId: string, ticketNumber: string, newStatus: string): Promise<void> {
    // Exclamation marks and "Check your quote!" were the flagged patterns here.
    // Each line now states what happened, plainly, with no call to action.
    const statusMessages: Record<string, string> = {
        "Request Received": "Promise Electronics has received your repair request.",
        "Technician Assigned": "A technician has been assigned to your repair.",
        "Diagnosis Completed": "Diagnosis is complete. Your quote is in My Repairs.",
        "Repairing": "Your device is now being repaired.",
        "Ready for Delivery": "Your device is repaired and ready for collection or delivery.",
        "Delivered": "Your device has been delivered.",
        "Arriving to Receive": "Our driver is on the way to collect your device.",
        "Parts Pending": "Your repair is waiting on a replacement part.",
    };

    /**
     * Copy is written for Chrome's push spam filter as much as for the reader.
     *
     * Since May 2025 Chrome runs an on-device classifier over web push title
     * and body text on Android, and shows anything it dislikes behind a "may be
     * deceptive" warning. It reacts to exclamation marks, urgency words, vague
     * subjects and "tap to view" phrasing — all of which this file used.
     *
     * The rule applied throughout: name the specific thing (ticket, device,
     * amount) and state a fact. A message that reads like a receipt passes; one
     * that reads like an advertisement does not. It is also simply more useful
     * — "Repair Update: Ready" told the customer nothing their lock screen
     * could act on.
     */
    await sendToUser(userId, {
        title: `Repair ${ticketNumber}`,
        body: statusMessages[newStatus] || `Status updated to ${newStatus}.`,
        data: {
            type: "repair_update",
            ticketNumber,
            status: newStatus,
        },
    });
}

export async function notifyQuoteReady(userId: string, serviceRequestId: string, amount: number): Promise<void> {
    await sendToUser(userId, {
        // Was "Your Quote is Ready!" / "…Tap to view details." — an exclamation
        // mark and a tap-through instruction, two of the filter's clearest
        // triggers. The amount is the useful part, so lead with it.
        title: `Repair quote — ৳${amount.toLocaleString()}`,
        body: `Promise Electronics has priced your repair at ৳${amount.toLocaleString()}. Review it in My Repairs to approve or decline.`,
        data: {
            type: "quote_ready",
            serviceRequestId,
            amount: String(amount),
        },
    });
}

export async function notifyQuoteAccepted(userId: string, ticketNumber: string): Promise<void> {
    await sendToUser(userId, {
        // Was "Thank you! We'll begin working on your repair soon." — no
        // specifics, an exclamation, and a vague promise. Confirmation of a
        // recorded fact reads as transactional.
        title: `Quote approved — ${ticketNumber}`,
        body: `Your approval is recorded. Promise Electronics will begin the repair and update this page as it progresses.`,
        data: {
            type: "repair_update",
            ticketNumber,
        },
    });
}

export async function notifyPromotional(userId: string, title: string, body: string, route?: string): Promise<void> {
    await sendToUser(userId, {
        title,
        body,
        data: {
            type: "promotional",
            route: route || "/native/home",
        },
    });
}

export const pushService = {
    sendToUser,
    sendToDevice,
    registerDeviceToken,
    deactivateToken,
    deactivateUserOwnedToken,
    listActiveStaffDeviceTokens,
    removeUserTokens,
    notifyOrderStatusChange,
    notifyQuoteReady,
    notifyQuoteAccepted,
    notifyPromotional,
};
