import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A new service request must push to admin devices.
 *
 * Before this, POST /api/service-requests published exactly one thing: an SSE
 * event, which is an in-page toast delivered over an open EventSource. It
 * reaches an admin who already has the panel open in a browser tab and nobody
 * else — it cannot wake a closed tab or a phone.
 *
 * notifyAdminsWithPush existed in fcm.service.ts with ZERO callers anywhere in
 * the server. Browsers subscribed successfully to a pipe with nothing feeding
 * it, which is why enabling notifications appeared to work and no notification
 * ever arrived.
 *
 * The second test is the one that matters operationally: a push failure must
 * not fail the intake. The service request is committed before the push is
 * attempted and the customer already holds a ticket number, so a dead FCM
 * token or an unreachable Firebase must still return 201.
 */

const CREATED_REQUEST = {
    id: "sr-test-1",
    ticketNumber: "SRV-20260805-0001",
    brand: "Samsung",
    primaryIssue: "No picture",
    status: "Pending",
};

/**
 * The route module pulls in the database, every repository, and a dozen
 * services at import time. None of that is under test here — the question is
 * only whether a successful intake reaches the push helper — so the module
 * graph is stubbed down to the POST path.
 */
function mockRouteDependencies(overrides: {
    notifyAdminsWithPush: ReturnType<typeof vi.fn>;
    createRetailServiceRequest?: ReturnType<typeof vi.fn>;
}) {
    const passthroughMiddleware = (_req: any, _res: any, next: () => void) => next();

    vi.doMock("../server/db.js", () => ({ db: {} }));
    vi.doMock("../server/repositories/index.js", () => ({
        jobRepo: {}, serviceRequestRepo: {}, userRepo: {}, systemRepo: {},
        settingsRepo: {}, notificationRepo: {},
    }));
    vi.doMock("../server/routes/middleware/auth.js", () => ({
        requireAdminAuth: passthroughMiddleware,
        requireCustomerAuth: passthroughMiddleware,
        requireGranularPermission: () => passthroughMiddleware,
        requireSuperAdmin: passthroughMiddleware,
        getCustomerId: () => null,
    }));
    vi.doMock("../server/routes/middleware/sse-broker.js", () => ({
        notifyAdminUpdate: vi.fn(),
        notifyCustomerUpdate: vi.fn(),
        broadcastAdminEvent: vi.fn(),
    }));
    vi.doMock("../server/routes/middleware/rate-limit.js", () => ({
        serviceRequestLimiter: passthroughMiddleware,
    }));
    vi.doMock("../server/services/admin-realtime.service.js", () => ({
        publishJobTicketEvent: vi.fn(),
        publishServiceRequestEvent: vi.fn(),
        publishAdminNotificationEvent: vi.fn(),
    }));
    vi.doMock("../server/services/fcm.service.js", () => ({
        notifyAdminsWithPush: overrides.notifyAdminsWithPush,
    }));
    vi.doMock("../server/repositories/service-area.repository.js", () => ({
        getActiveServiceAreaById: vi.fn(async () => ({ id: "area-1", isActive: true })),
    }));
    vi.doMock("../server/services/customer-repair-journey.service.js", () => ({
        repairJourneyService: { createJourneyFromServiceRequest: vi.fn(async () => ({})) },
    }));
    vi.doMock("../server/services/retail-intake.service.js", () => ({
        createRetailServiceRequest:
            overrides.createRetailServiceRequest ??
            vi.fn(async () => ({
                serviceRequest: CREATED_REQUEST,
                duplicateWindow: false,
                idempotent: false,
            })),
        // Real IntakeError so the route's `instanceof` branch stays meaningful.
        IntakeError: class IntakeError extends Error {
            status = 400;
            code = "INTAKE_ERROR";
        },
        parseIdempotencyKeyHeader: vi.fn(() => null),
        sanitizePublicServiceRequest: (r: any) => r,
    }));
}

async function mountRouter() {
    const mod = await import("../server/routes/service-requests.routes.js");
    const router = (mod as any).default ?? (mod as any).router;
    const app = express();
    app.use(express.json());
    app.use(router);
    return app;
}

const VALID_INTAKE = {
    brand: "Samsung",
    primaryIssue: "No picture",
    customerName: "Test Customer",
    phone: "+8801700000900",
    status: "Pending",
    requestIntent: "repair",
    serviceMode: "service_center",
    servicePreference: "service_center",
};

describe("POST /api/service-requests → admin push", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
    });

    it("pushes to admin devices when a request is created", async () => {
        const notifyAdminsWithPush = vi.fn(async () => {});
        mockRouteDependencies({ notifyAdminsWithPush });

        const app = await mountRouter();
        const res = await request(app).post("/api/service-requests").send(VALID_INTAKE);

        expect(res.status).toBe(201);
        expect(notifyAdminsWithPush).toHaveBeenCalledTimes(1);

        const payload = notifyAdminsWithPush.mock.calls[0][0] as any;
        expect(payload.type).toBe("service_request_created");
        // The ticket number is what an admin needs to act on the notification;
        // a push that does not carry it is not actionable.
        expect(payload.data.ticketNumber).toBe(CREATED_REQUEST.ticketNumber);
        expect(payload.data.serviceRequestId).toBe(CREATED_REQUEST.id);
    });

    it("still returns 201 when the push rejects", async () => {
        const notifyAdminsWithPush = vi.fn(async () => {
            throw new Error("FCM unreachable");
        });
        mockRouteDependencies({ notifyAdminsWithPush });

        const app = await mountRouter();
        const res = await request(app).post("/api/service-requests").send(VALID_INTAKE);

        // The row is committed and the customer holds a ticket. A notification
        // problem is not the customer's problem.
        expect(res.status).toBe(201);
        expect(res.body.ticketNumber).toBe(CREATED_REQUEST.ticketNumber);
        expect(notifyAdminsWithPush).toHaveBeenCalledTimes(1);
    });
});
