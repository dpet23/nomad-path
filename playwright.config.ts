import { defineConfig, devices } from '@playwright/test';
const BASE_URL = 'http://localhost:3000';

export default defineConfig({
    testDir: 'e2e',
    fullyParallel: false, // Map tests share browser state; run serially for reliability
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: 'html',
    use: {
        baseURL: BASE_URL,
        trace: 'on-first-retry',
    },
    timeout: 30_000, // Map tile loading can be slow
    expect: {
        timeout: 10_000,
    },
    webServer: {
        command: 'npx serve ./e2e -l 3000 --no-clipboard',
        url: BASE_URL,
        reuseExistingServer: false,
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
