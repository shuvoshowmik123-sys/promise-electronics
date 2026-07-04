import type { Notification, ServiceRequest } from "../../shared/schema.js";
import type { AdminNotificationItem } from "../../shared/types/admin-notifications.js";
import { notificationRepo, serviceRequestRepo } from "../repositories/index.js";
import { getEffectivePermissionsForUser } from "../routes/middleware/auth.js";
import { LEGACY_TO_GRANULAR } from "../../shared/permission-catalog.js";

const STORED_NOTIFICATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type AdminNotificationFeedDeps = {
    listServiceRequests: () => Promise<ServiceRequest[]>;
    listUnreadNotifications: (userId: string) => Promise<Notification[]>;
    now: () => Date;
};

type FeedUser = { role: string; permissions?: string | null };

/**
 * Returns true when the user holds ANY of the provided permission keys,
 * supporting both legacy broad keys (e.g. "serviceRequests") and
 * granular dotted keys (e.g. "serviceRequests.view").
 *
 * Resolution order per key:
 *   1. Direct match in effectivePermissions
 *   2. A legacy key whose LEGACY_TO_GRANULAR expansion covers this granular key
 */
function hasAnyPermission(perms: Record<string, any>, keys: string[]): boolean {
    if (perms['*']) return true;
    for (const key of keys) {
        if (perms[key]) return true;
        // If `key` is granular, check whether user holds a legacy key that expands to it
        for (const [legacyKey, granularKeys] of Object.entries(LEGACY_TO_GRANULAR)) {
            if (Array.isArray(granularKeys) && granularKeys.includes(key) && perms[legacyKey]) return true;
        }
    }
    return false;
}

function canSeeNotificationItem(
    user: FeedUser,
    item: AdminNotificationItem,
    currentUserId?: string,
): boolean {
    const perms = getEffectivePermissionsForUser(user);
    if (perms['*']) return true;  // Super Admin sees everything

    const type = item.type || '';
    const isBroadcast = !item.userId || item.userId === 'broadcast';
    const isPersonal = !!currentUserId && !!item.userId && item.userId === currentUserId;

    // system_alert: Super Admin only, regardless of recipient
    if (type === 'system_alert') return false;

    // Personal (notification explicitly addressed to the current user): always show
    if (isPersonal) return true;

    // ── Broadcast / unknown-owner items from here ──

    // Service request feed items (virtual + stored)
    if (item.source === 'service_request'
        || type === 'service_request'
        || type === 'repair') {
        return hasAnyPermission(perms, [
            'serviceRequests',
            'serviceRequests.view', 'serviceRequests.reply', 'serviceRequests.logCall',
            'serviceRequests.quote', 'serviceRequests.transitionStage', 'serviceRequests.convertToJob',
        ]);
    }

    // Job-related
    if (['job_ready', 'smart_sync_needed', 'job'].includes(type) || !!item.jobId) {
        return hasAnyPermission(perms, [
            'jobs',
            'jobs.view', 'jobs.create', 'jobs.assignTechnician',
            'jobs.reportOutcome', 'jobs.advanceStatus', 'jobs.edit',
        ]);
    }

    // order_update — jobs or service-requests
    if (type === 'order_update') {
        return hasAnyPermission(perms, [
            'serviceRequests', 'serviceRequests.view',
            'jobs', 'jobs.view',
        ]);
    }

    // Finance / drawer / payment alerts
    if (['payment_verified', 'payment_rejected', 'manual-payment', 'customer_payment_submitted'].includes(type)) {
        return hasAnyPermission(perms, [
            'finance', 'finance.view',
            'pos', 'pos.view',
            'process_payment', 'view_financials',
        ]);
    }
    if (type === 'alert' && !item.jobId) {
        return hasAnyPermission(perms, [
            'finance', 'finance.view',
            'pos', 'pos.view',
            'process_payment', 'view_financials',
        ]);
    }

    // Inventory / low stock (broadcast)
    if (type === 'low_stock') {
        return hasAnyPermission(perms, [
            'inventory',
            'inventory.view', 'inventory.addItem', 'inventory.editItem', 'inventory.adjustStock',
        ]);
    }

    // Payroll / leave — always personal to recipients; if somehow broadcast, Super Admin only
    if (type === 'payroll') return false;

    // Attendance warnings (outside check-in, off-site alerts)
    if (type === 'attendance_exception'
        || (type === 'warning' && !!(item.link?.includes('attendance')))) {
        return hasAnyPermission(perms, ['attendance', 'attendance.view']);
    }

    // Corporate notifications
    if (type === 'corporate_notification') {
        return hasAnyPermission(perms, ['corporate', 'corporate.view', 'corporate.manageClients']);
    }

    // Unknown broadcast notification → Super Admin only (wildcard handled at top)
    if (isBroadcast) return false;

    // Unknown personal → already handled by isPersonal above; hide as a safe default
    return false;
}

function defaultDeps(): AdminNotificationFeedDeps {
    return {
        listServiceRequests: serviceRequestRepo.getAllServiceRequests,
        listUnreadNotifications: notificationRepo.getUnreadNotifications,
        now: () => new Date(),
    };
}

