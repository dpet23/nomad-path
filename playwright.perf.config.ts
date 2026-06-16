import { defineConfig, devices } from '@playwright/test';
const BASE_URL = 'http://localhost:3102';

/**
 * Characterization perf test config (`npm run test:perf`).
 *
 * Serves the harness/perf page (which loads the PROFILING library bundle),
 * drives load/ingest/colour-change operations, and prints the library's
 * performance.measure entries. It asserts nothing about timings — it is a
 * printing test, the foundation for a future perf-regression net.
 *
 * Deliberately NOT part of `test:all` (no assertions to gate CI on). Run on
 * demand. Chromium only.
 */
export default defineConfig({
    testDir: 'harness/perf',
    testMatch: '**/*.spec.ts', // .test.ts is reserved for vitest
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    reporter: [['list']],
    use: {
        baseURL: BASE_URL,
        trace: 'on-first-retry',
    },
    timeout: 30_000,
    expect: {
        timeout: 10_000,
    },
    webServer: {
        command: 'npx serve ./harness/perf -l 3102 --no-clipboard',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 60_000,
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
