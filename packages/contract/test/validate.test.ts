import { describe, expect, it } from 'vitest';

import {
    buildDividerItem,
    buildLineGeometry,
    buildPolygonGeometry,
    buildTrackItem,
    buildTripData,
    buildWaypointItem,
    validateTripData,
} from '@nomadpath/contract';

describe('validateTripData: success cases', () => {
    it('returns zero issues for every default fixture builder output (fixture/validator handshake)', () => {
        expect(validateTripData(buildTripData())).toEqual([]);
        expect(
            validateTripData(
                buildTripData({
                    items: [buildTrackItem({ geometries: [buildPolygonGeometry()] })],
                }),
            ),
        ).toEqual([]);
    });

    it('accepts antimeridian-crossing bounds without complaint', () => {
        const item = buildTrackItem({ bounds: [179.9, -55, -179.9, -54] });
        expect(validateTripData(buildTripData({ items: [item], bounds: [179.9, -55, -179.9, -54] }))).toEqual([]);
    });

    it('accepts equal consecutive timestamps (non-decreasing, not strictly increasing)', () => {
        const line = buildLineGeometry({ time: [100, 100, 200] });
        expect(validateTripData(buildTripData({ items: [buildTrackItem({ geometries: [line] })] }))).toEqual([]);
    });
});

describe('validateTripData: structural failures', () => {
    it('reports structural issues for a non-object without throwing', () => {
        const issues = validateTripData('garbage');
        expect(issues.length).toBeGreaterThan(0);
    });

    it('reports a path for nested structural issues', () => {
        const doc = buildTripData({ items: [buildTrackItem({ order: 1.5 })] });
        const issues = validateTripData(doc);
        expect(issues.some(i => i.path.includes('items.0.order'))).toBe(true);
    });
});

describe('validateTripData: semantic failures', () => {
    it('reports mismatched per-point attribute array lengths', () => {
        const line = buildLineGeometry({ speed: [1, 2] });
        const issues = validateTripData(buildTripData({ items: [buildTrackItem({ geometries: [line] })] }));
        expect(issues.some(i => i.message.includes('speed') && i.message.includes('length'))).toBe(true);
    });

    it('reports lon/lat length mismatch', () => {
        const line = buildLineGeometry({ lat: [-54.5, -54.6] });
        const issues = validateTripData(buildTripData({ items: [buildTrackItem({ geometries: [line] })] }));
        expect(issues.length).toBeGreaterThan(0);
    });

    it('reports decreasing timestamps', () => {
        const line = buildLineGeometry({ time: [200, 100, 300] });
        const issues = validateTripData(buildTripData({ items: [buildTrackItem({ geometries: [line] })] }));
        expect(issues.some(i => i.message.includes('non-decreasing'))).toBe(true);
    });

    it('reports duplicate item ids', () => {
        const a = buildTrackItem({ order: 0 });
        const b = buildTrackItem({ order: 1 });
        const issues = validateTripData(buildTripData({ items: [a, b] }));
        expect(issues.some(i => i.message.includes('duplicate') && i.message.includes('id'))).toBe(true);
    });

    it('reports duplicate order values', () => {
        const a = buildTrackItem({ id: 'a', order: 5 });
        const b = buildWaypointItem({ id: 'b', order: 5 });
        const issues = validateTripData(buildTripData({ items: [a, b] }));
        expect(issues.some(i => i.message.includes('duplicate') && i.message.includes('order'))).toBe(true);
    });

    it('reports an unclosed polygon ring', () => {
        const polygon = buildPolygonGeometry({
            lon: [4.1, 4.3, 4.3, 4.1],
            lat: [-54.7, -54.7, -54.5, -54.5],
        });
        const issues = validateTripData(buildTripData({ items: [buildTrackItem({ geometries: [polygon] })] }));
        expect(issues.some(i => i.message.includes('closed'))).toBe(true);
    });

    it('reports a polygon ring with fewer than 4 positions', () => {
        const polygon = buildPolygonGeometry({ lon: [4.1, 4.3, 4.1], lat: [-54.7, -54.5, -54.7] });
        const issues = validateTripData(buildTripData({ items: [buildTrackItem({ geometries: [polygon] })] }));
        expect(issues.length).toBeGreaterThan(0);
    });

    it('reports an impossible calendar date that matches the pattern', () => {
        const issues = validateTripData(buildTripData({ items: [buildTrackItem({ day: '2030-02-30' })] }));
        expect(issues.some(i => i.message.includes('calendar'))).toBe(true);
    });

    it('reports inverted latitude bounds (south > north)', () => {
        const issues = validateTripData(buildTripData({ bounds: [4.1, -54.5, 4.3, -54.7] }));
        expect(issues.some(i => i.message.includes('south'))).toBe(true);
    });

    it('reports a divider item on the waypoints panel', () => {
        const bad = buildDividerItem({ panel: 'waypoints', groupLabel: 'Accommodation' });
        const issues = validateTripData(buildTripData({ items: [bad] }));
        expect(issues.some(i => i.message.includes('divider'))).toBe(true);
    });

    it('reports a divider item without a day', () => {
        const item = buildDividerItem();
        delete item.day;
        const issues = validateTripData(buildTripData({ items: [item] }));
        expect(issues.some(i => i.message.includes('divider'))).toBe(true);
    });

    it('collects ALL issues from a document with several unrelated problems', () => {
        const badLine = buildLineGeometry({ speed: [1], time: [300, 200, 100] });
        const a = buildTrackItem({ id: 'dup', order: 7, geometries: [badLine] });
        const b = buildTrackItem({ id: 'dup', order: 7, day: '2030-02-30' });
        const issues = validateTripData(buildTripData({ items: [a, b] }));
        // speed length + decreasing time + duplicate id + duplicate order + impossible date
        expect(issues.length).toBeGreaterThanOrEqual(5);
    });

    it('issue paths point at the offending item', () => {
        const line = buildLineGeometry({ speed: [1] });
        const issues = validateTripData(
            buildTripData({ items: [buildTrackItem(), buildDividerItem({ geometries: [line] })] }),
        );
        expect(issues.some(i => i.path.includes('items.1'))).toBe(true);
    });
});
