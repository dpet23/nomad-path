import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
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
              message:
                'contract is the shared leaf package; it must not import the other packages.',
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
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  ...boundaries,
  prettier,
);
