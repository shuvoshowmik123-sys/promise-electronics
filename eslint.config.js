import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        /**
         * Nothing here is source.
         *
         * The config had no ignores at all, which was survivable while the only
         * generated directories were untracked — CI checks out the repo and
         * builds afterwards, so it never saw them. `android/` breaks that: the
         * Capacitor project is committed, and its bundled JavaScript would put
         * a few hundred lint errors into a pipeline that has to stay
         * meaningful.
         */
        ignores: [
            'android/**',
            'dist/**',
            'coverage/**',
            // Runner scripts and screenshots from the QA cycles. Untracked, so
            // CI never sees them; listed to keep local runs readable.
            'mobile-qa/**',
            'qa-*/**',
        ],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['client/src/pages/admin/**/*.{ts,tsx}', 'client/src/components/admin/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: '@/lib/api/customerApi',
                            message: 'Admin portal should not import customer API functions.',
                        },
                        {
                            name: '@/lib/api/corporateApi',
                            message: 'Admin portal should not import corporate API functions.',
                        }
                    ],
                },
            ],
        },
    },
    {
        files: ['client/src/pages/customer/**/*.{ts,tsx}', 'client/src/components/customer/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: '@/lib/api/adminApi',
                            message: 'Customer portal should not import admin API functions.',
                        },
                        {
                            name: '@/lib/api/corporateApi',
                            message: 'Customer portal should not import corporate API functions.',
                        }
                    ],
                },
            ],
        },
    },
    {
        files: ['client/src/pages/corporate/**/*.{ts,tsx}', 'client/src/components/corporate/**/*.{ts,tsx}'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: '@/lib/api/adminApi',
                            message: 'Corporate portal should not import admin API functions.',
                        },
                        {
                            name: '@/lib/api/customerApi',
                            message: 'Corporate portal should not import customer API functions.',
                        }
                    ],
                },
            ],
        },
    }
);
