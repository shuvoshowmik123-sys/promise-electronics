import { describe, it, expect, beforeAll } from 'vitest';
import { TestFactory } from './factory';
import type { SuperTest, Test } from 'supertest';

describe('Auth Boundaries Security Tests', () => {
    let client: any; // using any to bypass strict type mismatch for supertest test agent

    beforeAll(async () => {
        client = await TestFactory.createClient();
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
