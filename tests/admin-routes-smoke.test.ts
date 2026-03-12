import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function allowAdminRequest() {
    return (req: any, _res: any, next: () => void) => {
        req.session = req.session || {};
        req.session.adminUserId = "admin-1";
        req.session.adminId = "admin-1";
        next();
    };
}

function createAuthMock() {
    return {
        requireAdminAuth: allowAdminRequest(),
        requirePermission: () => allowAdminRequest(),
        requireAnyPermission: () => allowAdminRequest(),
        requireSuperAdmin: allowAdminRequest(),
        getEffectivePermissionsForUser: () => ({ dashboard: true, finance: true }),
        adminCreateUserSchema: { parse: (value: unknown) => value },
        adminUpdateUserSchema: { parse: (value: unknown) => value },
        getDefaultPermissions: () => ({ dashboard: true }),
    };
}

function createApp(router: express.Router) {
    const app = express();
    app.use(express.json());
    app.use(router);
    return app;
}

describe("admin route smoke tests", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("serves admin dashboard and job overview with mocked dependencies", async () => {
        vi.doMock("../server/routes/middleware/auth.js", createAuthMock);
        vi.doMock("../server/repositories/index.js", () => ({
            userRepo: {
                getUser: vi.fn(async () => ({
                    id: "admin-1",
                    role: "Manager",
                    permissions: JSON.stringify({ dashboard: true, finance: true }),
                })),
            },
            analyticsRepo: {
                getJobOverview: vi.fn(async () => ({
                    dueToday: [],
                    dueTomorrow: [],
                    dueThisWeek: [],
                    readyForDelivery: [],
                    technicianWorkloads: [],
                    stats: {
                        totalDueToday: 0,
                        totalDueTomorrow: 0,
                        totalDueThisWeek: 0,
                        totalReadyForDelivery: 0,
                        totalInProgress: 0,
                    },
                })),
            },
            orderRepo: {},
            serviceRequestRepo: {},
            jobRepo: {},
            employmentRepo: {},
        }));
        vi.doMock("../server/lib/dashboardCache.js", () => ({
            getCachedDashboard: vi.fn(async () => ({
                data: {
                    totalRevenue: 1000,
                    posRevenueThisMonth: 800,
                    corporateRevenueThisMonth: 200,
                    totalWastageLoss: 0,
                    revenueData: [],
                },
                cacheStatus: "fresh",
            })),
        }));
        vi.doMock("../server/routes/middleware/sse-broker.js", () => ({
            notifySpecificAdmin: vi.fn(),
        }));
        vi.doMock("../server/services/mailer.js", () => ({ MailerService: class {} }));
        vi.doMock("../server/services/auth.service.js", () => ({ authService: {} }));
        vi.doMock("../server/services/audit.service.js", () => ({ AuditLogger: class {} }));
        vi.doMock("../server/routes/admin-stream.js", () => ({
            handleAdminEventStream: vi.fn(),
        }));

        const { default: router } = await import("../server/routes/users.routes.js");
        const app = createApp(router);

        const dashboardRes = await request(app).get("/api/admin/dashboard");
        const overviewRes = await request(app).get("/api/admin/job-overview");

        expect(dashboardRes.status).toBe(200);
        expect(dashboardRes.body.totalRevenue).toBe(1000);
        expect(overviewRes.status).toBe(200);
        expect(overviewRes.body.stats.totalDueToday).toBe(0);
    });

    it("serves service requests with mocked repository outputs", async () => {
        vi.doMock("../server/routes/middleware/auth.js", createAuthMock);
        vi.doMock("../server/repositories/index.js", () => ({
            jobRepo: {
                getJobTicket: vi.fn(async () => ({
                    id: "JOB-1",
                    status: "In Progress",
                    technician: "Tech A",
                })),
            },
            serviceRequestRepo: {
                getAllServiceRequests: vi.fn(async () => ([
                    {
                        id: "srv-1",
                        brand: "Sony",
                        modelNumber: "X90",
                        status: "Pending",
                        servicePreference: "service_center",
                        serviceMode: "service_center",
                        createdAt: new Date("2026-03-12T00:00:00.000Z"),
                    },
                ])),
            },
            userRepo: {},
            systemRepo: {},
            settingsRepo: {},
            notificationRepo: {},
        }));
        vi.doMock("../server/utils/auditLogger.js", () => ({
            auditLogger: { log: vi.fn() },
        }));
        vi.doMock("../server/services/job.service.js", () => ({
            jobService: {},
        }));
        vi.doMock("../server/services/admin-realtime.service.js", () => ({
            publishJobTicketEvent: vi.fn(),
            publishServiceRequestEvent: vi.fn(),
        }));
        vi.doMock("../server/routes/middleware/sse-broker.js", () => ({
            notifyAdminUpdate: vi.fn(),
            notifyCustomerUpdate: vi.fn(),
        }));

        const { default: router } = await import("../server/routes/service-requests.routes.js");
        const app = createApp(router);

        const res = await request(app).get("/api/service-requests");

        expect(res.status).toBe(200);
        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0].trackingStatus).toBeDefined();
    });

    it("serves admin notifications from the shared notification feed", async () => {
        vi.doMock("../server/routes/middleware/auth.js", createAuthMock);
        vi.doMock("../server/repositories/index.js", () => ({
            notificationRepo: {
                getNotifications: vi.fn(async () => []),
                markNotificationAsRead: vi.fn(),
                createNotification: vi.fn(),
            },
            userRepo: {
                getUser: vi.fn(async () => ({ id: "admin-1", role: "Super Admin", name: "Admin" })),
            },
            jobRepo: {
                getJobTicket: vi.fn(async () => ({ id: "JOB-1", assistedByIds: "[]" })),
            },
        }));
        vi.doMock("../server/storage.js", () => ({
            storage: {
                updateJobTicket: vi.fn(),
            },
        }));
        vi.doMock("../server/routes/admin-stream.js", () => ({
            handleAdminEventStream: vi.fn(),
        }));
        vi.doMock("../server/services/admin-notification-feed.service.js", () => ({
            buildAdminNotificationFeed: vi.fn(async () => ([
                {
                    id: "sr-srv-1",
                    source: "service_request",
                    type: "service_request",
                    title: "Service Request",
                    message: "Sony X90 - Pending",
                    createdAt: "2026-03-12T10:00:00.000Z",
                    read: false,
                    link: "service-requests",
                    linkId: "srv-1",
                },
            ])),
            getAdminNotificationUnreadCount: vi.fn(async () => 1),
        }));
        vi.doMock("../server/services/fcm.service.js", () => ({
            registerDeviceToken: vi.fn(),
            unregisterDeviceTokens: vi.fn(),
        }));

        const { default: router } = await import("../server/routes/admin-notifications.routes.js");
        const app = createApp(router);

        const listRes = await request(app).get("/api/admin/notifications");
        const countRes = await request(app).get("/api/admin/notifications/unread-count");

        expect(listRes.status).toBe(200);
        expect(listRes.body).toHaveLength(1);
        expect(countRes.status).toBe(200);
        expect(countRes.body.count).toBe(1);
    });
});
