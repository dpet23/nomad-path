import type { PerPointAttribute, TripItem } from '@nomadpath/contract';
import { buildLineGeometry, buildPointGeometry, buildTrackItem } from '@nomadpath/contract';
import { describe, expect, it } from 'vitest';

import {
    categoricalColour,
    continuousDomain,
    itemLineColours,
    NO_DATA_COLOUR,
    rampColours,
} from '../src/core/colour.ts';

describe('NO_DATA_COLOUR', () => {
    it('is a fixed neutral grey RGBA tuple, opaque', () => {
        expect(NO_DATA_COLOUR).toEqual([128, 128, 128, 255]);
    });
});

describe('continuousDomain', () => {
    it('returns undefined for an empty items array', () => {
        expect(continuousDomain([], 'ele')).toBeUndefined();
    });

    it('returns undefined when no item has the attribute', () => {
        const items = [buildTrackItem({ geometries: [buildLineGeometry({ ele: undefined })] })];

        expect(continuousDomain(items, 'ele')).toBeUndefined();
    });

    it('returns undefined when every value for the attribute is null', () => {
        const items = [buildTrackItem({ geometries: [buildLineGeometry({ ele: [null, null, null] })] })];

        expect(continuousDomain(items, 'ele')).toBeUndefined();
    });

    it('ignores null entries when computing min/max', () => {
        const items = [buildTrackItem({ geometries: [buildLineGeometry({ ele: [100, null, 300] })] })];

        expect(continuousDomain(items, 'ele')).toEqual([100, 300]);
    });

    it('returns a degenerate [v, v] domain when all values are equal', () => {
        const items = [buildTrackItem({ geometries: [buildLineGeometry({ ele: [150, 150, 150] })] })];

        expect(continuousDomain(items, 'ele')).toEqual([150, 150]);
    });

    it('aggregates min/max across multiple line geometries within one item', () => {
        const items = [
            buildTrackItem({
                geometries: [buildLineGeometry({ ele: [100, 120] }), buildLineGeometry({ ele: [90, 400] })],
            }),
        ];

        expect(continuousDomain(items, 'ele')).toEqual([90, 400]);
    });

    it('aggregates min/max across multiple items', () => {
        const items = [
            buildTrackItem({ name: 'A', geometries: [buildLineGeometry({ ele: [100, 200] })] }),
            buildTrackItem({ name: 'B', geometries: [buildLineGeometry({ ele: [50, 500] })] }),
        ];

        expect(continuousDomain(items, 'ele')).toEqual([50, 500]);
    });

    it('ignores point geometries, which never carry per-point attributes', () => {
        const items = [
            buildTrackItem({
                geometries: [buildPointGeometry(), buildLineGeometry({ ele: [100, 200] })],
            }),
        ];

        expect(continuousDomain(items, 'ele')).toEqual([100, 200]);
    });

    it('computes the domain independently per attribute (speed vs ele)', () => {
        const items = [buildTrackItem({ geometries: [buildLineGeometry({ ele: [100, 200], speed: [1, 2] })] })];

        expect(continuousDomain(items, 'speed')).toEqual([1, 2]);
    });

    it('only considers the items passed in (caller is responsible for visible-only filtering)', () => {
        const hidden = buildTrackItem({ name: 'Hidden', geometries: [buildLineGeometry({ ele: [900, 950] })] });
        const visible = buildTrackItem({ name: 'Visible', geometries: [buildLineGeometry({ ele: [100, 200] })] });

        expect(continuousDomain([visible], 'ele')).toEqual([100, 200]);
        expect(continuousDomain([visible, hidden], 'ele')).toEqual([100, 950]);
    });
});

