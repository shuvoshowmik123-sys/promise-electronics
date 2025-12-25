import dotenv from "dotenv";
import path from "path";

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });
import express from "express";
import session from "express-session";
import { registerRoutes } from "./routes/index.js";
import { createServer } from "http";
import pgSession from "connect-pg-simple";

import cors from "cors";

export const app = express();
export const httpServer = createServer(app);

// Configure CORS
app.use(cors({
    origin: [
        "http://localhost:5083",
        "http://localhost:5082",
        "https://promiseelectronics.com",
        "http://localhost",
        "capacitor://localhost",
        "http://192.168.0.103:5083" // Common local IP, can be adjusted
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"]
}));

// Trust proxy for production (HTTPS behind proxy)
app.set("trust proxy", 1);

app.use(
    express.json({
        limit: "50mb",
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
    secret: process.env.SESSION_SECRET || "promise-electronics-secret-key-2025",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProduction,
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        // sameSite: "none" required for cross-origin mobile apps (Capacitor)
        // sameSite: "lax" is safer but blocks cross-origin cookies
        sameSite: isProduction ? "none" : "lax",
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
    // Development fallback - use memory store (imported dynamically in createApp)
    console.log('[Session] DATABASE_URL not set - session store will be configured in createApp()');
}

app.use(session(sessionConfig));

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
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
        capturedJsonResponse = bodyJson;
        return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
        const duration = Date.now() - start;
        if (path.startsWith("/api")) {
            let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
            if (capturedJsonResponse) {
                logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
            }

            log(logLine);
        }
    });

    next();
});

import { aiErrorHandler } from "./routes/middleware/ai-logger.js";

export async function createApp() {
    await registerRoutes(httpServer, app);

    // Register AI Error Handler last
    app.use(aiErrorHandler);

    return app;
}
