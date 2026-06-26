import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema.js";

const { Pool } = pg;

let _pool: pg.Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getPool(): pg.Pool {
  if (!_pool) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('FATAL: DATABASE_URL is not set. Cannot initialize database pool.');
    }
    _pool = new Pool({
      connectionString: dbUrl,
      max: parseInt(process.env.DB_POOL_MAX || '5', 10),
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
      ssl: dbUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    });
    _pool.on('error', (err: Error) => {
      console.error('[DB] Unexpected error on idle client (reconnecting automatically)', err.message);
    });
    console.log('[DB] Connection pool initialized');
  }
  return _pool;
}

export const pool = new Proxy({} as pg.Pool, {
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

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  }
});
