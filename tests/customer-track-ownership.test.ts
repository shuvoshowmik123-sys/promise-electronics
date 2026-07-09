import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createAppWithSession(router: express.Router, session: Record<string, any> | null) {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: () => void) => {
        if (session) req.session = { ...session };
        next();
    });
    app.use(router);
    return app;
}

const TICKET_A = "SRV-2026-0001";
const TICKET_B = "SRV-2026-0002";
const TICKET_LEGACY = "SRV-2026-0003";
const TICKET_LEGACY_MISMATCH = "SRV-2026-0004";

const ORDER_A = {
    id: "srv-a",
    ticketNumber: TICKET_A,
    customerId: "cust-a",
    phone: "01710000001",
    customerName: "Customer A",
    address: "House A, Road A, Dhaka",
    trackingStatus: "In Progress",
    createdAt: new Date("2026-01-01"),
    convertedJobId: null,
};

const ORDER_B = {
    id: "srv-b",
    ticketNumber: TICKET_B,
    customerId: "cust-b",
    phone: "01710000002",
    customerName: "Customer B",
    address: "House B, Road B, Dhaka",
    trackingStatus: "Pending",
    createdAt: new Date("2026-01-02"),
    convertedJobId: null,
};

const ORDER_LEGACY = {
    id: "srv-legacy",
    ticketNumber: TICKET_LEGACY,
    customerId: null,
    phone: "01710000001",
    customerName: "Legacy A",
    address: "Legacy House, Dhaka",
    trackingStatus: "Booked",
    createdAt: new Date("2026-01-03"),
    convertedJobId: null,
};

const ORDER_LEGACY_MISMATCH = {
    id: "srv-legacy-x",
    ticketNumber: TICKET_LEGACY_MISMATCH,
    customerId: null,
    phone: "01710000099",
    customerName: "Legacy Other",
    address: "Other House, Chittagong",
    trackingStatus: "Booked",
    createdAt: new Date("2026-01-04"),
    convertedJobId: null,
};

const CUSTOMER_A = { id: "cust-a", phone: "01710000001", name: "Customer A" };

function ticketToOrder(ticket: string) {
    const map: Record<string, any> = {
        [TICKET_A]: ORDER_A,
        [TICKET_B]: ORDER_B,
        [TICKET_LEGACY]: ORDER_LEGACY,
        [TICKET_LEGACY_MISMATCH]: ORDER_LEGACY_MISMATCH,
    };
    return map[ticket];
}

function setupMocks(opts: {
    linkCalled?: boolean;
    customerForSession?: any;
    link?: ReturnType<typeof vi.fn>;
} = {}) {
    vi.doMock("../server/routes/middleware/auth.js", () => ({
        requireCustomerAuth: (req: any, _res: any, next: () => void) => {
            req.session = req.session || {};
            req.session.customerId = "cust-a";
            next();
        },
        getCustomerId: (req: any) => req.session?.customerId,
        customerLoginSchema: { parse: (v: unknown) => v },
        customerRegisterSchema: { parse: (v: unknown) => v },
        requireAdminAuth: (req: any, _res: any, next: () => void) => { req.session = req.session || {}; req.session.adminUserId = "admin-1"; next(); },
        requirePermission: () => (req: any, _res: any, next: () => void) => { next(); },
    }));
    vi.doMock("../server/storage.js", () => ({
        storage: {
            getServiceRequestByTicketNumber: vi.fn(async (ticket: string) => ticketToOrder(ticket)),
            getServiceRequestEvents: vi.fn(async () => [{ id: "evt-1", status: "Received", message: "Received" }]),
            getCustomer: vi.fn(async (id: string) => {
                if (opts.customerForSession !== undefined) return opts.customerForSession;
                return id === "cust-a" ? CUSTOMER_A : null;
            }),
            getServiceRequest: vi.fn(),
            getServiceRequestsByCustomerId: vi.fn(),
        },
    }));
    vi.doMock("../server/repositories/index.js", () => ({
        userRepo: { getUser: vi.fn(async () => CUSTOMER_A) },
        customerRepo: {},
        orderRepo: {},
        corporateRepo: {},
        notificationRepo: {},
    }));
    vi.doMock("../server/db.js", () => ({
        db: {
            select: vi.fn(() => ({
                from: vi.fn(() => ({
                    where: vi.fn(() => ({
                        orderBy: vi.fn(() => ({
                            limit: vi.fn(async () => []),
                        })),
                    })),
                    orderBy: vi.fn(() => ({
                        limit: vi.fn(async () => []),
                    })),
                    limit: vi.fn(async () => []),
                })),
            })),
        },
    }));
    vi.doMock("../server/routes/middleware/sse-broker.js", () => ({
        addCustomerSSEClient: vi.fn(),
        removeCustomerSSEClient: vi.fn(),
        notifyAdminUpdate: vi.fn(),
        notifyCustomerUpdate: vi.fn(),
    }));
    vi.doMock("../server/services/firebase.js", () => ({ firebaseAdmin: { auth: () => ({ verifyIdToken: vi.fn() }) } }));
    vi.doMock("../server/routes/middleware/rate-limit.js", () => ({
        authLimiter: (req: any, _res: any, next: () => void) => next(),
        registrationLimiter: (req: any, _res: any, next: () => void) => next(),
        serviceRequestLimiter: (req: any, _res: any, next: () => void) => next(),
        accountRecoveryLimiter: (req: any, _res: any, next: () => void) => next(),
    }));
    vi.doMock("../server/routes/blacklist.routes.js", () => ({ isPhoneBlacklisted: vi.fn(async () => false) }));
    vi.doMock("../server/utils/phone.js", () => ({
        normalizePhone: (phone: string | null | undefined) => {
            if (!phone) return null;
            let d = phone.replace(/\D/g, "");
            if (d.startsWith("880")) d = d.slice(3);
            if (d.startsWith("0")) d = d.slice(1);
            return d.slice(-10) || null;
        },
    }));
    vi.doMock("../server/services/customer.service.js", () => ({
        customerService: {
            linkServiceRequestToCustomer: opts.link ?? vi.fn(async () => true),
            linkServiceRequestsByPhone: vi.fn(async () => 0),
        },
    }));
    vi.doMock("../shared/schema.js", () => ({
        insertManualPaymentSchema: { pick: () => ({ extend: () => ({ parse: (v: unknown) => v }) }) },
        manualPayments: {
            serviceRequestId: "serviceRequestId",
            jobTicketId: "jobTicketId",
            createdAt: "createdAt",
        },
        User: {},
    }));
}

