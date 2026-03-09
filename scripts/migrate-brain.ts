import { config } from "dotenv";
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

// Load .env
config();

async function runBrainMigrations() {
    const dbUrl = process.env.BRAIN_DATABASE_URL;
    if (!dbUrl) {
        console.error("❌ BRAIN_DATABASE_URL is missing in .env");
        process.exit(1);
    }

    console.log("Connecting to Brain DB to run migrations...");
    const sql = neon(dbUrl);
    const db = drizzle(sql);

    try {
        console.log("Running migrations...");
        // This will create the tables defined in our schema
        // We actually need drizzle-kit push, not just migrate, to create 
        // tables if we haven't generated SQL migration files yet.
    } catch (e) {
        console.error("Migration failed", e);
    }
}

runBrainMigrations();
