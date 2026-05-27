import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import * as schema from './schema.js';

// Lazily init so env vars are loaded before connection attempt
let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getPool(): Pool {
    if (!_pool) {
        const dbUrl = process.env.BRAIN_DATABASE_URL;
        if (!dbUrl) {
            throw new Error('FATAL: BRAIN_DATABASE_URL is not set. Cannot initialize brain DB pool.');
        }
        if (dbUrl.includes('neon.tech')) {
            neonConfig.webSocketConstructor = ws;
        }
        _pool = new Pool({
            connectionString: dbUrl,
            max: parseInt(process.env.BRAIN_DB_POOL_MAX || '5', 10),
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 5_000,
            keepAlive: true,
        });
        _pool.on('error', (err: Error) => {
            console.error('[Brain DB] Idle client error (auto-reconnecting):', err.message);
        });
        console.log('[Brain DB] Pool initialized');
    }
    return _pool;
}

function getBrainDb() {
    if (!_db) {
        _db = drizzle(getPool(), { schema });
    }
    return _db;
}

// Lazy-initialized proxy export — preserves existing `import { brainDb }` usage
export const brainDb = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
    get(_target, prop) {
        return (getBrainDb() as any)[prop];
    }
});
