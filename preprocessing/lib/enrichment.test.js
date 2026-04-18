// @vitest-environment node
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

import { parseGPX, parseKML } from './parsers.js';
import { computeSunAngle, enrichTrack } from './enrichment.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');

// ---------------------------------------------------------------------------
// computeSunAngle
// ---------------------------------------------------------------------------

describe('computeSunAngle', () => {
    // Tokyo (35.6895N, 139.6917E), 2024-03-15
    // Sunrise ~05:51 JST (20:51 UTC prev day), sunset ~18:01 JST (09:01 UTC)
    const LAT = 35.6895;
    const LON = 139.6917;

    it('returns a value in daytime range (90-270) for midday UTC+9', () => {
        // 03:00 UTC = 12:00 JST -- well into daytime
        const angle = computeSunAngle(LAT, LON, new Date('2024-03-15T03:00:00Z'));
        expect(angle).toBeGreaterThanOrEqual(90);
        expect(angle).toBeLessThanOrEqual(270);
    });

    it('returns a value in pre-dawn range (0-90) for early morning UTC+9', () => {
        // 19:30 UTC prev day = 04:30 JST -- before sunrise
        const angle = computeSunAngle(LAT, LON, new Date('2024-03-14T19:30:00Z'));
        expect(angle).toBeGreaterThanOrEqual(0);
        expect(angle).toBeLessThan(90);
    });

    it('returns a value in post-dusk range (270-360) for evening UTC+9', () => {
        // 12:00 UTC = 21:00 JST -- after sunset
        const angle = computeSunAngle(LAT, LON, new Date('2024-03-15T12:00:00Z'));
        expect(angle).toBeGreaterThan(270);
        expect(angle).toBeLessThanOrEqual(360);
    });

    it('returns an integer (rounded to nearest degree)', () => {
        const angle = computeSunAngle(LAT, LON, new Date('2024-03-15T03:00:00Z'));
        expect(Number.isInteger(angle)).toBe(true);
    });

    it('pre-dawn angle is less than post-dusk angle (distinguishable)', () => {
        const preDawn = computeSunAngle(LAT, LON, new Date('2024-03-14T19:30:00Z'));
        const postDusk = computeSunAngle(LAT, LON, new Date('2024-03-15T12:00:00Z'));
        expect(preDawn).toBeLessThan(postDusk);
    });
});

// ---------------------------------------------------------------------------
// enrichTrack -- speed
// ---------------------------------------------------------------------------

