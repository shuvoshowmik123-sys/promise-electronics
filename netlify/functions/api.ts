import 'dotenv/config';
import express from "express";
import serverless from "serverless-http";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { pool } from "../../server/db";
import { registerRoutes } from "../../server/routes";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

// Middleware
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Health Check Endpoint
app.get("/api/health-check", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");
        res.json({ status: "ok", time: result.rows[0].now, env: process.env.NODE_ENV });
    } catch (error) {
        console.error("Health check failed:", error);
        res.status(500).json({ status: "error", error: String(error) });
    }
});

const PgSession = pgSession(session);

app.use(
    session({
        store: new PgSession({
            pool,
            tableName: 'session',
            createTableIfMissing: false,
            pruneSessionInterval: false
        }),
        secret: process.env.SESSION_SECRET || "promise-electronics-secret-key-2025",
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === "production",
            httpOnly: true,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            sameSite: "lax",
        },
    })
);

// We need to wait for routes to be registered
let handler: any;

import { seedSuperAdmin } from "../../server/seed";

const init = async () => {
    try {
        console.log("Initializing Netlify function...");
        await seedSuperAdmin();
        console.log("Seeding complete.");
        await registerRoutes(httpServer, app);
        console.log("Routes registered.");
        handler = serverless(app);
    } catch (error) {
        console.error("Initialization error:", error);
        throw error;
    }
};

// Export the handler
export const api = async (event: any, context: any) => {
    context.callbackWaitsForEmptyEventLoop = false;
    if (!handler) {
        await init();
    }
    return handler(event, context);
};
