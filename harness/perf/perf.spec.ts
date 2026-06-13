/**
 * Characterization perf test (`npm run test:perf`).
 *
 * A PRINTING test, not a regression test. It loads the profiling library
 * bundle, drives the major phases (load + ingest happen during create; a
 * colour-attribute change drives the re-render path), reads the library's
 * `performance.measure` entries via page.evaluate, and PRINTS them.
 *
 * It asserts nothing about the durations — you cannot set thresholds before
 * seeing the numbers, and this is how you see them. Its job is to prove the
 * timing seam works end-to-end in a test context and to emit reproducible
 * numbers. Adding assertions/baselines is the clean future iteration.
 *
 * The console-error fixture (auto) still fails the run if the page errors —
 * a broken bundle or a failed library load is a real failure even here.
 *
 * NOT part of `test:all`. Run on demand against the profiling bundle.
 */
import { test } from './fixtures';
import type { PerfMeasure } from './helpers';
import { gotoPerfMap, readNomadMeasures } from './helpers';

/**
 * Print, in chronological order, only the measures emitted since the previous
 * call. `performance.getEntriesByType('measure')` returns entries in the order
 * they were recorded, so each phase's new marks are the tail past `printed`.
 * Returns the new running count of printed entries.
 */
function printNewMeasures(label: string, all: PerfMeasure[], printed: number): number {
    const fresh = all.slice(printed);
    // eslint-disable-next-line no-console
    console.log(`\n  ── ${label} ──`);
    if (fresh.length === 0) {
        // eslint-disable-next-line no-console
        console.log('  (no new nomadpath.* measures)');
    }
    for (const m of fresh) {
        // eslint-disable-next-line no-console
        console.log(`  ${m.name.padEnd(34)} ${m.duration.toFixed(2)} ms`);
    }
    return all.length;
}

test('characterization: print per-phase timings', async ({ page }) => {
    let printed = 0;

    // load + ingest fire during NomadPath.create().
    await gotoPerfMap(page);
    printed = printNewMeasures('after load + ingest', await readNomadMeasures(page), printed);

    // Drive the colour re-render path (nomadpath.setColourAttribute). `elevations`
    // is always present in the fixture, so this is a valid switch.
    await page.evaluate(() => (window as any).nomadMap.setColourAttribute('elevations'));
    await page.waitForFunction(() => (window as any).nomadMap.colourAttribute === 'elevations');

    printed = printNewMeasures('after colour-attribute change', await readNomadMeasures(page), printed);

    // Drive the visibility-toggle re-render path (nomadpath.updateRanges) through
    // the real UI wiring: clicking a track-row checkbox fires TrackLegend's
    // onVisibilityChange -> attrLegend.updateRanges -> LayerManager.updateRanges.
    // The native checkbox is visually replaced by a styled label (display:none),
    // so Playwright's uncheck() refuses it; .click() on the element dispatches
    // the same change event the user's click would, regardless of CSS visibility.
    await page.evaluate(() => {
        const cb = document.querySelector<HTMLInputElement>(
            '.np-track-legend .np-track-row .np-track-row__checkbox',
        );
        cb?.click();
    });

    printed = printNewMeasures('after visibility toggle', await readNomadMeasures(page), printed);
});