describe('enrichTrack -- speed', () => {
    const { tracks } = parseGPX(join(FIXTURES, 'sample-track.gpx'));
    const enriched = enrichTrack(tracks[0]);

    it('preserves GPX extension speed on point 0 (<osmand:speed>)', () => {
        // 8.33 m/s * 3.6 ~= 29.988 km/h -- carried straight through
        expect(enriched.points[0].speedKmh).toBeCloseTo(8.33 * 3.6, 2);
    });

    it('preserves GPX extension speed on point 1 (<speed_2d>)', () => {
        expect(enriched.points[1].speedKmh).toBeCloseTo(45, 2);
    });

    it('computes Haversine fallback speed for point 2 (no extension)', () => {
        expect(enriched.points[2].speedKmh).toBeDefined();
        expect(enriched.points[2].speedKmh).toBeGreaterThan(0);
    });

    it('does not assign speed to the first point when no extension present', () => {
        const { tracks: noElevTracks } = parseGPX(join(FIXTURES, 'sample-no-elevation.gpx'));
        const noElevEnriched = enrichTrack(noElevTracks[0]);
        // First point: no extension, no previous point -> no speed
        expect(noElevEnriched.points[0].speedKmh).toBeUndefined();
        // Second point: Haversine fallback applied
        expect(noElevEnriched.points[1].speedKmh).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// enrichTrack -- sun angle
// ---------------------------------------------------------------------------

describe('enrichTrack -- sun angle', () => {
    const { tracks } = parseGPX(join(FIXTURES, 'sample-track.gpx'));
    const enriched = enrichTrack(tracks[0]);

    it('adds sunAngle to every point', () => {
        for (const point of enriched.points) {
            expect(point).toHaveProperty('sunAngle');
        }
    });

    it('sunAngle is an integer in daytime range for timestamped daytime points', () => {
        // sample-track.gpx: Tokyo, 2024-03-15T08:00-08:10Z = 17:00-17:10 JST (daytime)
        for (const point of enriched.points) {
            expect(Number.isInteger(point.sunAngle)).toBe(true);
            expect(point.sunAngle).toBeGreaterThanOrEqual(90);
            expect(point.sunAngle).toBeLessThanOrEqual(270);
        }
    });

    it('sunAngle is null for points without a timestamp', () => {
        const trackNoTime = {
            name: 'test',
            sourceFile: 'test.gpx',
            transportMode: 'drive',
            points: [
                { lon: 139.69, lat: 35.69 },
                { lon: 139.70, lat: 35.70 },
            ],
        };
        const result = enrichTrack(trackNoTime);
        for (const point of result.points) {
            expect(point.sunAngle).toBeNull();
        }
    });

    it('KML flight track (no timestamps) gets null sunAngle for all points', () => {
        const { tracks: kmlTracks } = parseKML(join(FIXTURES, 'flight-SYD-NRT.kml'));
        const kmlEnriched = enrichTrack(kmlTracks[0]);
        for (const point of kmlEnriched.points) {
            expect(point.sunAngle).toBeNull();
        }
    });

    it('returns null sunAngle for polar location during polar day (Svalbard, June 21)', () => {
        // Svalbard: 78°N, 15°E — sun never sets in June, suncalc returns undefined sunrise/sunset
        const track = {
            name: 'Polar Walk',
            sourceFile: 'polar.gpx',
            transportMode: 'walk',
            points: [
                { lon: 15.0, lat: 78.0, time: Date.parse('2024-06-21T12:00:00Z') },
                { lon: 15.1, lat: 78.0, time: Date.parse('2024-06-21T12:30:00Z') },
            ],
        };
        const enriched = enrichTrack(track);
        for (const pt of enriched.points) {
            expect(pt.sunAngle).toBeNull();
        }
    });
});

// ---------------------------------------------------------------------------
// enrichTrack -- speed edge cases
// ---------------------------------------------------------------------------

describe('enrichTrack -- speed edge cases', () => {
    it('returns no Haversine speed when consecutive points share the same timestamp', () => {
        const track = {
            name: 'test',
            sourceFile: 'test.gpx',
            transportMode: 'drive',
            points: [
                { lon: 139.69, lat: 35.69, time: Date.parse('2024-03-15T08:00:00Z') },
                { lon: 139.70, lat: 35.70, time: Date.parse('2024-03-15T08:00:00Z') }, // same time
                { lon: 139.71, lat: 35.71, time: Date.parse('2024-03-15T08:05:00Z') },
            ],
        };
        const enriched = enrichTrack(track);
        // dtSec = 0 → computeSpeedKmh returns null → no speedKmh assigned
        expect(enriched.points[1].speedKmh).toBeUndefined();
        // Point 2 has 5 minutes elapsed → speed computed via Haversine
        expect(enriched.points[2].speedKmh).toBeDefined();
        expect(enriched.points[2].speedKmh).toBeGreaterThan(0);
    });

    it('returns no Haversine speed when timestamp goes backward', () => {
        const track = {
            name: 'test',
            sourceFile: 'test.gpx',
            transportMode: 'drive',
            points: [
                { lon: 139.70, lat: 35.70, time: Date.parse('2024-03-15T08:05:00Z') },
                { lon: 139.69, lat: 35.69, time: Date.parse('2024-03-15T08:00:00Z') }, // earlier
            ],
        };
        const enriched = enrichTrack(track);
        // dtSec < 0 → computeSpeedKmh returns null → no speedKmh assigned
        expect(enriched.points[1].speedKmh).toBeUndefined();
    });

    it('preserves an extension speed of exactly 0 km/h', () => {
        const track = {
            name: 'test',
            sourceFile: 'test.gpx',
            transportMode: 'drive',
            points: [
                { lon: 139.69, lat: 35.69, speedKmh: 0 },
                { lon: 139.70, lat: 35.70, speedKmh: 0 },
            ],
        };
        const enriched = enrichTrack(track);
        expect(enriched.points[0].speedKmh).toBe(0);
        expect(enriched.points[1].speedKmh).toBe(0);
    });
});
