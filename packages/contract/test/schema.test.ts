import {
    buildLineGeometry,
    buildPointGeometry,
    buildPolygonGeometry,
    buildTrackItem,
    buildTripData,
    buildWaypointItem,
    tripDataSchema,
} from '@nomadpath/contract';
import { describe, expect, it } from 'vitest';

const BASE = 1894176000;

function accepts(doc: unknown): void {
    const result = tripDataSchema.safeParse(doc);
    expect(result.success, JSON.stringify(result.success ? '' : result.error.issues)).toBe(true);
}

function rejects(doc: unknown): void {
    expect(tripDataSchema.safeParse(doc).success).toBe(false);
}

describe('tripDataSchema: top level', () => {
    it('accepts a full valid document', () => {
        accepts(buildTripData());
    });

    it('accepts a document without the optional trip name', () => {
        const doc = buildTripData();
        delete doc.name;
        accepts(doc);
    });

    it('accepts an empty items list (empty trip)', () => {
        accepts(buildTripData({ items: [] }));
    });

    it('rejects a wrong version', () => {
        rejects({ ...buildTripData(), version: 2 });
    });

    it('rejects a missing version', () => {
        const { version: _version, ...rest } = buildTripData();
        rejects(rest);
    });

    it('rejects missing items', () => {
        const { items: _items, ...rest } = buildTripData();
        rejects(rest);
    });

    it('rejects unknown extra keys (strict producer contract)', () => {
        rejects({ ...buildTripData(), unexpected: true });
    });

    it('rejects non-object documents', () => {
        rejects('not a trip');
        rejects(null);
        rejects(42);
    });
});

describe('tripDataSchema: items', () => {
    it('accepts a waypoint item without the optional folder (top-level item)', () => {
        const item = buildWaypointItem();
        delete item.folder;
        accepts(buildTripData({ items: [item] }));
    });

    it('accepts a track item without the optional transportMode', () => {
        const item = buildTrackItem();
        delete item.transportMode;
        accepts(buildTripData({ items: [item] }));
    });

    it('accepts an item without the optional name', () => {
        const item = buildTrackItem();
        delete item.name;
        accepts(buildTripData({ items: [item] }));
    });

    it('rejects an item with no geometries', () => {
        rejects(buildTripData({ items: [buildTrackItem({ geometries: [] })] }));
    });
});

describe('tripDataSchema: geometries', () => {
    it('accepts all three geometry types', () => {
        accepts(
            buildTripData({
                items: [
                    buildTrackItem({
                        geometries: [buildLineGeometry(), buildPointGeometry(), buildPolygonGeometry()],
                    }),
                ],
            }),
        );
    });

    it('accepts a line with all per-point attribute arrays absent', () => {
        const line = buildLineGeometry();
        delete line.time;
        delete line.ele;
        delete line.speed;
        accepts(buildTripData({ items: [buildTrackItem({ geometries: [line] })] }));
    });

    it('accepts null entries inside per-point attribute arrays (missing data as-is)', () => {
        const line = buildLineGeometry({ speed: [1, null, 2], ele: [null, null, null] });
        accepts(buildTripData({ items: [buildTrackItem({ geometries: [line] })] }));
    });

    it('rejects a line with fewer than 2 points', () => {
        const line = buildLineGeometry({
            lon: [4.1],
            lat: [-54.5],
            time: [BASE],
            ele: [100],
            speed: [1],
        });
        rejects(buildTripData({ items: [buildTrackItem({ geometries: [line] })] }));
    });

    it('rejects out-of-range coordinates in lines and points', () => {
        rejects(
            buildTripData({
                items: [buildTrackItem({ geometries: [buildLineGeometry({ lat: [-54.5, -95, -54.6] })] })],
            }),
        );
        rejects(
            buildTripData({
                items: [buildWaypointItem({ geometries: [buildPointGeometry({ lon: 200 })] })],
            }),
        );
    });

    it('rejects an unknown geometry type', () => {
        rejects(
            buildTripData({
                items: [buildTrackItem({ geometries: [{ type: 'circle', lon: 4.1, lat: -54.5 } as never] })],
            }),
        );
    });

    it('rejects null entries in lon/lat coordinate arrays', () => {
        rejects(
            buildTripData({
                items: [buildTrackItem({ geometries: [buildLineGeometry({ lon: [4.1, null, 4.2] as never })] })],
            }),
        );
    });
});
