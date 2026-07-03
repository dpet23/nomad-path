import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        projects: [
            {
                test: { name: 'contract', root: 'packages/contract', environment: 'node' },
            },
            {
                test: { name: 'pipeline', root: 'packages/pipeline', environment: 'node' },
            },
            {
                test: { name: 'ui', root: 'packages/ui', environment: 'node' },
            },
        ],
        coverage: {
            provider: 'v8',
            include: ['packages/*/src/**'],
            exclude: ['packages/demo/**'],
            thresholds: {
                lines: 75,
                functions: 75,
                branches: 75,
                statements: 75,
            },
        },
    },
});
