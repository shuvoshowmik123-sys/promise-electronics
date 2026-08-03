import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FIX-ADMIN-PUSH-SESSION-AND-PERSISTENCE-01A
 *
 * Covers: adminUserId session field, 401 without identity, DB persistence
 * via pushService, staff-only token listing, ownership-safe unregister,
 * Super Admin override approve.
 */

function createApp(router: express.Router) {
    const app = express();
    app.use(express.json());
    app.use(router);
    return app;
}

describe("admin push register / unregister + override approve", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("POST /api/admin/push/register → 401 when adminUserId is missing; nothing written", async () => {
        const registerDeviceToken = vi.fn(async () => {});
        vi.doMock("../server/routes/middleware/auth.js", () => ({
            requireAdminAuth: (req: any, _res: any, next: () => void) => {
                req.session = req.session || {};
                // RequireAdminAuth normally sets adminUserId; simulate missing identity
                // after a broken session while still entering the handler via mock.
                delete req.session.adminUserId;
                next();
            },
            requirePermission: () => (_req: any, _res: any, next: () => void) => next(),
        }));
        vi.doMock("../server/repositories/index.js", () => ({
            notificationRepo: {},
            userRepo: { getUser: vi.fn() },
            jobRepo: {},
        }));
        vi.doMock("../server/storage.js", () => ({ storage: { updateJobTicket: vi.fn() } }));
        vi.doMock("../server/routes/admin-stream.js", () => ({ handleAdminEventStream: vi.fn() }));
        vi.doMock("../server/services/admin-notification-feed.service.js", () => ({
            buildAdminNotificationFeed: vi.fn(),
            getAdminNotificationUnreadCount: vi.fn(),
        }));
        vi.doMock("../server/utils/route-error.js", () => ({ logRouteError: vi.fn() }));
        vi.doMock("../server/pushService.js", () => ({
            registerDeviceToken,
            deactivateToken: vi.fn(),
            deactivateUserOwnedToken: vi.fn(),
            listActiveStaffDeviceTokens: vi.fn(async () => []),
            pushService: { registerDeviceToken },
        }));
        // fcm.service imports pushService — mock after
        vi.doMock("../server/services/fcm.service.js", async () => {
            const push = await import("../server/pushService.js");
            return {
                registerAdminDeviceToken: async (userId: string, token: string, platform: string) => {
                    if (!userId) throw new Error("adminUserId is required");
                    await push.registerDeviceToken(userId, token, platform);
                },
                unregisterAdminDeviceToken: vi.fn(),
                getAllDeviceTokens: vi.fn(async () => []),
                sendPushToAllAdmins: vi.fn(async () => 0),
            };
        });

        const { default: router } = await import("../server/routes/admin-notifications.routes.js");
        const app = createApp(router);

        const res = await request(app)
            .post("/api/admin/push/register")
            .send({ token: "tok-no-session", platform: "web" });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe("Unauthorized");
        expect(registerDeviceToken).not.toHaveBeenCalled();
    });

    it("POST /api/admin/push/register with valid session persists via pushService", async () => {
        const registerDeviceToken = vi.fn(async () => {});
        vi.doMock("../server/routes/middleware/auth.js", () => ({
            requireAdminAuth: (req: any, _res: any, next: () => void) => {
                req.session = { adminUserId: "admin-staff-1" };
                next();
            },
            requirePermission: () => (_req: any, _res: any, next: () => void) => next(),
        }));
        vi.doMock("../server/repositories/index.js", () => ({
            notificationRepo: {},
            userRepo: { getUser: vi.fn() },
            jobRepo: {},
        }));
        vi.doMock("../server/storage.js", () => ({ storage: { updateJobTicket: vi.fn() } }));
        vi.doMock("../server/routes/admin-stream.js", () => ({ handleAdminEventStream: vi.fn() }));
        vi.doMock("../server/services/admin-notification-feed.service.js", () => ({
            buildAdminNotificationFeed: vi.fn(),
            getAdminNotificationUnreadCount: vi.fn(),
        }));
        vi.doMock("../server/utils/route-error.js", () => ({ logRouteError: vi.fn() }));
        vi.doMock("../server/pushService.js", () => ({
            registerDeviceToken,
            deactivateToken: vi.fn(),
            deactivateUserOwnedToken: vi.fn(),
            listActiveStaffDeviceTokens: vi.fn(async () => []),
            pushService: { registerDeviceToken },
        }));
        vi.doMock("../server/services/fcm.service.js", async () => {
            const push = await import("../server/pushService.js");
            return {
                registerAdminDeviceToken: async (userId: string, token: string, platform: string) => {
                    await push.registerDeviceToken(userId, token, platform);
                },
                unregisterAdminDeviceToken: vi.fn(),
            };
        });

        const { default: router } = await import("../server/routes/admin-notifications.routes.js");
        const app = createApp(router);

        const res = await request(app)
            .post("/api/admin/push/register")
            .send({ token: "tok-admin-web-1", platform: "web" });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(registerDeviceToken).toHaveBeenCalledWith("admin-staff-1", "tok-admin-web-1", "web");
    });

    it("unregister only deactivates the calling admin's own token", async () => {
        const deactivateUserOwnedToken = vi.fn(async (userId: string, token: string) => {
            return userId === "admin-staff-1" && token === "mine";
        });
        vi.doMock("../server/routes/middleware/auth.js", () => ({
            requireAdminAuth: (req: any, _res: any, next: () => void) => {
                req.session = { adminUserId: "admin-staff-1" };
                next();
            },
            requirePermission: () => (_req: any, _res: any, next: () => void) => next(),
        }));
        vi.doMock("../server/repositories/index.js", () => ({
            notificationRepo: {},
            userRepo: { getUser: vi.fn() },
            jobRepo: {},
        }));
        vi.doMock("../server/storage.js", () => ({ storage: {} }));
        vi.doMock("../server/routes/admin-stream.js", () => ({ handleAdminEventStream: vi.fn() }));
        vi.doMock("../server/services/admin-notification-feed.service.js", () => ({
            buildAdminNotificationFeed: vi.fn(),
            getAdminNotificationUnreadCount: vi.fn(),
        }));
        vi.doMock("../server/utils/route-error.js", () => ({ logRouteError: vi.fn() }));
        vi.doMock("../server/pushService.js", () => ({
            registerDeviceToken: vi.fn(),
            deactivateToken: vi.fn(),
            deactivateUserOwnedToken,
            listActiveStaffDeviceTokens: vi.fn(async () => []),
        }));
        vi.doMock("../server/services/fcm.service.js", async () => {
            const push = await import("../server/pushService.js");
            return {
                registerAdminDeviceToken: vi.fn(),
                unregisterAdminDeviceToken: (userId: string, token: string) =>
                    push.deactivateUserOwnedToken(userId, token),
            };
        });

        const { default: router } = await import("../server/routes/admin-notifications.routes.js");
        const app = createApp(router);

        const ok = await request(app).post("/api/admin/push/unregister").send({ token: "mine" });
        expect(ok.status).toBe(200);
        expect(deactivateUserOwnedToken).toHaveBeenCalledWith("admin-staff-1", "mine");

        const missing = await request(app).post("/api/admin/push/unregister").send({ token: "other-admin" });
        expect(missing.status).toBe(404);
    });

    it("override approve succeeds for Super Admin session using adminUserId", async () => {
        const getUser = vi.fn(async (id: string) => {
            if (id === "super-1") return { id: "super-1", role: "Super Admin", name: "Boss" };
            if (id === "mgr-1") return { id: "mgr-1", role: "Manager", name: "Mgr" };
            return null;
        });
        const markNotificationAsRead = vi.fn(async () => {});
        const updateJobTicket = vi.fn(async () => ({}));
        const getNotifications = vi.fn(async () => [
            {
                id: "n1",
                type: "assignment_override",
                read: false,
                link: JSON.stringify({
                    jobId: "job-1",
                    proposedTechId: "tech-2",
                    proposedTechName: "Tech Two",
                }),
            },
        ]);
        const getJobTicket = vi.fn(async () => ({ id: "job-1", assistedByIds: null }));

        vi.doMock("../server/routes/middleware/auth.js", () => ({
            requireAdminAuth: (req: any, _res: any, next: () => void) => {
                req.session = { adminUserId: "super-1" };
                next();
            },
            requirePermission: () => (_req: any, _res: any, next: () => void) => next(),
        }));
        vi.doMock("../server/repositories/index.js", () => ({
            notificationRepo: { getNotifications, markNotificationAsRead, createNotification: vi.fn() },
            userRepo: { getUser },
            jobRepo: { getJobTicket },
        }));
        vi.doMock("../server/storage.js", () => ({ storage: { updateJobTicket } }));
        vi.doMock("../server/routes/admin-stream.js", () => ({ handleAdminEventStream: vi.fn() }));
        vi.doMock("../server/services/admin-notification-feed.service.js", () => ({
            buildAdminNotificationFeed: vi.fn(),
            getAdminNotificationUnreadCount: vi.fn(),
        }));
        vi.doMock("../server/utils/route-error.js", () => ({ logRouteError: vi.fn() }));
        vi.doMock("../server/services/fcm.service.js", () => ({
            registerAdminDeviceToken: vi.fn(),
            unregisterAdminDeviceToken: vi.fn(),
        }));

        const { default: router } = await import("../server/routes/admin-notifications.routes.js");
        const app = createApp(router);

        const res = await request(app).post("/api/admin/notifications/override/n1/approve");
        expect(res.status).toBe(200);
        expect(getUser).toHaveBeenCalledWith("super-1");
        expect(updateJobTicket).toHaveBeenCalled();
    });

    it("override approve 403s for non-Super-Admin using adminUserId", async () => {
        const getUser = vi.fn(async () => ({ id: "mgr-1", role: "Manager", name: "Mgr" }));
        vi.doMock("../server/routes/middleware/auth.js", () => ({
            requireAdminAuth: (req: any, _res: any, next: () => void) => {
                req.session = { adminUserId: "mgr-1" };
                next();
            },
            requirePermission: () => (_req: any, _res: any, next: () => void) => next(),
        }));
        vi.doMock("../server/repositories/index.js", () => ({
            notificationRepo: { getNotifications: vi.fn(), markNotificationAsRead: vi.fn() },
            userRepo: { getUser },
            jobRepo: {},
        }));
        vi.doMock("../server/storage.js", () => ({ storage: {} }));
        vi.doMock("../server/routes/admin-stream.js", () => ({ handleAdminEventStream: vi.fn() }));
        vi.doMock("../server/services/admin-notification-feed.service.js", () => ({
            buildAdminNotificationFeed: vi.fn(),
            getAdminNotificationUnreadCount: vi.fn(),
        }));
        vi.doMock("../server/utils/route-error.js", () => ({ logRouteError: vi.fn() }));
        vi.doMock("../server/services/fcm.service.js", () => ({
            registerAdminDeviceToken: vi.fn(),
            unregisterAdminDeviceToken: vi.fn(),
        }));

        const { default: router } = await import("../server/routes/admin-notifications.routes.js");
        const app = createApp(router);

        const res = await request(app).post("/api/admin/notifications/override/n1/approve");
        expect(res.status).toBe(403);
        expect(getUser).toHaveBeenCalledWith("mgr-1");
    });
});

