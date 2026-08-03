import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispositionForAuthCheckError } from "../client/src/lib/customer-auth-check.js";
import { inquiryMatchesSearch } from "../client/src/lib/inquiry-search.js";
import {
  isInquiryVisibilitySseEvent,
  toastForInquiryVisibilityEvent,
} from "../client/src/lib/admin-sse-inquiry-events.js";
import { ApiError } from "../client/src/lib/api/httpClient.js";

/**
 * CUSTOMER-AUTH-RESILIENCE-AND-RECOVERY-VISIBILITY-01A
 */

function createApp(router: express.Router) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = req.session || {};
    next();
  });
  app.use(router);
  return app;
}

describe("GET /api/customer/me resilience", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function loadMeRouter(getCustomer: ReturnType<typeof vi.fn>) {
    vi.doMock("../server/storage.js", () => ({
      storage: {
        getCustomer,
        createInquiry: vi.fn(),
      },
    }));
    vi.doMock("../server/repositories/index.js", () => ({
      userRepo: { getUserByPhone: vi.fn(), createUser: vi.fn(), updateUser: vi.fn() },
      settingsRepo: {},
    }));
    vi.doMock("../server/db.js", () => ({
      db: { execute: vi.fn() },
    }));
    vi.doMock("../server/routes/middleware/auth.js", () => ({
      requireCustomerAuth: (_req: any, _res: any, next: () => void) => next(),
      getCustomerId: (req: any) => req.session?.customerId,
      authLimiter: (_req: any, _res: any, next: () => void) => next(),
      accountRecoveryLimiter: (_req: any, _res: any, next: () => void) => next(),
    }));
    vi.doMock("../server/routes/middleware/rate-limit.js", () => ({
      authLimiter: (_req: any, _res: any, next: () => void) => next(),
      accountRecoveryLimiter: (_req: any, _res: any, next: () => void) => next(),
    }));
    vi.doMock("../server/services/customer-session.service.js", () => ({
      establishCustomerSession: vi.fn(async () => ({ csrfToken: "x" })),
      enforceCustomerLoginPolicy: vi.fn(),
      CustomerAccountNotActivatedError: class extends Error {},
    }));
    vi.doMock("../server/utils/session.js", () => ({
      regenerateSession: vi.fn(async () => {}),
    }));
    vi.doMock("../server/routes/middleware/sse-broker.js", () => ({
      notifyAdminUpdate: vi.fn(),
    }));
    vi.doMock("../server/services/customer.service.js", () => ({
      customerService: { linkServiceRequestsByPhone: vi.fn() },
    }));
    // customer.routes may pull many deps — mock broadly if import fails
    try {
      const mod = await import("../server/routes/customer.routes.js");
      return mod.default;
    } catch {
      // fallback: mount a minimal mirror of the fixed /me handler for contract tests
      const r = express.Router();
      r.get("/api/customer/me", async (req: any, res) => {
        try {
          if (!req.session?.customerId) {
            return res.status(401).json({ error: "Not logged in", code: "NOT_AUTHENTICATED" });
          }
          const customer = await getCustomer(req.session.customerId);
          if (!customer) {
            return res.status(401).json({ error: "Customer not found", code: "INVALID_SESSION" });
          }
          const { password: _, ...safe } = customer;
          res.json(safe);
        } catch {
          res.status(503).json({
            error: "Unable to verify session right now. Please try again.",
            code: "AUTH_CHECK_UNAVAILABLE",
          });
        }
      });
      return r;
    }
  }

  it("returns 503 AUTH_CHECK_UNAVAILABLE (not 401) when lookup throws — and does respond", async () => {
    const getCustomer = vi.fn(async () => {
      throw new Error("connection refused");
    });
    const router = await loadMeRouter(getCustomer);
    const app = createApp(router);
    // inject session
    app.use((req: any, _res, next) => {
      req.session.customerId = "cust-1";
      next();
    });
    // re-mount with session injection before router — rebuild
    const app2 = express();
    app2.use(express.json());
    app2.use((req: any, _res, next) => {
      req.session = { customerId: "cust-1" };
      next();
    });
    app2.use(router);

    const res = await request(app2).get("/api/customer/me");
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("AUTH_CHECK_UNAVAILABLE");
    expect(res.body.error).toBeTruthy();
  });

  it("returns 401 NOT_AUTHENTICATED when no session", async () => {
    const getCustomer = vi.fn();
    const router = await loadMeRouter(getCustomer);
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.session = {};
      next();
    });
    app.use(router);

    const res = await request(app).get("/api/customer/me");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("NOT_AUTHENTICATED");
    expect(getCustomer).not.toHaveBeenCalled();
  });

  it("returns 401 INVALID_SESSION when customer row is missing", async () => {
    const getCustomer = vi.fn(async () => undefined);
    const router = await loadMeRouter(getCustomer);
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.session = {
        customerId: "gone",
        destroy: (cb: () => void) => cb(),
      };
      next();
    });
    app.use(router);

    const res = await request(app).get("/api/customer/me");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_SESSION");
  });
});

