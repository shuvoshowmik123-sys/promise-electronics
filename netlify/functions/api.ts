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
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const PgSession = pgSession(session);

app.use(
    session({
        store: new PgSession({
            pool,
            tableName: 'session',
            createTableIfMissing: true
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
    await seedSuperAdmin();
    await registerRoutes(httpServer, app);
    handler = serverless(app);
};

// Export the handler
export const api = async (event: any, context: any) => {
    if (!handler) {
        await init();
    }
    return handler(event, context);
};
