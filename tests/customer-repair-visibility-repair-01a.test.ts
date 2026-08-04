/**
 * CUSTOMER-REPAIR-VISIBILITY-REPAIR-01A
 *
 * Covers ITEMs 1–7 required tests (local, mocked DB / routes).
 */
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shouldAdoptOrphanJourney } from "../server/services/orphan-journey-reconcile.rules.js";
import { isPublicServiceTicketNumber } from "../client/src/lib/service-request-lookup.js";

describe("ITEM 4 pure safety predicate — shouldAdoptOrphanJourney", () => {
  it("adopts when journey is unowned and SR already has an owner", () => {
    expect(
      shouldAdoptOrphanJourney({
        journeyCustomerId: null,
        serviceRequestCustomerId: "cust-1",
      }),
    ).toBe(true);
  });

  it("skips when journey already has an owner (never overwrite)", () => {
    expect(
      shouldAdoptOrphanJourney({
        journeyCustomerId: "cust-other",
        serviceRequestCustomerId: "cust-1",
      }),
    ).toBe(false);
  });

  it("skips when service request is also unowned (never guess)", () => {
    expect(
      shouldAdoptOrphanJourney({
        journeyCustomerId: null,
        serviceRequestCustomerId: null,
      }),
    ).toBe(false);
  });

  it("is idempotent for already-owned journeys", () => {
    expect(
      shouldAdoptOrphanJourney({
        journeyCustomerId: "cust-1",
        serviceRequestCustomerId: "cust-1",
      }),
    ).toBe(false);
  });
});

describe("ITEM 4 HOTFIX-2 reconcile target guard — parsed hostname only", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function importGuard() {
    const mod = await import("../server/services/orphan-journey-reconcile.service.js");
    return mod as { classifyReconcileTarget: (u: string | undefined | null) => "local" | "remote" | "invalid" };
  }

  it("treats exact loopback hostnames as local", async () => {
    const { classifyReconcileTarget } = await importGuard();
    expect(classifyReconcileTarget("postgresql://u:p@localhost:5432/db")).toBe("local");
    expect(classifyReconcileTarget("postgresql://u:p@127.0.0.1:5432/db")).toBe("local");
    expect(classifyReconcileTarget("postgresql://u:p@[::1]:5432/db")).toBe("local");
  });

  it("classifies remote as remote despite localhost in the USERNAME", async () => {
    const { classifyReconcileTarget } = await importGuard();
    expect(classifyReconcileTarget("postgresql://localhost:pw@remote.example.com/app")).toBe("remote");
  });

  it("classifies remote as remote despite localhost in the PASSWORD", async () => {
    const { classifyReconcileTarget } = await importGuard();
    expect(classifyReconcileTarget("postgresql://u:localhost@remote.example.com/app")).toBe("remote");
  });

  it("classifies remote as remote despite localhost in the DATABASE PATH", async () => {
    const { classifyReconcileTarget } = await importGuard();
    expect(classifyReconcileTarget("postgresql://u:p@remote.example.com/localhost")).toBe("remote");
  });

  it("classifies remote as remote despite localhost in the QUERY STRING", async () => {
    const { classifyReconcileTarget } = await importGuard();
    expect(classifyReconcileTarget("postgresql://u:p@remote.example.com/app?host=localhost")).toBe("remote");
  });

  it("classifies plain remote hostnames as remote", async () => {
    const { classifyReconcileTarget } = await importGuard();
    expect(classifyReconcileTarget("postgresql://u:p@remote.example.com/app")).toBe("remote");
  });

  it("fails closed on malformed URLs", async () => {
    const { classifyReconcileTarget } = await importGuard();
    expect(classifyReconcileTarget("not a url")).toBe("invalid");
    expect(classifyReconcileTarget("postgresql://u:p@:5432/db")).toBe("invalid");
    expect(classifyReconcileTarget("postgresql:///db")).toBe("invalid");
  });

  it("fails closed on empty or missing URLs", async () => {
    const { classifyReconcileTarget } = await importGuard();
    expect(classifyReconcileTarget("")).toBe("invalid");
    expect(classifyReconcileTarget(undefined)).toBe("invalid");
    expect(classifyReconcileTarget(null)).toBe("invalid");
  });

  async function mountReconcileService() {
    const execute = vi.fn(async () => ({
      rows: [{ candidates: 0, adopted: 0, conflicts: 0, skipped_unowned: 0, already_owned: 0 }],
    }));
    vi.doMock("../server/db.js", () => ({ db: { execute } }));
    const mod = await import("../server/services/orphan-journey-reconcile.service.js");
    return { reconcile: mod.reconcileOrphanJourneys, execute };
  }

  it("rejected remote target causes ZERO DB calls", async () => {
    process.env.DATABASE_URL = "postgresql://u:p@remote.example.com/app";
    delete process.env.ALLOW_REMOTE_ORPHAN_RECONCILE;

    const { reconcile, execute } = await mountReconcileService();
    await expect(reconcile()).rejects.toThrow(/Refusing|remote/i);
    expect(execute).not.toHaveBeenCalled();
  });

  it("malformed URL fails closed even WITH remote opt-in", async () => {
    process.env.DATABASE_URL = "not a url";
    process.env.ALLOW_REMOTE_ORPHAN_RECONCILE = "1";

    const { reconcile, execute } = await mountReconcileService();
    await expect(reconcile()).rejects.toThrow(/Refusing|malformed/i);
    expect(execute).not.toHaveBeenCalled();
  });

  it("explicit remote opt-in is required and separately tested — guard passes only with it", async () => {
    process.env.DATABASE_URL = "postgresql://u:p@remote.example.com/app";
    process.env.ALLOW_REMOTE_ORPHAN_RECONCILE = "1";

    const { reconcile, execute } = await mountReconcileService();
    const report = await reconcile();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(report.candidates).toBe(0);

    process.env.ALLOW_REMOTE_ORPHAN_RECONCILE = "0";
    const { reconcile: reconcileNo, execute: executeNo } = await mountReconcileService();
    await expect(reconcileNo()).rejects.toThrow(/Refusing|remote/i);
    expect(executeNo).not.toHaveBeenCalled();
  });
});

