// @vitest-environment node
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

import { parseGPX, parseKML } from './parsers.js';
import { enrichTrack } from './enrichment.js';
import { groupTracks } from './grouping.js';
import { buildGeoJSON } from './output.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Run the full pipeline on one or more fixture files and return the result.
 *
 * @param {string[]} gpxPaths
 * @param {string[]} kmlPaths
 * @param {string[]} waypointPaths
 * @param {Record<string, { hidden?: boolean }>} [poiCategoryConfig]
 */
function runPipeline(gpxPaths = [], kmlPaths = [], waypointPaths = [], poiCategoryConfig = {}) {
    const allTracks = [];
    const allWaypoints = [];

    for (const p of gpxPaths) {
        const { tracks, waypoints } = parseGPX(p);
        allTracks.push(...tracks.map(enrichTrack));
        allWaypoints.push(...waypoints);
    }
    for (const p of kmlPaths) {
        const { tracks, waypoints } = parseKML(p);
        allTracks.push(...tracks.map(enrichTrack));
        allWaypoints.push(...waypoints);
    }
    for (const p of waypointPaths) {
        const { waypoints } = parseGPX(p);
        allWaypoints.push(...waypoints);
    }

    const grouped = groupTracks(allTracks);
    return buildGeoJSON({ tracks: grouped, waypoints: allWaypoints, tripName: 'Test Trip', poiCategoryConfig });
}

// ---------------------------------------------------------------------------
// FeatureCollection structure
// ---------------------------------------------------------------------------

describe('buildGeoJSON -- FeatureCollection structure', () => {
    const result = runPipeline([join(FIXTURES, 'sample-track.gpx')]);

    it('produces a valid GeoJSON FeatureCollection', () => {
        expect(result.type).toBe('FeatureCollection');
        expect(Array.isArray(result.features)).toBe(true);
    });

    it('embeds metadata with tripName and attributeRanges', () => {
        expect(result.metadata.tripName).toBe('Test Trip');
        expect(result.metadata).toHaveProperty('attributeRanges');
    });

    it('has no feature ids (deferred to Epic 3)', () => {
        for (const f of result.features) {
            expect(f.id).toBeUndefined();
        }
    });
});

// ---------------------------------------------------------------------------
// Track features
// ---------------------------------------------------------------------------

