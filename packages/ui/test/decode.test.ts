import {
    buildLineGeometry,
    buildPointGeometry,
    buildPolygonGeometry,
    buildTrackItem,
    buildTripData,
    buildWaypointItem,
    CONTRACT_VERSION,
} from '@nomadpath/contract';
import { describe, expect, it } from 'vitest';

import { decodeTripData } from '../src/core/decode.ts';

describe('decodeTripData', () => {
    describe('file tier', () => {
        it('accepts a valid file with no notices', () => {
            const raw = buildTripData();

            const result = decodeTripData(raw);

            expect(result).toEqual({
                ok: true,
                name: 'Fictional Archipelago 2030',
                items: [buildTrackItem(), buildWaypointItem()],
                notices: [],
            });
        });

        it('accepts an empty items array', () => {
            const raw = buildTripData({ items: [] });

            const result = decodeTripData(raw);

            expect(result).toEqual({
                ok: true,
                name: 'Fictional Archipelago 2030',
                items: [],
                notices: [],
            });
        });

        it.each<[string, unknown]>([
            ['null', null],
            ['a plain array', []],
            ['a string', 'not an object'],
            ['a number', 42],
            ['undefined', undefined],
        ])('rejects raw input that is %s, not a plain object', (_label, raw) => {
            const result = decodeTripData(raw);

            expect(result).toEqual({
                ok: false,
                reason: expect.any(String) as string,
            });
            expect(result.ok).toBe(false);
        });

        it('rejects a version mismatch, naming both versions', () => {
            const raw = buildTripData({ version: 99 as unknown as 1 });

            const result = decodeTripData(raw);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.reason).toContain(String(CONTRACT_VERSION));
                expect(result.reason).toContain('99');
            }
        });

        it('rejects items that is not an array', () => {
            const raw = { ...buildTripData(), items: 'not-an-array' };

            const result = decodeTripData(raw);

            expect(result.ok).toBe(false);
        });
    });

    describe('item tier', () => {
        it('skips a bad item among good items, with an item-skipped notice at the original index', () => {
            const goodA = buildTrackItem({ name: 'Good A' });
            const badItem = { name: 'Bad', geometries: [] } as unknown as ReturnType<typeof buildTrackItem>;
            const goodB = buildWaypointItem({ name: 'Good B' });
            const raw = buildTripData({ items: [goodA, badItem, goodB] });

            const result = decodeTripData(raw);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.items).toEqual([goodA, goodB]);
                expect(result.notices).toEqual([
                    {
                        kind: 'item-skipped',
                        itemIndex: 1,
                        reason: expect.any(String) as string,
                    },
                ]);
            }
        });

        it('skips an item whose line geometry has mismatched lon/lat lengths', () => {
            const badGeometry = buildLineGeometry({ lat: [-54.501, -54.502] });
            const badItem = buildTrackItem({ name: 'Mismatched', geometries: [badGeometry] });
            const good = buildWaypointItem();
            const raw = buildTripData({ items: [badItem, good] });

            const result = decodeTripData(raw);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.items).toEqual([good]);
                expect(result.notices).toEqual([
                    {
                        kind: 'item-skipped',
                        itemIndex: 0,
                        reason: expect.any(String) as string,
                    },
                ]);
            }
        });

        it('rejects null entries in the items array as a skipped item', () => {
            const good = buildTrackItem();
            const raw = buildTripData({ items: [good, null as unknown as ReturnType<typeof buildTrackItem>] });

            const result = decodeTripData(raw);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.items).toEqual([good]);
                expect(result.notices).toEqual([
                    {
                        kind: 'item-skipped',
                        itemIndex: 1,
                        reason: expect.any(String) as string,
                    },
                ]);
            }
        });
    });

    describe('field tier', () => {
        it('drops a mismatched-length ele array from a line geometry and keeps the item', () => {
            const geometry = buildLineGeometry({ ele: [100, 150] });
            const item = buildTrackItem({ geometries: [geometry] });
            const raw = buildTripData({ items: [item] });

            const result = decodeTripData(raw);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.items).toHaveLength(1);
                const keptGeometry = result.items[0]?.geometries[0];
                expect(keptGeometry).toEqual({ ...geometry, ele: undefined });
                expect(result.notices).toEqual([
                    {
                        kind: 'attribute-dropped',
                        itemIndex: 0,
                        attribute: 'ele',
                        reason: expect.any(String) as string,
                    },
                ]);
            }
        });

        it('drops a mismatched-length speed array from a line geometry and keeps the item', () => {
            const geometry = buildLineGeometry({ speed: [1, 1.5] });
            const item = buildTrackItem({ geometries: [geometry] });
            const raw = buildTripData({ items: [item] });

            const result = decodeTripData(raw);

            expect(result.ok).toBe(true);
            if (result.ok) {
                const keptGeometry = result.items[0]?.geometries[0];
                expect(keptGeometry).toEqual({ ...geometry, speed: undefined });
                expect(result.notices).toEqual([
                    {
                        kind: 'attribute-dropped',
                        itemIndex: 0,
                        attribute: 'speed',
                        reason: expect.any(String) as string,
                    },
                ]);
            }
        });

        it('drops a mismatched-length time array from a line geometry and keeps the item', () => {
            const geometry = buildLineGeometry({ time: [1894176000] });
            const item = buildTrackItem({ geometries: [geometry] });
            const raw = buildTripData({ items: [item] });

            const result = decodeTripData(raw);

            expect(result.ok).toBe(true);
            if (result.ok) {
                const keptGeometry = result.items[0]?.geometries[0];
                expect(keptGeometry).toEqual({ ...geometry, time: undefined });
                expect(result.notices).toEqual([
                    {
                        kind: 'attribute-dropped',
                        itemIndex: 0,
                        attribute: 'time',
                        reason: expect.any(String) as string,
                    },
                ]);
            }
        });

        it('does not mutate the original raw input geometry when dropping an attribute', () => {
            const geometry = buildLineGeometry({ ele: [100, 150] });
            const item = buildTrackItem({ geometries: [geometry] });
            const raw = buildTripData({ items: [item] });

            decodeTripData(raw);

            expect(geometry.ele).toEqual([100, 150]);
        });

        it('treats an absent optional attribute as valid and silent, with no notice', () => {
            const geometry = buildLineGeometry({ ele: undefined, speed: undefined, time: undefined });
            const item = buildTrackItem({ geometries: [geometry] });
            const raw = buildTripData({ items: [item] });

            const result = decodeTripData(raw);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.items).toEqual([item]);
                expect(result.notices).toEqual([]);
            }
        });

        it('reports multiple attribute-dropped notices for one geometry with several mismatched arrays', () => {
            const geometry = buildLineGeometry({ ele: [100], speed: [1] });
            const item = buildTrackItem({ geometries: [geometry] });
            const raw = buildTripData({ items: [item] });

            const result = decodeTripData(raw);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.notices).toEqual([
                    { kind: 'attribute-dropped', itemIndex: 0, attribute: 'ele', reason: expect.any(String) as string },
                    {
                        kind: 'attribute-dropped',
                        itemIndex: 0,
                        attribute: 'speed',
                        reason: expect.any(String) as string,
                    },
                ]);
            }
        });

        it('does not apply field-tier checks to point or polygon geometries', () => {
            const pointItem = buildWaypointItem({ geometries: [buildPointGeometry()] });
            const polygonItem = buildTrackItem({ name: 'Region', geometries: [buildPolygonGeometry()] });
            const raw = buildTripData({ items: [pointItem, polygonItem] });

            const result = decodeTripData(raw);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.items).toEqual([pointItem, polygonItem]);
                expect(result.notices).toEqual([]);
            }
        });
    });
});