describe("ITEM 5 ticket vs id lookup helper", () => {
  it("treats SRV- tickets as public ticket numbers", () => {
    expect(isPublicServiceTicketNumber("SRV-20260803-001")).toBe(true);
    expect(isPublicServiceTicketNumber("srv-20260803-001")).toBe(true);
  });

  it("treats internal ids as non-tickets", () => {
    expect(isPublicServiceTicketNumber("BAN1HOu-s6df8-iEzfMyC")).toBe(false);
    expect(isPublicServiceTicketNumber("4YpDrngtmrVJuPY_Ooox5")).toBe(false);
  });
});

describe("ITEM 1+2 quote journey owner + observable create", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function mountQuotes(opts: {
    sessionCustomerId?: string | null;
    resolvedCustomerId: string | null;
    journeyThrows?: boolean;
  }) {
    const createJourneyFromQuote = vi.fn(async (args: { quoteRequestId: string; customerId: string | null }) => {
      if (opts.journeyThrows) throw new Error("journey insert failed");
      return "journey-1";
    });

    vi.doMock("../server/services/customer-repair-journey.service.js", () => ({
      repairJourneyService: {
        createJourneyFromQuote,
        createJourneyFromServiceRequest: vi.fn(),
      },
    }));

    vi.doMock("../server/services/retail-intake.service.js", () => ({
      createRetailServiceRequest: vi.fn(async () => ({
        serviceRequest: {
          id: "quote-sr-1",
          ticketNumber: "SRV-20260803-099",
          customerId: opts.resolvedCustomerId,
          customerName: "Test",
          phone: "01710000001",
          brand: "Samsung",
          primaryIssue: "No power",
          isQuote: true,
        },
        idempotent: false,
        duplicateWindow: false,
      })),
      IntakeError: class IntakeError extends Error {
        status = 400;
        code = "INTAKE";
      },
      parseIdempotencyKeyHeader: () => null,
      sanitizePublicServiceRequest: (r: any) => r,
    }));

    vi.doMock("../server/routes/middleware/rate-limit.js", () => ({
      serviceRequestLimiter: (_req: any, _res: any, next: () => void) => next(),
    }));
    vi.doMock("../server/routes/middleware/auth.js", () => ({
      getCustomerId: (req: any) => req.session?.customerId,
      requireAdminAuth: (_r: any, _s: any, n: () => void) => n(),
      requireCustomerAuth: (_r: any, _s: any, n: () => void) => n(),
      requireGranularPermission: () => (_r: any, _s: any, n: () => void) => n(),
      requireAnyGranularPermission: () => (_r: any, _s: any, n: () => void) => n(),
    }));
    vi.doMock("../server/routes/middleware/sse-broker.js", () => ({
      notifyAdminUpdate: vi.fn(),
      notifyCustomerUpdate: vi.fn(),
    }));
    vi.doMock("../server/storage.js", () => ({ storage: {} }));
    vi.doMock("../server/repositories/index.js", () => ({
      settingsRepo: {},
      notificationRepo: {},
      systemRepo: {},
      userRepo: {},
      jobRepo: {},
      serviceRequestRepo: { getQuoteRequests: vi.fn(async () => []) },
      warrantyRepo: {},
      hrRepo: {},
    }));
    vi.doMock("../server/pushService.js", () => ({ pushService: {} }));
    vi.doMock("../server/services/job.service.js", () => ({ jobService: {} }));
    vi.doMock("../server/services/logistics-task.service.js", () => ({
      syncPickupScheduleToLogisticsTask: vi.fn(),
    }));
    vi.doMock("../server/db.js", () => ({ db: { execute: vi.fn() } }));
    vi.doMock("../server/utils/auditLogger.js", () => ({ auditLogger: { log: vi.fn() } }));
    vi.doMock("../server/services/retail-quote.service.js", () => ({
      sendOrPriceQuote: vi.fn(),
      acceptRetailQuote: vi.fn(),
      declineRetailQuote: vi.fn(),
      convertRetailQuoteToJob: vi.fn(),
      RetailQuoteError: class extends Error {},
      attachCanonicalQuoteView: (x: any) => x,
    }));
    vi.doMock("../shared/schema.js", async (importOriginal) => {
      const actual = await importOriginal<any>();
      return {
        ...actual,
        insertQuoteRequestSchema: {
          parse: (body: any) => ({
            brand: body.brand || "Samsung",
            primaryIssue: body.primaryIssue || "No power",
            customerName: body.customerName || "Test",
            phone: body.phone || "01710000001",
            description: body.description,
            serviceMode: body.serviceMode,
            requestIntent: "quote",
          }),
        },
      };
    });

    const { default: router } = await import("../server/routes/quotes.routes.js");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.session = { customerId: opts.sessionCustomerId ?? null };
      next();
    });
    app.use(router);
    return { app, createJourneyFromQuote };
  }

  it("anonymous quote → journey uses post-intake resolved customer id (not null session)", async () => {
    const { app, createJourneyFromQuote } = await mountQuotes({
      sessionCustomerId: null,
      resolvedCustomerId: "resolved-cust-phone",
    });

    const res = await request(app).post("/api/quotes").send({
      brand: "Samsung",
      primaryIssue: "No power",
      customerName: "Anon",
      phone: "01710000001",
    });

    expect(res.status).toBe(201);
    expect(createJourneyFromQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        quoteRequestId: "quote-sr-1",
        customerId: "resolved-cust-phone",
      }),
    );
  });

  it("authenticated quote → journey uses resolved id (unchanged behaviour)", async () => {
    const { app, createJourneyFromQuote } = await mountQuotes({
      sessionCustomerId: "session-cust",
      resolvedCustomerId: "session-cust",
    });

    const res = await request(app).post("/api/quotes").send({
      brand: "LG",
      primaryIssue: "Lines",
      customerName: "Auth",
      phone: "01710000002",
    });

    expect(res.status).toBe(201);
    expect(createJourneyFromQuote).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "session-cust" }),
    );
  });

  it("journey create failure still returns success (ITEM 2: do not reject committed SR)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { app, createJourneyFromQuote } = await mountQuotes({
      sessionCustomerId: null,
      resolvedCustomerId: "resolved-cust",
      journeyThrows: true,
    });

    const res = await request(app).post("/api/quotes").send({
      brand: "Samsung",
      primaryIssue: "No power",
      customerName: "Anon",
      phone: "01710000001",
    });

    expect(res.status).toBe(201);
    expect(createJourneyFromQuote).toHaveBeenCalled();
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes("FAILED to create journey"))).toBe(true);
    errSpy.mockRestore();
  });
});

