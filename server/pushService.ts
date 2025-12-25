import { nanoid } from "nanoid";
import { db } from "./db.js";
import { eq, and } from "drizzle-orm";
import * as schema from "../shared/schema.js";

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface PushNotificationPayload {
    title: string;
    body: string;
    data?: Record<string, string>;
    icon?: string;
}

// Initialize Firebase Admin
try {
    // Check if already initialized to avoid errors on hot reload
    if (!admin.apps.length) {
        const serviceAccountPath = join(process.cwd(), 'server', 'service-account.json');
        const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("[Push] Firebase Admin initialized successfully");
    }
} catch (error) {
    console.error("[Push] Failed to initialize Firebase Admin:", error);
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
            }
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
    const statusMessages: Record<string, string> = {
        "Request Received": "Your repair request has been received.",
        "Technician Assigned": "A technician has been assigned to your repair.",
        "Diagnosis Completed": "Diagnosis is complete. Check your quote!",
        "Repairing": "Your device is now being repaired.",
        "Ready for Delivery": "Your device is ready for pickup/delivery!",
        "Delivered": "Your device has been delivered. Thank you!",
        "Arriving to Receive": "Our team is on the way to pick up your device.",
        "Parts Pending": "We're waiting for parts to arrive for your repair.",
    };

    await sendToUser(userId, {
        title: `Repair Update: ${newStatus}`,
        body: statusMessages[newStatus] || `Your repair status is now: ${newStatus}`,
        data: {
            type: "repair_update",
            ticketNumber,
            status: newStatus,
        },
    });
}

export async function notifyQuoteReady(userId: string, serviceRequestId: string, amount: number): Promise<void> {
    await sendToUser(userId, {
        title: "Your Quote is Ready!",
        body: `Estimated cost: ৳${amount.toLocaleString()}. Tap to view details.`,
        data: {
            type: "quote_ready",
            serviceRequestId,
            amount: String(amount),
        },
    });
}

export async function notifyQuoteAccepted(userId: string, ticketNumber: string): Promise<void> {
    await sendToUser(userId, {
        title: "Quote Accepted",
        body: "Thank you! We'll begin working on your repair soon.",
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
    removeUserTokens,
    notifyOrderStatusChange,
    notifyQuoteReady,
    notifyQuoteAccepted,
    notifyPromotional,
};
