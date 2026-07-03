import { expect, test } from '@playwright/test';

// Scaffolding placeholder: proves the Playwright toolchain runs on both
// projects. Replaced by real UI-driven specs from phase 6 onward.
test('playwright toolchain runs @scaffold', ({ browserName }) => {
    expect(browserName).toBe('chromium');
});
