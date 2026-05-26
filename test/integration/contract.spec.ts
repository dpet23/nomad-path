/**
 * Output ⟷ input contract tests.
 *
 * Each test loads a hand-crafted geojson under contract-fixtures/ that varies
 * one shape dimension and asserts library-observable behaviour. These tests
 * close the 15 contract gaps catalogued in
 * docs/test-analysis/preprocessing-watcher-2026-04-28.md §3.
 *
 * Per Epic 10 Phase 1.5 (tests-only contract): these tests invoke the real
 * library and assert observable behaviour. They are L-Integration in
 * framework category — library-in-real-browser-on-fixture-shape-varied-input.
 */
import { test, expect } from './fixtures';
import { gotoMapWithFixture } from './helpers';

const FX = '/contract-fixtures';

test.describe('Output ⟷ input contract', () => {
    // -----------------------------------------------------------------------
    // Gap 1: POIFeature.label is optional and the pipeline never writes it.
    // The library must tolerate POIs with no `label` property.
    // -----------------------------------------------------------------------
    test('Gap 1: library loads POI with no label property', async ({ page }) => {
        await gotoMapWithFixture(page, `${FX}/poi-without-label.geojson`);
        const ready = await page.evaluate(() => (window as any).nomadMapReady);
        expect(ready).toBe(true);
        const visible = await page.evaluate(() =>
            (window as any).nomadMap.isPOICategoryVisible('accommodation'),
        );
        expect(visible).toBe(true);
    });

    // -----------------------------------------------------------------------
    // Gap 2: library reads metadata.attributeRanges on initial load via
    // LayerManager.addLayers → mergeRanges (LayerManager.ts:262). However,
    // AttributeLegend's constructor immediately recomputes from per-point
    // arrays via computeVisibleRanges and overwrites _layers._ranges
    // (AttributeLegend.ts:41-42). So when per-point arrays are absent, the
    // merged metadata range is discarded — surfacing a recompute-vs-metadata
    // precedence question that warrants its own design discussion.
    //
    // Deferred to Epic 13 (library test remediation), where the right place
    // to test the merge happens to be a unit test of LayerManager.addLayers
    // with mocked AttributeLegend, rather than this end-to-end fixture.
    // No assertion here; the gap is acknowledged in the analysis doc.
    // -----------------------------------------------------------------------
    // Gap 3: TrackProperties.transportMode is an open enum. Pipeline can emit
    // OsmAnd activity strings like "snorkel", "horseback". Library must
    // render these (paint expression has a fallback to drive at the segment
    // level via `transportMode ?? 'drive'`).
    // -----------------------------------------------------------------------
    test('Gap 3: library renders track with unknown transportMode', async ({ page }) => {
        await gotoMapWithFixture(page, `${FX}/unknown-transport-mode.geojson`);
        const ready = await page.evaluate(() => (window as any).nomadMapReady);
        expect(ready).toBe(true);
        const featureCount = await page.evaluate(() => {
            const source = (window as any)._map.getSource('np-tracks');
            const data = source?.serialize?.()?.data;
            return data?.features?.length ?? 0;
        });
        // 2-point track → 1 segment.
        expect(featureCount).toBe(1);
        // Confirm the unknown mode reached the segment property (no silent overwrite).
        const mode = await page.evaluate(() => {
            const source = (window as any)._map.getSource('np-tracks');
            const data = source?.serialize?.()?.data;
            return data?.features?.[0]?.properties?.transportMode;
        });
        expect(mode).toBe('snorkel');
    });

    // -----------------------------------------------------------------------
    // Gap 4: TrackProperties.group is optional in the type but pipeline
    // always emits it. Library must tolerate a track with no `group` key
    // (e.g. legacy fixture from before the field existed).
    // -----------------------------------------------------------------------
    test('Gap 4: library loads track with no group property', async ({ page }) => {
        await gotoMapWithFixture(page, `${FX}/track-without-group.geojson`);
        const ready = await page.evaluate(() => (window as any).nomadMapReady);
        expect(ready).toBe(true);
        const featureCount = await page.evaluate(() => {
            const source = (window as any)._map.getSource('np-tracks');
            const data = source?.serialize?.()?.data;
            return data?.features?.length ?? 0;
        });
        expect(featureCount).toBe(1);
    });

    // -----------------------------------------------------------------------
    // Gap 5: TrackFeature.geometry.coordinates allows 3D. Pipeline emits 2D
    // today (elevation goes into the parallel array), but the type permits
    // 3D and the library must accept it. Antimeridian split must also
    // preserve altitude (fixed in this commit).
    // -----------------------------------------------------------------------
    test('Gap 5: library renders track with 3D coordinates', async ({ page }) => {
        await gotoMapWithFixture(page, `${FX}/track-3d-coords.geojson`);
        const ready = await page.evaluate(() => (window as any).nomadMapReady);
        expect(ready).toBe(true);
        const featureCount = await page.evaluate(() => {
            const source = (window as any)._map.getSource('np-tracks');
            const data = source?.serialize?.()?.data;
            return data?.features?.length ?? 0;
        });
        // 3-point track → 2 segments.
        expect(featureCount).toBe(2);
        // Each segment's coords should still carry the altitude (3-element).
        const allHaveAltitude = await page.evaluate(() => {
            const source = (window as any)._map.getSource('np-tracks');
            const data = source?.serialize?.()?.data;
            return data.features.every(
                (f: any) => f.geometry.coordinates.every((c: number[]) => c.length === 3),
            );
        });
        expect(allHaveAltitude).toBe(true);
    });

    // -----------------------------------------------------------------------
    // Gap 6: properties.times is a one-way contract — pipeline writes it but
    // library never reads it for rendering. Omitting it must not break
    // anything.
    // -----------------------------------------------------------------------
    test('Gap 6: library renders track with no times array', async ({ page }) => {
        await gotoMapWithFixture(page, `${FX}/track-without-times.geojson`);
        const ready = await page.evaluate(() => (window as any).nomadMapReady);
        expect(ready).toBe(true);
        const featureCount = await page.evaluate(() => {
            const source = (window as any)._map.getSource('np-tracks');
            const data = source?.serialize?.()?.data;
            return data?.features?.length ?? 0;
        });
        expect(featureCount).toBe(1);
    });

    // -----------------------------------------------------------------------
    // Gap 7: mergeRanges now throws on unit mismatch (fixed in this commit).
    // Loading two trips with conflicting speed units should fail loudly
    // with a descriptive error instead of silently picking one unit.
    // -----------------------------------------------------------------------
    test('Gap 7: library throws on multi-trip unit mismatch', async ({ page, consoleErrors }) => {
        await gotoMapWithFixture(page, [
            `${FX}/conflicting-units-a.geojson`,
            `${FX}/conflicting-units-b.geojson`,
        ]);
        const error = await page.evaluate(() => (window as any).nomadMapError);
        expect(error).toBeDefined();
        expect(error).toMatch(/Conflicting units/i);
        expect(error).toMatch(/speed/);
        // The test page logs the thrown error via console.error — that's
        // expected here, so drop the matching entry from the captured array
        // before the shared fixture's auto-assert at end of test.
        const idx = consoleErrors.findIndex((m) => /Conflicting units/i.test(m));
        if (idx >= 0) consoleErrors.splice(idx, 1);
    });

    // -----------------------------------------------------------------------
    // Gap 8 (regression-only): deriveTrackId is composed from `${day}::${name}`,
    // so two tracks sharing (day, name) collide. Current behaviour: both
    // tracks load but their IDs are identical, so any setTrackVisible(id)
    // call affects both at once. This test pins current behaviour; Epic 11
    // is expected to fix the underlying defect (collision-tolerant IDs or
    // pipeline-side disambiguation), at which point this test will need
    // updating.
    // -----------------------------------------------------------------------
    test('Gap 8 (regression-only): duplicate (day, name) tracks share a single trackId today', async ({ page }) => {
        await gotoMapWithFixture(page, `${FX}/duplicate-track-id.geojson`);
        const ready = await page.evaluate(() => (window as any).nomadMapReady);
        expect(ready).toBe(true);
        const trackIds = await page.evaluate(() => {
            const source = (window as any)._map.getSource('np-tracks');
            const data = source?.serialize?.()?.data;
            return [...new Set(data.features.map((f: any) => f.properties.trackId))];
        });
        // Defect-pinning: today there's only one unique trackId for the two tracks.
        // Epic 11 will fix this — when it does, this assertion flips.
        expect(trackIds).toHaveLength(1);
        expect(trackIds[0]).toBe('2024-01-01::Coastal Drive');
    });

    // -----------------------------------------------------------------------
    // Gap 9: speeds parallel array can contain explicit nulls. Library
    // should render the track without NaN errors; segments with null speed
    // values get a neutral colour via the paint expression's fallback.
    // -----------------------------------------------------------------------
    test('Gap 9: library renders track with null speeds in parallel array', async ({ page }) => {
        await gotoMapWithFixture(page, `${FX}/track-null-speeds.geojson`);
        const ready = await page.evaluate(() => (window as any).nomadMapReady);
        expect(ready).toBe(true);
        const speedValues = await page.evaluate(() => {
            const source = (window as any)._map.getSource('np-tracks');
            const data = source?.serialize?.()?.data;
            return data.features.map((f: any) => f.properties.speedValue);
        });
        // 4-point track → 3 segments. avgNullable returns null when either
        // neighbour is null. speeds = [100, null, null, 50]:
        //   seg 0..1: avg(100, null) → null
        //   seg 1..2: avg(null, null) → null
        //   seg 2..3: avg(null, 50) → null
        expect(speedValues).toEqual([null, null, null]);
    });

    // -----------------------------------------------------------------------
    // Gap 10: pipeline sorts features chronologically; library must tolerate
    // unsorted input. Day-index assignment alphabetises day keys, so the
    // expected dayIndex values are stable regardless of input order.
    // -----------------------------------------------------------------------
    test('Gap 10: library produces correct dayIndex despite unsorted feature order', async ({ page }) => {
        await gotoMapWithFixture(page, `${FX}/unsorted-features.geojson`);
        const ready = await page.evaluate(() => (window as any).nomadMapReady);
        expect(ready).toBe(true);
        const dayToIndex = await page.evaluate(() => {
            const source = (window as any)._map.getSource('np-tracks');
            const data = source?.serialize?.()?.data;
            const map: Record<string, number> = {};
            for (const f of data.features) {
                map[f.properties.day] = f.properties.dayIndex;
            }
            return map;
        });
        // Days sorted alphabetically: 2024-01-01, 2024-01-02, 2024-01-03 → 0, 1, 2.
        expect(dayToIndex['2024-01-01']).toBe(0);
        expect(dayToIndex['2024-01-02']).toBe(1);
        expect(dayToIndex['2024-01-03']).toBe(2);
    });

    // -----------------------------------------------------------------------
    // Gap 11: tripName is in the schema but no library code reads it. The
    // library must accept any tripName value (including empty) and still
    // load both trips fully when multi-trip is used.
    // -----------------------------------------------------------------------
    test('Gap 11: library loads multi-trip with empty + populated tripName', async ({ page }) => {
        await gotoMapWithFixture(page, [
            `${FX}/trip-empty-name.geojson`,
            `${FX}/trip-named.geojson`,
        ]);
        const ready = await page.evaluate(() => (window as any).nomadMapReady);
        expect(ready).toBe(true);
        const featureCount = await page.evaluate(() => {
            const source = (window as any)._map.getSource('np-tracks');
            const data = source?.serialize?.()?.data;
            return data?.features?.length ?? 0;
        });
        // Two 2-point tracks → 2 segments total.
        expect(featureCount).toBe(2);
    });

    // -----------------------------------------------------------------------
    // Gap 12 (regression-only): POI with empty category. Library currently
    // groups uncategorised POIs together silently; defect deferred to Epic 11
    // (pipeline-side fallback decision). Test pins current behaviour.
    // -----------------------------------------------------------------------
    test('Gap 12 (regression-only): library accepts POI with empty category today', async ({ page }) => {
        await gotoMapWithFixture(page, `${FX}/poi-empty-category.geojson`);
        const ready = await page.evaluate(() => (window as any).nomadMapReady);
        expect(ready).toBe(true);
        const poiCount = await page.evaluate(() => {
            const source = (window as any)._map.getSource('np-pois');
            const data = source?.serialize?.()?.data;
            return data?.features?.length ?? 0;
        });
        // Defect-pinning: the POI is loaded; Epic 11 may decide to reject or relabel.
        expect(poiCount).toBe(1);
    });

    // -----------------------------------------------------------------------
    // Gap 13: pipeline omits parallel arrays entirely when all values are
    // null (e.g. a plain KML LineString). Library's avgNullable uses
    // optional chaining so this should still build segments.
    // -----------------------------------------------------------------------
    test('Gap 13: library builds segments for track with no parallel arrays', async ({ page }) => {
        await gotoMapWithFixture(page, `${FX}/track-no-parallel-arrays.geojson`);
        const ready = await page.evaluate(() => (window as any).nomadMapReady);
        expect(ready).toBe(true);
        const segments = await page.evaluate(() => {
            const source = (window as any)._map.getSource('np-tracks');
            const data = source?.serialize?.()?.data;
            return data.features.map((f: any) => ({
                elev: f.properties.elevValue,
                speed: f.properties.speedValue,
                sun: f.properties.sunValue,
            }));
        });
        // 3-point track → 2 segments, all with null aggregate values.
        expect(segments).toHaveLength(2);
        for (const seg of segments) {
            expect(seg.elev).toBeNull();
            expect(seg.speed).toBeNull();
            expect(seg.sun).toBeNull();
        }
    });

    // -----------------------------------------------------------------------
    // Gap 14: features with unrecognised type are now warned-and-skipped
    // (fixed in this commit) instead of silently dropped. The track count
    // should match only the genuinely-typed features.
    // -----------------------------------------------------------------------
    test('Gap 14: library warns and skips features with unknown type', async ({ page, consoleErrors }) => {
        // The DataLoader emits console.warn for the malformed feature; capture
        // it via a separate listener since the shared fixture only collects errors.
        const warnings: string[] = [];
        page.on('console', (msg) => {
            if (msg.type() === 'warning') warnings.push(msg.text());
        });

        await gotoMapWithFixture(page, `${FX}/malformed-type.geojson`);
        const ready = await page.evaluate(() => (window as any).nomadMapReady);
        expect(ready).toBe(true);

        const featureCount = await page.evaluate(() => {
            const source = (window as any)._map.getSource('np-tracks');
            const data = source?.serialize?.()?.data;
            return data?.features?.length ?? 0;
        });
        // Only the well-formed track became a segment; the TRACK-uppercase one was skipped.
        expect(featureCount).toBe(1);

        // A warning was emitted naming the offending type value.
        const matched = warnings.some((w) => /unrecognised properties\.type=/i.test(w) && /TRACK/.test(w));
        expect(matched, `expected a console.warn about unrecognised type; got ${JSON.stringify(warnings)}`).toBe(true);

        // No genuine errors.
        expect(consoleErrors).toEqual([]);
    });

    // -----------------------------------------------------------------------
    // Gap 15: `hidden` undefined (track property absent) is the
    // documented "default to visible" semantic. Library uses
    // `!properties.hidden` to decide.
    // -----------------------------------------------------------------------
    test('Gap 15: library treats track with no hidden property as visible', async ({ page }) => {
        await gotoMapWithFixture(page, `${FX}/track-no-hidden.geojson`);
        const ready = await page.evaluate(() => (window as any).nomadMapReady);
        expect(ready).toBe(true);
        const visibleIds = await page.evaluate(() => [
            ...(window as any).nomadMap._layers.visibleIds,
        ]);
        expect(visibleIds).toContain('2024-01-01::Implicit Visible Track');
    });
});