describe('rampColours', () => {
    const domain: [number, number] = [0, 100];

    it('returns an empty array for an empty values array', () => {
        expect(rampColours([], domain)).toEqual(new Uint8ClampedArray(0));
    });

    it('produces RGBA stride 4: length is 4x the input length', () => {
        const result = rampColours([0, 50, 100], domain);

        expect(result).toHaveLength(12);
    });

    it('maps a null entry to exactly NO_DATA_COLOUR', () => {
        const result = rampColours([null], domain);

        expect(Array.from(result)).toEqual(NO_DATA_COLOUR);
    });

    it('maps every entry to NO_DATA_COLOUR when the domain is degenerate (min === max)', () => {
        const result = rampColours([5, 10, 15], [7, 7]);

        expect(Array.from(result)).toEqual([...NO_DATA_COLOUR, ...NO_DATA_COLOUR, ...NO_DATA_COLOUR]);
    });

    it('maps the domain minimum and maximum to different colours', () => {
        const result = rampColours([0, 100], domain);

        const first = Array.from(result.subarray(0, 4));
        const second = Array.from(result.subarray(4, 8));
        expect(first).not.toEqual(second);
    });

    it('is deterministic: the same value and domain always produce the same colour', () => {
        const a = rampColours([42], domain);
        const b = rampColours([42], domain);

        expect(Array.from(a)).toEqual(Array.from(b));
    });

    it('produces every channel within valid byte range and full alpha for in-domain values', () => {
        const result = rampColours([0, 25, 50, 75, 100], domain);

        for (let i = 0; i < result.length; i += 4) {
            const [r, g, b, a] = [result[i], result[i + 1], result[i + 2], result[i + 3]];
            expect(r).toBeGreaterThanOrEqual(0);
            expect(r).toBeLessThanOrEqual(255);
            expect(g).toBeGreaterThanOrEqual(0);
            expect(g).toBeLessThanOrEqual(255);
            expect(b).toBeGreaterThanOrEqual(0);
            expect(b).toBeLessThanOrEqual(255);
            expect(a).toBe(255);
        }
    });

    it('clamps a value below the domain minimum to the same colour as the minimum', () => {
        const atMin = rampColours([0], domain);
        const belowMin = rampColours([-50], domain);

        expect(Array.from(belowMin)).toEqual(Array.from(atMin));
    });

    it('clamps a value above the domain maximum to the same colour as the maximum', () => {
        const atMax = rampColours([100], domain);
        const aboveMax = rampColours([200], domain);

        expect(Array.from(aboveMax)).toEqual(Array.from(atMax));
    });

    it('mixes null and numeric entries independently in one call', () => {
        const result = rampColours([0, null, 100], domain);

        expect(Array.from(result.subarray(4, 8))).toEqual(NO_DATA_COLOUR);
        expect(Array.from(result.subarray(0, 4))).not.toEqual(NO_DATA_COLOUR);
        expect(Array.from(result.subarray(8, 12))).not.toEqual(NO_DATA_COLOUR);
    });
});

describe('categoricalColour', () => {
    it('is stable under reordering: the same category yields the same colour regardless of list order', () => {
        const categories = ['Walking', 'Cycling', 'Driving'];
        const shuffled = ['Driving', 'Walking', 'Cycling'];

        expect(categoricalColour('Cycling', categories)).toEqual(categoricalColour('Cycling', shuffled));
    });

    it('gives different categories different colours', () => {
        const categories = ['Walking', 'Cycling', 'Driving'];

        const walking = categoricalColour('Walking', categories);
        const cycling = categoricalColour('Cycling', categories);
        const driving = categoricalColour('Driving', categories);

        expect(walking).not.toEqual(cycling);
        expect(walking).not.toEqual(driving);
        expect(cycling).not.toEqual(driving);
    });

    it('produces an opaque RGBA tuple', () => {
        const [, , , a] = categoricalColour('Walking', ['Walking']);

        expect(a).toBe(255);
    });

    it('is deterministic across repeated calls with the same inputs', () => {
        const categories = ['Walking', 'Cycling'];

        expect(categoricalColour('Walking', categories)).toEqual(categoricalColour('Walking', categories));
    });

    it('produces 12 pairwise-distinct colours for 12 categories', () => {
        const categories = Array.from({ length: 12 }, (_, i) => `Category ${String(i)}`);

        const colours = categories.map(category => categoricalColour(category, categories));
        const unique = new Set(colours.map(colour => colour.join(',')));

        expect(unique.size).toBe(12);
    });

    it('assigns colour by sorted position, independent of the category argument order among calls', () => {
        const categoriesAsc = ['Cycling', 'Driving', 'Walking'];
        const categoriesDesc = ['Walking', 'Driving', 'Cycling'];

        expect(categoricalColour('Driving', categoriesAsc)).toEqual(categoricalColour('Driving', categoriesDesc));
    });
});

