import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import jsdoc from 'eslint-plugin-jsdoc';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import sonarjs from 'eslint-plugin-sonarjs';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

/**
 * Import boundaries between workspace packages (see docs/architecture/overview.md):
 * - contract is the shared leaf: it imports no other workspace package.
 * - pipeline never imports the ui (nor any map/render library).
 * - ui core stays map-agnostic: only renderer adapters may import map libraries.
 */
const boundaries = [
    {
        files: ['packages/contract/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['@nomadpath/pipeline', '@nomadpath/ui', '@nomadpath/demo'],
                            message: 'contract is the shared leaf package; it must not import the other packages.',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['packages/pipeline/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['@nomadpath/ui', '@nomadpath/demo', 'maplibre-gl', '@deck.gl/*', 'deck.gl'],
                            message: 'the pipeline must not depend on the ui or map/render libraries.',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['packages/ui/src/core/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['maplibre-gl', '@deck.gl/*', 'deck.gl'],
                            message:
                                'ui core is map-agnostic; only renderer adapters (src/render) may import map libraries.',
                        },
                    ],
                },
            ],
        },
    },
];

export default tseslint.config(
    {
        ignores: ['node_modules', 'coverage', 'dist', 'playwright-report', 'test-results'],
    },
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    sonarjs.configs.recommended,
    {
        plugins: {
            'import-x': importX,
            jsdoc,
            'simple-import-sort': simpleImportSort,
            'unused-imports': unusedImports,
        },
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // --- ported from the previous project's config (non-formatting, not already in strict/stylistic) ---
            eqeqeq: ['error', 'smart'],
            'max-classes-per-file': ['error', 1],
            'no-caller': 'error',
            'no-new-wrappers': 'error',
            'no-undef-init': 'error',
            'prefer-arrow-callback': 'error',
            'prefer-template': 'error',
            radix: 'error',
            // space after // and /* -- readability; prettier does not enforce this
            'spaced-comment': ['error', 'always'],
            // the UI ships to viewers with no reliable console; keep it clean. Overridden
            // below for the pipeline (a CLI whose job is terminal output) and the demo.
            'no-console': 'error',
            'no-shadow': 'off',
            '@typescript-eslint/no-shadow': ['error', { hoist: 'all', ignoreTypeValueShadow: true }],
            'no-use-before-define': 'off',
            // functions:false keeps the top-down "public API first, helpers below" file layout legal
            '@typescript-eslint/no-use-before-define': ['error', { functions: false }],
            '@typescript-eslint/unified-signatures': 'error',
            '@typescript-eslint/prefer-function-type': 'error',

            // import hygiene
            'simple-import-sort/imports': 'error',
            'simple-import-sort/exports': 'error',
            'import-x/first': 'error',
            'import-x/newline-after-import': 'error',
            'import-x/no-duplicates': 'error',
            // no phantom dependencies: every import must be declared in the importing
            // package's own package.json (npm hoisting would otherwise let it resolve)
            'import-x/no-extraneous-dependencies': ['error', { devDependencies: true }],
            'unused-imports/no-unused-imports': 'error',

            // jsdoc: descriptions on declared functions/methods; TS provides the types
            'jsdoc/check-alignment': 'error',
            'jsdoc/require-description': ['error', { contexts: ['FunctionDeclaration', 'MethodDefinition'] }],
            'jsdoc/tag-lines': ['error', 'any', { startLines: 1, endLines: 0 }],

            // --- local adjustments ---
            // duplicate of @typescript-eslint/no-unused-vars, without the _-prefix escape hatch
            'sonarjs/no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                    ignoreRestSiblings: true,
                },
            ],
        },
    },
    {
        files: ['**/*.js'],
        extends: [tseslint.configs.disableTypeChecked],
    },
    {
        // the pipeline is a CLI (terminal output is its job) and the demo is a dev tool
        files: ['packages/pipeline/**/*.ts', 'packages/demo/**/*.ts'],
        rules: {
            'no-console': 'off',
        },
    },
    {
        files: ['**/test/**/*.ts', 'packages/e2e/**/*.ts'],
        rules: {
            // test bodies legitimately repeat literals/structures and lack jsdoc
            'jsdoc/require-description': 'off',
            'sonarjs/no-duplicate-string': 'off',
        },
    },
    ...boundaries,
    prettier,
);
