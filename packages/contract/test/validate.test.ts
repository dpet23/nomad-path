import {
    buildLineGeometry,
    buildPolygonGeometry,
    buildTrackItem,
    buildTripData,
    validateTripData,
} from '@nomadpath/contract';
import { describe, expect, it } from 'vitest';

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

    it('accepts out-of-order timestamps (time is not an ordering key)', () => {
        const line = buildLineGeometry({ time: [300, 100, 200] });
        expect(validateTripData(buildTripData({ items: [buildTrackItem({ geometries: [line] })] }))).toEqual([]);
    });
});

describe('validateTripData: structural failures', () => {
    it('reports structural issues for a non-object without throwing', () => {
        const issues = validateTripData('garbage');
        expect(issues.length).toBeGreaterThan(0);
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

    it('collects ALL issues from a document with several unrelated problems', () => {
        const badLineA = buildLineGeometry({ speed: [1], time: [300, 200, 100] });
        const badLineB = buildLineGeometry({ lat: [-54.5, -54.6] });
        const a = buildTrackItem({ name: 'First bad track', geometries: [badLineA] });
        const b = buildTrackItem({ name: 'Second bad track', geometries: [badLineB] });
        const issues = validateTripData(buildTripData({ items: [a, b] }));
        // speed length + lon/lat length mismatch
        expect(issues.length).toBeGreaterThanOrEqual(2);
    });

    it('issue paths point at the offending item', () => {
        const line = buildLineGeometry({ speed: [1] });
        const issues = validateTripData(
            buildTripData({
                items: [buildTrackItem(), buildTrackItem({ name: 'Flight leg', geometries: [line] })],
            }),
        );
        expect(issues.some(i => i.path.includes('items.1'))).toBe(true);
    });
});
