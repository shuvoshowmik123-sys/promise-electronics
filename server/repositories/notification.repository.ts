/**
 * Notification Repository
 * 
 * Handles all database operations for:
 * - In-app notifications
 * - Device tokens for push notifications
 */

import { db, nanoid, eq, desc, and, schema, type Notification, type InsertNotification } from './base.js';
import type { DeviceToken, InsertDeviceToken } from '../../shared/schema.js';

// ============================================
// Notification Queries
// ============================================

export async function getNotifications(userId: string): Promise<Notification[]> {
    return db.select().from(schema.notifications)
        .where(eq(schema.notifications.userId, userId))
        .orderBy(desc(schema.notifications.createdAt));
}

export async function getUnreadNotifications(userId: string): Promise<Notification[]> {
    return db.select().from(schema.notifications)
        .where(and(
            eq(schema.notifications.userId, userId),
            eq(schema.notifications.read, false)
        ))
        .orderBy(desc(schema.notifications.createdAt));
}

export async function getNotification(id: string): Promise<Notification | undefined> {
    const [notification] = await db.select().from(schema.notifications)
        .where(eq(schema.notifications.id, id));
    return notification;
}

// ============================================
// Notification Mutations
// ============================================

export async function createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db.insert(schema.notifications)
        .values({ ...notification, id: nanoid() })
        .returning();
    return newNotification;
}

export async function markNotificationAsRead(id: string): Promise<Notification | undefined> {
    const [updated] = await db
        .update(schema.notifications)
        .set({ read: true })
        .where(eq(schema.notifications.id, id))
        .returning();
    return updated;
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
    await db
        .update(schema.notifications)
        .set({ read: true })
        .where(eq(schema.notifications.userId, userId));
}

export async function deleteNotification(id: string): Promise<boolean> {
    const result = await db.delete(schema.notifications).where(eq(schema.notifications.id, id));
    return (result.rowCount ?? 0) > 0;
}

// ============================================
// Device Token Operations (Push Notifications)
// ============================================

export async function getDeviceTokensByUserId(userId: string): Promise<DeviceToken[]> {
    return db.select().from(schema.deviceTokens)
        .where(and(
            eq(schema.deviceTokens.userId, userId),
            eq(schema.deviceTokens.isActive, true)
        ));
}

export async function getDeviceToken(token: string): Promise<DeviceToken | undefined> {
    const [deviceToken] = await db.select().from(schema.deviceTokens)
        .where(eq(schema.deviceTokens.token, token));
    return deviceToken;
}

export async function registerDeviceToken(data: InsertDeviceToken): Promise<DeviceToken> {
    // Check if token already exists
    const existing = await getDeviceToken(data.token);

    if (existing) {
        // Update existing token (may have changed user or needs reactivation)
        const [updated] = await db
            .update(schema.deviceTokens)
            .set({
                userId: data.userId,
                platform: data.platform,
                isActive: true,
                lastUsedAt: new Date(),
            })
            .where(eq(schema.deviceTokens.token, data.token))
            .returning();
        return updated;
    }

    // Insert new token
    const [newToken] = await db.insert(schema.deviceTokens)
        .values({ ...data, id: nanoid() })
        .returning();
    return newToken;
}

export async function deactivateDeviceToken(token: string): Promise<boolean> {
    const result = await db
        .update(schema.deviceTokens)
        .set({ isActive: false })
        .where(eq(schema.deviceTokens.token, token));
    return (result.rowCount ?? 0) > 0;
}

export async function updateDeviceTokenLastUsed(token: string): Promise<void> {
    await db
        .update(schema.deviceTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(schema.deviceTokens.token, token));
}