describe("ITEM 3 HOTFIX-2 account linker — transactional conditional linking", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function mountLinker(opts: {
    requests: Array<{ id: string; phone: string | null; customerId: string | null }>;
    /** Rows the indexed phone_normalized read returns. Default none — these
     *  fixtures carry no phone_normalized, so they belong to the legacy set. */
    indexedRequests?: Array<{ id: string; phone: string | null; customerId: string | null }>;
    txRowCounts?: Array<number>;
  }) {
    const executeCalls: unknown[] = [];
    const txRowCounts = opts.txRowCounts ?? [0, 0];

    // HOTFIX-3 replaced one unfiltered scan with two bounded reads: an indexed
    // phone_normalized lookup, then the legacy null/blank set. They are built in
    // that order inside Promise.all, so the first .where() is the indexed read.
    let whereCall = 0;

    vi.doMock("../server/db.js", () => ({
      db: {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(async () =>
              whereCall++ === 0 ? (opts.indexedRequests ?? []) : opts.requests,
            ),
          })),
        })),
        transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => {
          let callIndex = 0;
          const tx = {
            execute: vi.fn(async (q: unknown) => {
              executeCalls.push(q);
              const rowCount = txRowCounts[callIndex] ?? 0;
              callIndex++;
              return { rowCount, rows: [] };
            }),
          };
          return cb(tx);
        }),
      },
    }));

    vi.doMock("../shared/schema.js", async (importOriginal) => {
      const actual = await importOriginal<any>();
      return {
        ...actual,
        serviceRequests: {
          id: "id",
          phone: "phone",
          phoneNormalized: "phone_normalized",
          customerId: "customer_id",
        },
      };
    });

    const { customerService } = await import("../server/services/customer.service.js");
    return { customerService, executeCalls };
  }

  function sqlText(q: unknown): string {
    const chunks = (q as any)?.queryChunks ?? [];
    return chunks
      .map((c: any) => {
        if (typeof c === "string") return c;
        if (Array.isArray(c?.value)) return c.value.join("");
        if (typeof c?.value === "string") return c.value;
        if (Array.isArray(c?.queryChunks)) return sqlText(c);
        return "";
      })
      .join("");
  }

  it("links an unlinked SR and adopts its orphan journey only", async () => {
    const { customerService, executeCalls } = await mountLinker({
      requests: [
        { id: "sr-orphan", phone: "01710000001", customerId: null },
        { id: "sr-other", phone: "01719999999", customerId: null },
      ],
      txRowCounts: [1, 0],
    });

    const linked = await customerService.linkServiceRequestsByPhone("01710000001", "cust-new");

    expect(linked).toBe(1);
    expect(executeCalls.length).toBe(2);
    const linkSql = sqlText(executeCalls[0]);
    const adoptSql = sqlText(executeCalls[1]);
    expect(linkSql).toContain("sr-orphan");
    expect(linkSql).not.toContain("sr-other");
    expect(linkSql).toMatch(/\(customer_id IS NULL OR customer_id =/i);
    expect(adoptSql).toMatch(/WHERE\s+j\.customer_id IS NULL/i);
    expect(adoptSql).toContain("FROM service_requests");
    expect(adoptSql).toMatch(/sr\.customer_id\s*=/i);
    expect(adoptSql).toContain("sr-orphan");
    expect(adoptSql).not.toContain("sr-other");
  });

  it("adopts journeys of SRs already owned by the same customer even with zero new links", async () => {
    const { customerService, executeCalls } = await mountLinker({
      requests: [{ id: "sr-already", phone: "01710000001", customerId: "cust-new" }],
    });

    const linked = await customerService.linkServiceRequestsByPhone("01710000001", "cust-new");

    expect(linked).toBe(0);
    expect(executeCalls.length).toBe(2);
    expect(sqlText(executeCalls[1])).toContain("sr-already");
    expect(sqlText(executeCalls[1])).toMatch(/sr\.customer_id\s*=/i);
  });

  it("never reassigns an SR owned by another customer (no link, no adoption)", async () => {
    const { customerService, executeCalls } = await mountLinker({
      requests: [{ id: "sr-taken", phone: "01710000001", customerId: "cust-other" }],
    });

    const linked = await customerService.linkServiceRequestsByPhone("01710000001", "cust-new");

    expect(linked).toBe(0);
    expect(executeCalls.length).toBe(0);
  });

  it("no matching phone → returns 0 and runs no adoption SQL", async () => {
    const { customerService, executeCalls } = await mountLinker({
      requests: [{ id: "sr-x", phone: "01719999999", customerId: null }],
    });

    const linked = await customerService.linkServiceRequestsByPhone("01710000001", "cust-new");

    expect(linked).toBe(0);
    expect(executeCalls.length).toBe(0);
  });

  it("matches normalized phone formats (880... vs 0...) and adopts", async () => {
    const { customerService, executeCalls } = await mountLinker({
      requests: [{ id: "sr-norm", phone: "01712345678", customerId: null }],
      txRowCounts: [1, 0],
    });

    const linked = await customerService.linkServiceRequestsByPhone("8801712345678", "cust-new");

    expect(linked).toBe(1);
    expect(sqlText(executeCalls[0])).toContain("sr-norm");
  });

  it("adoption SQL never overwrites an owned journey and rechecks the owner", async () => {
    const { customerService, executeCalls } = await mountLinker({
      requests: [{ id: "sr-guard", phone: "01710000001", customerId: "cust-new" }],
    });

    await customerService.linkServiceRequestsByPhone("01710000001", "cust-new");

    const adoptSql = sqlText(executeCalls[1]);
    expect(adoptSql).toMatch(/WHERE\s+j\.customer_id IS NULL/i);
    expect(adoptSql).toContain("FROM service_requests");
    expect(adoptSql).toMatch(/sr\.customer_id\s*=/i);
  });

  it("link UPDATE predicate is conditional — cannot overwrite a different non-null owner", async () => {
    const { customerService, executeCalls } = await mountLinker({
      requests: [{ id: "sr-cond", phone: "01710000001", customerId: "cust-other" }],
    });

    const linked = await customerService.linkServiceRequestsByPhone("01710000001", "cust-new");

    expect(linked).toBe(0);
    expect(executeCalls.length).toBe(0);
  });

  it("explicit linkServiceRequestToCustomer adopts journeys after linking", async () => {
    const { customerService, executeCalls } = await mountLinker({
      requests: [],
      txRowCounts: [1, 0],
    });

    const ok = await customerService.linkServiceRequestToCustomer("sr-z", "cust-new");

    expect(ok).toBe(true);
    expect(executeCalls.length).toBe(2);
    const linkSql = sqlText(executeCalls[0]);
    expect(linkSql).toContain("sr-z");
    expect(linkSql).toMatch(/\(customer_id IS NULL OR customer_id =/i);
    expect(sqlText(executeCalls[1])).toMatch(/sr\.customer_id\s*=/i);
  });

  it("explicit link for a request owned by a different customer links nothing and adopts nothing", async () => {
    const { customerService, executeCalls } = await mountLinker({
      requests: [],
      txRowCounts: [0, 0],
    });

    const ok = await customerService.linkServiceRequestToCustomer("sr-taken", "cust-new");

    expect(ok).toBe(false);
    expect(executeCalls.length).toBe(1);
    expect(sqlText(executeCalls[0])).toContain("sr-taken");
  });

  it("explicit link for a request already owned by the same customer is not a failure", async () => {
    const { customerService, executeCalls } = await mountLinker({
      requests: [],
      txRowCounts: [1, 0],
    });

    const ok = await customerService.linkServiceRequestToCustomer("sr-already", "cust-new");

    expect(ok).toBe(true);
    expect(executeCalls.length).toBe(2);
  });
});

