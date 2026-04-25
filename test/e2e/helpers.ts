import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** URL of the E2E test harness page, relative to baseURL. */
export const TEST_PAGE = '/test.html';

/** Navigate and wait for the NomadPath instance to be fully ready. */
export async function gotoMap(page: Page) {
    const response = await page.goto(TEST_PAGE);
    expect(response?.status(), `HTTP ${response?.status()} loading ${TEST_PAGE} — wrong server or path`).toBe(200);
    await page.waitForFunction(() => (window as any).nomadMapReady === true, { timeout: 1_000 });
    const error = await page.evaluate(() => (window as any).nomadMapError);
    expect(error).toBeUndefined();
}
