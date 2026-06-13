import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** URL of the perf harness page, relative to baseURL. */
export const PERF_PAGE = '/test.html';

/** A library performance.measure entry, as read back via page.evaluate. */
export interface PerfMeasure {
    name: string;
    duration: number;
}

/** Navigate to the perf harness and wait for the NomadPath instance to be ready. */
export async function gotoPerfMap(page: Page) {
    const response = await page.goto(PERF_PAGE);
    expect(response?.status(), `HTTP ${response?.status()} loading ${PERF_PAGE} — wrong server or path`).toBe(200);
    await page.waitForFunction(() => (window as any).nomadMapReady === true, { timeout: 5_000 });
    const error = await page.evaluate(() => (window as any).nomadMapError);
    expect(error).toBeUndefined();
}

/** Read all `nomadpath.*` performance.measure entries from the page. */
export async function readNomadMeasures(page: Page): Promise<PerfMeasure[]> {
    return page.evaluate(() =>
        performance
            .getEntriesByType('measure')
            .filter((e) => e.name.startsWith('nomadpath.'))
            .map((e) => ({ name: e.name, duration: e.duration })),
    );
}