describe("ITEM 6 Firebase session sets freshness stamp via establishCustomerSession", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Firebase login establishes passwordChangedAtStamp so requireCustomerAuth would pass", async () => {
    const establishCustomerSession = vi.fn(async (req: any) => {
      req.session.customerId = "user-fb";
      req.session.authMethod = "firebase";
      req.session.authenticatedAt = Date.now();
      req.session.passwordChangedAtStamp = 1_700_000_000_000;
      return { csrfToken: "csrf-test" };
    });

    vi.doMock("../server/services/firebase.js", () => ({
      verifyFirebaseToken: vi.fn(async () => ({
        uid: "fb-uid-1",
        email: "a@example.com",
        name: "Firebase User",
        picture: null,
      })),
    }));

    vi.doMock("../server/services/customer-session.service.js", () => ({
      enforceCustomerLoginPolicy: vi.fn(async () => undefined),
      establishCustomerSession,
      CustomerAccountNotActivatedError: class extends Error {
        code = "ACCOUNT_SETUP_REQUIRED";
      },
    }));

    vi.doMock("../server/db.js", () => ({
      db: {
        query: {
          users: {
            findFirst: vi.fn(async () => ({
              id: "user-fb",
              name: "Firebase User",
              email: "a@example.com",
              role: "Customer",
              customerAccountState: "active",
              profileImageUrl: null,
            })),
          },
        },
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn(async () => []),
          })),
        })),
        execute: vi.fn(async () => ({ rows: [] })),
      },
    }));

    const { default: router } = await import("../server/routes/firebase-auth.routes.js");
    const app = express();
    app.use(express.json());
    let capturedSession: any = null;
    app.use((req: any, _res, next) => {
      req.session = {
        regenerate: (cb: (e?: unknown) => void) => cb(),
        save: (cb: (e?: unknown) => void) => {
          capturedSession = { ...req.session };
          cb();
        },
      };
      next();
    });
    app.use(router);

    const res = await request(app).post("/api/auth/firebase").send({ idToken: "tok" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(establishCustomerSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ customerId: "user-fb", authMethod: "firebase" }),
    );
    expect(capturedSession?.passwordChangedAtStamp).toBe(1_700_000_000_000);
  });
});