describe('buildGeoJSON -- track features', () => {
    const result = runPipeline([join(FIXTURES, 'sample-track.gpx')]);
    const track = result.features.find(f => f.properties.type === 'track');

    it('produces a LineString feature for the track', () => {
        expect(track).toBeDefined();
        expect(track.geometry.type).toBe('LineString');
    });

    it('sets required track properties', () => {
        expect(track.properties.name).toBe('Morning Drive');
        expect(track.properties.type).toBe('track');
        expect(track.properties.transportMode).toBe('drive');
        expect(track.properties.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // hidden is omitted from output when false (the visible default).
        expect(track.properties.hidden).toBeUndefined();
    });

    it('coordinates are [lon, lat] pairs', () => {
        const [lon, lat] = track.geometry.coordinates[0];
        expect(lon).toBeCloseTo(139.6917, 4);
        expect(lat).toBeCloseTo(35.6895, 4);
    });

    it('includes times parallel array', () => {
        expect(Array.isArray(track.properties.times)).toBe(true);
        expect(track.properties.times).toHaveLength(track.geometry.coordinates.length);
    });

    it('includes elevations parallel array', () => {
        expect(Array.isArray(track.properties.elevations)).toBe(true);
        expect(track.properties.elevations[0]).toBe(40);
    });

    it('includes speeds parallel array (with null where missing)', () => {
        expect(Array.isArray(track.properties.speeds)).toBe(true);
        // Point 0: osmand:speed present
        expect(track.properties.speeds[0]).toBeCloseTo(8.33 * 3.6, 1);
        // Point 2: no extension, Haversine fallback applied
        expect(track.properties.speeds[2]).toBeGreaterThan(0);
    });

    it('includes sunAngles parallel array', () => {
        expect(Array.isArray(track.properties.sunAngles)).toBe(true);
        // All points are timestamped daytime (Tokyo 17:00-17:10 JST)
        for (const angle of track.properties.sunAngles) {
            expect(angle).not.toBeNull();
            expect(angle).toBeGreaterThanOrEqual(90);
            expect(angle).toBeLessThanOrEqual(270);
        }
    });

    it('parallel arrays all have the same length as coordinates', () => {
        const n = track.geometry.coordinates.length;
        expect(track.properties.times).toHaveLength(n);
        expect(track.properties.elevations).toHaveLength(n);
        expect(track.properties.speeds).toHaveLength(n);
        expect(track.properties.sunAngles).toHaveLength(n);
    });
});

// ---------------------------------------------------------------------------
// KML flight -- omitted parallel arrays when all values absent
// ---------------------------------------------------------------------------

describe('buildGeoJSON -- KML flight (no timestamps)', () => {
    const result = runPipeline([], [join(FIXTURES, 'flight-SYD-NRT.kml')]);
    const track = result.features.find(f => f.properties.type === 'track');

    it('produces a flight track with day key starting with "flight-"', () => {
        expect(track.properties.day).toMatch(/^flight-/);
    });

    it('omits times array when no timestamps present', () => {
        expect(track.properties.times).toBeUndefined();
    });

    it('omits sunAngles array when all values would be null', () => {
        expect(track.properties.sunAngles).toBeUndefined();
    });

    it('omits speeds array when no speeds could be computed', () => {
        // No timestamps means no Haversine fallback either
        expect(track.properties.speeds).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// POI features
// ---------------------------------------------------------------------------

describe('buildGeoJSON -- POI features', () => {
    const result = runPipeline([], [], [join(FIXTURES, 'sample-waypoints.gpx')]);
    const pois = result.features.filter(f => f.properties.type === 'poi');

    it('produces Point features for waypoints', () => {
        expect(pois).toHaveLength(2);
        expect(pois[0].geometry.type).toBe('Point');
    });

    it('sets poi properties', () => {
        expect(pois[0].properties.name).toBe('Hotel Gracery Shinjuku');
        expect(pois[0].properties.category).toBe('accommodation');
    });

    it('hidden is omitted when no poi_categories config is provided', () => {
        expect(pois[0].properties.hidden).toBeUndefined();
    });

    it('hidden is true when category config has hidden: true', () => {
        const result = runPipeline([], [], [join(FIXTURES, 'sample-waypoints.gpx')], {
            accommodation: { hidden: true },
        });
        const poi = result.features.find(f => f.properties.type === 'poi' && f.properties.category === 'accommodation');
        expect(poi.properties.hidden).toBe(true);
    });

    it('hidden is omitted when category config has hidden: false (explicit)', () => {
        const result = runPipeline([], [], [join(FIXTURES, 'sample-waypoints.gpx')], {
            accommodation: { hidden: false },
        });
        const poi = result.features.find(f => f.properties.type === 'poi' && f.properties.category === 'accommodation');
        expect(poi.properties.hidden).toBeUndefined();
    });

    it('hidden is omitted for categories not in poi_categories config', () => {
        const result = runPipeline([], [], [join(FIXTURES, 'sample-waypoints.gpx')], {
            other: { hidden: true },
        });
        const poi = result.features.find(f => f.properties.type === 'poi' && f.properties.category === 'accommodation');
        expect(poi.properties.hidden).toBeUndefined();
    });

    it('hidden is omitted when category config entry is empty (no hidden key)', () => {
        const result = runPipeline([], [], [join(FIXTURES, 'sample-waypoints.gpx')], {
            accommodation: {},
        });
        const poi = result.features.find(f => f.properties.type === 'poi' && f.properties.category === 'accommodation');
        expect(poi.properties.hidden).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Attribute ranges
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// group and hidden passthrough
// ---------------------------------------------------------------------------

describe('buildGeoJSON -- group and hidden', () => {
    it('passes group and hidden from augmented track to feature properties', () => {
        const { tracks } = parseGPX(join(FIXTURES, 'sample-track.gpx'));
        const augmented = tracks.map(t => enrichTrack(t)).map(t => ({
            ...t,
            group: 'my-group',
            hidden: true,
        }));
        const grouped = groupTracks(augmented);
        const result = buildGeoJSON({ tracks: grouped, waypoints: [], tripName: 'Test' });
        const track = result.features.find(f => f.properties.type === 'track');
        expect(track.properties.group).toBe('my-group');
        expect(track.properties.hidden).toBe(true);
    });

    it('defaults group to null and omits hidden when not set', () => {
        const result = runPipeline([join(FIXTURES, 'sample-track.gpx')]);
        const track = result.features.find(f => f.properties.type === 'track');
        expect(track.properties.group).toBeNull();
        expect(track.properties.hidden).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

describe('buildGeoJSON -- stats', () => {
    const result = runPipeline([join(FIXTURES, 'sample-track.gpx')]);
    const { stats } = result.metadata;

    it('embeds stats in metadata', () => {
        expect(stats).toBeDefined();
    });

    it('counts tracks and waypoints', () => {
        expect(stats.trackCount).toBe(1);
        expect(stats.waypointCount).toBe(0);
    });

    it('counts unique ground days', () => {
        expect(stats.dayCount).toBe(1);
    });

    it('counts transport modes', () => {
        expect(stats.transportModes).toHaveProperty('drive');
        expect(stats.transportModes.drive).toBe(1);
    });

    it('counts POI categories from waypoints', () => {
        // Concrete counts pin both the bucketing logic AND that the parser's
        // `category` field flows through to `stats.poiCategories`.
        const r = runPipeline([], [], [join(FIXTURES, 'sample-waypoints.gpx')]);
        const cats = r.metadata.stats.poiCategories;
        expect(cats).toEqual({ accommodation: 1, landmark: 1 });
    });

    it('poiCategories is an empty object when waypointCount is zero', () => {
        expect(stats.waypointCount).toBe(0);
        expect(stats.poiCategories).toEqual({});
    });

    it('includes dateRange for ground tracks', () => {
        expect(stats.dateRange).toBeDefined();
        expect(stats.dateRange.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(stats.dateRange.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('excludes flight day keys from dayCount and dateRange', () => {
        const result2 = runPipeline([], [join(FIXTURES, 'flight-SYD-NRT.kml')]);
        expect(result2.metadata.stats.dayCount).toBe(0);
        expect(result2.metadata.stats.dateRange).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Attribute ranges
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Track ordering
// ---------------------------------------------------------------------------

describe('buildGeoJSON -- track ordering', () => {
    /** Build a minimal GroupedTrack with the given day key and name. */
    function makeTrack(day, name) {
        return {
            name,
            sourceFile: 'test.gpx',
            transportMode: 'drive',
            day,
            group: null,
            points: [
                { lon: 0, lat: 0, elevation: 10, speedKmh: 30, time: null, sunAngle: null },
                { lon: 1, lat: 1, elevation: 10, speedKmh: 30, time: null, sunAngle: null },
            ],
        };
    }

    it('emits track features in chronological order regardless of input order', () => {
        const tracks = [
            makeTrack('2024-09-13', 'C'),
            makeTrack('2024-09-11', 'A'),
            makeTrack('2024-09-12', 'B'),
        ];
        const result = buildGeoJSON({ tracks, waypoints: [], tripName: 'Test' });
        const names = result.features
            .filter(f => f.properties.type === 'track')
            .map(f => f.properties.name);
        expect(names).toEqual(['A', 'B', 'C']);
    });

    it('sorts flight-day keys by embedded date', () => {
        const tracks = [
            makeTrack('flight-2024-03-16-nrt-lax', 'Late Flight'),
            makeTrack('flight-2024-03-14-syd-nrt', 'Early Flight'),
        ];
        const result = buildGeoJSON({ tracks, waypoints: [], tripName: 'Test' });
        const names = result.features
            .filter(f => f.properties.type === 'track')
            .map(f => f.properties.name);
        expect(names).toEqual(['Early Flight', 'Late Flight']);
    });
});

// ---------------------------------------------------------------------------
// Empty input
// ---------------------------------------------------------------------------

describe('buildGeoJSON -- empty input', () => {
    const result = buildGeoJSON({ tracks: [], waypoints: [], tripName: 'Empty Trip' });

    it('produces a valid FeatureCollection with no features', () => {
        expect(result.type).toBe('FeatureCollection');
        expect(result.features).toHaveLength(0);
    });

    it('stats have zero counts and no dateRange', () => {
        const { stats } = result.metadata;
        expect(stats.trackCount).toBe(0);
        expect(stats.waypointCount).toBe(0);
        expect(stats.dayCount).toBe(0);
        expect(stats.dateRange).toBeUndefined();
    });

    it('attributeRanges is empty', () => {
        expect(result.metadata.attributeRanges).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// poiCategoryConfig edge cases
// ---------------------------------------------------------------------------

describe('buildGeoJSON -- poiCategoryConfig edge cases', () => {
    it('treats a null config entry as visible (hidden absent on output)', () => {
        const result = runPipeline([], [], [join(FIXTURES, 'sample-waypoints.gpx')], {
            accommodation: null,
        });
        const poi = result.features.find(
            f => f.properties.type === 'poi' && f.properties.category === 'accommodation',
        );
        expect(poi.properties.hidden).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// excludeFromAutoBounds propagation
// ---------------------------------------------------------------------------

describe('buildGeoJSON -- excludeFromAutoBounds', () => {
    function makeGroupedTrack(day, name, excludeFromAutoBounds) {
        return {
            name,
            sourceFile: 'test.gpx',
            transportMode: 'flight',
            day,
            group: 'flights-2025',
            hidden: true,
            excludeFromAutoBounds,
            points: [
                { lon: 0, lat: 0, elevation: 5000, speedKmh: 800, time: null, sunAngle: null },
                { lon: 10, lat: 5, elevation: 5000, speedKmh: 800, time: null, sunAngle: null },
            ],
        };
    }

    it('propagates excludeFromAutoBounds: true to feature properties', () => {
        const result = buildGeoJSON({
            tracks: [makeGroupedTrack('flight-2024-01-01-qf1', 'QF1', true)],
            waypoints: [],
            tripName: 'Test',
        });
        const track = result.features.find(f => f.properties.type === 'track');
        expect(track.properties.excludeFromAutoBounds).toBe(true);
    });

    it('omits excludeFromAutoBounds from feature properties when false', () => {
        const result = buildGeoJSON({
            tracks: [makeGroupedTrack('flight-2024-01-01-qf2', 'QF2', false)],
            waypoints: [],
            tripName: 'Test',
        });
        const track = result.features.find(f => f.properties.type === 'track');
        expect(track.properties.excludeFromAutoBounds).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Attribute ranges
// ---------------------------------------------------------------------------

describe('buildGeoJSON -- attribute ranges', () => {
    const result = runPipeline([join(FIXTURES, 'sample-track.gpx')]);
    const { attributeRanges } = result.metadata;

    it('computes elevation range across all track points', () => {
        expect(attributeRanges.elevation).toBeDefined();
        expect(attributeRanges.elevation.min).toBe(40);
        expect(attributeRanges.elevation.max).toBe(45);
        expect(attributeRanges.elevation.unit).toBe('m');
    });

    it('computes speed range across all track points', () => {
        expect(attributeRanges.speed).toBeDefined();
        expect(attributeRanges.speed.min).toBeGreaterThan(0);
        expect(attributeRanges.speed.unit).toBe('km/h');
    });

    it('omits elevation range when no track has elevation data', () => {
        // sample-no-elevation.gpx has no <ele> elements
        const noElevResult = runPipeline([join(FIXTURES, 'sample-no-elevation.gpx')]);
        expect(noElevResult.metadata.attributeRanges.elevation).toBeUndefined();
    });
});
