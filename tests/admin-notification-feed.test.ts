import { describe, expect, it, vi } from "vitest";
import {
    buildAdminNotificationFeed,
    getAdminNotificationUnreadCount,
    hasAnyPermission,
    canSeeNotificationItem,
} from "../server/services/admin-notification-feed.service";
import type { FeedUser } from "../server/services/admin-notification-feed.service";
import type { AdminNotificationItem } from "../shared/types/admin-notifications";

describe("admin notification feed", () => {
    it("uses the same unread feed for list and count while excluding stale overrides", async () => {
        const now = new Date("2026-03-12T12:00:00.000Z");

        const listServiceRequests = vi.fn(async () => ([
            {
                id: "srv-1",
                brand: "Sony",
                modelNumber: "X90",
                status: "Pending",
                createdAt: new Date("2026-03-12T10:00:00.000Z"),
                adminInteracted: false,
            },
            {
                id: "srv-2",
                brand: "LG",
                modelNumber: "C2",
                status: "Pending",
                createdAt: new Date("2026-03-12T09:00:00.000Z"),
                adminInteracted: true,
            },
        ] as any[]));

        const listUnreadNotifications = vi.fn(async (userId: string) => {
            if (userId === "admin-1") {
                return [
                    {
                        id: "note-1",
                        title: "Personal note",
                        message: "Check the dashboard",
                        type: "message",
                        read: false,
                        createdAt: new Date("2026-03-12T11:00:00.000Z"),
                        link: "dashboard",
                        jobId: null,
                        contextType: "general",
                    },
                ] as any[];
            }

            return [
                {
                    id: "note-2",
                    title: "Broadcast note",
                    message: "Stock audit tonight",
                    type: "message",
                    read: false,
                    createdAt: new Date("2026-03-12T08:00:00.000Z"),
                    link: "inventory",
                    jobId: null,
                    contextType: "general",
                },
                {
                    id: "override-1",
                    title: "Override request",
                    message: "Should stay in approvals only",
                    type: "assignment_override",
                    read: false,
                    createdAt: new Date("2026-03-12T07:00:00.000Z"),
                    link: "{\"reason\":\"test\"}",
                    jobId: "JOB-1",
                    contextType: "assignment_override",
                },
                {
                    id: "old-1",
                    title: "Old note",
                    message: "Too old for bell",
                    type: "message",
                    read: false,
                    createdAt: new Date("2026-03-01T00:00:00.000Z"),
                    link: "dashboard",
                    jobId: null,
                    contextType: "general",
                },
            ] as any[];
        });

        const overrides = {
            listServiceRequests,
            listUnreadNotifications,
            now: () => now,
        };

        const items = await buildAdminNotificationFeed("admin-1", overrides);
        const unreadCount = await getAdminNotificationUnreadCount("admin-1", overrides);

        expect(items.map((item) => item.id)).toEqual(["note-1", "sr-srv-1", "note-2"]);
        expect(items[0]).toMatchObject({
            source: "stored_notification",
            link: "dashboard",
        });
        expect(items[1]).toMatchObject({
            source: "service_request",
            link: "service-requests",
            linkId: "srv-1",
        });
        expect(unreadCount).toBe(items.length);
    });
});

// ── Phase 24B: Permission filter unit tests ──────────────────────────────────

function makeItem(overrides: Partial<AdminNotificationItem> = {}): AdminNotificationItem {
    return {
        id: "n1",
        source: "stored_notification",
        type: "info",
        title: "Test",
        message: "Test message",
        createdAt: new Date().toISOString(),
        read: false,
        link: "dashboard",
        ...overrides,
    };
}