describe("ITEM 7 HOTFIX-2 SMS provider error handling", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SMS_API_URL = "https://sms.example.test/send";
    process.env.SMS_API_KEY = "secret-key-never-log";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SMS_API_URL;
    delete process.env.SMS_API_KEY;
  });

  // Sensitive values placed separately in every provider field the brief names.
  const HOSTILE = {
    error: "01710000001",
    code: "01710000001",
    status: "01710000001",
    msg: "Reset https://sms.example.test/help?token=reset-token-abc for 01710000001",
    message: "apikey-9f8e7d6c5b4a3a2b1c0d",
  };

  function allLogs(spies: Array<ReturnType<typeof vi.spyOn>>): string {
    return spies
      .flatMap((s) => s.mock.calls)
      .map((c) => c.map(String).join(" "))
      .join("\n");
  }

  it("hostile provider fields never appear in logs or in the returned error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ json: async () => ({ ...HOSTILE }) })),
    );

    const { smsService } = await import("../server/services/sms.service.js");
    const result = await smsService.sendSms({
      to: "01710000002",
      message: "Reset https://app.example/reset?token=super-secret-token",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to send SMS");
    expect(result.error).not.toContain("01710000001");
    expect(result.error).not.toContain("apikey");
    expect(result.error).not.toContain("reset-token-abc");
    expect(result.error).not.toContain("sms.example.test");

    const logs = allLogs([errSpy, logSpy]);
    expect(logs).toContain("category=provider_rejected");
    expect(logs).not.toContain("01710000001");
    expect(logs).not.toContain("apikey");
    expect(logs).not.toContain("reset-token-abc");
    expect(logs).not.toContain("super-secret-token");
    expect(logs).not.toContain("secret-key-never-log");
    expect(logs).not.toContain("sms.example.test");
    expect(logs).not.toContain("app.example");
    expect(logs).not.toContain("Insufficient");

    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("only fixed failure categories are logged — no raw provider code or status", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ json: async () => ({ ...HOSTILE }) })),
    );

    const { smsService } = await import("../server/services/sms.service.js");
    await smsService.sendSms({ to: "01710000003", message: "hi" });

    const logs = allLogs([errSpy]);
    expect(logs).toBe("[SMS] Provider response received: failure category=provider_rejected");
    expect(logs).not.toMatch(/code=|status=|msg|message/i);

    errSpy.mockRestore();
  });

  it("thrown network error never leaks URL, phone, or raw error text", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("request to https://sms.example.test/send failed: getaddrinfo ENOTFOUND for 01710000004");
      }),
    );

    const { smsService } = await import("../server/services/sms.service.js");
    const result = await smsService.sendSms({ to: "01710000004", message: "hi" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Network error while sending SMS");
    const logs = allLogs([errSpy]);
    expect(logs).toContain("network failure");
    expect(logs).not.toContain("sms.example.test");
    expect(logs).not.toContain("ENOTFOUND");
    expect(logs).not.toContain("01710000004");

    errSpy.mockRestore();
  });

  it("success response remains unchanged", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({ error: 0, msg_id: "msg-123", status: "success" }),
      })),
    );

    const { smsService } = await import("../server/services/sms.service.js");
    const result = await smsService.sendSms({ to: "01710000005", message: "hi" });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("msg-123");
    expect(result.error).toBeUndefined();
    expect(allLogs([logSpy])).toContain("[SMS] Provider response received: success");

    logSpy.mockRestore();
  });
});