describe('itemLineColours', () => {
    const categories = ['Cycling', 'Driving', 'Walking'];

    it('returns an empty array for a point-only item (no line geometries)', () => {
        const item = buildTrackItem({ geometries: [buildPointGeometry()] });

        expect(itemLineColours(item, 'ele', { categories })).toEqual([]);
    });

    it('returns one RGBA array per line geometry', () => {
        const item = buildTrackItem({
            geometries: [buildLineGeometry({ ele: [100, 200] }), buildLineGeometry({ ele: [50, 60, 70] })],
        });

        const result = itemLineColours(item, 'ele', { categories, domain: [50, 200] });

        expect(result).toHaveLength(2);
        expect(result[0]?.length).toBe(8);
        expect(result[1]?.length).toBe(12);
    });

    it('maps a per-point attribute through the given domain via rampColours', () => {
        const item = buildTrackItem({ geometries: [buildLineGeometry({ ele: [0, 100] })] });

        const result = itemLineColours(item, 'ele', { categories, domain: [0, 100] });

        expect(Array.from(result[0] ?? [])).toEqual(Array.from(rampColours([0, 100], [0, 100])));
    });

    it('floods all-NO_DATA_COLOUR when the attribute is missing on the item geometry', () => {
        const item = buildTrackItem({ geometries: [buildLineGeometry({ ele: undefined })] });

        const result = itemLineColours(item, 'ele', { categories, domain: [0, 100] });

        expect(Array.from(result[0] ?? [])).toEqual([...NO_DATA_COLOUR, ...NO_DATA_COLOUR, ...NO_DATA_COLOUR]);
    });

    it('floods all-NO_DATA_COLOUR for a per-point attribute when no domain is given', () => {
        const item = buildTrackItem({ geometries: [buildLineGeometry({ lon: [1, 2], lat: [1, 2], ele: [100, 200] })] });

        const result = itemLineColours(item, 'ele', { categories });

        expect(Array.from(result[0] ?? [])).toEqual([...NO_DATA_COLOUR, ...NO_DATA_COLOUR]);
    });

    it('floods the item category colour per point for transportMode', () => {
        const item = buildTrackItem({ transportMode: 'Cycling', geometries: [buildLineGeometry({ lon: [1, 2, 3] })] });

        const result = itemLineColours(item, 'transportMode', { categories });
        const expected = categoricalColour('Cycling', categories);

        expect(Array.from(result[0] ?? [])).toEqual([...expected, ...expected, ...expected]);
    });

    it('floods NO_DATA_COLOUR per point when transportMode is absent on the item', () => {
        const item = buildTrackItem({ transportMode: undefined, geometries: [buildLineGeometry({ lon: [1, 2] })] });

        const result = itemLineColours(item, 'transportMode', { categories });

        expect(Array.from(result[0] ?? [])).toEqual([...NO_DATA_COLOUR, ...NO_DATA_COLOUR]);
    });

    it('sizes the transportMode flood to the geometry point count, not a fixed size', () => {
        const item = buildTrackItem({
            transportMode: 'Walking',
            geometries: [buildLineGeometry({ lon: [1, 2, 3, 4, 5] })],
        });

        const result = itemLineColours(item, 'transportMode', { categories });

        expect(result[0]?.length).toBe(20);
    });

    it('uses NO_DATA_COLOUR for an unsupported/unknown attribute name defensively', () => {
        const item = buildTrackItem({ geometries: [buildLineGeometry({ lon: [1, 2] })] });

        const result = itemLineColours(item, 'unknownAttr' as PerPointAttribute, { categories });

        expect(Array.from(result[0] ?? [])).toEqual([...NO_DATA_COLOUR, ...NO_DATA_COLOUR]);
    });

    it('does not mutate the input item', () => {
        const item: TripItem = buildTrackItem({ geometries: [buildLineGeometry({ ele: [100, 200] })] });
        const before = JSON.parse(JSON.stringify(item)) as TripItem;

        itemLineColours(item, 'ele', { categories, domain: [0, 300] });

        expect(item).toEqual(before);
    });
});
