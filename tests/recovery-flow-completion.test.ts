import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_RECOVERY_MESSAGE_PREFIX,
  isAccountRecoveryInquiryMessage,
} from "../shared/account-recovery.js";

/**
 * RECOVERY-FLOW-COMPLETION-01A
 */

describe("isAccountRecoveryInquiryMessage", () => {
  it("matches recovery prefix", () => {
    expect(isAccountRecoveryInquiryMessage(`${ACCOUNT_RECOVERY_MESSAGE_PREFIX} Ticket: T1`)).toBe(true);
    expect(isAccountRecoveryInquiryMessage(`  ${ACCOUNT_RECOVERY_MESSAGE_PREFIX} hi`)).toBe(true);
  });

  it("rejects ordinary inquiries", () => {
    expect(isAccountRecoveryInquiryMessage("Please call me back")).toBe(false);
    expect(isAccountRecoveryInquiryMessage("ACCOUNT_RECOVERY without brackets")).toBe(false);
    expect(isAccountRecoveryInquiryMessage(null)).toBe(false);
    expect(isAccountRecoveryInquiryMessage(undefined)).toBe(false);
  });
});

describe("POST /api/admin/customers/:id/reset-link delivery + inquiry close-loop", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.APP_BASE_URL;
  });

  async function mountResetRoute(opts: {
    customer: { id: string; role: string; name: string; phone: string | null };
    inquiry?: { id: string; message: string; status?: string } | null;
    smsResult?: { success: boolean; error?: string };
  }) {
    process.env.APP_BASE_URL = "https://app.example.test";
    const sendSms = vi.fn(async (args: { to: string; message: string }) => {
      // Capture for assertions; tests must not log full URL
      return opts.smsResult ?? { success: true, messageId: "m1" };
    });
    const updateInquiry = vi.fn(async () => ({ id: opts.inquiry?.id, status: "Replied" }));
    const getInquiry = vi.fn(async (id: string) => {
      if (!opts.inquiry || opts.inquiry.id !== id) return undefined;
      return opts.inquiry;
    });
    const getUser = vi.fn(async () => opts.customer);

    vi.doMock("../server/routes/middleware/auth.js", () => ({
      requireAdminAuth: (req: any, _res: any, next: () => void) => {
        req.session = { adminUserId: "super-admin-1" };
        next();
      },
      requireSuperAdmin: (_req: any, _res: any, next: () => void) => next(),
      requirePermission: () => (_r: any, _s: any, n: () => void) => n(),
      requireGranularPermission: () => (_r: any, _s: any, n: () => void) => n(),
      requireAnyPermission: () => (_r: any, _s: any, n: () => void) => n(),
      getEffectivePermissionsForUser: () => ({}),
      adminCreateUserSchema: { parse: (v: unknown) => v },
      adminUpdateUserSchema: { parse: (v: unknown) => v },
      getDefaultPermissions: () => ({}),
    }));
    vi.doMock("../server/repositories/index.js", () => ({
      userRepo: { getUser, deleteUser: vi.fn(), createUser: vi.fn(), updateUser: vi.fn() },
      analyticsRepo: {},
      orderRepo: { getOrdersByCustomerId: vi.fn(async () => []) },
      serviceRequestRepo: { getServiceRequestsByCustomerId: vi.fn(async () => []) },
      jobRepo: {},
      employmentRepo: {},
    }));
    vi.doMock("../server/repositories/customer.repository.js", () => ({
      getInquiry,
      updateInquiry,
      getAllInquiries: vi.fn(),
      createInquiry: vi.fn(),
    }));
    vi.doMock("../server/storage.js", () => ({
      storage: {
        updateInquiry,
        getAllInquiries: vi.fn(async () => []),
      },
    }));
    vi.doMock("../server/db.js", () => ({
      db: {
        transaction: async (fn: any) => fn({
          execute: vi.fn(async () => ({})),
        }),
        execute: vi.fn(async () => ({})),
      },
    }));
    vi.doMock("../server/services/sms.service.js", () => ({
      smsService: { sendSms },
    }));
    vi.doMock("../server/services/corporate-setup-token.service.js", () => ({
      getCorporateAppBaseUrl: () => "https://app.example.test",
      createCorporateSetupToken: vi.fn(),
      invalidateCorporateSetupToken: vi.fn(),
      invalidateOtherCorporateSetupTokens: vi.fn(),
      removeCorporateUserAndTokens: vi.fn(),
    }));
    vi.doMock("../server/utils/auditLogger.js", () => ({
      auditLogger: { log: vi.fn(async () => {}) },
    }));
    vi.doMock("../server/utils/route-error.js", () => ({ logRouteError: vi.fn() }));
    vi.doMock("../server/routes/middleware/sse-broker.js", () => ({
      notifySpecificAdmin: vi.fn(),
    }));
    vi.doMock("../server/services/mailer.js", () => ({ MailerService: class {} }));
    vi.doMock("../server/services/auth.service.js", () => ({ authService: {} }));
    vi.doMock("../server/services/audit.service.js", () => ({ AuditLogger: class {} }));
    vi.doMock("../server/services/customer-repair-journey.service.js", () => ({
      repairJourneyService: {},
    }));
    vi.doMock("../server/services/corporate-password-reset.service.js", () => ({
      corporatePasswordResetService: {},
    }));
    vi.doMock("../server/services/assignment.service.js", () => ({
      upsertPresence: vi.fn(),
      sweepOfflineStaff: vi.fn(),
    }));
    vi.doMock("../server/lib/dashboardCache.js", () => ({ getCachedDashboard: vi.fn() }));
    vi.doMock("../server/routes/admin-stream.js", () => ({ handleAdminEventStream: vi.fn() }));

    const { default: router } = await import("../server/routes/users.routes.js");
    const app = express();
    app.use(express.json());
    app.use(router);
    return { app, sendSms, updateInquiry, getInquiry, getUser };
  }

  it("deliver:sms sends only to phone on the customer record (never body phone)", async () => {
    const { app, sendSms } = await mountResetRoute({
      customer: {
        id: "cust-1",
        role: "Customer",
        name: "Rina",
        phone: "01711112222",
      },
      smsResult: { success: true },
    });

    const res = await request(app)
      .post("/api/admin/customers/cust-1/reset-link")
      .send({
        deliver: "sms",
        phone: "01999998888", // attacker-supplied — must be ignored
        to: "01999998888",
      });

    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^https:\/\/app\.example\.test\/reset#t=/);
    expect(res.body.delivery?.status).toBe("sent");
    expect(sendSms).toHaveBeenCalledTimes(1);
    const arg = sendSms.mock.calls[0][0];
    expect(arg.to).toBe("01711112222");
    expect(arg.to).not.toBe("01999998888");
    // Response must not leak token outside url (url is intentional once-only return)
    const blob = JSON.stringify(res.body);
    expect(blob).not.toMatch(/tokenHash|token_hash/);
  });

  it("SMS failure still returns url and reports delivery failed", async () => {
    const { app, sendSms } = await mountResetRoute({
      customer: { id: "cust-1", role: "Customer", name: "Rina", phone: "01711112222" },
      smsResult: { success: false, error: "gateway down" },
    });

    const res = await request(app)
      .post("/api/admin/customers/cust-1/reset-link")
      .send({ deliver: "sms" });

    expect(res.status).toBe(200);
    expect(res.body.url).toBeTruthy();
    expect(res.body.delivery).toEqual({
      channel: "sms",
      status: "failed",
      error: "gateway down",
    });
    expect(sendSms).toHaveBeenCalled();
  });

  it("inquiryId on recovery inquiry marks Replied with internal note (no token)", async () => {
    const { app, updateInquiry } = await mountResetRoute({
      customer: { id: "cust-1", role: "Customer", name: "Rina", phone: "01711112222" },
      inquiry: {
        id: "inq-rec-1",
        message: "[ACCOUNT_RECOVERY] Ticket: T9",
        status: "Pending",
      },
    });

    const res = await request(app)
      .post("/api/admin/customers/cust-1/reset-link")
      .send({ inquiryId: "inq-rec-1" });

    expect(res.status).toBe(200);
    expect(updateInquiry).toHaveBeenCalled();
    const [id, updates] = updateInquiry.mock.calls[0];
    expect(id).toBe("inq-rec-1");
    expect(updates.status).toBe("Replied");
    expect(updates.reply).toContain("[RESET_LINK_ISSUED]");
    expect(updates.reply).not.toContain(res.body.url);
    expect(String(updates.reply)).not.toMatch(/#t=/);
  });

  it("inquiryId on non-recovery inquiry is rejected", async () => {
    const { app, updateInquiry } = await mountResetRoute({
      customer: { id: "cust-1", role: "Customer", name: "Rina", phone: "01711112222" },
      inquiry: {
        id: "inq-ord-1",
        message: "When is my TV ready?",
        status: "Pending",
      },
    });

    const res = await request(app)
      .post("/api/admin/customers/cust-1/reset-link")
      .send({ inquiryId: "inq-ord-1" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NOT_RECOVERY_INQUIRY");
    expect(updateInquiry).not.toHaveBeenCalled();
  });

  it("absent inquiryId leaves inquiry untouched", async () => {
    const { app, updateInquiry } = await mountResetRoute({
      customer: { id: "cust-1", role: "Customer", name: "Rina", phone: "01711112222" },
      inquiry: {
        id: "inq-rec-1",
        message: "[ACCOUNT_RECOVERY] hi",
      },
    });

    const res = await request(app).post("/api/admin/customers/cust-1/reset-link").send({});
    expect(res.status).toBe(200);
    expect(updateInquiry).not.toHaveBeenCalled();
  });
});

describe("UI action matrix (contract)", () => {
  it("recovery rows use Issue reset link; ordinary use Internal note", () => {
    const recovery = isAccountRecoveryInquiryMessage("[ACCOUNT_RECOVERY] x");
    const ordinary = isAccountRecoveryInquiryMessage("Hello support");
    expect(recovery).toBe(true);
    expect(ordinary).toBe(false);
    // Document intended primary action labels for InquiriesTab
    const actionFor = (isRec: boolean) => (isRec ? "Issue reset link" : "Internal note");
    expect(actionFor(recovery)).toBe("Issue reset link");
    expect(actionFor(ordinary)).toBe("Internal note");
    expect(actionFor(recovery)).not.toBe("Reply");
  });
});
