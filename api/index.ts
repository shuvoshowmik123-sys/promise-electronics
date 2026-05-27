let app: any;
let migrated = false;

async function runMigrations() {
    if (migrated) return;
    try {
        const { db } = await import("../server/db.js");
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users (firebase_uid)`);
        console.log("[Startup] firebase_uid migration ensured");
    } catch (e: any) {
        console.warn("[Startup] firebase_uid migration skipped:", e.message?.slice(0, 120));
    }
    try {
        const { brainService } = await import("../server/brain/brain.service.js");
        await brainService.migratePhase6Columns().catch(() => {});
        await brainService.migrateKGTables().catch(() => {});
    } catch { /* brain optional */ }
    migrated = true;
}

export default async function handler(req: any, res: any) {
    try {
        if (!app) {
            const { createApp } = await import("../server/app.js");
            app = await createApp();
            await runMigrations();
        }
        app(req, res);
    } catch (error: any) {
        console.error("[FATAL] Serverless Function Crash:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "The serverless function crashed during initialization.",
            details: process.env.NODE_ENV === "development" ? error.message : undefined
        });
    }
}
