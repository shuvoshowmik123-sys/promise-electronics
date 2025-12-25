import dotenv from "dotenv";
import path from "path";

// Load environment variables before initializing database
const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../shared/schema.js";

if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL is not set. Database connection will fail.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

