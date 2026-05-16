/**
 * E2E seam tests (`npm run test:e2e`).
 *
 * These tests validate the contract between the preprocessing pipeline and the
 * map library. The fixture is generated from raw GPX/KML files in
 * test/fixtures/map/ by `build:data`, then loaded in the browser via
 * test/e2e/test.html.
 *
 * A failure here that passes `test:library` means a seam bug: the pipeline
 * produces something the library doesn't handle correctly.
 *
 * Tests in this file must invoke the real library on pipeline-produced output
 * and assert observable behaviour. Tests that read trips[0].features /
 * trips[0].metadata directly without invoking the library are Theatre and
 * belong in P-Unit instead.
 */
import { test, expect } from './fixtures';
import { gotoMap } from './helpers';

// ---------------------------------------------------------------------------
// Fixture constants — derived from pipeline output, never guessed.
//
// The fixture has:
//   4 tracks: 1 flight + 2 drives + 1 walk
//   2 POIs: accommodation (visible) + landmark (hidden via yaml)
//   2 ground days: 2025-06-10 (drive + walk), 2025-06-11 (drive)
//   1 flight day key: flight-2025-06-09-0600-tst101-lebl-lfpg
//   groups: flights (excludeFromAutoBounds), root-level ground tracks
//   yaml: landmark POI defaultVisible: false
// ---------------------------------------------------------------------------

test.describe('pipeline metadata', () => {
    test('fixture loads without error', async ({ page }) => {
        await gotoMap(page);
        const ready = await page.evaluate(() => (window as any).nomadMapReady);
        expect(ready).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Seam: library renders pipeline output
// ---------------------------------------------------------------------------

test.describe('library renders pipeline data', () => {
    test('track layer exists after loading pipeline fixture', async ({ page }) => {
        await gotoMap(page);
        const hasLayer = await page.evaluate(
            () => !!(window as any)._map.getLayer('np-tracks-layer'),
        );
        expect(hasLayer).toBe(true);
    });

    test('track source has features from pipeline output', async ({ page }) => {
        await gotoMap(page);
        const featureCount = await page.evaluate(() => {
            const source = (window as any)._map.getSource('np-tracks');
            const data = source?.serialize?.()?.data;
            return data?.features?.length ?? 0;
        });
        // Pipeline produces 4 tracks; after segmentation each N-point track produces N-1 segments.
        // Segments may be split further at antimeridian crossings, so count >= number of tracks.
        expect(featureCount).toBeGreaterThanOrEqual(4);
    });

    test('POI source has features from pipeline output', async ({ page }) => {
        await gotoMap(page);
        const poiCount = await page.evaluate(() => {
            const source = (window as any)._map.getSource('np-pois');
            const data = source?.serialize?.()?.data;
            return data?.features?.length ?? 0;
        });
        // 2 POIs from the fixture (accommodation + landmark)
        expect(poiCount).toBe(2);
    });

    test('track legend shows correct day groups', async ({ page }) => {
        await gotoMap(page);
        const dayHeaders = await page.locator('.np-track-legend .np-day-header > span').allTextContents();
        // Should have day groups for the pipeline output dates
        expect(dayHeaders.length).toBeGreaterThanOrEqual(2);
        // Flight day header should contain the flight name
        const hasFlight = dayHeaders.some(h => /TST101/i.test(h) || /flight/i.test(h));
        expect(hasFlight).toBe(true);
    });

    test('attribute legend shows pipeline ranges', async ({ page }) => {
        await gotoMap(page);
        // Default attribute is "day" which has no range label; switching to speed
        // surfaces the pipeline-derived range.
        await page.selectOption('.np-attr-select', 'speeds');
        const rangeText = await page.locator('.np-range-label').textContent();
        expect(rangeText).toBeTruthy();
        expect(rangeText).toMatch(/km\/h/);
    });

    test('POI legend shows categories from pipeline', async ({ page }) => {
        await gotoMap(page);
        const categories = await page.locator('.np-poi-legend .np-category-header > span').allTextContents();
        const lowerCategories = categories.map(c => c.toLowerCase());
        expect(lowerCategories).toContain('accommodation');
        expect(lowerCategories).toContain('landmark');
    });

    test('landmark POI category is hidden at load (defaultVisible: false)', async ({ page }) => {
        await gotoMap(page);
        const isVisible = await page.evaluate(() => {
            return (window as any).nomadMap.isPOICategoryVisible('landmark');
        });
        expect(isVisible).toBe(false);
    });

    test('accommodation POI category is visible at load', async ({ page }) => {
        await gotoMap(page);
        const isVisible = await page.evaluate(() => {
            return (window as any).nomadMap.isPOICategoryVisible('accommodation');
        });
        expect(isVisible).toBe(true);
    });
});