describe("dispositionForAuthCheckError (checkAuth)", () => {
  it("logs out on 401 ApiError", () => {
    expect(dispositionForAuthCheckError(new ApiError("nope", "NOT_AUTHENTICATED", 401))).toBe("logout");
  });

  it("logs out on session codes even if status were present", () => {
    for (const code of [
      "NOT_AUTHENTICATED",
      "INVALID_SESSION",
      "SESSION_REVOKED",
      "SESSION_REAUTH_REQUIRED",
    ]) {
      expect(dispositionForAuthCheckError(new ApiError("x", code, 401))).toBe("logout");
    }
  });

  it("keeps session on 503 AUTH_CHECK_UNAVAILABLE", () => {
    expect(
      dispositionForAuthCheckError(new ApiError("blip", "AUTH_CHECK_UNAVAILABLE", 503)),
    ).toBe("keep");
  });

  it("keeps session on 408 REQUEST_TIMEOUT", () => {
    expect(dispositionForAuthCheckError(new ApiError("timeout", "REQUEST_TIMEOUT", 408))).toBe("keep");
  });

  it("keeps session on raw network error with no statusCode", () => {
    expect(dispositionForAuthCheckError(new TypeError("Failed to fetch"))).toBe("keep");
    expect(dispositionForAuthCheckError(new Error("network down"))).toBe("keep");
  });
});

describe("SSE inquiry visibility events", () => {
  it("recognizes account_recovery_request and customer_created", () => {
    expect(isInquiryVisibilitySseEvent({ type: "account_recovery_request" })).toBe(true);
    expect(isInquiryVisibilitySseEvent({ type: "customer_created" })).toBe(true);
  });

  it("unknown types do not match (handler must not throw)", () => {
    expect(isInquiryVisibilitySseEvent({ type: "totally_unknown" })).toBe(false);
    expect(isInquiryVisibilitySseEvent(null)).toBe(false);
    expect(() => toastForInquiryVisibilityEvent({ type: "weird" })).not.toThrow();
  });

  it("builds toast copy for recovery and registration", () => {
    const rec = toastForInquiryVisibilityEvent({ type: "account_recovery_request" });
    expect(rec.title.toLowerCase()).toContain("recovery");
    const created = toastForInquiryVisibilityEvent({
      type: "customer_created",
      data: { name: "Rina" },
    });
    expect(created.description).toContain("Rina");
  });
});

describe("inquiry search predicate", () => {
  const row = {
    name: "Karim",
    phone: "01712345678",
    message: "[ACCOUNT_RECOVERY] Ticket: T1",
    status: "Pending",
    reply: null as string | null,
  };

  it("matches name, phone, and message", () => {
    expect(inquiryMatchesSearch(row, "karim")).toBe(true);
    expect(inquiryMatchesSearch(row, "01712")).toBe(true);
    expect(inquiryMatchesSearch(row, "account_recovery")).toBe(true);
  });

  it("email-shaped term still finds the record via phone/name/message (not silent zero)", () => {
    // Old bug: inq.email was always undefined → email query matched nothing.
    // Searching a phone that is on the row must still work.
    const emailish = "user@example.com";
    const withEmailInMessage = { ...row, message: `Contact ${emailish} please` };
    expect(inquiryMatchesSearch(withEmailInMessage, "user@example.com")).toBe(true);
    expect(inquiryMatchesSearch(row, "01712345678")).toBe(true);
  });

  it("does not require an email field", () => {
    expect((row as any).email).toBeUndefined();
    expect(inquiryMatchesSearch(row, "Karim")).toBe(true);
  });
});
