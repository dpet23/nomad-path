import { describe, expect, it } from 'vitest';

import type { TrackFeature } from '../data/types';
import { buildSegmentFeatures } from './LayerManager';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeTrack = (
    day: string,
    name: string,
    coords: [number, number][],
    overrides: Partial<TrackFeature['properties']> = {},
): TrackFeature => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: {
        type: 'track',
        name,
        day,
        defaultVisible: true,
        transportMode: 'drive',
        elevations: coords.map((_, i) => 100 + i * 10),
        speeds: coords.map((_, i) => 30 + i * 5),
        sunAngles: coords.map((_, i) => 90 + i * 20),
        ...overrides,
    },
});

const DAY = '2024-03-15';
const DAY_2 = '2024-03-16';
const DAY_3 = '2024-03-17';

const THREE_COORDS: [number, number][] = [
    [139.69, 35.68],
    [139.7, 35.69],
    [139.71, 35.7],
];

// ---------------------------------------------------------------------------
// buildSegmentFeatures
// ---------------------------------------------------------------------------

describe('buildSegmentFeatures', () => {
    it('produces N-1 segments for N coordinates', () => {
        const track = makeTrack(DAY, 'Drive', THREE_COORDS);
        const { featureCollection } = buildSegmentFeatures([track]);
        expect(featureCollection.features).toHaveLength(2);
    });

    it('each segment is a 2-point LineString', () => {
        const track = makeTrack(DAY, 'Drive', THREE_COORDS);
        const { featureCollection } = buildSegmentFeatures([track]);
        for (const f of featureCollection.features) {
            expect(f.geometry.type).toBe('LineString');
            expect((f.geometry as GeoJSON.LineString).coordinates).toHaveLength(2);
        }
    });

    it('consecutive segments share their boundary coordinate', () => {
        const track = makeTrack(DAY, 'Drive', THREE_COORDS);
        const { featureCollection } = buildSegmentFeatures([track]);
        const [s0, s1] = featureCollection.features;
        const end0 = (s0.geometry as GeoJSON.LineString).coordinates[1];
        const start1 = (s1.geometry as GeoJSON.LineString).coordinates[0];
        expect(end0).toEqual(start1);
    });

    it('averages attribute values across the two endpoint points', () => {
        const track = makeTrack(DAY, 'Drive', THREE_COORDS, {
            speeds: [10, 30, 50],
        });
        const { featureCollection } = buildSegmentFeatures([track]);
        const seg0Props = featureCollection.features[0].properties!;
        expect(seg0Props.speedValue).toBeCloseTo(20); // (10 + 30) / 2
        const seg1Props = featureCollection.features[1].properties!;
        expect(seg1Props.speedValue).toBeCloseTo(40); // (30 + 50) / 2
    });

    it('uses null for segment value when either endpoint is null', () => {
        const track = makeTrack(DAY, 'Drive', THREE_COORDS, {
            speeds: [null, 30, null],
        });
        const { featureCollection } = buildSegmentFeatures([track]);
        expect(featureCollection.features[0].properties!.speedValue).toBeNull();
        expect(featureCollection.features[1].properties!.speedValue).toBeNull();
    });

    it('assigns day indices by sorted day key order', () => {
        const trackA = makeTrack(DAY_2, 'Day 2', THREE_COORDS);
        const trackB = makeTrack(DAY, 'Day 1', THREE_COORDS);
        const { featureCollection } = buildSegmentFeatures([trackA, trackB]);
        const byDay = new Map<string, number>();
        for (const f of featureCollection.features) {
            byDay.set(f.properties!.day, f.properties!.dayIndex);
        }
        // DAY sorts first → dayIndex 0
        expect(byDay.get(DAY)).toBe(0);
        expect(byDay.get(DAY_2)).toBe(1);
    });

    it('returns maxDayIndex 0 for a single day', () => {
        const track = makeTrack(DAY, 'Drive', THREE_COORDS);
        expect(buildSegmentFeatures([track]).maxDayIndex).toBe(0);
    });

    it('returns correct maxDayIndex for multiple days', () => {
        const tracks = [
            makeTrack(DAY, 'A', THREE_COORDS),
            makeTrack(DAY_2, 'B', THREE_COORDS),
            makeTrack(DAY_3, 'C', THREE_COORDS),
        ];
        expect(buildSegmentFeatures(tracks).maxDayIndex).toBe(2);
    });

    it('embeds trackId, day, and transportMode on every segment', () => {
        const track = makeTrack(DAY, 'Morning Drive', THREE_COORDS, {
            transportMode: 'walk',
        });
        const { featureCollection } = buildSegmentFeatures([track]);
        for (const f of featureCollection.features) {
            expect(f.properties!.trackId).toBe(`${DAY}::Morning Drive`);
            expect(f.properties!.day).toBe(DAY);
            expect(f.properties!.transportMode).toBe('walk');
        }
    });

    it('handles tracks with no attribute arrays (null values)', () => {
        const track: TrackFeature = {
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
                name: 'No attrs',
                day: DAY,
                defaultVisible: true,
                transportMode: 'drive',
            },
        };
        const { featureCollection } = buildSegmentFeatures([track]);
        const props = featureCollection.features[0].properties!;
        expect(props.speedValue).toBeNull();
        expect(props.elevValue).toBeNull();
        expect(props.sunValue).toBeNull();
    });
});
