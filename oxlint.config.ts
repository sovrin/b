import { defineConfig } from 'oxlint';

export default defineConfig({
    plugins: ['typescript'],
    categories: {
        correctness: 'error',
        suspicious: 'warn',
        pedantic: 'off',
        perf: 'warn',
        style: 'off',
    },
    rules: {
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
        'arrow-body-style': ['error', 'always'],
        'no-continue': 'off',
        'sort-imports': 'off',
    },
    settings: {
        jsdoc: {
            ignorePrivate: false,
            ignoreInternal: false,
            ignoreReplacesDocs: true,
            overrideReplacesDocs: true,
            augmentsExtendsReplacesDocs: false,
            implementsReplacesDocs: false,
            exemptDestructuredRootsFromChecks: false,
            tagNamePreference: {},
        },
        vitest: {
            typecheck: false,
        },
    },
    env: {
        builtin: true,
    },
    globals: {},
    ignorePatterns: [],
});
