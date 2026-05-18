import { describe, expect, it } from 'vitest';

import type { TrackFeature, TripData } from '../contract/types';
import { computeVisibleRanges } from './AttributeRanges';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DAY_1 = '2024-01-01';
const DAY_2 = '2024-01-02';
const ID_A = `${DAY_1}::A`;
const ID_B = `${DAY_2}::B`;

const makeTrack = (day: string, name: string, overrides: Partial<TrackFeature['properties']> = {}): TrackFeature => ({
    type: 'Feature',
    geometry: {
        type: 'LineString',
        coordinates: [
            [0, 0],
            [1, 1],
        ],
    },
    properties: {
        type: 'track',
        name,
        day,
        defaultVisible: true,
        transportMode: 'drive',
        ...overrides,
    },
});

const makeTrip = (tracks: TrackFeature[]): TripData => ({
    type: 'FeatureCollection',
    metadata: { tripName: 'Test', attributeRanges: {} },
    features: tracks,
});

// ---------------------------------------------------------------------------
// computeVisibleRanges
// ---------------------------------------------------------------------------

describe('computeVisibleRanges', () => {
    it('returns empty ranges when no tracks are visible', () => {
        const trip = makeTrip([makeTrack(DAY_1, 'A', { elevations: [10, 20] })]);
        const result = computeVisibleRanges([trip], new Set());
        expect(result).toEqual({});
    });

    it('computes elevation range from visible tracks', () => {
        const trip = makeTrip([
            makeTrack(DAY_1, 'A', { elevations: [10, 50, 30] }),
            makeTrack(DAY_2, 'B', { elevations: [5, 100] }),
        ]);
        const visible = new Set([ID_A, ID_B]);
        const result = computeVisibleRanges([trip], visible);
        expect(result.elevation).toEqual({ min: 5, max: 100, unit: 'm' });
    });

    it('computes speed range from visible tracks', () => {
        const trip = makeTrip([makeTrack(DAY_1, 'A', { speeds: [0, 60, null, 120] })]);
        const visible = new Set([ID_A]);
        const result = computeVisibleRanges([trip], visible);
        expect(result.speed).toEqual({ min: 0, max: 120, unit: 'km/h' });
    });

    it('excludes hidden tracks from range computation', () => {
        const trip = makeTrip([
            makeTrack(DAY_1, 'A', { elevations: [10, 20] }),
            makeTrack(DAY_2, 'B', { elevations: [500, 1000] }),
        ]);
        // Only A visible — B's 500–1000 range excluded
        const visible = new Set([ID_A]);
        const result = computeVisibleRanges([trip], visible);
        expect(result.elevation).toEqual({ min: 10, max: 20, unit: 'm' });
    });

    it('omits elevation key when no visible tracks have elevation data', () => {
        const trip = makeTrip([makeTrack(DAY_1, 'A', { speeds: [10, 20] })]);
        const visible = new Set([ID_A]);
        const result = computeVisibleRanges([trip], visible);
        expect(result.elevation).toBeUndefined();
    });

    it('omits speed key when no visible tracks have speed data', () => {
        const trip = makeTrip([makeTrack(DAY_1, 'A', { elevations: [10, 20] })]);
        const visible = new Set([ID_A]);
        const result = computeVisibleRanges([trip], visible);
        expect(result.speed).toBeUndefined();
    });

    it('handles all-null speed arrays gracefully', () => {
        const trip = makeTrip([makeTrack(DAY_1, 'A', { speeds: [null, null] })]);
        const visible = new Set([ID_A]);
        const result = computeVisibleRanges([trip], visible);
        expect(result.speed).toBeUndefined();
    });

    it('works across multiple trips', () => {
        const trip1 = makeTrip([makeTrack(DAY_1, 'A', { elevations: [10, 50] })]);
        const trip2 = makeTrip([makeTrack(DAY_2, 'B', { elevations: [5, 200] })]);
        const visible = new Set([ID_A, ID_B]);
        const result = computeVisibleRanges([trip1, trip2], visible);
        expect(result.elevation).toEqual({ min: 5, max: 200, unit: 'm' });
    });

    it('ignores stale IDs in visibleIds that do not match any loaded track', () => {
        const trip = makeTrip([makeTrack(DAY_1, 'A', { elevations: [10, 20] })]);
        // Include a valid ID and two stale/nonexistent ones
        const visible = new Set([ID_A, 'stale::Ghost Track', '2099-01-01::Nonexistent']);
        const result = computeVisibleRanges([trip], visible);
        // Only track A contributes; stale IDs do not crash or distort results
        expect(result.elevation).toEqual({ min: 10, max: 20, unit: 'm' });
    });
});
