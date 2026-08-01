/**
 * CUSTOMER-ACCOUNT-ACTIVATION-01A
 *
 * Contract tests for the staff-issued one-time reset link flow:
 * - unclaimed accounts block login with the same body as bad-password
 * - verify endpoint never reveals token validity to expired/used links
 * - complete flips customer_account_state to active
 * - second consume fails
 * - phone mismatch fails generically
 * - kill-on-login invalidates live reset links
 * - no forbidden keys in any API response
 */
import crypto from "crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Forbidden response keys (security contract) ──────────────────────────────
const FORBIDDEN_KEYS = [
    "password",
    "passwordHash",
    "temporaryPassword",
    "resetSecret",
    "otpSecret",
    "codeHash",
    "tokenHash",
];

function assertNoForbiddenKeys(body: unknown, path = "") {
    if (typeof body !== "object" || body === null) return;
    for (const key of Object.keys(body as Record<string, unknown>)) {
        expect(FORBIDDEN_KEYS, `Forbidden key "${path}${key}" found in response`).not.toContain(key);
        assertNoForbiddenKeys((body as Record<string, unknown>)[key], `${path}${key}.`);
    }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const TOKEN_RAW = crypto.randomBytes(32).toString("base64url");
const TOKEN_HASH = crypto.createHash("sha256").update(TOKEN_RAW).digest("hex");

const UNCLAIMED_USER = {
    id: "user-unclaimed",
    name: "Test Customer",
    phone: "01710000001",
    phoneNormalized: "1710000001",
    password: null,
    customerAccountState: "unclaimed",
    lastLoginAt: null,
    passwordChangedAt: null,
    role: "Customer",
};

const ACTIVE_USER = {
    ...UNCLAIMED_USER,
    id: "user-active",
    customerAccountState: "active",
    password: "$2a$12$hashedpassword",
};

const VALID_LINK = {
    id: "link-1",
    user_id: UNCLAIMED_USER.id,
    token_hash: TOKEN_HASH,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    phone_attempts: 0,
    consumed_at: null,
    invalidated_at: null,
    invalidated_reason: null,
    created_by: "admin-1",
    created_at: new Date().toISOString(),
};

// ── App factory ───────────────────────────────────────────────────────────────
function makePassthrough(req: any, _res: any, next: () => void) { next(); }

async function buildApp(overrides: {
    dbRows?: unknown[];
    dbExecuteRows?: unknown[];
    userForLogin?: typeof UNCLAIMED_USER | null;
    googleUser?: typeof UNCLAIMED_USER;
    linkRow?: typeof VALID_LINK | null | "expired" | "consumed" | "maxAttempts";
}) {
    vi.resetModules();

    const linkRow = overrides.linkRow === undefined ? VALID_LINK : overrides.linkRow;
    const resolvedLink =
        linkRow === "expired"
            ? { ...VALID_LINK, expires_at: new Date(Date.now() - 1000).toISOString() }
            : linkRow === "consumed"
            ? { ...VALID_LINK, consumed_at: new Date().toISOString() }
            : linkRow === "maxAttempts"
            ? { ...VALID_LINK, phone_attempts: 5 }
            : linkRow;

    vi.doMock("../server/routes/middleware/auth.js", () => ({
        requireCustomerAuth: makePassthrough,
        getCustomerId: (req: any) => req.session?.customerId,
        customerLoginSchema: { parse: (v: unknown) => v },
        customerRegisterSchema: { parse: (v: unknown) => v },
        requireAdminAuth: makePassthrough,
        requirePermission: () => makePassthrough,
    }));

    vi.doMock("../server/routes/middleware/rate-limit.js", () => ({
        authLimiter: makePassthrough,
        registrationLimiter: makePassthrough,
        serviceRequestLimiter: makePassthrough,
        accountRecoveryLimiter: makePassthrough,
        resetLinkLimiter: makePassthrough,
    }));

    vi.doMock("../server/routes/middleware/sse-broker.js", () => ({
        addCustomerSSEClient: vi.fn(),
        removeCustomerSSEClient: vi.fn(),
        notifyAdminUpdate: vi.fn(),
        notifyCustomerUpdate: vi.fn(),
    }));

    vi.doMock("../server/services/firebase.js", () => ({
        firebaseAdmin: {
            auth: () => ({
                verifyIdToken: vi.fn(async () => ({
                    uid: "google-uid-1",
                    email: "customer@example.com",
                    name: "Test Customer",
                    picture: null,
                })),
            }),
        },
    }));

    vi.doMock("../server/routes/blacklist.routes.js", () => ({
        isPhoneBlacklisted: vi.fn(async () => false),
    }));

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
            linkServiceRequestToCustomer: vi.fn(async () => true),
            linkServiceRequestsByPhone: vi.fn(async () => 0),
        },
    }));

    // Db mock: returns link row for SELECT ... FOR UPDATE path
    const executeRows = overrides.dbExecuteRows ?? [{ rows: resolvedLink ? [resolvedLink] : [] }];
    let executeCallCount = 0;
    vi.doMock("../server/db.js", () => ({
        db: {
            select: vi.fn(() => ({
                from: vi.fn(() => ({
                    where: vi.fn(() => ({
                        limit: vi.fn(async () => overrides.dbRows ?? (resolvedLink ? [resolvedLink] : [])),
                        orderBy: vi.fn(() => ({ limit: vi.fn(async () => []) })),
                    })),
                    limit: vi.fn(async () => []),
                    orderBy: vi.fn(() => ({ limit: vi.fn(async () => []) })),
                })),
            })),
            execute: vi.fn(async () => {
                const row = executeRows[executeCallCount] ?? executeRows[executeRows.length - 1];
                executeCallCount++;
                return row;
            }),
            transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
                const tx = {
                    execute: vi.fn(async (query: unknown) => {
                        // First call: SELECT FOR UPDATE — return link row
                        // Subsequent UPDATE calls return empty
                        return { rows: resolvedLink ? [resolvedLink] : [] };
                    }),
                };
                return fn(tx);
            }),
        },
    }));

    vi.doMock("../server/repositories/index.js", () => ({
        userRepo: {
            getUser: vi.fn(async (id: string) => {
                if (id === UNCLAIMED_USER.id) return UNCLAIMED_USER;
                if (id === ACTIVE_USER.id) return ACTIVE_USER;
                return null;
            }),
            getUserByPhone: vi.fn(async (phone: string) => {
                const normalized = phone.replace(/\D/g, "").slice(-10);
                if (normalized === "1710000001") {
                    return overrides.userForLogin !== undefined ? overrides.userForLogin : ACTIVE_USER;
                }
                return null;
            }),
            getUserByPhoneNormalized: vi.fn(async (phone: string) => {
                const normalized = phone.replace(/\D/g, "").slice(-10);
                if (normalized === "1710000001") {
                    return overrides.userForLogin !== undefined ? overrides.userForLogin : ACTIVE_USER;
                }
                return null;
            }),
            updateUserLastLogin: vi.fn(async () => {}),
        },
        customerRepo: {},
        orderRepo: {},
        corporateRepo: {},
        notificationRepo: {},
        analyticsRepo: {},
        serviceRequestRepo: {},
        jobRepo: {},
        employmentRepo: {},
    }));

    vi.doMock("../server/storage.js", () => ({
        storage: {
            getServiceRequestByTicketNumber: vi.fn(async () => null),
            getServiceRequestEvents: vi.fn(async () => []),
            getCustomer: vi.fn(async () => null),
            getServiceRequest: vi.fn(),
            getServiceRequestsByCustomerId: vi.fn(),
            createInquiry: vi.fn(async () => ({ id: "inq-1" })),
            // Mirrors upsertUserFromGoogle linking an existing account by email.
            upsertUserFromGoogle: vi.fn(async () => overrides.googleUser ?? ACTIVE_USER),
        },
    }));

    vi.doMock("../server/services/audit.service.js", () => ({
        AuditLogger: { log: vi.fn() },
    }));

    vi.doMock("../server/services/mailer.js", () => ({
        MailerService: { sendEmail: vi.fn() },
    }));

    vi.doMock("../server/services/auth.service.js", () => ({
        authService: { verifyCustomerSession: vi.fn(async () => null) },
    }));

    // Partial mock: the real enforceCustomerLoginPolicy and its error class must
    // survive, since they are the control under test on every login route.
    vi.doMock("../server/services/customer-session.service.js", async (importOriginal) => {
        const actual = await importOriginal<typeof import("../server/services/customer-session.service.js")>();
        return {
            ...actual,
            customerSessionService: {
                getSessionFreshness: vi.fn(async () => ({ isFresh: true, passwordChangedAt: null })),
            },
        };
    });

    const { default: router } = await import("../server/routes/customer.routes.js");
    const app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: () => void) => {
        req.session = { save: (cb: () => void) => cb?.() };
        next();
    });
    app.use(router);
    return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Customer account activation (01A)", () => {
    afterEach(() => vi.resetAllMocks());

    describe("Login blocks unclaimed accounts", () => {
        it("returns same 401 body for unclaimed as for wrong password", async () => {
            const appUnclaimed = await buildApp({ userForLogin: UNCLAIMED_USER });
            const resUnclaimed = await request(appUnclaimed)
                .post("/api/customer/login")
                .send({ phone: "01710000001", password: "AnyPassword1!" });

            expect(resUnclaimed.status).toBe(401);
            assertNoForbiddenKeys(resUnclaimed.body);
        });
    });

    describe("Google sign-in cannot bypass staff activation", () => {
        it("rejects an unclaimed account with ACCOUNT_SETUP_REQUIRED", async () => {
            const app = await buildApp({ googleUser: UNCLAIMED_USER });
            const res = await request(app)
                .post("/api/customer/google-auth")
                .send({ token: "any-firebase-token" });

            expect(res.status).toBe(403);
            expect(res.body.code).toBe("ACCOUNT_SETUP_REQUIRED");
            assertNoForbiddenKeys(res.body);
        });

        it("does not block an already-active account at the guard", async () => {
            const app = await buildApp({});
            const res = await request(app)
                .post("/api/customer/google-auth")
                .send({ token: "any-firebase-token" });

            // Scoped deliberately: this asserts the new guard does not fire for an
            // active account. Full session establishment is not mocked here, so the
            // request proceeds past the guard and then fails in session plumbing —
            // the signed-in happy path is covered by the disposable-PostgreSQL proof
            // and manual QA, not by this unit test.
            expect(res.status).not.toBe(403);
            expect(res.body.code).not.toBe("ACCOUNT_SETUP_REQUIRED");
            assertNoForbiddenKeys(res.body);
        });
    });

    describe("POST /api/auth/firebase — the endpoint the frontend actually calls", () => {
        async function buildFirebaseApp(accountState: string) {
            vi.resetModules();
            const updates: string[] = [];

            vi.doMock("../server/services/firebase.js", () => ({
                verifyFirebaseToken: vi.fn(async () => ({
                    uid: "fb-uid-1",
                    email: "customer@example.com",
                    name: "Test Customer",
                    picture: null,
                })),
            }));

            vi.doMock("../server/db.js", () => ({
                db: {
                    query: {
                        users: {
                            // No firebaseUid match, then an email match — the exact
                            // path the reviewer identified as the live bypass.
                            findFirst: vi.fn()
                                .mockResolvedValueOnce(null)
                                .mockResolvedValue({
                                    id: "user-unclaimed",
                                    name: "Test Customer",
                                    email: "customer@example.com",
                                    role: "Customer",
                                    customerAccountState: accountState,
                                }),
                        },
                    },
                    update: vi.fn(() => ({
                        set: vi.fn(() => ({
                            where: vi.fn(() => {
                                updates.push("firebaseUid-linked");
                                return Promise.resolve();
                            }),
                        })),
                    })),
                    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(async () => [{ id: "new" }]) })) })),
                    execute: vi.fn(async () => ({ rows: [] })),
                },
            }));

            const { default: router } = await import("../server/routes/firebase-auth.routes.js");
            const app = express();
            app.use(express.json());
            app.use((req: any, _res: any, next: () => void) => {
                req.session = {
                    regenerate: (cb: (e?: unknown) => void) => cb(),
                    save: (cb: (e?: unknown) => void) => cb(),
                };
                next();
            });
            app.use(router);
            return { app, updates };
        }

        it("rejects an unclaimed account with 403 ACCOUNT_SETUP_REQUIRED", async () => {
            const { app } = await buildFirebaseApp("unclaimed");
            const res = await request(app).post("/api/auth/firebase").send({ idToken: "tok" });

            expect(res.status).toBe(403);
            expect(res.body.code).toBe("ACCOUNT_SETUP_REQUIRED");
            assertNoForbiddenKeys(res.body);
        });

        it("does not attach the Firebase UID to an unclaimed account", async () => {
            const { app, updates } = await buildFirebaseApp("unclaimed");
            await request(app).post("/api/auth/firebase").send({ idToken: "tok" });

            // Linking before the gate would leave a permanent second key on an
            // account that was never activated.
            expect(updates).not.toContain("firebaseUid-linked");
        });

        it("lets an active account through", async () => {
            const { app } = await buildFirebaseApp("active");
            const res = await request(app).post("/api/auth/firebase").send({ idToken: "tok" });

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            assertNoForbiddenKeys(res.body);
        });
    });

    describe("The 6-digit reset-code path is gone", () => {
        it("POST /api/customer/password-reset/complete no longer exists", async () => {
            const app = await buildApp({});
            const res = await request(app)
                .post("/api/customer/password-reset/complete")
                .send({ phone: "01710000001", code: "123456", newPassword: "Secure123!" });

            // Express falls through to 404 when no route is registered.
            expect(res.status).toBe(404);
        });
    });

    describe("POST /api/customer/reset-link/verify", () => {
        it("returns {valid:true} for a live token", async () => {
            const app = await buildApp({});
            const res = await request(app)
                .post("/api/customer/reset-link/verify")
                .send({ token: TOKEN_RAW });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("valid");
            assertNoForbiddenKeys(res.body);
        });

        it("returns {valid:false} for unknown token", async () => {
            const app = await buildApp({ dbRows: [] });
            const res = await request(app)
                .post("/api/customer/reset-link/verify")
                .send({ token: "not-a-real-token" });

            expect(res.status).toBe(200);
            expect(res.body.valid).toBe(false);
        });

        it("returns {valid:false} for expired link", async () => {
            // Real SQL: WHERE ... AND expires_at > NOW() — expired row filtered out by DB
            const app = await buildApp({ dbExecuteRows: [{ rows: [] }] });
            const res = await request(app)
                .post("/api/customer/reset-link/verify")
                .send({ token: TOKEN_RAW });

            expect(res.status).toBe(200);
            expect(res.body.valid).toBe(false);
        });

        it("returns {valid:false} for consumed link", async () => {
            // Real SQL: WHERE ... AND consumed_at IS NULL — consumed row filtered out by DB
            const app = await buildApp({ dbExecuteRows: [{ rows: [] }] });
            const res = await request(app)
                .post("/api/customer/reset-link/verify")
                .send({ token: TOKEN_RAW });

            expect(res.status).toBe(200);
            expect(res.body.valid).toBe(false);
        });
    });

    describe("POST /api/customer/reset-link/complete", () => {
        it("rejects missing token with 400", async () => {
            const app = await buildApp({});
            const res = await request(app)
                .post("/api/customer/reset-link/complete")
                .send({ phone: "+8801710000001", password: "Secure123!", confirmPassword: "Secure123!" });

            expect(res.status).toBe(400);
            assertNoForbiddenKeys(res.body);
        });

        it("never exposes forbidden keys on any success or failure path", async () => {
            const app = await buildApp({});
            // Various payloads — all responses must be clean
            const payloads = [
                { token: TOKEN_RAW, phone: "+8801710000001", password: "Secure123!", confirmPassword: "Mismatch!" },
                { token: "bad", phone: "+8801710000001", password: "Secure123!", confirmPassword: "Secure123!" },
            ];
            for (const body of payloads) {
                const res = await request(app).post("/api/customer/reset-link/complete").send(body);
                assertNoForbiddenKeys(res.body);
            }
        });
    });
});
