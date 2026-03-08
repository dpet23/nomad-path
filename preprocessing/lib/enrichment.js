import suncalc from 'suncalc';
const { getPosition, getTimes } = suncalc;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RAD_TO_DEG = 180 / Math.PI;

// Earth radius in metres (WGS-84 mean)
const EARTH_RADIUS_M = 6_371_000;

// ---------------------------------------------------------------------------
// Haversine distance
// ---------------------------------------------------------------------------

/**
 * Great-circle distance between two coordinate pairs in metres.
 *
 * @param {number} lat1 - degrees
 * @param {number} lon1 - degrees
 * @param {number} lat2 - degrees
 * @param {number} lon2 - degrees
 * @returns {number} distance in metres
 */
function haversineMetres(lat1, lon1, lat2, lon2) {
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

// ---------------------------------------------------------------------------
// Sun angle
// ---------------------------------------------------------------------------
// Solar day angle (0-360)
// ---------------------------------------------------------------------------

/**
 * Compute the solar day angle (0-360) for a point in time, relative to
 * the actual sunrise and sunset for that location and date.
 *
 * The scale is normalised so that fixed stops always mean the same phase:
 *   0   = solar midnight (start of day)
 *   90  = sunrise
 *   180 = solar noon
 *   270 = sunset
 *   360 = solar midnight (end of day)
 *
 * Pre-dawn night (0-90) and post-dusk night (270-360) are distinguishable.
 * Returns NaN for polar locations where suncalc cannot determine
 * sunrise/sunset; callers should check isFinite() and treat NaN as null.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {Date} date
 * @returns {number} angle in degrees (0–360), rounded to nearest integer
 */
export function computeSunAngle(lat, lon, date) {
    const times = getTimes(date, lat, lon);
    const sunrise = times.sunrise?.getTime();
    const sunset = times.sunset?.getTime();

    // Polar edge-cases: suncalc returns NaN or missing dates.
    // Return NaN as a null-sentinel; callers check isFinite().
    if (!sunrise || !isFinite(sunrise) || !sunset || !isFinite(sunset)) {
        return NaN;
    }

    const solarNoon = (sunrise + sunset) / 2;
    const t = date.getTime();

    let angle;
    if (t <= sunrise) {
        // Pre-dawn: midnight→sunrise maps to 0°→90°
        const midnight = solarNoon - 12 * 3_600_000;
        const span = sunrise - midnight;
        angle = span > 0 ? 90 * ((t - midnight) / span) : 0;
    } else if (t <= solarNoon) {
        // Morning: sunrise→noon maps to 90°→180°
        angle = 90 + 90 * ((t - sunrise) / (solarNoon - sunrise));
    } else if (t <= sunset) {
        // Afternoon: noon→sunset maps to 180°→270°
        angle = 180 + 90 * ((t - solarNoon) / (sunset - solarNoon));
    } else {
        // Post-dusk: sunset→midnight maps to 270°→360°
        const midnight = solarNoon + 12 * 3_600_000;
        const span = midnight - sunset;
        angle = span > 0 ? 270 + 90 * ((t - sunset) / span) : 270;
    }

    return Math.round(Math.max(0, Math.min(360, angle)));
}

// ---------------------------------------------------------------------------
// Speed fallback
// ---------------------------------------------------------------------------

/**
 * Compute speed in km/h between two consecutive points using Haversine
 * distance and elapsed time. Returns null if either point lacks a timestamp,
 * the time delta is zero or negative, or the result is not finite.
 *
 * @param {import('./parsers.js').RawPoint} prev
 * @param {import('./parsers.js').RawPoint} curr
 * @returns {number|null}
 */
function computeSpeedKmh(prev, curr) {
    if (prev.time == null || curr.time == null) return null;
    const dtSec = (curr.time - prev.time) / 1000;
    if (dtSec <= 0) return null;
    const distM = haversineMetres(prev.lat, prev.lon, curr.lat, curr.lon);
    const kmh = (distM / dtSec) * 3.6;
    return isFinite(kmh) ? kmh : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} EnrichedPoint
 * @property {number} lon
 * @property {number} lat
 * @property {number|undefined} elevation
 * @property {number|undefined} time
 * @property {number|undefined} speedKmh - from extension, or Haversine fallback
 * @property {number|null} sunAngle - solar day angle 0–360°, or null if no timestamp
 */

/**
 * @typedef {Object} EnrichedTrack
 * @property {string} name
 * @property {string} sourceFile
 * @property {string} transportMode
 * @property {EnrichedPoint[]} points
 */

/**
 * Enrich a parsed track's points with computed speed (Haversine fallback) and
 * sun angle (via suncalc + tz-lookup).
 *
 * Speed: uses the value already present in the point from GPX extensions; only
 * falls back to Haversine when the extension speed is absent. The first point
 * gets no Haversine speed (no previous point).
 *
 * Sun angle: requires a timestamp. Points without one get null.
 *
 * @param {import('./parsers.js').RawTrack} track
 * @returns {EnrichedTrack}
 */
export function enrichTrack(track) {
    const enrichedPoints = track.points.map((point, i) => {
        /** @type {EnrichedPoint} */
        const enriched = {
            lon: point.lon,
            lat: point.lat,
        };

        if (point.elevation !== undefined) enriched.elevation = point.elevation;
        if (point.time !== undefined) enriched.time = point.time;

        // Speed: prefer GPX extension, fall back to Haversine from previous point
        if (point.speedKmh !== undefined) {
            enriched.speedKmh = point.speedKmh;
        } else if (i > 0) {
            const fallback = computeSpeedKmh(track.points[i - 1], point);
            if (fallback !== null) enriched.speedKmh = fallback;
        }

        // Sun angle
        if (point.time != null) {
            const date = new Date(point.time);
            const angle = computeSunAngle(point.lat, point.lon, date);
            enriched.sunAngle = isFinite(angle) ? angle : null;
        } else {
            enriched.sunAngle = null;
        }

        return enriched;
    });

    return {
        name: track.name,
        sourceFile: track.sourceFile,
        transportMode: track.transportMode,
        points: enrichedPoints,
    };
}
