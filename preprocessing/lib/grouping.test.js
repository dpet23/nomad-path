// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { groupTracks } from './grouping.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal EnrichedTrack factory for grouping tests.
 *
 * @param {object} opts
 * @param {string} opts.name
 * @param {string} opts.transportMode
 * @param {{lat: number, lon: number, time?: number}[]} opts.points
 * @returns {import('./enrichment.js').EnrichedTrack}
 */
function makeTrack({ name, transportMode, points }) {
    return {
        name,
        sourceFile: `${name}.gpx`,
        transportMode,
        points: points.map(p => ({ lon: p.lon, lat: p.lat, time: p.time, sunAngle: null })),
    };
}

// ---------------------------------------------------------------------------
// Ground track day assignment
// ---------------------------------------------------------------------------

describe('groupTracks -- ground tracks', () => {
    it('assigns YYYY-MM-DD based on local date of first timed point', () => {
        // Tokyo (UTC+9): 2024-03-15T08:00Z = 2024-03-15 17:00 JST
        const track = makeTrack({
            name: 'morning-drive',
            transportMode: 'drive',
            points: [
                { lat: 35.6895, lon: 139.6917, time: Date.parse('2024-03-15T08:00:00Z') },
                { lat: 35.6900, lon: 139.6925, time: Date.parse('2024-03-15T08:05:00Z') },
            ],
        });
        const [grouped] = groupTracks([track]);
        expect(grouped.day).toBe('2024-03-15');
    });

    it('assigns the local date, not the UTC date, when they differ', () => {
        // Sydney (UTC+11 in March): 2024-03-14T14:00Z = 2024-03-15 01:00 AEDT
        const track = makeTrack({
            name: 'night-drive',
            transportMode: 'drive',
            points: [
                { lat: -33.8688, lon: 151.2093, time: Date.parse('2024-03-14T14:00:00Z') },
                { lat: -33.8700, lon: 151.2100, time: Date.parse('2024-03-14T14:05:00Z') },
            ],
        });
        const [grouped] = groupTracks([track]);
        // UTC date is 2024-03-14, but local Sydney date is 2024-03-15
        expect(grouped.day).toBe('2024-03-15');
    });

    it('groups two tracks on the same local date with the same day key', () => {
        const morning = makeTrack({
            name: 'morning',
            transportMode: 'walk',
            points: [
                { lat: 35.6895, lon: 139.6917, time: Date.parse('2024-03-15T00:00:00Z') },
                { lat: 35.6900, lon: 139.6925, time: Date.parse('2024-03-15T00:30:00Z') },
            ],
        });
        const afternoon = makeTrack({
            name: 'afternoon',
            transportMode: 'drive',
            points: [
                { lat: 35.6910, lon: 139.6940, time: Date.parse('2024-03-15T05:00:00Z') },
                { lat: 35.6920, lon: 139.6950, time: Date.parse('2024-03-15T05:30:00Z') },
            ],
        });
        const [g1, g2] = groupTracks([morning, afternoon]);
        expect(g1.day).toBe(g2.day);
    });

    it('assigns different day keys to tracks on different local dates', () => {
        const day1 = makeTrack({
            name: 'day1',
            transportMode: 'drive',
            points: [
                { lat: 35.6895, lon: 139.6917, time: Date.parse('2024-03-15T02:00:00Z') },
                { lat: 35.6900, lon: 139.6925, time: Date.parse('2024-03-15T02:30:00Z') },
            ],
        });
        const day2 = makeTrack({
            name: 'day2',
            transportMode: 'drive',
            points: [
                { lat: 35.6895, lon: 139.6917, time: Date.parse('2024-03-16T02:00:00Z') },
                { lat: 35.6900, lon: 139.6925, time: Date.parse('2024-03-16T02:30:00Z') },
            ],
        });
        const [g1, g2] = groupTracks([day1, day2]);
        expect(g1.day).not.toBe(g2.day);
        expect(g1.day).toBe('2024-03-15');
        expect(g2.day).toBe('2024-03-16');
    });

    it('falls back to filename stem when no timestamps are present', () => {
        const track = makeTrack({
            name: 'day3-morning',
            transportMode: 'walk',
            points: [
                { lat: 35.6895, lon: 139.6917 },
                { lat: 35.6900, lon: 139.6925 },
            ],
        });
        const [grouped] = groupTracks([track]);
        expect(grouped.day).toBe('day3-morning');
    });

    it('strips only the final extension when the filename stem contains dots', () => {
        // basename(file, extname(file)) only removes the last extension.
        // A stem like "morning.run.no-time.gpx" should become "morning-run-no-time"
        // (dots collapsed by slugify), not lose the middle ".run." portion.
        const track = {
            name: 'morning run',
            sourceFile: '/some/path/morning.run.no-time.gpx',
            transportMode: 'walk',
            points: [
                { lon: 139.6917, lat: 35.6895, sunAngle: null },
                { lon: 139.6925, lat: 35.6900, sunAngle: null },
            ],
        };
        const [grouped] = groupTracks([track]);
        expect(grouped.day).toBe('morning-run-no-time');
    });

    it('produces a stem-derived day key that COLLIDES with a same-date timestamped track', () => {
        // Documented limitation: a no-timestamp file named like "2025-01-01.gpx"
        // produces stem "2025-01-01", which is identical to the day key a real
        // timestamped track on 2025-01-01 would receive. This pins current
        // behaviour so a future change (e.g. prefixing stem-derived keys to
        // disambiguate) shows up as a deliberate test update, not a silent
        // semantics shift.
        const stemTrack = {
            name: 'misleading filename',
            sourceFile: '/some/path/2025-01-01.gpx',
            transportMode: 'walk',
            points: [
                { lon: 139.6917, lat: 35.6895, sunAngle: null },
                { lon: 139.6925, lat: 35.6900, sunAngle: null },
            ],
        };
        const datedTrack = makeTrack({
            name: 'real-2025-01-01',
            transportMode: 'drive',
            points: [
                { lat: 35.6895, lon: 139.6917, time: Date.parse('2025-01-01T08:00:00Z') },
                { lat: 35.6900, lon: 139.6925, time: Date.parse('2025-01-01T08:05:00Z') },
            ],
        });
        const [stemGrouped, datedGrouped] = groupTracks([stemTrack, datedTrack]);
        expect(stemGrouped.day).toBe('2025-01-01');
        expect(datedGrouped.day).toBe('2025-01-01');
        expect(stemGrouped.day).toBe(datedGrouped.day);
    });
});

