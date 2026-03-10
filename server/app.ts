import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
import express from "express";
import session from "express-session";
import { createServer } from "http";
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

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

// Validate environment (non-fatal for optional vars)
validateEnv();

// Augment express-session with user data
declare module "express-session" {
    interface SessionData {
        adminUserId?: string;
        adminUserRole?: string;
        passport?: { user: any };
    }
}

export const app = express();
app.use(compression({
    filter: (req, res) => {
        if (req.headers['accept'] === 'text/event-stream') {
            return false; // Disable compression for SSE
        }
        return compression.filter(req, res);
    }
})); // Enable GZIP compression

// HTTP Security Headers
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for now — SPA injects scripts dynamically
    crossOriginEmbedderPolicy: false, // Allow loading third-party images/fonts
}));

export const httpServer = createServer(app);

// Configure CORS
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) {
            return callback(null, true);
        }

        // Allow localhost on any port
        if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
            return callback(null, true);
        }

        // Production and capacitor origins
        const allowedOrigins = [
            "https://promiseelectronics.com",
            "https://www.promiseelectronics.com",
            "capacitor://localhost",
        ];

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        // Log rejected origins for debugging
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

// Trust proxy for production (HTTPS behind proxy)
app.set("trust proxy", 1);

app.use(
    express.json({
        limit: "2mb",
        verify: (req, _res, buf) => {
            (req as any).rawBody = buf;
        },
    }),
);

app.use(express.urlencoded({ extended: false }));

// Session configuration
const isProduction = process.env.NODE_ENV === "production";

// Use PostgreSQL session store for production (persistent)
// Falls back to memory store for development (no DB required)
const PgStore = pgSession(session);

const sessionConfig: session.SessionOptions = {
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        // sameSite: "lax" is standard, but "none" is required if cross-origin credentials are used
        sameSite: isProduction ? "lax" : "lax", // Change to lax by default unless specific cross-origin demands it
    },
};

// Use PostgreSQL session store if DATABASE_URL is available
if (process.env.DATABASE_URL) {
    sessionConfig.store = new PgStore({
        conString: process.env.DATABASE_URL,
        tableName: 'user_sessions', // Custom table name to avoid conflicts
        createTableIfMissing: true, // Auto-create session table
        pruneSessionInterval: 60 * 15, // Prune expired sessions every 15 min
    });
    console.log('[Session] Using PostgreSQL session store (persistent)');
} else {
    console.log('[Session] DATABASE_URL not set - using memory store');
}

app.use(session(sessionConfig));
app.use(cookieParser());

app.use(setCsrfToken);

export function log(message: string, source = "express") {
    const formattedTime = new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    });

    console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;

    // Attach Correlation ID for distributed tracing
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
        if (path.startsWith("/api")) {
            const correlationId = (req as any).correlationId;
            let logLine = `[${correlationId}] ${req.method} ${path} ${res.statusCode} in ${duration}ms`;
            if (capturedJsonResponse) {
                const redactedResponse = redactLogData(capturedJsonResponse);
                logLine += ` :: ${JSON.stringify(redactedResponse)}`;
            }

            log(logLine);
        }
    });

    next();
});

export async function createApp() {
    // Setup Swagger API documentation
    setupSwagger(app);

    await registerRoutes(httpServer, app);

    // Register AI Error Handler last
    app.use(aiErrorHandler);
    app.use(errorHandler);

    return app;
}
