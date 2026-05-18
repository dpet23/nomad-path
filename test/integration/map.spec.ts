/**
 * NomadPath end-to-end tests.
 *
 * Each test navigates to the test harness page (e2e/test.html) which loads
 * a deterministic fixture (e2e/fixture.geojson) with:
 *   - "Tokyo Drive"  — defaultVisible: true,  day 2024-01-01, coords ~139.7°E 35.7°N
 *   - "Sydney Walk"  — defaultVisible: false, day 2024-01-02, coords ~151.2°E -33.9°N
 *   - "Helsinki Flight"— defaultVisible: true,  day 2024-01-03, excludeFromAutoBounds, coords ~25°E 60.2°N
 *   - "Test Hotel"   — POI at 139.695°E 35.691°N
 *
 * Tests interact via window.nomadMap (NomadPath instance) and window._map
 * (MapLibre Map instance), both exposed by the harness page.
 *
 * Layer/source IDs (from LayerManager.ts):
 *   TRACK_SOURCE     = 'np-tracks'
 *   TRACK_LAYER      = 'np-tracks-layer'
 *   POI_SOURCE       = 'np-pois'            (circle data only)
 *   POI_LABEL_SOURCE = 'np-pois-labels-src' (separate source for label layer)
 *   POI_LAYER        = 'np-pois-layer'
 *   POI_LABELS       = 'np-pois-labels'
 */

import { expect, test } from './fixtures';
import { gotoMap } from './helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TRACK_A_ID = '2024-01-01::Tokyo Drive';
const TRACK_B_ID = '2024-01-02::Sydney Walk';
const TRACK_C_ID = '2024-01-03::Helsinki Flight';

// Tokyo bounds (Track A, visible): ~35.68–35.70°N, 139.69–139.71°E
// Sydney bounds (Track B, hidden): ~-33.87–-33.85°N, 151.20–151.23°E
// Helsinki bounds (Track C, excludeFromAutoBounds): ~60.17–60.18°N, 24.94–24.96°E
const TOKYO_MIN_LAT = 35.5;
const TOKYO_MAX_LAT = 40.0; // Helsinki (60°N) is well above this
const SYDNEY_MAX_LAT = -33.0; // Any latitude below this means Sydney is included

type PwPage = import('@playwright/test').Page;

/**
 * Wait for any in-progress camera animation (fitBounds, flyTo, etc.) to settle.
 * fitBounds() is async/animated — reading getBounds() immediately after returns
 * the pre-animation viewport, not the final position.
 */
async function waitForMapSettle(page: PwPage) {
    // Brief pause to let any animation start before we check isMoving().
    await page.waitForTimeout(150);
    await page.waitForFunction(() => !(window as any)._map.isMoving(), { timeout: 10_000, polling: 100 });
}

// ---------------------------------------------------------------------------
// 1. Smoke / initialisation
// ---------------------------------------------------------------------------

