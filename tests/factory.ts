import request from 'supertest';
import { createApp } from '../server/app';

export const TestFactory = {
    // Bootstraps evaluating the express app and mounting routes
    createApp: async () => {
        const app = await createApp();
        return app;
    },

    // Creates an anonymous API client
    createClient: async () => {
        const app = await TestFactory.createApp();
        return request(app);
    },

    // Simulates a logged in admin session
    createAdminClient: async () => {
        const app = await TestFactory.createApp();
        const agent = request.agent(app);
        // Note: Mocking passport session auth requires injecting cookies
        // or intercepting the mock-strategy for integration tests
        return agent;
    },
};
