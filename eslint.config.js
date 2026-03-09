import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
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