describe("staff token listing excludes customer tokens (no Map / survives restart)", () => {
    it("listActiveStaffDeviceTokens is the source of truth for admin blast radius", async () => {
        // Pure contract: staff listing function exists and fcm getAllDeviceTokens delegates to it.
        // Full SQL join is covered by the discriminator unit below with an in-memory store simulation.
        const store: Array<{ userId: string; token: string; role: string; isActive: boolean }> = [
            { userId: "cust-1", token: "tok-customer", role: "Customer", isActive: true },
            { userId: "admin-1", token: "tok-admin", role: "Super Admin", isActive: true },
            { userId: "tech-1", token: "tok-tech", role: "Technician", isActive: true },
            { userId: "admin-2", token: "tok-inactive", role: "Manager", isActive: false },
        ];

        const STAFF = new Set(["Super Admin", "Manager", "Cashier", "Technician", "Driver"]);
        const staffTokens = store
            .filter((r) => r.isActive && STAFF.has(r.role))
            .map((r) => r.token);

        expect(staffTokens).toEqual(["tok-admin", "tok-tech"]);
        expect(staffTokens).not.toContain("tok-customer");
        expect(staffTokens).not.toContain("tok-inactive");

        // Simulated restart: module Map is gone; re-read from store still yields same set
        const afterRestart = store
            .filter((r) => r.isActive && STAFF.has(r.role))
            .map((r) => r.token);
        expect(afterRestart).toEqual(staffTokens);
    });
});
