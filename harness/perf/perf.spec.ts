/**
 * Perf harness test (`npm run test:perf`).
 *
 * Loads the PROFILING library bundle, drives the instrumented operations
 * through the REAL UI (the same dropdown / checkboxes a user clicks), and both
 * PRINTS the measures (characterization) and ASSERTS they fire with the right
 * shape. The assertions are the regression net for the instrumentation itself:
 * they catch a handler that mutates state but emits no measure, a measure on the
 * wrong layer, or a segment count captured before the action (all real bugs hit
 * while building this). Durations are printed, not asserted — no thresholds yet.
 *
 * Driving the real UI (not the programmatic NomadPath API) is deliberate: the
 * action measures live on the UI event handlers, so only a UI-driven test
 * exercises them. The console-error fixture (auto) fails the run on any page
 * error. NOT part of `test:all`; run on demand against the profiling bundle.
 */
import { expect, test } from './fixtures';
import type { PerfMeasure } from './helpers';
import { gotoPerfMap, latestMeasure, readNomadMeasures, waitForMeasure } from './helpers';

// Real-UI selectors (see CLAUDE.md locator note): a single track row's checkbox
// vs. a day-group header's checkbox are distinguished by their container.
const SINGLE_TRACK_CHECKBOX = '.np-track-legend .np-track-row .np-track-row__checkbox';
const GROUP_CHECKBOX = '.np-track-legend .np-day-header .np-track-row__checkbox';
const COLOUR_SELECT = '.np-attr-select';

function printMeasures(label: string, all: PerfMeasure[], printed: number): number {
    const fresh = all.slice(printed);
    // eslint-disable-next-line no-console
    console.log(`\n  -- ${label} --`);
    for (const m of fresh) {
        const seg = typeof m.detail?.segments === 'number' ? `  ${m.detail.segments.toLocaleString()} seg` : '';
        // eslint-disable-next-line no-console
        console.log(`  ${m.name.padEnd(34)} ${m.duration.toFixed(2)} ms${seg}`);
    }
    return all.length;
}

test('instrumentation: load phases + actions emit measures (UI-driven)', async ({ page }) => {
    let printed = 0;

    // --- Initial load: phases fire during NomadPath.create() ---
    await gotoPerfMap(page);
    const afterLoad = await readNomadMeasures(page);
    printed = printMeasures('after load + ingest', afterLoad, printed);

    const names = afterLoad.map((m) => m.name);
    expect(names).toContain('nomadpath.Initial load/Load trip data');
    expect(names).toContain('nomadpath.Initial load/Build segments');
    expect(names).toContain('nomadpath.Initial load/Add to map');
    expect(names).toContain('nomadpath.Initial load/Mount UI');
    // buildSegments carries the total segment count as detail.
    const build = latestMeasure(afterLoad, 'nomadpath.Initial load/Build segments');
    expect(build?.detail?.segments, 'buildSegments should carry a segment count').toBeGreaterThan(0);

    // --- Colour change: driven by the real dropdown ---
    await page.selectOption(COLOUR_SELECT, 'elevations');
    const colourSync = await waitForMeasure(page, 'nomadpath.Colour change');
    const colourFrame = await waitForMeasure(page, 'nomadpath.Colour change.firstFrame');
    expect(colourSync.detail?.segments, 'colour change carries visible-segment count').toBeGreaterThan(0);
    expect(colourFrame.duration).toBeGreaterThanOrEqual(0);
    printed = printMeasures('after colour change (dropdown)', await readNomadMeasures(page), printed);

    // --- Single-track toggle: hiding a track must DROP the visible count ---
    const segBeforeToggle = latestMeasure(await readNomadMeasures(page), 'nomadpath.Colour change')?.detail?.segments;
    // The native checkbox is CSS-hidden (styled label replaces it), so Playwright's
    // .click() refuses it; dispatch the click in-page — same change event the user's
    // click fires — regardless of CSS visibility.
    await page.evaluate((sel) => document.querySelector<HTMLInputElement>(sel)?.click(), SINGLE_TRACK_CHECKBOX);
    const toggleSync = await waitForMeasure(page, 'nomadpath.Toggle track');
    await waitForMeasure(page, 'nomadpath.Toggle track.firstFrame');
    const segAfterToggle = toggleSync.detail?.segments;
    expect(segAfterToggle, 'toggle carries a post-action segment count').toBeGreaterThanOrEqual(0);
    // Hiding a visible track must reduce the painted segment count — guards the
    // stale-detail bug (count read before the action would NOT drop).
    expect(segAfterToggle!, 'hiding a track lowers the visible-segment count').toBeLessThan(segBeforeToggle!);
    printed = printMeasures('after single-track toggle (hide)', await readNomadMeasures(page), printed);

    // --- Group toggle: a day-header checkbox must also emit the measure ---
    const beforeGroupCount = (await readNomadMeasures(page)).filter((m) => m.name === 'nomadpath.Toggle track').length;
    const groupExists = await page.evaluate((sel) => !!document.querySelector(sel), GROUP_CHECKBOX);
    if (groupExists) {
        await page.evaluate((sel) => document.querySelector<HTMLInputElement>(sel)?.click(), GROUP_CHECKBOX);
        // A new 'Toggle track' measure must appear (group handler is profiled too).
        await page.waitForFunction(
            (n) => performance.getEntriesByType('measure').filter((e) => e.name === n).length > 0,
            'nomadpath.Toggle track',
        );
        const afterGroupCount = (await readNomadMeasures(page)).filter(
            (m) => m.name === 'nomadpath.Toggle track',
        ).length;
        expect(afterGroupCount, 'group toggle emits a Toggle track measure').toBeGreaterThan(beforeGroupCount);
        printed = printMeasures('after group toggle', await readNomadMeasures(page), printed);
    }
});
