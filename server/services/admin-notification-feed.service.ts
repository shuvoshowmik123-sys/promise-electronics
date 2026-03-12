import type { Notification, ServiceRequest } from "../../shared/schema.js";
import type { AdminNotificationItem } from "../../shared/types/admin-notifications.js";
import { notificationRepo, serviceRequestRepo } from "../repositories/index.js";

const STORED_NOTIFICATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type AdminNotificationFeedDeps = {
    listServiceRequests: () => Promise<ServiceRequest[]>;
    listUnreadNotifications: (userId: string) => Promise<Notification[]>;
    now: () => Date;
};

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
    };
}

export async function buildAdminNotificationFeed(
    currentUserId?: string,
    overrides: Partial<AdminNotificationFeedDeps> = {},
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

    return [...unreadServiceRequests, ...unreadStoredNotifications]
        .sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt));
}

export async function getAdminNotificationUnreadCount(
    currentUserId?: string,
    overrides: Partial<AdminNotificationFeedDeps> = {},
): Promise<number> {
    const items = await buildAdminNotificationFeed(currentUserId, overrides);
    return items.length;
}
