import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema.js";

const { Pool } = pg;

let _pool: pg.Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

// Each createPool() call gets a unique generation. The lifetime timer checks
// this before firing so old timers can't reset a newer healthy pool.
let poolGeneration = 0;
// Prevents concurrent resetDbPool() calls from stacking (e.g. idle-error storms).
let resetInProgress = false;

function createPool(): pg.Pool {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('FATAL: DATABASE_URL is not set. Cannot initialize database pool.');
  }
  const generation = ++poolGeneration;
  const pool = new Pool({
    connectionString: dbUrl,
    max: parseInt(process.env.DB_POOL_MAX || '5', 10),
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    query_timeout: 30_000,
    keepAlive: true,
    ssl: dbUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  });

  pool.on('error', (err: Error) => {
    const safeMsg = err.message?.slice(0, 100) ?? 'unknown error';
    console.error('[DB] Unexpected error on idle client:', safeMsg);
    // Trigger a pool reset so the next query gets a fresh connection.
    resetDbPool('idle client error: ' + safeMsg).catch(() => {});
  });

  console.log('[DB] Connection pool initialized');

  // Proactively recycle the pool after DB_POOL_MAX_LIFETIME_SECONDS to prevent
  // stale connections after Aiven failovers. Uses generation check so an early
  // watchdog-triggered reset won't be followed by a redundant lifetime reset.
  const lifetimeSecs = parseInt(process.env.DB_POOL_MAX_LIFETIME_SECONDS || '0', 10);
  if (lifetimeSecs > 0) {
    setTimeout(() => {
      if (poolGeneration === generation) {
        resetDbPool(`scheduled max-lifetime reset after ${lifetimeSecs}s`).catch(() => {});
      }
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

const POOL_DRAIN_TIMEOUT_MS = 10_000;

/** Drain the current pool and create a fresh one on the next DB call. */
export async function resetDbPool(reason: string): Promise<void> {
  if (resetInProgress) return;
  resetInProgress = true;
  try {
    console.log(`[DB] Pool reset triggered: ${reason} -- gen:${poolGeneration} resetInProgress:${resetInProgress}`);
    const oldPool = _pool;
    _pool = null;
    _db = null;
    if (oldPool) {
      try {
        await Promise.race([
          oldPool.end(),
          new Promise<void>((_res, rej) =>
            setTimeout(
              () => rej(new Error(`pool drain timed out after ${POOL_DRAIN_TIMEOUT_MS}ms`)),
              POOL_DRAIN_TIMEOUT_MS,
            )
          ),
        ]);
        console.log(`[DB] Old pool drained -- gen:${poolGeneration}`);
      } catch (e: any) {
        console.warn(`[DB] Old pool drain warning: ${e.message?.slice(0, 80)} -- gen:${poolGeneration}`);
      }
    }
  } finally {
    resetInProgress = false;
  }
}

export function getDbPoolDiagnostics(): {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  host: string;
  poolGeneration: number;
  resetInProgress: boolean;
} {
  if (!_pool) return { totalCount: 0, idleCount: 0, waitingCount: 0, host: '(no pool)', poolGeneration, resetInProgress };
  let host = '(redacted)';
  try { host = new URL(process.env.DATABASE_URL || '').hostname; } catch {}
  return {
    totalCount: _pool.totalCount,
    idleCount: _pool.idleCount,
    waitingCount: _pool.waitingCount,
    host,
    poolGeneration,
    resetInProgress,
  };
}
