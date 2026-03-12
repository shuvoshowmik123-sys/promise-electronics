import { describe, expect, it, vi } from "vitest";
import { buildAdminNotificationFeed, getAdminNotificationUnreadCount } from "../server/services/admin-notification-feed.service";

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
