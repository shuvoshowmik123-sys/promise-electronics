import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema.js";

const { Pool } = pg;

let _pool: pg.Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function createPool(): pg.Pool {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('FATAL: DATABASE_URL is not set. Cannot initialize database pool.');
  }
  const pool = new Pool({
    connectionString: dbUrl,
    max: parseInt(process.env.DB_POOL_MAX || '5', 10),
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    ssl: dbUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  });
  pool.on('error', (err: Error) => {
    console.error('[DB] Unexpected error on idle client (reconnecting automatically)', err.message);
  });
  console.log('[DB] Connection pool initialized');

  // If DB_POOL_MAX_LIFETIME_SECONDS is set, schedule a proactive pool reset to prevent
  // stale connections after Aiven failovers or long idle periods.
  const lifetimeSecs = parseInt(process.env.DB_POOL_MAX_LIFETIME_SECONDS || '0', 10);
  if (lifetimeSecs > 0) {
    setTimeout(() => {
      resetDbPool(`scheduled max-lifetime reset after ${lifetimeSecs}s`).catch(() => {});
    }, lifetimeSecs * 1000).unref();
  }

  return pool;
}

function getPool(): pg.Pool {
  if (!_pool) {
    _pool = createPool();
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

/** Drain the current pool and create a fresh one on the next DB call. */
export async function resetDbPool(reason: string): Promise<void> {
  console.log(`[DB] Pool reset triggered: ${reason}`);
  const oldPool = _pool;
  _pool = null;
  _db = null;
  if (oldPool) {
    try {
      await oldPool.end();
      console.log('[DB] Old pool drained');
    } catch (e: any) {
      console.warn('[DB] Old pool drain warning:', e.message?.slice(0, 80));
    }
  }
}

export function getDbPoolDiagnostics(): {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  host: string;
} {
  if (!_pool) return { totalCount: 0, idleCount: 0, waitingCount: 0, host: '(no pool)' };
  let host = '(redacted)';
  try { host = new URL(process.env.DATABASE_URL || '').hostname; } catch {}
  return {
    totalCount: _pool.totalCount,
    idleCount: _pool.idleCount,
    waitingCount: _pool.waitingCount,
    host,
  };
}