test.describe('initialisation', () => {
    test('map loads without error', async ({ page }) => {
        await gotoMap(page);
    });

    test('track source exists', async ({ page }) => {
        await gotoMap(page);
        const exists = await page.evaluate(() => !!(window as any)._map.getSource('np-tracks'));
        expect(exists).toBe(true);
    });

    test('track layer exists', async ({ page }) => {
        await gotoMap(page);
        const exists = await page.evaluate(() => !!(window as any)._map.getLayer('np-tracks-layer'));
        expect(exists).toBe(true);
    });

    test('track source contains segment features', async ({ page }) => {
        await gotoMap(page);
        // Use serialize() — querySourceFeatures requires rendered tiles and is unreliable in headless.
        // Fixture has 2 tracks × 2 segments each = 4 segment features minimum.
        const count = await page.evaluate(() => {
            const src = (window as any)._map.getSource('np-tracks');
            return src.serialize().data.features?.length ?? 0;
        });
        expect(count).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// 2. POI rendering
// ---------------------------------------------------------------------------

test.describe('POI rendering', () => {
    test('POI source exists', async ({ page }) => {
        await gotoMap(page);
        const exists = await page.evaluate(() => !!(window as any)._map.getSource('np-pois'));
        expect(exists).toBe(true);
    });

    test('POI circle layer exists', async ({ page }) => {
        await gotoMap(page);
        const exists = await page.evaluate(() => !!(window as any)._map.getLayer('np-pois-layer'));
        expect(exists).toBe(true);
    });

    test('POI label layer exists', async ({ page }) => {
        await gotoMap(page);
        const exists = await page.evaluate(() => !!(window as any)._map.getLayer('np-pois-labels'));
        expect(exists).toBe(true);
    });

    test('POI source contains the fixture POI', async ({ page }) => {
        await gotoMap(page);
        // Use serialize() — querySourceFeatures requires rendered tiles and is unreliable in headless.
        const count = await page.evaluate(() => {
            const src = (window as any)._map.getSource('np-pois');
            return src.serialize().data.features?.length ?? 0;
        });
        expect(count).toBeGreaterThan(0);
    });

    test('POI circle layer is visible (not hidden)', async ({ page }) => {
        await gotoMap(page);
        const visibility = await page.evaluate(() =>
            (window as any)._map.getLayoutProperty('np-pois-layer', 'visibility'),
        );
        // MapLibre default (undefined) means visible; explicit 'visible' also fine
        expect(visibility === undefined || visibility === 'visible').toBe(true);
    });

    test('POI circle actually renders in the viewport at POI coordinates', async ({ page }) => {
        await gotoMap(page);
        // Jump to the fixture POI location then wait for it to actually appear in
        // queryRenderedFeatures. GeoJSON tiles are generated client-side but may
        // not be ready on the first idle event.
        await page.evaluate(() => {
            const map = (window as any)._map;
            map.jumpTo({ center: [139.695, 35.691], zoom: 14 });
        });
        await page.waitForFunction(
            () =>
                (window as any)._map.queryRenderedFeatures(undefined, { layers: ['np-pois-layer'] }).length >
                0,
            { timeout: 10_000 },
        );
    });
});

// ---------------------------------------------------------------------------
// 3. Track visibility
// ---------------------------------------------------------------------------

test.describe('track visibility', () => {
    test('Tokyo Drive (defaultVisible: true) is visible on load', async ({ page }) => {
        await gotoMap(page);
        const visible = await page.evaluate(
            id => (window as any).nomadMap.isTrackVisible(id),
            TRACK_A_ID,
        );
        expect(visible).toBe(true);
    });

    test('Sydney Walk (defaultVisible: false) is hidden on load', async ({ page }) => {
        await gotoMap(page);
        const visible = await page.evaluate(
            id => (window as any).nomadMap.isTrackVisible(id),
            TRACK_B_ID,
        );
        expect(visible).toBe(false);
    });

    test('setTrackVisible(true) makes a hidden track visible', async ({ page }) => {
        await gotoMap(page);
        await page.evaluate(id => (window as any).nomadMap.setTrackVisible(id, true), TRACK_B_ID);
        const visible = await page.evaluate(
            id => (window as any).nomadMap.isTrackVisible(id),
            TRACK_B_ID,
        );
        expect(visible).toBe(true);
    });

    test('setTrackVisible(false) hides a visible track', async ({ page }) => {
        await gotoMap(page);
        await page.evaluate(id => (window as any).nomadMap.setTrackVisible(id, false), TRACK_A_ID);
        const visible = await page.evaluate(
            id => (window as any).nomadMap.isTrackVisible(id),
            TRACK_A_ID,
        );
        expect(visible).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 4. fitToTracks — should only consider visible tracks
// ---------------------------------------------------------------------------

test.describe('fitToTracks', () => {
    test('initial auto-fit only includes visible tracks (Tokyo, not Sydney)', async ({ page }) => {
        await gotoMap(page);
        await waitForMapSettle(page);
        // Sydney Walk is defaultVisible: false, so initial bounds should not reach Sydney latitude
        const south = await page.evaluate(() => (window as any)._map.getBounds().getSouth());
        // Tokyo is ~35.7°N; Sydney is ~-33.9°S — a negative south bound means Sydney is included
        expect(south).toBeGreaterThan(TOKYO_MIN_LAT);
    });

    test('fitToTracks() only fits visible tracks', async ({ page }) => {
        await gotoMap(page);
        await page.evaluate(() => (window as any).nomadMap.fitToTracks());
        await waitForMapSettle(page);
        const south = await page.evaluate(() => (window as any)._map.getBounds().getSouth());
        expect(south).toBeGreaterThan(TOKYO_MIN_LAT);
    });

    test('excludeFromAutoBounds track is visible but excluded from initial auto-fit', async ({ page }) => {
        await gotoMap(page);
        await waitForMapSettle(page);
        // Helsinki Flight is defaultVisible:true but excludeFromAutoBounds:true.
        // It should be visible (renderable) but its coords (~60°N) must not affect initial bounds.
        const [isVisible, north] = await page.evaluate(
            id => [
                (window as any).nomadMap.isTrackVisible(id),
                (window as any)._map.getBounds().getNorth(),
            ],
            TRACK_C_ID,
        );
        expect(isVisible).toBe(true);
        expect(north).toBeLessThan(TOKYO_MAX_LAT); // ~36°N at most; Helsinki at 60°N would push this far higher
    });

    test('fitToTracks() expands bounds when hidden track is made visible', async ({ page }) => {
        await gotoMap(page);
        await page.evaluate(id => (window as any).nomadMap.setTrackVisible(id, true), TRACK_B_ID);
        await page.evaluate(() => (window as any).nomadMap.fitToTracks());
        await waitForMapSettle(page);
        const south = await page.evaluate(() => (window as any)._map.getBounds().getSouth());
        // Now Sydney (lat -33.9) should be included
        expect(south).toBeLessThan(SYDNEY_MAX_LAT);
    });

    test('fitToTracks() with all tracks hidden is a no-op (no crash)', async ({ page }) => {
        await gotoMap(page);
        // Hide all three tracks (Tokyo and Helsinki are visible by default; Sydney is already hidden)
        await page.evaluate(id => (window as any).nomadMap.setTrackVisible(id, false), TRACK_A_ID);
        await page.evaluate(id => (window as any).nomadMap.setTrackVisible(id, false), TRACK_C_ID);
        // fitToTracks should return without throwing when there are no visible tracks
        await page.evaluate(() => (window as any).nomadMap.fitToTracks());
        const exists = await page.evaluate(() => !!(window as any)._map.getLayer('np-tracks-layer'));
        expect(exists).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 5. Basemap switch
// ---------------------------------------------------------------------------

// Source IDs that confirm a given basemap's style is applied.
// blueMarble is an inline style with a named source; osm is URL-based.
const BASEMAP_SOURCE: Record<string, string | null> = {
    blueMarble: 'blue-marble',
    osm: null, // no reliable source name to probe
};

test.describe('basemap switch', () => {
    /**
     * Call setBasemap() and wait until the new style's own source is present
     * (proves the style switched) AND our track layer is present (proves
     * layer restoration ran). The old "wait for layer to disappear" approach
     * is no longer reliable — our styledata handler restores layers so quickly
     * that headless polling never catches the brief absence.
     */
    async function switchBasemap(page: PwPage, basemapId: string) {
        await page.evaluate(id => (window as any).nomadMap.setBasemap(id), basemapId);
        const basemapSource = BASEMAP_SOURCE[basemapId];
        if (basemapSource) {
            // Wait until the new basemap source AND our track layer both exist.
            await page.waitForFunction(
                src =>
                    !!(window as any)._map.getSource(src) &&
                    !!(window as any)._map.getLayer('np-tracks-layer'),
                basemapSource,
                { timeout: 15_000 },
            );
        } else {
            // No reliable basemap-specific probe — just ensure our layer survives.
            await page.waitForFunction(
                () => !!(window as any)._map.getLayer('np-tracks-layer'),
                { timeout: 15_000 },
            );
        }
    }

    test('track layer survives a basemap switch to blueMarble', async ({ page }) => {
        await gotoMap(page);
        await switchBasemap(page, 'blueMarble');
        const exists = await page.evaluate(() => !!(window as any)._map.getLayer('np-tracks-layer'));
        expect(exists).toBe(true);
    });

    test('track source survives a basemap switch to blueMarble', async ({ page }) => {
        await gotoMap(page);
        await switchBasemap(page, 'blueMarble');
        const exists = await page.evaluate(() => !!(window as any)._map.getSource('np-tracks'));
        expect(exists).toBe(true);
    });

    test('POI layer survives a basemap switch to blueMarble', async ({ page }) => {
        await gotoMap(page);
        await switchBasemap(page, 'blueMarble');
        const exists = await page.evaluate(() => !!(window as any)._map.getLayer('np-pois-layer'));
        expect(exists).toBe(true);
    });

    test('track visibility state is preserved after basemap switch', async ({ page }) => {
        await gotoMap(page);
        // Sydney Walk starts hidden — confirm it's still hidden after switch
        await switchBasemap(page, 'blueMarble');
        const visible = await page.evaluate(
            id => (window as any).nomadMap.isTrackVisible(id),
            TRACK_B_ID,
        );
        expect(visible).toBe(false);
    });

    test('switching back to osm restores track layer', async ({ page }) => {
        await gotoMap(page);
        await switchBasemap(page, 'blueMarble');
        await switchBasemap(page, 'osm');
        const exists = await page.evaluate(() => !!(window as any)._map.getLayer('np-tracks-layer'));
        expect(exists).toBe(true);
    });

    test('rapid basemap switching does not crash', async ({ page }) => {
        await gotoMap(page);
        // Fire 3 switches without waiting for any to complete
        await page.evaluate(() => {
            const nm = (window as any).nomadMap;
            nm.setBasemap('blueMarble');
            nm.setBasemap('osm');
            nm.setBasemap('blueMarble');
        });
        // Wait for the final basemap handler to restore our track layer.
        // The generation counter ensures only the latest handler runs.
        await page.waitForFunction(
            () => !!(window as any)._map.getLayer('np-tracks-layer'),
            { timeout: 30_000, polling: 200 },
        );
    });

    test('track visibility survives rapid basemap switching', async ({ page }) => {
        await gotoMap(page);
        // Hide Sydney, then rapid-switch
        await page.evaluate(id => (window as any).nomadMap.setTrackVisible(id, false), TRACK_A_ID);
        await page.evaluate(() => {
            const nm = (window as any).nomadMap;
            nm.setBasemap('blueMarble');
            nm.setBasemap('osm');
        });
        await page.waitForFunction(
            () => !!(window as any)._map.getLayer('np-tracks-layer'),
            { timeout: 30_000 },
        );
        // Wait a bit for all handlers to complete
        await page.waitForTimeout(500);
        const visible = await page.evaluate(
            id => (window as any).nomadMap.isTrackVisible(id),
            TRACK_A_ID,
        );
        expect(visible).toBe(false);
    });

    test('zoom is clamped when switching to a basemap with lower maxZoom', async ({ page }) => {
        await gotoMap(page);
        // Zoom to 12, well above Blue Marble's maxZoom of 8
        await page.evaluate(() => (window as any)._map.jumpTo({ zoom: 12 }));
        await switchBasemap(page, 'blueMarble');
        await waitForMapSettle(page);
        const zoom = await page.evaluate(() => (window as any)._map.getZoom());
        expect(zoom).toBeLessThanOrEqual(8);
    });
});

// ---------------------------------------------------------------------------
// 6. Colour attribute
// ---------------------------------------------------------------------------

test.describe('colour attribute', () => {
    test('default colour attribute is "day"', async ({ page }) => {
        await gotoMap(page);
        const attr = await page.evaluate(() => (window as any).nomadMap.colourAttribute);
        expect(attr).toBe('day');
    });

    test('setColourAttribute updates the getter', async ({ page }) => {
        await gotoMap(page);
        await page.evaluate(() => (window as any).nomadMap.setColourAttribute('speeds'));
        const attr = await page.evaluate(() => (window as any).nomadMap.colourAttribute);
        expect(attr).toBe('speeds');
    });

    test('setColourAttribute does not remove the track layer', async ({ page }) => {
        await gotoMap(page);
        for (const attr of ['speeds', 'elevations', 'sunAngles', 'transportMode', 'day'] as const) {
            await page.evaluate(a => (window as any).nomadMap.setColourAttribute(a), attr);
        }
        const exists = await page.evaluate(() => !!(window as any)._map.getLayer('np-tracks-layer'));
        expect(exists).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 7. Layer filter and paint property
// ---------------------------------------------------------------------------

test.describe('layer filter and paint', () => {
    // The visibility filter format: ['in', ['get', 'trackId'], ['literal', [id1, id2, ...]]]
    // filter[2][1] is the array of currently visible track IDs.

    test('track layer filter excludes hidden tracks on load', async ({ page }) => {
        await gotoMap(page);
        // Sydney Walk is defaultVisible: false — must be absent from the literal array
        const filter = await page.evaluate(() => (window as any)._map.getFilter('np-tracks-layer'));
        const literal: string[] = filter?.[2]?.[1];
        expect(literal).toBeDefined();
        expect(literal).not.toContain(TRACK_B_ID);
        expect(literal).toContain(TRACK_A_ID);
        expect(literal).toContain(TRACK_C_ID);
    });

    test('track layer filter drops a track when it is hidden', async ({ page }) => {
        await gotoMap(page);
        await page.evaluate(id => (window as any).nomadMap.setTrackVisible(id, false), TRACK_A_ID);
        const filter = await page.evaluate(() => (window as any)._map.getFilter('np-tracks-layer'));
        const literal: string[] = filter?.[2]?.[1];
        expect(literal).not.toContain(TRACK_A_ID);
    });

    test('track layer filter adds a track when it is shown', async ({ page }) => {
        await gotoMap(page);
        await page.evaluate(id => (window as any).nomadMap.setTrackVisible(id, true), TRACK_B_ID);
        const filter = await page.evaluate(() => (window as any)._map.getFilter('np-tracks-layer'));
        const literal: string[] = filter?.[2]?.[1];
        expect(literal).toContain(TRACK_B_ID);
    });

    test('line-color is an expression (array) on load', async ({ page }) => {
        await gotoMap(page);
        const paint = await page.evaluate(() =>
            (window as any)._map.getPaintProperty('np-tracks-layer', 'line-color'),
        );
        expect(Array.isArray(paint)).toBe(true);
    });

    test('line-color expression changes when colour attribute switches from day to speed', async ({ page }) => {
        await gotoMap(page);
        const before = await page.evaluate(() =>
            JSON.stringify((window as any)._map.getPaintProperty('np-tracks-layer', 'line-color')),
        );
        await page.evaluate(() => (window as any).nomadMap.setColourAttribute('speeds'));
        const after = await page.evaluate(() =>
            JSON.stringify((window as any)._map.getPaintProperty('np-tracks-layer', 'line-color')),
        );
        expect(after).not.toBe(before);
    });
});

// ---------------------------------------------------------------------------
// 8. destroy()
// ---------------------------------------------------------------------------

test.describe('destroy', () => {
    test('removes all UI panels from the DOM', async ({ page }) => {
        await gotoMap(page);
        const beforeCount = await page.locator('.np-panel').count();
        expect(beforeCount).toBeGreaterThan(0);
        await page.evaluate(() => (window as any).nomadMap.destroy());
        const afterCount = await page.locator('.np-panel').count();
        expect(afterCount).toBe(0);
    });

    test('removes map controls from the DOM', async ({ page }) => {
        await gotoMap(page);
        const beforeCount = await page.locator('.np-map-controls').count();
        expect(beforeCount).toBe(1);
        await page.evaluate(() => (window as any).nomadMap.destroy());
        const afterCount = await page.locator('.np-map-controls').count();
        expect(afterCount).toBe(0);
    });

    test('removes mobile menu elements from the DOM', async ({ page }) => {
        await gotoMap(page);
        await page.evaluate(() => (window as any).nomadMap.destroy());
        const btn = await page.locator('.np-mobile-btn').count();
        const backdrop = await page.locator('.np-mobile-backdrop').count();
        const drawer = await page.locator('.np-mobile-drawer').count();
        expect(btn + backdrop + drawer).toBe(0);
    });

    test('removes the map canvas', async ({ page }) => {
        await gotoMap(page);
        await page.evaluate(() => (window as any).nomadMap.destroy());
        const canvas = await page.locator('.maplibregl-canvas').count();
        expect(canvas).toBe(0);
    });
});
