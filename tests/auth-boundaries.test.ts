import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { TestFactory } from './factory';
import type { SuperTest, Test } from 'supertest';

/**
 * This is the only test file that boots the real app via TestFactory.createApp() ->
 * createApp() -> validateEnv(), which fail-closes without DATABASE_URL/SESSION_SECRET/
 * INTAKE_FINGERPRINT_SECRET. These are harmless, test-only, loopback-only dummy values —
 * never used to connect, migrate, or seed a real database (pg.Pool connects lazily on
 * first query, not at construction) — so the auth-boundary checks below can run in any
 * environment, secrets-free or not. Original process.env values are restored after this
 * file completes.
 */

// failClosedReadinessMiddleware gates every non-health route with 503 until isDbReady()
// is true, which never happens without a real MAIN schema boot sequence. Force it true
// here only, so these requests actually reach the auth middleware being tested instead
// of short-circuiting on the readiness gate — every other export is left real.
vi.mock('../server/services/db-readiness.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../server/services/db-readiness.js')>();
    return { ...actual, isDbReady: () => true };
});
const DUMMY_ENV: Record<string, string> = {
    DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test_disposable_auth_boundaries_do_not_use',
    SESSION_SECRET: 'test-only-dummy-session-secret-never-a-real-secret',
    INTAKE_FINGERPRINT_SECRET: 'test-only-dummy-fingerprint-secret-16chars-min',
};
const originalEnv: Record<string, string | undefined> = {};

describe('Auth Boundaries Security Tests', () => {
    let client: any; // using any to bypass strict type mismatch for supertest test agent

    beforeAll(async () => {
        for (const key of Object.keys(DUMMY_ENV)) {
            originalEnv[key] = process.env[key];
            process.env[key] = DUMMY_ENV[key];
        }
        client = await TestFactory.createClient();
    });

    afterAll(() => {
        for (const key of Object.keys(DUMMY_ENV)) {
            if (originalEnv[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnv[key];
        }
    });

    describe('Unauthenticated Access Controls', () => {
        it('should reject unauthenticated access to admin routes', async () => {
            const response = await client.get('/api/admin/users');
            expect(response.status).toBe(401);
        });

        it('should reject unauthenticated access to customer routes', async () => {
            const response = await client.get('/api/customer/me');
            expect(response.status).toBe(401);
        });

        it('should allow access to public routes without authentication', async () => {
            const response = await client.get('/api/public/inventory');
            expect(response.status).not.toBe(401);
            // Wait for 200/500 depending on actual DB status without mocks
        });
    });
});
