import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
import express, { type Express } from "express";
import session from "express-session";
import { createServer, type Server } from "http";
import pgSession from "connect-pg-simple";
import cookieParser from "cookie-parser";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import { validateEnv } from "./utils/validateEnv.js";
import { setCsrfToken } from "./routes/middleware/csrf.js";
import { redactLogData } from "./utils/redact.js";
import { registerRoutes } from "./routes/index.js";
import { aiErrorHandler } from "./routes/middleware/ai-logger.js";
import { setupSwagger } from "./swagger.js";
import { errorHandler } from "./routes/middleware/error-handler.js";

// Load environment variables early - required for local dev and module-level repository evaluation
const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

// Augment express-session with user data
declare module "express-session" {
    interface SessionData {
        adminUserId?: string;
        adminUserRole?: string;
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
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
    }));

    // Trust proxy for production (HTTPS behind Vercel's edge)
    app.set("trust proxy", 1);

    app.use(cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
                return callback(null, true);
            }
            const allowedOrigins = [
                "https://promiseelectronics.com",
                "https://www.promiseelectronics.com",
                "capacitor://localhost",
            ];
            if (allowedOrigins.includes(origin)) return callback(null, true);
            console.log(`[CORS] Rejected origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
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

    const sessionConfig: session.SessionOptions = {
        secret: process.env.SESSION_SECRET!,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: isProduction,
            httpOnly: true,
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            sameSite: "lax",
        },
    };

    if (process.env.DATABASE_URL) {
        sessionConfig.store = new PgStore({
            conString: process.env.DATABASE_URL,
            tableName: 'user_sessions',
            createTableIfMissing: true,
            // pruneSessionInterval MUST be false in serverless — setInterval will
            // prevent the Lambda/Vercel function from shutting down cleanly.
            pruneSessionInterval: false as any,
        });
        console.log('[Session] Using PostgreSQL session store (persistent)');
    } else {
        console.log('[Session] DATABASE_URL not set — using memory store (dev only)');
    }

    app.use(session(sessionConfig));
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
                let logLine = `[${correlationId}] ${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
                if (capturedJsonResponse) {
                    const redactedResponse = redactLogData(capturedJsonResponse);
                    logLine += ` :: ${JSON.stringify(redactedResponse)}`;
                }
                log(logLine);
            }
        });

        next();
    });

    // ─── 7. Routes & error handlers ───────────────────────────────────────────
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