describe("FF-006 Customer tracking ownership", () => {
    beforeEach(() => { vi.resetModules(); });
    afterEach(() => { vi.restoreAllMocks(); });

    it("anonymous request returns limited public projection only", async () => {
        setupMocks();
        const { default: router } = await import("../server/routes/customer.routes.js");
        const app = createAppWithSession(router, null);

        const res = await request(app).get(`/api/customer/track/${TICKET_A}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("ticketNumber", TICKET_A);
        expect(res.body).toHaveProperty("trackingStatus");
        expect(res.body).toHaveProperty("createdAt");
        expect(res.body).toHaveProperty("message");
        expect(res.body).not.toHaveProperty("phone");
        expect(res.body).not.toHaveProperty("address");
        expect(res.body).not.toHaveProperty("customerId");
        expect(res.body).not.toHaveProperty("timeline");
        expect(res.body).not.toHaveProperty("paymentSubmissions");
        expect(res.body).not.toHaveProperty("id");
    });

    it("Customer A accessing Customer A ticket returns full projection", async () => {
        setupMocks();
        const { default: router } = await import("../server/routes/customer.routes.js");
        const app = createAppWithSession(router, { customerId: "cust-a" });

        const res = await request(app).get(`/api/customer/track/${TICKET_A}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("ticketNumber", TICKET_A);
        expect(res.body).toHaveProperty("phone");
        expect(res.body).toHaveProperty("address");
        expect(res.body).toHaveProperty("customerId", "cust-a");
        expect(res.body).toHaveProperty("timeline");
        expect(res.body).toHaveProperty("paymentSubmissions");
    });

    it("Customer A accessing Customer B ticket gets 404 and no private data", async () => {
        setupMocks();
        const { default: router } = await import("../server/routes/customer.routes.js");
        const app = createAppWithSession(router, { customerId: "cust-a" });

        const res = await request(app).get(`/api/customer/track/${TICKET_B}`);

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty("error");
        expect(res.body).not.toHaveProperty("phone");
        expect(res.body).not.toHaveProperty("address");
        expect(res.body).not.toHaveProperty("customerId");
        expect(res.body).not.toHaveProperty("timeline");
        expect(res.body).not.toHaveProperty("paymentSubmissions");
        expect(res.body).not.toHaveProperty("id");
        expect(res.body).not.toHaveProperty("ticketNumber");
    });

    it("unlinked legacy ticket with matching phone links and returns full projection", async () => {
        const linkMock = vi.fn(async () => true);
        setupMocks({ link: linkMock });

        const { default: router } = await import("../server/routes/customer.routes.js");
        const app = createAppWithSession(router, { customerId: "cust-a" });

        const res = await request(app).get(`/api/customer/track/${TICKET_LEGACY}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("ticketNumber", TICKET_LEGACY);
        expect(res.body).toHaveProperty("timeline");
        expect(res.body).toHaveProperty("paymentSubmissions");
        expect(linkMock).toHaveBeenCalledWith("srv-legacy", "cust-a");
    });

    it("unlinked legacy ticket with non-matching phone gets 404 and no private data", async () => {
        setupMocks();
        const { default: router } = await import("../server/routes/customer.routes.js");
        const app = createAppWithSession(router, { customerId: "cust-a" });

        const res = await request(app).get(`/api/customer/track/${TICKET_LEGACY_MISMATCH}`);

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty("error");
        expect(res.body).not.toHaveProperty("phone");
        expect(res.body).not.toHaveProperty("address");
        expect(res.body).not.toHaveProperty("customerId");
        expect(res.body).not.toHaveProperty("timeline");
        expect(res.body).not.toHaveProperty("paymentSubmissions");
        expect(res.body).not.toHaveProperty("id");
        expect(res.body).not.toHaveProperty("ticketNumber");
    });

    it("response body for denied access never leaks phone, address, customerId, payments, timeline, or raw internal IDs", async () => {
        setupMocks();
        const { default: router } = await import("../server/routes/customer.routes.js");
        const app = createAppWithSession(router, { customerId: "cust-a" });

        const res = await request(app).get(`/api/customer/track/${TICKET_B}`);

        const body = JSON.stringify(res.body);
        expect(body).not.toContain("01710000002");
        expect(body).not.toContain("House B");
        expect(body).not.toContain("cust-b");
        expect(body).not.toContain("srv-b");
        expect(body).not.toContain("timeline");
        expect(body).not.toContain("paymentSubmissions");
    });
});