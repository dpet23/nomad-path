import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** URL of the perf harness page, relative to baseURL. */
export const PERF_PAGE = '/test.html';

/** A library performance.measure entry, as read back via page.evaluate. */
export interface PerfMeasure {
    name: string;
    duration: number;
    /** Structured payload (e.g. `{ segments: 112541 }`) when the measure carries one. */
    detail?: { segments?: number } | null;
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
            .map((e) => ({
                name: e.name,
                duration: e.duration,
                detail: (e as PerformanceMeasure).detail as { segments?: number } | null,
            })),
    );
}

/**
 * Wait until a `performance.measure` with the exact `name` exists, then return
 * it. Needed for `.firstFrame` measures, which resolve on a later render frame
 * (the action method is synchronous and fire-and-forget). Polls the buffer.
 */
export async function waitForMeasure(page: Page, name: string, timeout = 5_000): Promise<PerfMeasure> {
    await page.waitForFunction(
        (n) => performance.getEntriesByType('measure').some((e) => e.name === n),
        name,
        { timeout },
    );
    const all = await readNomadMeasures(page);
    const found = all.find((m) => m.name === name);
    if (!found) throw new Error(`measure "${name}" not found after wait`);
    return found;
}

/** The latest measure entry with the given exact name, or undefined. */
export function latestMeasure(all: PerfMeasure[], name: string): PerfMeasure | undefined {
    return [...all].reverse().find((m) => m.name === name);
}
