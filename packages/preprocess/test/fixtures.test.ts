import { describe, expect, it } from 'vitest';

import { buildRawFeature, buildRawLine, buildRawPoint } from '../src/fixtures.ts';

describe('pipeline fixtures', () => {
    it('builds a line with parallel arrays of equal length', () => {
        const line = buildRawLine();
        expect(line.lat).toHaveLength(line.lon.length);
        expect(line.time).toHaveLength(line.lon.length);
        expect(line.ele).toHaveLength(line.lon.length);
        expect(line.speed).toHaveLength(line.lon.length);
    });

    it('builds strictly increasing fixture timestamps', () => {
        const time = buildRawLine().time ?? [];
        for (let i = 1; i < time.length; i += 1) {
            expect(time[i]).toBeGreaterThan(time[i - 1] ?? Number.POSITIVE_INFINITY);
        }
    });

    it('keeps fixture attribute ranges non-overlapping (speeds 1-2, elevations 100-200)', () => {
        const line = buildRawLine();
        for (const s of line.speed ?? []) {
            expect(s).toBeGreaterThanOrEqual(1);
            expect(s).toBeLessThanOrEqual(2);
        }
        for (const e of line.ele ?? []) {
            expect(e).toBeGreaterThanOrEqual(100);
            expect(e).toBeLessThanOrEqual(200);
        }
    });

    it('applies overrides to features and geometries', () => {
        const feature = buildRawFeature({
            name: 'Custom',
            geometries: [buildRawPoint({ sym: 'https://example.test/marker.png' })],
        });
        expect(feature.name).toBe('Custom');
        expect(feature.geometries[0]).toMatchObject({ type: 'point', sym: 'https://example.test/marker.png' });
    });

    it('is deterministic (two builds are deeply equal)', () => {
        expect(buildRawFeature()).toEqual(buildRawFeature());
    });
});
