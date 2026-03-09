import dotenv from "dotenv";
import path from "path";

// Load environment variables
const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import * as schema from "../shared/schema.js";

if (process.env.DATABASE_URL?.includes('neon.tech')) {
  neonConfig.webSocketConstructor = ws;
}

if (!process.env.DATABASE_URL) {
  console.error("FATAL: DATABASE_URL is not set. Database connection will fail.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX || '50', 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Ensure we keep idle clients alive as long as possible on Neon
  keepAlive: true,
});

// A robust error handler for idle clients that are terminated by the server (e.g. Neon scale-to-zero)
pool.on('error', (err: Error, client: any) => {
  console.error('[DB] Unexpected error on idle client (reconnecting automatically)', err.message);
  // pg-pool automatically removes the client from the pool when this event fires
});

export const db = drizzle(pool, { schema });
