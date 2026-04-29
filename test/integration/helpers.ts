import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** URL of the test harness page, relative to baseURL. */
export const TEST_PAGE = '/test.html';

/** Navigate and wait for the NomadPath instance to be fully ready. */
export async function gotoMap(page: Page) {
    const response = await page.goto(TEST_PAGE);
    expect(response?.status(), `HTTP ${response?.status()} loading ${TEST_PAGE} — wrong server or path`).toBe(200);
    await page.waitForFunction(() => (window as any).nomadMapReady === true, { timeout: 1_000 });
    const error = await page.evaluate(() => (window as any).nomadMapError);
    expect(error).toBeUndefined();
}

/**
 * Navigate with one or more fixture paths overriding the default fixture.geojson.
 * Resolves once nomadMapReady is true OR nomadMapError is set; tests can then
 * inspect either state. Use this for contract tests that exercise fixture-shape
 * variations.
 */
export async function gotoMapWithFixture(page: Page, fixturePaths: string | string[]) {
    const paths = Array.isArray(fixturePaths) ? fixturePaths : [fixturePaths];
    const query = paths.map((p) => `fixture=${encodeURIComponent(p)}`).join('&');
    const url = `${TEST_PAGE}?${query}`;
    const response = await page.goto(url);
    expect(response?.status(), `HTTP ${response?.status()} loading ${url}`).toBe(200);
    await page.waitForFunction(
        () => (window as any).nomadMapReady === true || (window as any).nomadMapError !== undefined,
        { timeout: 2_000 },
    );
}
