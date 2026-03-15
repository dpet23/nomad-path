// Note: geometry simplification is intentionally omitted at this stage.
// MapLibre's GeoJSON source `tolerance` option handles zoom-level-aware
// simplification at render time, preserving all attribute data intact.
// An attribute-aware simplification pass can be added here post-MVP once
// real trip data is available to tune tolerances.

import { featureCollection, lineString, point } from '@turf/helpers';

/**
 * @typedef {import('./grouping.js').GroupedTrack} GroupedTrack
 * @typedef {import('./parsers.js').RawWaypoint} RawWaypoint
 */

// ---------------------------------------------------------------------------
// Attribute ranges
// ---------------------------------------------------------------------------

/**
 * Accumulate a min/max range from an array of nullable numeric values.
 *
 * @param {{min: number, max: number}} range - mutated in place
 * @param {(number | null | undefined)[]} values
 */
function updateRange(range, values) {
    for (const v of values) {
        if (v == null || !isFinite(v)) continue;
        if (v < range.min) range.min = v;
        if (v > range.max) range.max = v;
    }
}

// ---------------------------------------------------------------------------
// Parallel array helpers
// ---------------------------------------------------------------------------

/**
 * Extract a named scalar field from an array of points into a parallel array.
 * Returns null if every value is absent, so callers can omit the property.
 *
 * @param {object[]} points
 * @param {string} field
 * @returns {(number | null)[] | null}
 */
function extractArray(points, field) {
    const arr = points.map(p => p[field] ?? null);
    return arr.every(v => v === null) ? null : arr;
}

/**
 * Extract sunAngle values, returning null if all points lack a timestamp
 * (e.g. a KML flight with no time data).
 *
 * @param {import('./enrichment.js').EnrichedPoint[]} points
 * @returns {(number | null)[] | null}
 */
function extractSunAngles(points) {
    const arr = points.map(p => p.sunAngle ?? null);
    return arr.every(v => v === null) ? null : arr;
}

// ---------------------------------------------------------------------------
// Feature builders
// ---------------------------------------------------------------------------

/**
 * Convert a grouped, enriched track into a GeoJSON LineString Feature.
 *
 * @param {GroupedTrack} track
 * @returns {import('../../src/data/types.js').TrackFeature}
 */
function trackToFeature(track) {
    const coordinates = track.points.map(p => [p.lon, p.lat]);

    const times = extractArray(track.points, 'time');
    const elevations = extractArray(track.points, 'elevation');
    const speeds = extractArray(track.points, 'speedKmh');
    const sunAngles = extractSunAngles(track.points);

    return lineString(coordinates, {
        name: track.name,
        day: track.day,
        type: 'track',
        defaultVisible: track.defaultVisible ?? true,
        ...(track.excludeFromAutoBounds && { excludeFromAutoBounds: true }),
        group: track.group ?? null,
        transportMode: track.transportMode,
        ...(times && { times }),
        ...(elevations && { elevations }),
        ...(speeds && { speeds }),
        ...(sunAngles && { sunAngles }),
    });
}

/**
 * Convert a raw waypoint into a GeoJSON Point Feature.
 *
 * @param {RawWaypoint} waypoint
 * @returns {import('../../src/data/types.js').POIFeature}
 */
function waypointToFeature(waypoint) {
    return point([waypoint.lon, waypoint.lat], {
        name: waypoint.name,
        type: 'poi',
        category: waypoint.category,
    });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a trip-data GeoJSON FeatureCollection from grouped tracks and
 * waypoints.
 *
 * The returned object matches the TripData interface from src/data/types.ts
 * and is ready to be serialised with JSON.stringify().
 *
 * @param {object} opts
 * @param {GroupedTrack[]} opts.tracks
 * @param {RawWaypoint[]} opts.waypoints
 * @param {string} opts.tripName
 * @returns {import('../../src/data/types.js').TripData}
 */
export function buildGeoJSON({ tracks, waypoints, tripName }) {
    const elevRange = { min: Infinity, max: -Infinity };
    const speedRange = { min: Infinity, max: -Infinity };

    const sortedTracks = [...tracks].sort((a, b) => {
        const keyA = a.day.match(/^flight-(\d{4}-\d{2}-\d{2})/)?.[1] ?? a.day;
        const keyB = b.day.match(/^flight-(\d{4}-\d{2}-\d{2})/)?.[1] ?? b.day;
        return keyA.localeCompare(keyB);
    });

    const trackFeatures = sortedTracks.map(track => {
        updateRange(elevRange, track.points.map(p => p.elevation));
        updateRange(speedRange, track.points.map(p => p.speedKmh));
        return trackToFeature(track);
    });

    const poiFeatures = waypoints.map(waypointToFeature);

    const attributeRanges = {};
    if (isFinite(elevRange.min)) {
        attributeRanges.elevation = { min: elevRange.min, max: elevRange.max, unit: 'm' };
    }
    if (isFinite(speedRange.min)) {
        attributeRanges.speed = { min: speedRange.min, max: speedRange.max, unit: 'km/h' };
    }

    // Stats
    const transportModes = {};
    for (const t of tracks) {
        const mode = t.transportMode ?? 'unknown';
        transportModes[mode] = (transportModes[mode] ?? 0) + 1;
    }
    const groundDays = [...new Set(
        tracks.map(t => t.day).filter(d => !d.startsWith('flight-')),
    )].sort();
    const stats = {
        trackCount: tracks.length,
        waypointCount: waypoints.length,
        dayCount: groundDays.length,
        transportModes,
        ...(groundDays.length > 0 && {
            dateRange: { start: groundDays[0], end: groundDays[groundDays.length - 1] },
        }),
    };

    const collection = featureCollection([...trackFeatures, ...poiFeatures]);
    collection.metadata = { tripName, attributeRanges, stats };
    return collection;
}
