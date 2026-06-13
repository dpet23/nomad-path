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
import { gotoPerfMap, readNomadMeasures } from './helpers';

function printMeasures(label: string, measures: { name: string; duration: number }[]) {
    // eslint-disable-next-line no-console
    console.log(`\n  ── ${label} ──`);
    if (measures.length === 0) {
        // eslint-disable-next-line no-console
        console.log('  (no nomadpath.* measures found)');
        return;
    }
    for (const m of measures) {
        // eslint-disable-next-line no-console
        console.log(`  ${m.name.padEnd(34)} ${m.duration.toFixed(2)} ms`);
    }
}

test('characterization: print per-phase timings', async ({ page }) => {
    // load + ingest fire during NomadPath.create().
    await gotoPerfMap(page);
    printMeasures('after load + ingest', await readNomadMeasures(page));

    // Drive the colour re-render path. `elevations` is always present in the
    // fixture, so this is a valid switch. The re-render mark appears here once
    // setColourAttribute is instrumented (Stage 5); until then this exercises
    // the path and the row simply does not appear.
    await page.evaluate(() => (window as any).nomadMap.setColourAttribute('elevations'));
    await page.waitForFunction(() => (window as any).nomadMap.colourAttribute === 'elevations');

    printMeasures('after colour-attribute change', await readNomadMeasures(page));
});
