// @vitest-environment node
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

import { detectTransportMode, parseFile, parseGPX, parseKML } from './parsers.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');

// ---------------------------------------------------------------------------
// detectTransportMode (filename fallback)
// ---------------------------------------------------------------------------

describe('detectTransportMode', () => {
    it('detects flight from filename', () => {
        expect(detectTransportMode('flight-SYD-NRT.kml')).toBe('flight');
        expect(detectTransportMode('fly-london.gpx')).toBe('flight');
    });

    it('detects flight from FlightAware-prefixed filename', () => {
        expect(detectTransportMode('FlightAware_QFA468_YMML_YSSY_20250912.kml')).toBe('flight');
        expect(detectTransportMode('1. FlightAware_HAL158_PHNL_PHKO_20250919.kml')).toBe('flight');
    });

    it('detects walk from filename', () => {
        expect(detectTransportMode('morning-walk.gpx')).toBe('walk');
        expect(detectTransportMode('fuji-hike.gpx')).toBe('walk');
    });

    it('detects boat from filename', () => {
        expect(detectTransportMode('ferry-crossing.gpx')).toBe('boat');
    });

    it('defaults to drive', () => {
        expect(detectTransportMode('day1-morning.gpx')).toBe('drive');
    });
});

// ---------------------------------------------------------------------------
// parseGPX — track with OsmAnd metadata, timestamps, and elevation
// ---------------------------------------------------------------------------

