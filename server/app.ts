import 'dotenv/config';
import express from "express";
import session from "express-session";
import { registerRoutes } from "./routes.js";
import { createServer } from "http";
import connectMemoryStore from "memorystore";

export const app = express();
export const httpServer = createServer(app);

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

const MemoryStore = connectMemoryStore(session);

app.use(
    session({
        store: new MemoryStore({
            checkPeriod: 86400000 // prune expired entries every 24h
        }),
        secret: process.env.SESSION_SECRET || "promise-electronics-secret-key-2025",
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === "production",
            httpOnly: true,
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            sameSite: "lax", // CSRF protection
        },
    })
);

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

export async function createApp() {
    await registerRoutes(httpServer, app);
    return app;
}
