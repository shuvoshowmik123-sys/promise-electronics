import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { users } from "@shared/schema";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import 'dotenv/config';

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set in your environment variables.");
}

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema });

const DEFAULT_SUPER_ADMIN = {
    username: "admin",
    name: "Super Administrator",
    email: "admin@promise-electronics.com",
    password: "admin123",
    role: "Super Admin" as const,
    status: "Active",
    permissions: JSON.stringify({
        dashboard: true,
        jobs: true,
        inventory: true,
        pos: true,
        challans: true,
        finance: true,
        attendance: true,
        reports: true,
        serviceRequests: true,
        users: true,
        settings: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canExport: true,
    }),
};

import fs from 'fs';

function log(msg: string) {
    console.log(msg);
    fs.appendFileSync('seed_output.txt', msg + '\n');
}

async function main() {
    log("Connecting to database...");

    try {
        // Check if any super admin exists
        const [existingAdmin] = await db
            .select()
            .from(users)
            .where(eq(users.role, "Super Admin"));

        if (existingAdmin) {
            log("Super Admin already exists:");
            log("Username: " + existingAdmin.username);
            log("ID: " + existingAdmin.id);
            return;
        }

        log("Creating Super Admin...");

        // Hash password
        const hashedPassword = await bcrypt.hash(DEFAULT_SUPER_ADMIN.password, 12);

        // Create super admin
        const [admin] = await db
            .insert(users)
            .values({
                ...DEFAULT_SUPER_ADMIN,
                id: nanoid(),
                password: hashedPassword,
            })
            .returning();

        log("Super Admin created successfully!");
        log("Username: " + DEFAULT_SUPER_ADMIN.username);
        log("Password: " + DEFAULT_SUPER_ADMIN.password);

    } catch (error) {
        log("Error seeding super admin: " + error);
        process.exit(1);
    } finally {
        try {
            log("Creating session table...");
            await db.execute(sql`
                CREATE TABLE IF NOT EXISTS "session" (
                    "sid" varchar NOT NULL COLLATE "default",
                    "sess" json NOT NULL,
                    "expire" timestamp(6) NOT NULL
                )
                WITH (OIDS=FALSE);
            `);
            await db.execute(sql`
                ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
            `).catch(() => { }); // Ignore if exists
            await db.execute(sql`
                CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
            `);
            log("Session table created!");
        } catch (e) {
            log("Error creating session table: " + e);
        }
        await pool.end();
    }
}

main();