describe('parseGPX — track with metadata', () => {
    const { tracks, waypoints } = parseGPX(join(FIXTURES, 'sample-track.gpx'));

    it('returns one track', () => {
        expect(tracks).toHaveLength(1);
    });

    it('reads track name from <trk><name>', () => {
        expect(tracks[0].name).toBe('Morning Drive');
    });

    it('reads transport mode from <osmand:activity> metadata', () => {
        // metadata says "driving", not inferred from filename
        expect(tracks[0].transportMode).toBe('drive');
    });

    it('returns three points', () => {
        expect(tracks[0].points).toHaveLength(3);
    });

    it('reads lon/lat correctly', () => {
        expect(tracks[0].points[0].lon).toBeCloseTo(139.6917, 4);
        expect(tracks[0].points[0].lat).toBeCloseTo(35.6895, 4);
    });

    it('reads elevation in metres', () => {
        expect(tracks[0].points[0].elevation).toBe(40);
        expect(tracks[0].points[1].elevation).toBe(42);
    });

    it('reads timestamps as Unix milliseconds', () => {
        expect(tracks[0].points[0].time).toBe(Date.parse('2024-03-15T08:00:00Z'));
        expect(tracks[0].points[1].time).toBe(Date.parse('2024-03-15T08:05:00Z'));
    });

    it('reads speed from <osmand:speed> extension (m/s → km/h)', () => {
        // 8.33 m/s × 3.6 ≈ 29.988 km/h
        expect(tracks[0].points[0].speedKmh).toBeCloseTo(8.33 * 3.6, 2);
    });

    it('reads speed from <speed_2d><value> extension (m/s → km/h)', () => {
        // 12.5 m/s × 3.6 = 45 km/h
        expect(tracks[0].points[1].speedKmh).toBeCloseTo(45, 2);
    });

    it('omits speedKmh when no speed extension is present', () => {
        expect(tracks[0].points[2].speedKmh).toBeUndefined();
    });

    it('returns no waypoints', () => {
        expect(waypoints).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// parseGPX — activity inside <trk><extensions>
// ---------------------------------------------------------------------------

describe('parseGPX — activity in <trk><extensions>', () => {
    const { tracks } = parseGPX(join(FIXTURES, 'sample-trk-activity.gpx'));

    it('reads transport mode from <osmand:activity> inside <trk><extensions>', () => {
        expect(tracks[0].transportMode).toBe('walk');
    });

    it('reads track name', () => {
        expect(tracks[0].name).toBe('Morning Walk');
    });
});

// ---------------------------------------------------------------------------
// parseGPX — track without elevation (activity = walking)
// ---------------------------------------------------------------------------

describe('parseGPX — no elevation, walking activity', () => {
    const { tracks } = parseGPX(join(FIXTURES, 'sample-no-elevation.gpx'));

    it('reads transport mode from metadata (walking → walk)', () => {
        expect(tracks[0].transportMode).toBe('walk');
    });

    it('omits elevation when the <ele> element is absent', () => {
        expect(tracks[0].points[0].elevation).toBeUndefined();
    });

    it('still reads timestamps', () => {
        expect(tracks[0].points[0].time).toBe(Date.parse('2024-03-15T10:00:00Z'));
    });
});

// ---------------------------------------------------------------------------
// parseGPX — waypoints-only file
// ---------------------------------------------------------------------------

describe('parseGPX — waypoints only', () => {
    const { tracks, waypoints } = parseGPX(join(FIXTURES, 'sample-waypoints.gpx'));

    it('returns no tracks', () => {
        expect(tracks).toHaveLength(0);
    });

    it('returns two waypoints', () => {
        expect(waypoints).toHaveLength(2);
    });

    it('reads waypoint name and coordinates', () => {
        expect(waypoints[0].name).toBe('Hotel Gracery Shinjuku');
        expect(waypoints[0].lon).toBeCloseTo(139.7006, 4);
        expect(waypoints[0].lat).toBeCloseTo(35.6938, 4);
    });

    it('reads category from GPX <type> element', () => {
        expect(waypoints[0].category).toBe('accommodation');
        expect(waypoints[1].category).toBe('landmark');
    });
});

// ---------------------------------------------------------------------------
// parseKML — flight track (transport mode from filename)
// ---------------------------------------------------------------------------

describe('parseKML — flight track', () => {
    const { tracks, waypoints } = parseKML(join(FIXTURES, 'flight-SYD-NRT.kml'));

    it('returns one track', () => {
        expect(tracks).toHaveLength(1);
    });

    it('reads track name', () => {
        expect(tracks[0].name).toBe('Flight SYD-NRT');
    });

    it('reads three coordinate points (KML order: lon,lat,alt)', () => {
        expect(tracks[0].points).toHaveLength(3);
        expect(tracks[0].points[0].lon).toBeCloseTo(151.1772, 4);
        expect(tracks[0].points[0].lat).toBeCloseTo(-33.9461, 4);
    });

    it('detects flight from filename (KML has no activity metadata)', () => {
        expect(tracks[0].transportMode).toBe('flight');
    });

    it('has no timestamps for plain KML LineString', () => {
        expect(tracks[0].points[0].time).toBeUndefined();
    });

    it('returns no waypoints', () => {
        expect(waypoints).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// parseKML — FlightAware gx:Track (document-name detection)
// ---------------------------------------------------------------------------

describe('parseKML — FlightAware gx:Track with filename containing "FlightAware"', () => {
    const { tracks } = parseKML(join(FIXTURES, 'FlightAware_QFA468_YMML_YSSY_20250912.kml'));

    it('returns one track', () => {
        expect(tracks).toHaveLength(1);
    });

    it('detects flight transport mode from filename', () => {
        expect(tracks[0].transportMode).toBe('flight');
    });

    it('reads track name from Placemark', () => {
        expect(tracks[0].name).toBe('QF 468');
    });

    it('reads timestamps from gx:Track', () => {
        expect(tracks[0].points[0].time).toBe(Date.parse('2025-09-12T06:59:32Z'));
    });

    it('reads three coordinate points', () => {
        expect(tracks[0].points).toHaveLength(3);
    });
});

describe('parseKML — FlightAware with renamed file (no "flight" in filename)', () => {
    const { tracks } = parseKML(join(FIXTURES, 'renamed-flight.kml'));

    it('detects flight transport mode from KML document name', () => {
        expect(tracks[0].transportMode).toBe('flight');
    });
});

// ---------------------------------------------------------------------------
// parseFile — dispatch and error handling
// ---------------------------------------------------------------------------

describe('parseFile', () => {
    it('dispatches .gpx to parseGPX', () => {
        const { tracks } = parseFile(join(FIXTURES, 'sample-track.gpx'));
        expect(tracks).toHaveLength(1);
    });

    it('dispatches .kml to parseKML', () => {
        const { tracks } = parseFile(join(FIXTURES, 'flight-SYD-NRT.kml'));
        expect(tracks).toHaveLength(1);
    });

    it('throws a descriptive error for unsupported extensions', () => {
        expect(() => parseFile('track.tcx')).toThrow('Unsupported file format');
    });
});
