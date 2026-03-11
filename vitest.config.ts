import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'happy-dom',
        include: ['src/**/*.test.ts', 'preprocessing/**/*.test.js'],
        passWithNoTests: true,
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts', 'preprocessing/**/*.js'],
            exclude: [
                'src/**/*.test.ts',
                'preprocessing/**/*.test.js',
                'preprocessing/fixtures/**',
                // Files that require a live MapLibre map or have no runtime logic —
                // covered by Playwright e2e tests instead of unit tests.
                'src/index.ts',
                'src/core/MapEngine.ts',
                'src/data/types.ts',
                'preprocessing/build-trip-data.js',
            ],
            thresholds: {
                // Thresholds reflect the current state of unit-testable code.
                // Increase these as coverage improves; never decrease without reason.
                lines: 75,
                functions: 75,
                branches: 75,
                statements: 75,
            },
        },
    },
});