const SUPER_ADMIN: FeedUser = { role: "Super Admin" };
const DRIVER_ATTENDANCE_ONLY: FeedUser = { role: "Driver", permissions: JSON.stringify({ attendance: true }) };
const TECH_JOBS_VIEW: FeedUser = { role: "Technician", permissions: JSON.stringify({ "jobs.view": true }) };
const TECH_SR_VIEW: FeedUser = { role: "Technician", permissions: JSON.stringify({ "serviceRequests.view": true }) };
const CASHIER_POS_VIEW: FeedUser = { role: "Cashier", permissions: JSON.stringify({ "pos.view": true }) };
const CASHIER_FINANCE_VIEW: FeedUser = { role: "Cashier", permissions: JSON.stringify({ "finance.view": true }) };
const INVENTORY_VIEWER: FeedUser = { role: "Technician", permissions: JSON.stringify({ "inventory.view": true }) };

describe("hasAnyPermission", () => {
    it("returns true for Super Admin wildcard", () => {
        expect(hasAnyPermission({ "*": true }, ["jobs.view"])).toBe(true);
    });

    it("returns true for direct legacy key match", () => {
        expect(hasAnyPermission({ serviceRequests: true }, ["serviceRequests"])).toBe(true);
    });

    it("returns true when legacy key covers the granular key", () => {
        // user has legacy 'serviceRequests', checking granular 'serviceRequests.view'
        expect(hasAnyPermission({ serviceRequests: true }, ["serviceRequests.view"])).toBe(true);
    });

    it("returns true for direct granular key match", () => {
        expect(hasAnyPermission({ "jobs.view": true }, ["jobs.view"])).toBe(true);
    });

    it("returns false when no key matches", () => {
        expect(hasAnyPermission({ attendance: true }, ["jobs", "jobs.view"])).toBe(false);
    });
});

