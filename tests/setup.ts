import { beforeAll, afterAll } from 'vitest';

beforeAll(async () => {
    // Start transactions or prep test db before any tests
    console.log('Setting up Test Environment...');
});

afterAll(async () => {
    // Teardown connections or rollback transactional tests
    console.log('Tearing down Test Environment...');
});