describe("ITEM 5 public track endpoint is ticket-aware", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function mountSettings() {
    const getPublicServiceRequestByTicketNumber = vi.fn(async (ticket: string) => {
      if (ticket !== "SRV-20260803-777") return undefined;
      return {
        ticketNumber: "SRV-20260803-777",
        brand: "Samsung",
        screenSize: "55",
        primaryIssue: "No power",
        trackingStatus: "Request Received",
        stage: "intake",
        status: "active",
        createdAt: new Date(),
        serviceMode: "quote_only",
      };
    });

    vi.doMock("../server/storage.js", () => ({ storage: {} }));
    vi.doMock("../server/repositories/index.js", () => ({
      settingsRepo: {},
      notificationRepo: {},
      systemRepo: {},
      userRepo: {},
      jobRepo: {},
      warrantyRepo: {},
      hrRepo: {},
      serviceRequestRepo: { getPublicServiceRequestByTicketNumber },
    }));
    vi.doMock("../server/repositories/inventory.repository.js", () => ({}));
    vi.doMock("../server/routes/middleware/auth.js", () => ({
      requireAdminAuth: (_r: any, _s: any, n: () => void) => n(),
      requirePermission: () => (_r: any, _s: any, n: () => void) => n(),
      requireSuperAdmin: (_r: any, _s: any, n: () => void) => n(),
    }));
    vi.doMock("../server/utils/auditLogger.js", () => ({
      auditLogger: { log: vi.fn(async () => undefined) },
    }));
    vi.doMock("../server/services/settings-conflict.service.js", () => ({
      detectConflicts: vi.fn(),
      applyResolutions: vi.fn(),
    }));

    const { default: router } = await import("../server/routes/settings.routes.js");
    const app = express();
    app.use(express.json());
    app.use(router);
    return { app, getPublicServiceRequestByTicketNumber };
  }

  it("looks up by public SRV- ticket and returns the projection", async () => {
    const { app, getPublicServiceRequestByTicketNumber } = await mountSettings();
    const res = await request(app).get("/api/public/track/SRV-20260803-777");
    expect(res.status).toBe(200);
    expect(res.body.ticketNumber).toBe("SRV-20260803-777");
    expect(getPublicServiceRequestByTicketNumber).toHaveBeenCalledWith("SRV-20260803-777");
  });

  it("rejects short inputs and returns 404 for unknown tickets", async () => {
    const { app } = await mountSettings();
    const short = await request(app).get("/api/public/track/ab");
    expect(short.status).toBe(400);
    const missing = await request(app).get("/api/public/track/SRV-20260803-999");
    expect(missing.status).toBe(404);
  });
});