describe("canSeeNotificationItem — Phase 24B", () => {
    it("Super Admin sees system_alert", () => {
        expect(canSeeNotificationItem(SUPER_ADMIN, makeItem({ type: "system_alert" }))).toBe(true);
    });

    it("Super Admin sees unknown broadcast", () => {
        expect(canSeeNotificationItem(SUPER_ADMIN, makeItem({ type: "unknown_future_type", userId: "broadcast" }))).toBe(true);
    });

    // ── Driver (attendance only) ──────────────────────────────────────────────

    it("Driver does NOT see system_alert", () => {
        expect(canSeeNotificationItem(DRIVER_ATTENDANCE_ONLY, makeItem({ type: "system_alert", userId: "some-admin" }))).toBe(false);
    });

    it("Driver does NOT see broadcast service_request", () => {
        expect(canSeeNotificationItem(DRIVER_ATTENDANCE_ONLY, makeItem({ type: "service_request", source: "service_request" }))).toBe(false);
    });

    it("Driver does NOT see broadcast low_stock", () => {
        expect(canSeeNotificationItem(DRIVER_ATTENDANCE_ONLY, makeItem({ type: "low_stock", userId: "broadcast" }))).toBe(false);
    });

    it("Driver does NOT see broadcast finance alert", () => {
        expect(canSeeNotificationItem(DRIVER_ATTENDANCE_ONLY, makeItem({ type: "alert", userId: "broadcast" }))).toBe(false);
    });

    it("Driver DOES see personal notification addressed to them", () => {
        expect(canSeeNotificationItem(DRIVER_ATTENDANCE_ONLY, makeItem({ type: "payroll", userId: "driver-1" }), "driver-1")).toBe(true);
    });

    it("Driver does NOT see broadcast unknown notification", () => {
        expect(canSeeNotificationItem(DRIVER_ATTENDANCE_ONLY, makeItem({ type: "some_new_type", userId: "broadcast" }))).toBe(false);
    });

    // ── Technician with jobs.view ─────────────────────────────────────────────

    it("Technician with jobs.view sees job_ready", () => {
        expect(canSeeNotificationItem(TECH_JOBS_VIEW, makeItem({ type: "job_ready", userId: "broadcast" }))).toBe(true);
    });

    it("Technician with jobs.view sees item with jobId", () => {
        expect(canSeeNotificationItem(TECH_JOBS_VIEW, makeItem({ type: "info", jobId: "JOB-1", userId: "broadcast" }))).toBe(true);
    });

    it("Technician with jobs.view does NOT see low_stock", () => {
        expect(canSeeNotificationItem(TECH_JOBS_VIEW, makeItem({ type: "low_stock", userId: "broadcast" }))).toBe(false);
    });

    // ── Technician with serviceRequests.view ──────────────────────────────────

    it("Technician with serviceRequests.view sees service_request", () => {
        expect(canSeeNotificationItem(TECH_SR_VIEW, makeItem({ type: "service_request", source: "service_request" }))).toBe(true);
    });

    it("Technician with serviceRequests.view sees repair type", () => {
        expect(canSeeNotificationItem(TECH_SR_VIEW, makeItem({ type: "repair" }))).toBe(true);
    });

    it("Technician with serviceRequests.view does NOT see finance alert", () => {
        expect(canSeeNotificationItem(TECH_SR_VIEW, makeItem({ type: "payment_verified", userId: "broadcast" }))).toBe(false);
    });

    // ── Cashier with pos.view ─────────────────────────────────────────────────

    it("Cashier with pos.view sees payment_verified", () => {
        expect(canSeeNotificationItem(CASHIER_POS_VIEW, makeItem({ type: "payment_verified", userId: "broadcast" }))).toBe(true);
    });

    it("Cashier with pos.view sees alert (no jobId)", () => {
        expect(canSeeNotificationItem(CASHIER_POS_VIEW, makeItem({ type: "alert", userId: "broadcast" }))).toBe(true);
    });

    // ── Cashier with finance.view ─────────────────────────────────────────────

    it("Cashier with finance.view sees payment_rejected", () => {
        expect(canSeeNotificationItem(CASHIER_FINANCE_VIEW, makeItem({ type: "payment_rejected", userId: "broadcast" }))).toBe(true);
    });

    it("Cashier with finance.view does NOT see low_stock", () => {
        expect(canSeeNotificationItem(CASHIER_FINANCE_VIEW, makeItem({ type: "low_stock", userId: "broadcast" }))).toBe(false);
    });

    // ── Inventory viewer ─────────────────────────────────────────────────────

    it("Inventory viewer sees low_stock", () => {
        expect(canSeeNotificationItem(INVENTORY_VIEWER, makeItem({ type: "low_stock", userId: "broadcast" }))).toBe(true);
    });

    it("Inventory viewer (inventory.view) via legacy 'inventory' key sees low_stock", () => {
        const user: FeedUser = { role: "Technician", permissions: JSON.stringify({ inventory: true }) };
        expect(canSeeNotificationItem(user, makeItem({ type: "low_stock", userId: "broadcast" }))).toBe(true);
    });

    it("Inventory viewer does NOT see service_request", () => {
        expect(canSeeNotificationItem(INVENTORY_VIEWER, makeItem({ type: "service_request", source: "service_request" }))).toBe(false);
    });

    // ── Unknown broadcast → Super Admin only ─────────────────────────────────

    it("Unknown broadcast notification NOT shown to Manager-level user", () => {
        const manager: FeedUser = { role: "Manager" };
        expect(canSeeNotificationItem(manager, makeItem({ type: "unknown_future_type", userId: "broadcast" }))).toBe(false);
    });

    it("Unknown broadcast IS shown to Super Admin", () => {
        expect(canSeeNotificationItem(SUPER_ADMIN, makeItem({ type: "unknown_future_type", userId: "broadcast" }))).toBe(true);
    });

    // ── system_alert: personal to super admin, still hidden for non-SA ────────

    it("system_alert is hidden even when userId matches non-Super Admin user", () => {
        const tech: FeedUser = { role: "Technician", permissions: JSON.stringify({ "jobs.view": true }) };
        // Even if someone sends system_alert directly to a technician (shouldn't happen), hide it
        expect(canSeeNotificationItem(tech, makeItem({ type: "system_alert", userId: "tech-1" }), "tech-1")).toBe(false);
    });
});
