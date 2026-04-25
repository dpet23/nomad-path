/**
 * Level 3 — E2E seam tests.
 *
 * These tests validate the contract between the preprocessing pipeline and the
 * map library. The fixture is generated from raw GPX/KML files in
 * test/fixtures/map/ by `build:data`, then loaded in the browser via
 * test/e2e/test.html.
 *
 * A failure here that passes Level 2 means a seam bug: the pipeline produces
 * something the library doesn't handle correctly.
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

// ---------------------------------------------------------------------------
// Seam: metadata structure
// ---------------------------------------------------------------------------

test.describe('pipeline metadata', () => {
    test('fixture loads without error', async ({ page }) => {
        await gotoMap(page);
        const ready = await page.evaluate(() => (window as any).nomadMapReady);
        expect(ready).toBe(true);
    });

    test('trip metadata is accessible and has correct structure', async ({ page }) => {
        await gotoMap(page);
        const metadata = await page.evaluate(() => {
            const trips = (window as any).nomadMap.trips as any[];
            return trips[0].metadata;
        });
        expect(metadata).toBeDefined();
        expect(metadata.tripName).toBe('Meridian Trip');
        expect(metadata.attributeRanges).toBeDefined();
        expect(metadata.stats).toBeDefined();
    });

    test('attributeRanges has elevation and speed with correct units', async ({ page }) => {
        await gotoMap(page);
        const ranges = await page.evaluate(() => {
            const trips = (window as any).nomadMap.trips as any[];
            return trips[0].metadata.attributeRanges;
        });
        expect(ranges.elevation).toBeDefined();
        expect(ranges.elevation.unit).toBe('m');
        expect(Number.isFinite(ranges.elevation.min)).toBe(true);
        expect(Number.isFinite(ranges.elevation.max)).toBe(true);
        expect(ranges.elevation.min).toBeLessThan(ranges.elevation.max);

        expect(ranges.speed).toBeDefined();
        expect(ranges.speed.unit).toBe('km/h');
        expect(Number.isFinite(ranges.speed.min)).toBe(true);
        expect(Number.isFinite(ranges.speed.max)).toBe(true);
        expect(ranges.speed.min).toBeLessThan(ranges.speed.max);
    });

    test('stats reflect the fixture input files', async ({ page }) => {
        await gotoMap(page);
        const stats = await page.evaluate(() => {
            const trips = (window as any).nomadMap.trips as any[];
            return trips[0].metadata.stats;
        });
        expect(stats.trackCount).toBe(4);
        expect(stats.waypointCount).toBe(2);
        expect(stats.dayCount).toBe(2); // ground days only (flight excluded)
        expect(stats.transportModes.drive).toBe(2);
        expect(stats.transportModes.walk).toBe(1);
        expect(stats.transportModes.flight).toBe(1);
        expect(stats.dateRange.start).toBe('2025-06-10');
        expect(stats.dateRange.end).toBe('2025-06-11');
    });
});

// ---------------------------------------------------------------------------
// Seam: track features
// ---------------------------------------------------------------------------

test.describe('pipeline track features', () => {
    test('all tracks have required properties', async ({ page }) => {
        await gotoMap(page);
        const issues = await page.evaluate(() => {
            const trips = (window as any).nomadMap.trips as any[];
            const tracks = trips[0].features.filter((f: any) => f.properties.type === 'track');
            const problems: string[] = [];
            for (const t of tracks) {
                const p = t.properties;
                if (!p.name) problems.push(`Track missing name`);
                if (!p.day) problems.push(`Track ${p.name} missing day`);
                if (!p.transportMode) problems.push(`Track ${p.name} missing transportMode`);
                if (p.defaultVisible === undefined) problems.push(`Track ${p.name} missing defaultVisible`);
                if (t.geometry.type !== 'LineString') problems.push(`Track ${p.name} not LineString`);
                if (t.geometry.coordinates.length < 2) problems.push(`Track ${p.name} has < 2 coords`);
            }
            return problems;
        });
        expect(issues).toEqual([]);
    });

    test('track transport modes match expected values', async ({ page }) => {
        await gotoMap(page);
        const modes = await page.evaluate(() => {
            const trips = (window as any).nomadMap.trips as any[];
            const tracks = trips[0].features.filter((f: any) => f.properties.type === 'track');
            return tracks.map((t: any) => ({
                name: t.properties.name,
                mode: t.properties.transportMode,
            }));
        });
        const modeMap = Object.fromEntries(modes.map((m: any) => [m.name, m.mode]));
        expect(modeMap['Coastal Highway']).toBe('drive');
        expect(modeMap['Old Town Stroll']).toBe('walk');
        expect(modeMap['Mountain Pass']).toBe('drive');
        expect(modeMap['TST101 LEBL-LFPG']).toBe('flight');
    });

    test('flight track has a flight-prefixed day key', async ({ page }) => {
        await gotoMap(page);
        const flightDay = await page.evaluate(() => {
            const trips = (window as any).nomadMap.trips as any[];
            const flight = trips[0].features.find(
                (f: any) => f.properties.transportMode === 'flight',
            );
            return flight?.properties.day;
        });
        expect(flightDay).toMatch(/^flight-2025-06-09-/);
    });

    test('ground tracks sharing a date share the same day key', async ({ page }) => {
        await gotoMap(page);
        const day10Tracks = await page.evaluate(() => {
            const trips = (window as any).nomadMap.trips as any[];
            return trips[0].features
                .filter((f: any) => f.properties.type === 'track' && f.properties.day === '2025-06-10')
                .map((f: any) => f.properties.name);
        });
        expect(day10Tracks).toContain('Coastal Highway');
        expect(day10Tracks).toContain('Old Town Stroll');
        expect(day10Tracks).toHaveLength(2);
    });

    test('parallel arrays have correct length (one per coordinate)', async ({ page }) => {
        await gotoMap(page);
        const issues = await page.evaluate(() => {
            const trips = (window as any).nomadMap.trips as any[];
            const tracks = trips[0].features.filter((f: any) => f.properties.type === 'track');
            const problems: string[] = [];
            for (const t of tracks) {
                const n = t.geometry.coordinates.length;
                const p = t.properties;
                if (p.elevations && p.elevations.length !== n) {
                    problems.push(`${p.name}: elevations length ${p.elevations.length} != coords ${n}`);
                }
                if (p.speeds && p.speeds.length !== n) {
                    problems.push(`${p.name}: speeds length ${p.speeds.length} != coords ${n}`);
                }
                if (p.sunAngles && p.sunAngles.length !== n) {
                    problems.push(`${p.name}: sunAngles length ${p.sunAngles.length} != coords ${n}`);
                }
                if (p.times && p.times.length !== n) {
                    problems.push(`${p.name}: times length ${p.times.length} != coords ${n}`);
                }
            }
            return problems;
        });
        expect(issues).toEqual([]);
    });

    test('metadata elevation range actually bounds all per-point values', async ({ page }) => {
        await gotoMap(page);
        const result = await page.evaluate(() => {
            const trips = (window as any).nomadMap.trips as any[];
            const meta = trips[0].metadata;
            const range = meta.attributeRanges.elevation;
            const tracks = trips[0].features.filter((f: any) => f.properties.type === 'track');
            let globalMin = Infinity;
            let globalMax = -Infinity;
            for (const t of tracks) {
                const elev = t.properties.elevations;
                if (!elev) continue;
                for (const v of elev) {
                    if (v != null && isFinite(v)) {
                        if (v < globalMin) globalMin = v;
                        if (v > globalMax) globalMax = v;
                    }
                }
            }
            return { range, globalMin, globalMax };
        });
        expect(result.range.min).toBeLessThanOrEqual(result.globalMin);
        expect(result.range.max).toBeGreaterThanOrEqual(result.globalMax);
    });

    test('metadata speed range actually bounds all per-point values', async ({ page }) => {
        await gotoMap(page);
        const result = await page.evaluate(() => {
            const trips = (window as any).nomadMap.trips as any[];
            const meta = trips[0].metadata;
            const range = meta.attributeRanges.speed;
            const tracks = trips[0].features.filter((f: any) => f.properties.type === 'track');
            let globalMin = Infinity;
            let globalMax = -Infinity;
            for (const t of tracks) {
                const speeds = t.properties.speeds;
                if (!speeds) continue;
                for (const v of speeds) {
                    if (v != null && isFinite(v)) {
                        if (v < globalMin) globalMin = v;
                        if (v > globalMax) globalMax = v;
                    }
                }
            }
            return { range, globalMin, globalMax };
        });
        expect(result.range.min).toBeLessThanOrEqual(result.globalMin);
        expect(result.range.max).toBeGreaterThanOrEqual(result.globalMax);
    });
});

// ---------------------------------------------------------------------------
// Seam: group + visibility from nomadpath.yaml
// ---------------------------------------------------------------------------

test.describe('pipeline group and visibility config', () => {
    test('flight track has group "flights" from subfolder', async ({ page }) => {
        await gotoMap(page);
        const group = await page.evaluate(() => {
            const trips = (window as any).nomadMap.trips as any[];
            const flight = trips[0].features.find(
                (f: any) => f.properties.transportMode === 'flight',
            );
            return flight?.properties.group;
        });
        expect(group).toBe('flights');
    });

    test('flight track has excludeFromAutoBounds from yaml', async ({ page }) => {
        await gotoMap(page);
        const excluded = await page.evaluate(() => {
            const trips = (window as any).nomadMap.trips as any[];
            const flight = trips[0].features.find(
                (f: any) => f.properties.transportMode === 'flight',
            );
            return flight?.properties.excludeFromAutoBounds;
        });
        expect(excluded).toBe(true);
    });

    test('root-level tracks have group null', async ({ page }) => {
        await gotoMap(page);
        const groups = await page.evaluate(() => {
            const trips = (window as any).nomadMap.trips as any[];
            return trips[0].features
                .filter((f: any) => f.properties.type === 'track' && f.properties.transportMode !== 'flight')
                .map((f: any) => ({ name: f.properties.name, group: f.properties.group }));
        });
        for (const g of groups) {
            expect(g.group).toBeNull();
        }
    });

    test('landmark POI has defaultVisible false from yaml', async ({ page }) => {
        await gotoMap(page);
        const landmark = await page.evaluate(() => {
            const trips = (window as any).nomadMap.trips as any[];
            return trips[0].features.find(
                (f: any) => f.properties.type === 'poi' && f.properties.category === 'landmark',
            )?.properties;
        });
        expect(landmark).toBeDefined();
        expect(landmark.defaultVisible).toBe(false);
    });

    test('accommodation POI has defaultVisible true (default)', async ({ page }) => {
        await gotoMap(page);
        const accom = await page.evaluate(() => {
            const trips = (window as any).nomadMap.trips as any[];
            return trips[0].features.find(
                (f: any) => f.properties.type === 'poi' && f.properties.category === 'accommodation',
            )?.properties;
        });
        expect(accom).toBeDefined();
        expect(accom.defaultVisible).toBe(true);
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
        await page.selectOption('.np-attr-select', 'speed');
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