function resolveLink(notification: Notification): string {
    const rawLink = notification.link?.trim();
    if (rawLink && !rawLink.startsWith("{") && !rawLink.startsWith("[")) {
        return rawLink;
    }

    if (notification.jobId) {
        return "jobs";
    }

    if (notification.type === "service_request") {
        return "service-requests";
    }

    return "dashboard";
}

function resolveLinkId(notification: Notification): string | undefined {
    const rawLink = notification.link?.trim();
    if (rawLink && !rawLink.startsWith("{") && !rawLink.startsWith("[")) {
        return notification.jobId ?? undefined;
    }
    return notification.jobId ?? undefined;
}

function toTimestamp(value: string): number {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function mapServiceRequestNotification(request: ServiceRequest): AdminNotificationItem {
    const model = request.modelNumber ? ` ${request.modelNumber}` : "";
    return {
        id: `sr-${request.id}`,
        source: "service_request",
        type: "service_request",
        title: "Service Request",
        message: `${request.brand}${model} - ${request.status}`,
        createdAt: (request.createdAt ?? new Date()).toISOString(),
        read: Boolean(request.adminInteracted),
        link: "service-requests",
        linkId: request.id,
        // Virtual SR items have no DB userId — treated as broadcast in permission filter
    };
}

function shouldIncludeStoredNotification(notification: Notification, now: Date): boolean {
    if (notification.type === "assignment_override" || notification.contextType === "assignment_override") {
        return false;
    }

    const createdAt = notification.createdAt instanceof Date
        ? notification.createdAt.getTime()
        : new Date(notification.createdAt ?? 0).getTime();

    return createdAt >= now.getTime() - STORED_NOTIFICATION_MAX_AGE_MS;
}

function mapStoredNotification(notification: Notification): AdminNotificationItem {
    return {
        id: notification.id,
        source: "stored_notification",
        type: notification.type || "info",
        title: notification.title,
        message: notification.message,
        createdAt: (notification.createdAt ?? new Date()).toISOString(),
        read: Boolean(notification.read),
        link: resolveLink(notification),
        linkId: resolveLinkId(notification),
        jobId: notification.jobId ?? null,
        userId: notification.userId,
    };
}

export async function buildAdminNotificationFeed(
    currentUserId?: string,
    overrides: Partial<AdminNotificationFeedDeps> = {},
    currentUser?: FeedUser,
): Promise<AdminNotificationItem[]> {
    const deps = { ...defaultDeps(), ...overrides };
    const now = deps.now();

    const [serviceRequests, personalNotifications, broadcastNotifications] = await Promise.all([
        deps.listServiceRequests(),
        currentUserId ? deps.listUnreadNotifications(currentUserId) : Promise.resolve([]),
        deps.listUnreadNotifications("broadcast"),
    ]);

    const unreadServiceRequests = serviceRequests
        .filter((request) => !request.adminInteracted)
        .map(mapServiceRequestNotification);

    const unreadStoredNotifications = [...personalNotifications, ...broadcastNotifications]
        .filter((notification) => shouldIncludeStoredNotification(notification, now))
        .map(mapStoredNotification);

    const allItems = [...unreadServiceRequests, ...unreadStoredNotifications]
        .sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt));

    if (!currentUser) return allItems;
    return allItems.filter((item) => canSeeNotificationItem(currentUser, item, currentUserId));
}

export async function getAdminNotificationUnreadCount(
    currentUserId?: string,
    overrides: Partial<AdminNotificationFeedDeps> = {},
    currentUser?: FeedUser,
): Promise<number> {
    // No user context — fall back to full feed builder (safe, only happens in tests)
    if (!currentUser) {
        const items = await buildAdminNotificationFeed(currentUserId, overrides, currentUser);
        return items.length;
    }

    const perms = getEffectivePermissionsForUser(currentUser);
    const now = new Date();

    // Count unread SRs via SQL COUNT — no full table scan
    const hasSRPerm = hasAnyPermission(perms, [
        'serviceRequests',
        'serviceRequests.view', 'serviceRequests.reply', 'serviceRequests.logCall',
        'serviceRequests.quote', 'serviceRequests.transitionStage', 'serviceRequests.convertToJob',
    ]);
    const srCountPromise = hasSRPerm
        ? serviceRequestRepo.getUnreadServiceRequestCount()
        : Promise.resolve(0);

    // Count stored notifications using existing per-user SQL query (already cheap)
    const [srCount, personalNotifications, broadcastNotifications] = await Promise.all([
        srCountPromise,
        currentUserId ? notificationRepo.getUnreadNotifications(currentUserId) : Promise.resolve([]),
        notificationRepo.getUnreadNotifications('broadcast'),
    ]);

    const storedCount = [...personalNotifications, ...broadcastNotifications]
        .filter((n) => shouldIncludeStoredNotification(n, now))
        .map(mapStoredNotification)
        .filter((item) => canSeeNotificationItem(currentUser, item, currentUserId))
        .length;

    return srCount + storedCount;
}

// ── Exported for unit tests only ──
export { hasAnyPermission, canSeeNotificationItem };
export type { FeedUser };
