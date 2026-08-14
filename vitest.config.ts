import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./tests/setup.ts'],
        include: ['tests/**/*.test.ts'],
        /**
         * Vitest's 5000ms default testTimeout is not calibrated for this suite's
         * route-level tests.
         *
         * Ten test files use the idiomatic `vi.doMock` pattern:
         * `beforeEach(() => vi.resetModules())`, then a block of `vi.doMock(...)`
         * registrations, then `await import("../server/routes/....js")` inside the test
         * body. Because `vi.doMock` is intentionally NOT hoisted, that import must follow
         * the mock registrations and therefore cannot be lifted to a top-level import;
         * `resetModules()` additionally means the server route's module graph is
         * re-transformed and re-loaded per test rather than reused from cache.
         * (Those ten: admin-routes-smoke, b2b-account-intake, customer-account-activation-01a,
         * customer-track-ownership, external-qr-tracking, job-warranty-completion,
         * phase1-service-flow, phase2-custody-otp, phase3-manual-payments, repository-compat.)
         *
         * The assertions in those tests are trivial; essentially the whole duration is
         * module transform/load. Measured cold-load cost (2026-08-01, 8 CPUs, low
         * contention): job-warranty-completion 7471ms, external-qr-tracking 6585ms,
         * admin-routes-smoke 6570ms, b2b-account-intake 6439ms — four already above the
         * 5000ms default before any parallel pressure. Under full-suite fork parallelism
         * the 2.3-3.5s tier also crosses 5000ms, which is why the set of timing-out files
         * varied between runs instead of being stable.
         *
         * This value therefore encodes the real contract (allow a cold server module graph
         * to load under parallel load) rather than masking a slow or hanging test. A genuine
         * hang still fails, just later. Do not lower without re-measuring; do not raise to
         * hide a newly slow test.
         *
         * hookTimeout is deliberately left at the 5000ms default, so that a hook which
         * becomes slow fails loudly instead of being absorbed by a generous global.
         *
         * The files that genuinely need longer — the disposable-PostgreSQL tests, which
         * CREATE and DROP a database around each run — pass their own timeout as the last
         * argument to beforeAll and afterAll. That keeps the extra budget attached to the
         * hook that earned it and visible in the file that needs it.
         */
        testTimeout: 30000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules/', 'tests/', 'client/', 'shared/'],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './client/src'),
            '@shared': path.resolve(__dirname, './shared'),
        },
    },
});
