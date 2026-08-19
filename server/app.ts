import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
import express, { type Express, type Request, type Response } from "express";
import session from "express-session";
import { createServer, type Server } from "http";
import pgSession from "connect-pg-simple";
import cookieParser from "cookie-parser";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import { validateEnv } from "./utils/validateEnv.js";
import { assertProductionCorsConfig, getAllowedOrigins, isOriginAllowed } from "./utils/cors-config.js";
import { setCsrfToken } from "./routes/middleware/csrf.js";
import { redactLogData } from "./utils/redact.js";
import { registerRoutes } from "./routes/index.js";
import { aiErrorHandler } from "./routes/middleware/ai-logger.js";
import { setupSwagger } from "./swagger.js";
import { errorHandler } from "./routes/middleware/error-handler.js";
import { apiLimiter } from "./routes/middleware/rate-limit.js";
import { coldStartCacheMiddleware } from "./middleware/cold-start-cache.js";
import { pool as sharedPool } from "./db.js";
import { getReadinessState, isDbReady } from "./services/db-readiness.js";
import { requireAdminAuth, requireSuperAdmin } from "./routes/middleware/auth.js";
import { failClosedReadinessMiddleware } from "./middleware/main-schema-readiness.js";
import { attendanceCheckInGateMiddleware } from "./middleware/attendance-check-in-gate.js";
import { adminSessionRevocationMiddleware } from "./middleware/admin-session-revocation.js";
import { staffDeviceAuthMiddleware } from "./middleware/staff-device-auth.js";
import { buildAdminSystemStatus } from "./services/admin-system-status.service.js";

// Load environment variables early - required for local dev and module-level repository evaluation
const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

// Augment express-session with user data
declare module "express-session" {
    interface SessionData {
        adminUserId?: string;
        adminUserRole?: string;
        adminUserPermissions?: string | null;
        passport?: { user: any };
    }
}

export function log(message: string, source = "express") {
    const formattedTime = new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    });
    console.log(`${formattedTime} [${source}] ${message}`);
}

// Singleton app/server references (initialized once per process lifetime)
let _app: Express | null = null;
let _httpServer: Server | null = null;

