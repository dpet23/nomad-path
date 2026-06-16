import { defineConfig } from 'vitest/config';

export default defineConfig({
    // Exercise the profiling-on code path under unit test. Profiling-only logic
    // (segment counting, and detail payloads added later) is gated behind
    // NOMADPATH_PROFILING and is otherwise unreachable in tests. The demo/perf
    // bundles run with it true, so this matches what ships in the profiling
    // artifact. Replaced as a literal, so `typeof NOMADPATH_PROFILING` resolves.
    define: { NOMADPATH_PROFILING: 'true' },
    test: {
        environment: 'happy-dom',
        include: ['src/**/*.test.ts', 'preprocessing/**/*.test.js', 'test/**/*.test.ts'],
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
                'src/core/LayerManager.ts',
                'src/data/types.ts',
                'src/contract/types.ts',
                'src/contract/index.ts',
                'preprocessing/build-trip-data.js',
                'preprocessing/watch.js',
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