// ---------------------------------------------------------------------------
// Flight track day assignment
// ---------------------------------------------------------------------------

describe('groupTracks -- flight tracks', () => {
    it('assigns a unique key that starts with "flight-"', () => {
        const flight = makeTrack({
            name: 'Flight SYD-NRT',
            transportMode: 'flight',
            points: [
                { lat: -33.9461, lon: 151.1772, time: Date.parse('2024-03-16T00:30:00Z') },
                { lat: 35.7647, lon: 140.3864, time: Date.parse('2024-03-16T09:00:00Z') },
            ],
        });
        const [grouped] = groupTracks([flight]);
        expect(grouped.day).toMatch(/^flight-/);
    });

    it('uses UTC departure date in the key', () => {
        const flight = makeTrack({
            name: 'Flight SYD-NRT',
            transportMode: 'flight',
            points: [
                { lat: -33.9461, lon: 151.1772, time: Date.parse('2024-03-16T00:30:00Z') },
                { lat: 35.7647, lon: 140.3864, time: Date.parse('2024-03-16T09:00:00Z') },
            ],
        });
        const [grouped] = groupTracks([flight]);
        expect(grouped.day).toContain('2024-03-16');
    });

    it('gives two flights on different days distinct keys', () => {
        const f1 = makeTrack({
            name: 'Flight A',
            transportMode: 'flight',
            points: [
                { lat: -33.9461, lon: 151.1772, time: Date.parse('2024-03-16T00:30:00Z') },
                { lat: 35.7647, lon: 140.3864 },
            ],
        });
        const f2 = makeTrack({
            name: 'Flight B',
            transportMode: 'flight',
            points: [
                { lat: 35.7647, lon: 140.3864, time: Date.parse('2024-03-20T10:00:00Z') },
                { lat: 1.3521, lon: 103.8198 },
            ],
        });
        const [g1, g2] = groupTracks([f1, f2]);
        expect(g1.day).not.toBe(g2.day);
    });

    it('is never equal to a ground track day key on the same UTC date', () => {
        const flight = makeTrack({
            name: 'Flight SYD-NRT',
            transportMode: 'flight',
            points: [
                { lat: -33.9461, lon: 151.1772, time: Date.parse('2024-03-16T00:30:00Z') },
                { lat: 35.7647, lon: 140.3864 },
            ],
        });
        const ground = makeTrack({
            name: 'drive',
            transportMode: 'drive',
            points: [
                { lat: 35.6895, lon: 139.6917, time: Date.parse('2024-03-16T02:00:00Z') },
                { lat: 35.6900, lon: 139.6925 },
            ],
        });
        const [gFlight, gGround] = groupTracks([flight, ground]);
        expect(gFlight.day).not.toBe(gGround.day);
    });

    it('falls back gracefully when no timestamps are present', () => {
        const flight = makeTrack({
            name: 'Flight SYD-NRT',
            transportMode: 'flight',
            points: [
                { lat: -33.9461, lon: 151.1772 },
                { lat: 35.7647, lon: 140.3864 },
            ],
        });
        const [grouped] = groupTracks([flight]);
        expect(grouped.day).toMatch(/^flight-/);
    });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('groupTracks -- edge cases', () => {
    it('returns empty array for empty input', () => {
        expect(groupTracks([])).toEqual([]);
    });

    it('two flights on the same UTC date with the same name get distinct day keys', () => {
        // Connecting flights or a rebooking: same route code, same departure date
        const f1 = makeTrack({
            name: 'Flight SYD-NRT',
            transportMode: 'flight',
            points: [
                { lat: -33.9461, lon: 151.1772, time: Date.parse('2024-03-16T00:30:00Z') },
                { lat: 35.7647, lon: 140.3864 },
            ],
        });
        const f2 = makeTrack({
            name: 'Flight SYD-NRT',
            transportMode: 'flight',
            points: [
                { lat: -33.9461, lon: 151.1772, time: Date.parse('2024-03-16T14:00:00Z') },
                { lat: 35.7647, lon: 140.3864 },
            ],
        });
        const [g1, g2] = groupTracks([f1, f2]);
        expect(g1.day).not.toBe(g2.day);
    });

    it('does not crash when coordinates are out of valid range', () => {
        // tz-lookup with invalid coords should not throw
        const track = makeTrack({
            name: 'bad-coords',
            transportMode: 'drive',
            points: [
                { lat: 999, lon: 999, time: Date.parse('2024-03-15T08:00:00Z') },
                { lat: 999, lon: 999, time: Date.parse('2024-03-15T08:05:00Z') },
            ],
        });
        expect(() => groupTracks([track])).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// Passthrough of existing properties
// ---------------------------------------------------------------------------

describe('groupTracks -- property passthrough', () => {
    it('preserves all existing track properties', () => {
        const track = makeTrack({
            name: 'test',
            transportMode: 'drive',
            points: [
                { lat: 35.6895, lon: 139.6917, time: Date.parse('2024-03-15T08:00:00Z') },
                { lat: 35.6900, lon: 139.6925 },
            ],
        });
        const [grouped] = groupTracks([track]);
        expect(grouped.name).toBe('test');
        expect(grouped.transportMode).toBe('drive');
        expect(grouped.points).toHaveLength(2);
    });
});