export async function createApp(): Promise<Express> {
    // If already initialized (e.g. warm Vercel invocation), return cached instance
    if (_app) return _app;

    // ─── 1. Validate required environment variables ───────────────────────────
    validateEnv();
    assertProductionCorsConfig();

    // ─── 2. Create Express app ────────────────────────────────────────────────
    const app = express();
    const httpServer = createServer(app);

    // EXTREMELY IMPORTANT: Set these references BEFORE calling registerRoutes.
    // Many route modules import 'app' or 'httpServer' from this file via the proxies,
    // and if _app is still null when they are evaluated, the proxies will throw.
    _app = app;
    _httpServer = httpServer;

    // ─── 4. Core middleware ───────────────────────────────────────────────────
    app.use(compression({
        filter: (req, res) => {
            if (req.headers['accept'] === 'text/event-stream') {
                return false; // Disable compression for SSE
            }
            return compression.filter(req, res);
        }
    }));

    app.use(helmet({
        contentSecurityPolicy: false,          // React SPA needs inline scripts — CSP via meta tags
        crossOriginEmbedderPolicy: false,       // Allow ImageKit + Google embeds
        hsts: {
            maxAge: 31536000,                   // 1 year HTTPS enforcement
            includeSubDomains: true,
            preload: true,
        },
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
        permittedCrossDomainPolicies: { permittedPolicies: "none" },
        noSniff: true,                          // X-Content-Type-Options: nosniff
        frameguard: { action: "sameorigin" },   // X-Frame-Options: SAMEORIGIN (prevents clickjacking)
        xssFilter: false,                       // Deprecated — modern browsers ignore it
    }));

    // Trust proxy for production (HTTPS behind Vercel's edge)
    app.set("trust proxy", 1);

    app.use(cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            const allowed = getAllowedOrigins();
            if (isOriginAllowed(origin, allowed)) return callback(null, true);
            console.log(`[CORS] Rejected origin: ${origin}`);
            callback(null, false);
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "Cookie",
            "X-Correlation-ID",
            "X-XSRF-TOKEN",
            "X-CSRF-TOKEN",
        ]
    }));

    app.use(express.json({
        limit: "2mb",
        verify: (req, _res, buf) => {
            (req as any).rawBody = buf;
        },
    }));

    app.use(express.urlencoded({ extended: false }));

    // ─── 5. Session store ─────────────────────────────────────────────────────
    // All process.env access happens HERE — after dotenv.config() above.
    const isProduction = process.env.NODE_ENV === "production";
    const PgStore = pgSession(session);

    /**
     * Session lifetime — customers should not be asked to sign in repeatedly.
     *
     * This is a TV repair shop, not a bank. Someone books a repair, then checks
     * back days later to see where their television is. Being logged out between
     * those visits is the whole complaint, and re-authenticating protects
     * nothing here: the account holds repair history and an address, and every
     * genuinely sensitive action (the handover code) is separately gated.
     *
     * Three things were wrong:
     *
     * 1. No `rolling`. The cookie's expiry was written once at login and never
     *    refreshed, so the clock ran down even for someone using the site daily.
     *    With rolling, every request pushes the expiry out — an active customer
     *    is never logged out, which is the behaviour being asked for.
     *
     * 2. maxAge was 7 days. A customer whose repair takes longer than a week
     *    was guaranteed to be logged out mid-repair. 90 days covers a repair,
     *    its warranty questions, and the next visit.
     *
     * 3. sameSite "none". That was chosen for a Vercel-to-Render cross-origin
     *    setup, but the browser only ever talks to promiseelectronics.com — the
     *    API is reached through a same-origin /api/* rewrite, and the deployed
     *    bundle contains no onrender.com URL. So the cookie is first-party, and
     *    "none" only opts it into the third-party-cookie restrictions browsers
     *    are tightening, for no benefit. "lax" is correct and more durable.
     *
     *    Overridable: if the Capacitor native app ships, its WebView origin IS
     *    cross-site and will need "none" again. No native project exists in the
     *    repo today (no android/ or ios/ directory), so "lax" is safe now and
     *    one env var restores the old behaviour without a code change.
     */
    const sessionSameSite =
        (process.env.SESSION_COOKIE_SAMESITE as "lax" | "none" | "strict" | undefined) ??
        (isProduction ? "lax" : "lax");
    const SESSION_MAX_AGE_MS = Number(process.env.SESSION_MAX_AGE_DAYS || 90) * 24 * 60 * 60 * 1000;

    const sessionConfig: session.SessionOptions = {
        secret: process.env.SESSION_SECRET!,
        resave: false,
        saveUninitialized: false,
        // Refresh the expiry on every request so an active customer never ages out.
        rolling: true,
        cookie: {
            // sameSite "none" additionally REQUIRES secure:true, so keep them linked.
            secure: isProduction || sessionSameSite === "none",
            httpOnly: true,
            maxAge: SESSION_MAX_AGE_MS,
            sameSite: sessionSameSite,
        },
    };

    /**
     * Persist sessions whenever a database exists — do not make it conditional
     * on NODE_ENV.
     *
     * This previously required NODE_ENV === "production" (or an explicit opt-in)
     * before using Postgres. If that variable is unset or misspelled on the
     * host, the server silently falls back to MemoryStore, and every restart
     * signs out every user. On a plan that sleeps when idle, that is several
     * forced logins a day with nothing in the logs to explain them — and a 90
     * day cookie cannot help, because the server has forgotten the session the
     * cookie refers to.
     *
     * A memory store is never the right choice when DATABASE_URL is present, so
     * the default is inverted: persist unless someone explicitly asks not to.
     * Tests keep the in-memory store, which is what makes them isolated.
     */
    const isTestEnv = process.env.NODE_ENV === "test";
    const usePgSession = !isTestEnv && process.env.SESSION_STORE !== "memory";
    if (process.env.DATABASE_URL && usePgSession) {
        sessionConfig.store = new PgStore({
            pool: sharedPool as any,
            tableName: 'user_sessions',
            createTableIfMissing: true,
            pruneSessionInterval: false as any,
        });
        console.log('[Session] Using PostgreSQL session store (persistent)');
    } else if (!isTestEnv && !process.env.DATABASE_URL) {
        // Loud, because sessions will not survive a restart and that shows up
        // as unexplained logouts rather than as an error.
        console.warn('[Session] No DATABASE_URL — sessions are in memory and will be LOST on restart');
    } else {
        console.log('[Session] Using memory session store (test/opt-out)');
    }

    /**
     * Device tokens are resolved BEFORE express-session, and a request they
     * satisfy skips it entirely.
     *
     * The store is connect-pg-simple. Letting express-session see calls from
     * the native app would mean a PostgreSQL write per request per phone,
     * against a pool capped at DB_POOL_MAX=5 — and to record a fact that
     * staff_devices already holds durably. The middleware installs a plain
     * session-shaped object instead, so the 199 places that read
     * session.adminUserId are untouched.
     */
    const sessionMiddleware = session(sessionConfig);
    app.use(staffDeviceAuthMiddleware);
    app.use((req, res, next) => {
        if ((req as any).deviceAuth) return next();
        sessionMiddleware(req, res, next);
    });
    app.use(cookieParser());
    app.use(setCsrfToken);

    // ─── 6. Request logging middleware ────────────────────────────────────────
    app.use((req, res, next) => {
        const start = Date.now();
        const reqPath = req.path;

        const correlationId = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
        (req as any).correlationId = correlationId;
        res.setHeader('X-Correlation-ID', correlationId);

        let capturedJsonResponse: Record<string, any> | undefined = undefined;

        const originalResJson = res.json;
        res.json = function (bodyJson, ...args) {
            capturedJsonResponse = bodyJson;
            return originalResJson.apply(res, [bodyJson, ...args]);
        };

        const originalResSend = res.send;
        res.send = function (body) {
            if (typeof body === 'string' && (body.startsWith('A server error') || body.startsWith('A server e'))) {
                console.log("[Middleware] Intercepted plain text error, converting to JSON:", body);
                res.setHeader('Content-Type', 'application/json');
                return originalResSend.call(this, JSON.stringify({ error: body }));
            }
            return originalResSend.call(this, body);
        };

        res.on("finish", () => {
            const duration = Date.now() - start;
            if (reqPath.startsWith("/api")) {
                const verboseRequests = process.env.API_REQUEST_LOGS === "verbose";
                const shouldLog = verboseRequests || res.statusCode >= 400 || duration >= 1000;
                if (!shouldLog) return;

                let logLine = `[${correlationId}] ${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
                if (verboseRequests && capturedJsonResponse) {
                    const redactedResponse = redactLogData(capturedJsonResponse);
                    logLine += ` :: ${JSON.stringify(redactedResponse)}`;
                }
                log(logLine);
            }
        });

        next();
    });

    // ─── 7. Health check (Render keep-alive + load balancer probe) ───────────
    // /health is LIVENESS only: 200 while process and MAIN DB are alive.
    // 503 only if MAIN DB is unavailable. Never exposes schema/migration details.
    app.get('/health', (_req, res) => {
        const state = getReadinessState();
        const dbDown = state.state === 'degraded' && !state.dbConnected;
        res.status(dbDown ? 503 : 200).json({
            status: dbDown ? 'degraded' : 'ok',
            ts: new Date().toISOString(),
            uptime: Math.floor(process.uptime()),
        });
    });

    // Vercel Speed Insights — absorbs POST vitals pings without errors or AI watchdog noise
    app.post('/_vercel/speed-insights/vitals', (_req, res) => {
        res.status(204).end();
    });

    // /ready and /api/ready are STRICT traffic gates.
    // 503 until MAIN schema ledger is complete, lock-waiting, or failed.
    // Never exposes SQL, stack traces, connection URLs, migration source, or checksums.
    app.get('/ready', (_req: Request, res: Response) => {
        const ready = isDbReady();
        res.status(ready ? 200 : 503).json(
            ready ? { ready: true } : { ready: false, code: 'MAIN_SCHEMA_PENDING' }
        );
    });
    app.get('/api/ready', (_req: Request, res: Response) => {
        const ready = isDbReady();
        res.status(ready ? 200 : 503).json(
            ready ? { ready: true } : { ready: false, code: 'MAIN_SCHEMA_PENDING' }
        );
    });
    // Super Admin only — safe system status (ledger + journey lineage aggregates).
    // RELEASE-OPERATIONS-01B-A: no pool host, no SQL/errors, no migration control.
    app.get('/api/admin/readiness', requireAdminAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
        try {
            const body = await buildAdminSystemStatus();
            res.json(body);
        } catch {
            res.status(500).json({ error: "Failed to load system status" });
        }
    });

    // ─── 7a. Fail-closed readiness middleware (before API routes) ────────────
    // While MAIN schema is pending, lock-waiting, or failed, return safe 503 JSON
    // for all dynamic API routes. Allow only health/readiness endpoints.
    app.use('/api', failClosedReadinessMiddleware);

    // ─── 8. Global API rate limiter (non-admin IPs: 100 req/min) ────────────
    // Skips authenticated admin sessions (see rate-limit.ts skip logic)
    app.use('/api/', apiLimiter);
    app.use(coldStartCacheMiddleware);

    // ─── 8a. Admin session revocation — BEFORE the attendance gate.
    // A password change must end every older session, and it has to be checked
    // here rather than inside one route guard: /api/admin/me has no guard, and
    // the five permission guards each read the session for themselves. It also
    // has to precede the attendance gate, which answers 412 before identity is
    // settled and so told a revoked technician to check in, not to sign in.
    app.use(adminSessionRevocationMiddleware);

    // ─── 8b. Daily attendance gate (WORKFORCE-UX-01) — after session identity;
    // blocks protected staff ops until check-in. No scheduler. Super Admin exempt.
    app.use(attendanceCheckInGateMiddleware);

    // ─── 9. Routes & error handlers ───────────────────────────────────────────
    setupSwagger(app);
    await registerRoutes(httpServer, app);
    app.use(aiErrorHandler);
    app.use(errorHandler);

    console.log('[App] Express application initialized successfully');
    return app;
}

// For local dev server (server/index.ts) that directly uses these exports
export function getHttpServer(): Server {
    if (!_httpServer) throw new Error('App not initialized yet. Call createApp() first.');
    return _httpServer;
}

// Legacy export compatibility (used by some route files)
export const app = new Proxy({} as Express, {
    get(_target, prop) {
        if (!_app) throw new Error(`[app] Accessed before createApp() was called. Property: ${String(prop)}`);
        return (_app as any)[prop];
    }
});

export const httpServer = new Proxy({} as Server, {
    get(_target, prop) {
        if (!_httpServer) throw new Error(`[httpServer] Accessed before createApp() was called. Property: ${String(prop)}`);
        return (_httpServer as any)[prop];
    }
});
