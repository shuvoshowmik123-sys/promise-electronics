import NodeCache from 'node-cache';
import { Redis } from 'ioredis';

// Standard TTL: 5 minutes (300 seconds)
const localCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
let redisClient: Redis | null = null;

if (process.env.REDIS_URL) {
    try {
        redisClient = new Redis(process.env.REDIS_URL, {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true
        });

        redisClient.on('error', (err) => {
            console.error('[Cache] Redis connection error:', err);
        });

        redisClient.on('connect', () => {
            console.log('[Cache] Connected to Redis backend for distributed caching');
        });
    } catch (e) {
        console.error('[Cache] Failed to initialize Redis. Falling back to memory cache.', e);
        redisClient = null; // Ensure fallback
    }
} else {
    console.log('[Cache] REDIS_URL not set. Using local memory cache.');
}

export const simpleCache = {
    get: async <T>(key: string): Promise<T | undefined> => {
        if (redisClient) {
            try {
                const data = await redisClient.get(key);
                return data ? JSON.parse(data) as T : undefined;
            } catch (e) {
                console.error(`[Cache] Redis GET error for ${key}:`, e);
                // Fallback to local on read failure
                return localCache.get<T>(key);
            }
        }
        return localCache.get<T>(key);
    },

    set: async <T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> => {
        const ttl = ttlSeconds || 300;
        let success = true;

        if (redisClient) {
            try {
                await redisClient.set(key, JSON.stringify(value), 'EX', ttl);
            } catch (e) {
                console.error(`[Cache] Redis SET error for ${key}:`, e);
                success = false;
            }
        }

        // Always set local cache as primary L1 or fallback
        const localSuccess = localCache.set(key, value, ttl);
        return success && localSuccess;
    },

    del: async (key: string): Promise<number> => {
        let count = 0;
        if (redisClient) {
            try {
                count = await redisClient.del(key);
            } catch (e) {
                console.error(`[Cache] Redis DEL error for ${key}:`, e);
            }
        }
        count += localCache.del(key);
        return count;
    },

    flush: async (): Promise<void> => {
        if (redisClient) {
            try {
                await redisClient.flushdb();
            } catch (e) {
                console.error('[Cache] Redis FLUSH error:', e);
            }
        }
        localCache.flushAll();
    },

    // Helper to get or fetch data
    getOrFetch: async <T>(
        key: string,
        fetcher: () => Promise<T>,
        ttlSeconds: number = 300
    ): Promise<T> => {
        try {
            const cached = await simpleCache.get<T>(key);
            if (cached !== undefined) {
                return cached;
            }
        } catch (e) {
            console.warn(`[Cache] Failed to retrieve ${key}, fetching fresh data instead.`);
        }

        const fresh = await fetcher();
        await simpleCache.set(key, fresh, ttlSeconds);
        return fresh;
    }
};
