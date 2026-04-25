import { test as base, expect } from '@playwright/test';

/**
 * Shared Playwright fixtures for all browser-level tests.
 *
 * Console error detection: collects uncaught exceptions (pageerror) and
 * console.error calls during each test. After the test body runs, asserts
 * that no unexpected errors occurred — failing with the actual message
 * instead of a cryptic timeout.
 *
 * MapLibre tile-fetch failures are filtered — the basemap tries to load
 * vector/raster tiles from external servers, which fail in headless/offline.
 * These appear as browser "Failed to load resource" errors for .pbf or
 * tile-server URLs.
 */

/** Patterns for console errors that are expected and should be ignored. */
const IGNORED_PATTERNS = [
    /Failed to load resource.*\.pbf/i,
    /Failed to load resource.*tile\.openstreetmap/i,
];

function isIgnored(msg: string): boolean {
    return IGNORED_PATTERNS.some((re) => re.test(msg));
}

export const test = base.extend<{ consoleErrors: string[] }>({
    consoleErrors: [
        async ({ page }, use) => {
            const errors: string[] = [];

            page.on('pageerror', (err) => {
                const msg = err.message || String(err);
                if (!isIgnored(msg)) errors.push(`[pageerror] ${msg}`);
            });

            page.on('console', (msg) => {
                if (msg.type() === 'error') {
                    const text = msg.text();
                    if (!isIgnored(text)) errors.push(`[console.error] ${text}`);
                }
            });

            await use(errors);

            if (errors.length > 0) {
                expect(errors, 'Unexpected browser errors during test').toEqual([]);
            }
        },
        { auto: true },
    ],
});

export { expect } from '@playwright/test';
