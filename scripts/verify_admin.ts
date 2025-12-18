import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { users } from "@shared/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import 'dotenv/config';

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set.");
}

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema });

async function main() {
    console.log("Checking admin user...");

    try {
        const [admin] = await db
            .select()
            .from(users)
            .where(eq(users.username, "admin"));

        if (!admin) {
            console.error("❌ Admin user NOT found!");
            process.exit(1);
        }

        console.log("✅ Admin user found.");
        console.log("ID:", admin.id);
        console.log("Role:", admin.role);

        console.log("Testing password 'admin123'...");
        const isValid = await bcrypt.compare("admin123", admin.password);

        if (isValid) {
            console.log("✅ Password is CORRECT.");
        } else {
            console.error("❌ Password is INCORRECT.");
        }

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await pool.end();
    }
}

main();
