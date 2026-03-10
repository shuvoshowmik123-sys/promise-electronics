import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import * as schema from "../shared/schema.js";

// Lazily initialized so Vercel serverless can load env vars before the Pool connects
let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getPool(): Pool {
  if (!_pool) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('FATAL: DATABASE_URL is not set. Cannot initialize database pool.');
    }
    if (dbUrl.includes('neon.tech')) {
      neonConfig.webSocketConstructor = ws;
    }
    _pool = new Pool({
      connectionString: dbUrl,
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      keepAlive: true,
    });
    _pool.on('error', (err: Error) => {
      console.error('[DB] Unexpected error on idle client (reconnecting automatically)', err.message);
    });
    console.log('[DB] Connection pool initialized');
  }
  return _pool;
}

export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    return (getPool() as any)[prop];
  }
});

export function getDb() {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

// Backwards-compatible export: proxy that initializes lazily
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  }
});
