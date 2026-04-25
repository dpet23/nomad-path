import { defineConfig, devices } from '@playwright/test';
const BASE_URL = 'http://localhost:3101';

export default defineConfig({
    testDir: 'test/e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: 'html',
    use: {
        baseURL: BASE_URL,
        trace: 'on-first-retry',
    },
    timeout: 30_000,
    expect: {
        timeout: 10_000,
    },
    webServer: {
        command: 'npx serve ./test/e2e -l 3101 --no-clipboard',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 60_000,
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
        },
    ],
});
