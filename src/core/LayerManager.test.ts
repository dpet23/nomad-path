import { describe, expect, it } from 'vitest';

import type { TrackFeature } from '../contract/types';
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

// ---------------------------------------------------------------------------
// buildSegmentFeatures -- sunAngle circular averaging
// ---------------------------------------------------------------------------

describe('buildSegmentFeatures -- sunAngle circular averaging', () => {
    it('averages sunAngles correctly when not crossing midnight', () => {
        const track = makeTrack(DAY, 'Daytime', THREE_COORDS, {
            sunAngles: [120, 180, 240],
        });
        const { featureCollection } = buildSegmentFeatures([track]);
        expect(featureCollection.features[0].properties!.sunValue).toBeCloseTo(150);
        expect(featureCollection.features[1].properties!.sunValue).toBeCloseTo(210);
    });

    it('averages sunAngles correctly across midnight boundary (350° + 10°)', () => {
        const track = makeTrack(DAY, 'Midnight crossing', THREE_COORDS, {
            sunAngles: [350, 10, 20],
        });
        const { featureCollection } = buildSegmentFeatures([track]);
        // Correct circular average of 350° and 10° should be ~0°/360° (midnight),
        // NOT 180° (noon) which is what simple (350+10)/2 gives
        const sunValue = featureCollection.features[0].properties!.sunValue as number;
        const distFromMidnight = Math.min(sunValue, 360 - sunValue);
        expect(distFromMidnight).toBeLessThan(5); // within 5° of midnight
    });
});

// ---------------------------------------------------------------------------
// buildSegmentFeatures -- antimeridian splitting
// ---------------------------------------------------------------------------

describe('buildSegmentFeatures -- antimeridian splitting', () => {
    it('does not split a segment whose |dLon| is exactly 180', () => {
        // |dLon| = 180 is the boundary: the condition is > 180 to split
        const track = makeTrack(DAY, 'No Split', [
            [0, 0],
            [180, 0],
        ]);
        const { featureCollection } = buildSegmentFeatures([track]);
        expect(featureCollection.features).toHaveLength(1);
    });

    it('splits an eastward antimeridian crossing into 2 sub-segments', () => {
        // [179.9, 0] → [-179.9, 5]: dLon = -359.8, crosses eastward
        const track = makeTrack(DAY, 'Eastward', [
            [179.9, 0],
            [-179.9, 5],
        ]);
        const { featureCollection } = buildSegmentFeatures([track]);
        expect(featureCollection.features).toHaveLength(2);
    });

    it('splits a westward antimeridian crossing into 2 sub-segments', () => {
        // [-179.9, 0] → [179.9, 5]: dLon = +359.8, crosses westward
        const track = makeTrack(DAY, 'Westward', [
            [-179.9, 0],
            [179.9, 5],
        ]);
        const { featureCollection } = buildSegmentFeatures([track]);
        expect(featureCollection.features).toHaveLength(2);
    });

    it('places the boundary of an eastward crossing at lon ±180', () => {
        // [179.9, 0] → [-179.9, 5]: boundary at exactly ±180°
        const track = makeTrack(DAY, 'Eastward', [
            [179.9, 0],
            [-179.9, 5],
        ]);
        const { featureCollection } = buildSegmentFeatures([track]);
        const [seg0, seg1] = featureCollection.features;
        const coords0 = (seg0.geometry as GeoJSON.LineString).coordinates;
        const coords1 = (seg1.geometry as GeoJSON.LineString).coordinates;
        // First sub-segment ends at 180°
        expect(coords0[1][0]).toBeCloseTo(180, 5);
        // Second sub-segment starts at -180°
        expect(coords1[0][0]).toBeCloseTo(-180, 5);
    });

    it('places the boundary of a westward crossing at lon ±180', () => {
        // [-179.9, 0] → [179.9, 5]
        const track = makeTrack(DAY, 'Westward', [
            [-179.9, 0],
            [179.9, 5],
        ]);
        const { featureCollection } = buildSegmentFeatures([track]);
        const [seg0, seg1] = featureCollection.features;
        const coords0 = (seg0.geometry as GeoJSON.LineString).coordinates;
        const coords1 = (seg1.geometry as GeoJSON.LineString).coordinates;
        // First sub-segment ends at -180°
        expect(coords0[1][0]).toBeCloseTo(-180, 5);
        // Second sub-segment starts at +180°
        expect(coords1[0][0]).toBeCloseTo(180, 5);
    });

    it('interpolates boundary latitude correctly for an eastward crossing', () => {
        // [179, 0] → [-179, 10]: midpoint crossing → t = 0.5 → boundary lat = 5
        // dLon = -358, lon2Unwrapped = 181, t = (180-179)/(181-179) = 0.5
        const track = makeTrack(DAY, 'Eastward Lat', [
            [179, 0],
            [-179, 10],
        ]);
        const { featureCollection } = buildSegmentFeatures([track]);
        const [seg0, seg1] = featureCollection.features;
        const boundaryLatA = (seg0.geometry as GeoJSON.LineString).coordinates[1][1];
        const boundaryLatB = (seg1.geometry as GeoJSON.LineString).coordinates[0][1];
        expect(boundaryLatA).toBeCloseTo(5, 5);
        expect(boundaryLatB).toBeCloseTo(5, 5);
    });

    it('both sub-segments of a crossing inherit the same attribute values', () => {
        const track = makeTrack(
            DAY,
            'Crossing Attrs',
            [
                [179.9, 0],
                [-179.9, 5],
            ],
            { speeds: [10, 20], elevations: [100, 200] },
        );
        const { featureCollection } = buildSegmentFeatures([track]);
        const [seg0, seg1] = featureCollection.features;
        // Both get the average of the two endpoint values
        expect(seg0.properties!.speedValue).toBeCloseTo(15);
        expect(seg1.properties!.speedValue).toBeCloseTo(15);
        expect(seg0.properties!.elevValue).toBeCloseTo(150);
        expect(seg1.properties!.elevValue).toBeCloseTo(150);
    });

    it('handles multiple crossings in one track correctly', () => {
        // [179, 0] → [-179, 5] → [179, 10]: two crossings → 4 sub-segments
        const track = makeTrack(DAY, 'Double Cross', [
            [179, 0],
            [-179, 5],
            [179, 10],
        ]);
        const { featureCollection } = buildSegmentFeatures([track]);
        expect(featureCollection.features).toHaveLength(4);
    });
});
