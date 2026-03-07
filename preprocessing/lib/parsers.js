import { readFileSync } from 'fs';
import { basename, extname } from 'path';

import { gpx, kml } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';

const domParser = new DOMParser();

/**
 * @typedef {Object} RawPoint
 * @property {number} lon
 * @property {number} lat
 * @property {number|undefined} elevation - metres above sea level
 * @property {number|undefined} time - Unix timestamp in milliseconds
 */

/**
 * @typedef {Object} RawTrack
 * @property {string} name
 * @property {string} sourceFile
 * @property {string} transportMode - 'drive' | 'walk' | 'flight' | 'boat' | string
 * @property {RawPoint[]} points - at least 2 points guaranteed
 */

/**
 * @typedef {Object} RawWaypoint
 * @property {string} name
 * @property {number} lon
 * @property {number} lat
 * @property {string} category
 */

/**
 * @typedef {Object} ParsedFile
 * @property {RawTrack[]} tracks
 * @property {RawWaypoint[]} waypoints
 */

// ---------------------------------------------------------------------------
// Transport mode
// ---------------------------------------------------------------------------

/** OsmAnd activity strings → canonical transport mode. */
const ACTIVITY_MAP = {
    driving: 'drive',
    walking: 'walk',
    hiking: 'walk',
    running: 'walk',
    cycling: 'cycling',
    biking: 'cycling',
    boating: 'boat',
    sailing: 'boat',
    skiing: 'skiing',
    flying: 'flight',
};

/**
 * Extract the activity value from GPX metadata extensions.
 * Handles OsmAnd's <osmand:activity> and any other app using a local name
 * of "activity" anywhere inside <metadata><extensions>.
 *
 * @param {Document} dom
 * @returns {string|null}
 */
function extractGPXActivity(dom) {
    const metadataEls = dom.getElementsByTagName('metadata');
    for (let m = 0; m < metadataEls.length; m++) {
        const extEls = metadataEls[m].getElementsByTagName('extensions');
        for (let e = 0; e < extEls.length; e++) {
            const children = extEls[e].childNodes;
            for (let c = 0; c < children.length; c++) {
                const node = children[c];
                if (node.nodeType !== 1) continue; // element nodes only
                const localName = node.localName || node.nodeName.split(':').pop();
                if (localName === 'activity') {
                    return node.textContent?.trim() || null;
                }
            }
        }
    }
    return null;
}

/**
 * Infer transport mode from a filename (fallback when no metadata is present).
 *
 * @param {string} filename
 * @returns {string}
 */
export function detectTransportMode(filename) {
    const name = basename(filename, extname(filename)).toLowerCase();
    if (/\b(flight|fly|plane|air)\b/.test(name)) return 'flight';
    if (/\b(walk|hike|trek|run|jog)\b/.test(name)) return 'walk';
    if (/\b(cycle|bike|cycling|biking)\b/.test(name)) return 'cycling';
    if (/\b(boat|sail|ferry|ship|kayak|canoe)\b/.test(name)) return 'boat';
    return 'drive';
}

/**
 * Resolve transport mode from GPS metadata activity string, falling back to
 * filename-based inference.
 *
 * @param {string|null} activity - raw activity string from metadata
 * @param {string} filename
 * @returns {string}
 */
function resolveTransportMode(activity, filename) {
    if (activity) {
        const canonical = ACTIVITY_MAP[activity.toLowerCase()];
        if (canonical) return canonical;
        // Unknown activity string: return it as-is so styling can show "Other".
        return activity.toLowerCase();
    }
    return detectTransportMode(filename);
}

// ---------------------------------------------------------------------------
// POI categories
// ---------------------------------------------------------------------------

/**
 * Infer a POI category from the waypoint type element or filename.
 *
 * @param {string} filename
 * @param {string|undefined} waypointType
 * @returns {string}
 */
function detectCategory(filename, waypointType) {
    if (waypointType) return waypointType.toLowerCase();
    const name = basename(filename, extname(filename)).toLowerCase();
    if (/accommodat|hotel|hostel|airbnb/.test(name)) return 'accommodation';
    if (/landmark|attraction|sight/.test(name)) return 'landmark';
    if (/restaurant|food|eat|cafe/.test(name)) return 'food';
    return 'poi';
}

// ---------------------------------------------------------------------------
// GeoJSON normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a togeojson FeatureCollection into internal tracks and waypoints.
 *
 * @param {Object} geojson
 * @param {string} sourceFile
 * @param {string} transportMode - already resolved
 * @returns {ParsedFile}
 */
function normaliseFeatures(geojson, sourceFile, transportMode) {
    const tracks = [];
    const waypoints = [];

    for (const feature of geojson.features) {
        const geomType = feature.geometry?.type;
        if (!geomType) continue;

        if (geomType === 'LineString' || geomType === 'MultiLineString') {
            const name =
                feature.properties?.name || basename(sourceFile, extname(sourceFile));

            // Flatten multi-segment tracks into a single point sequence.
            const coords =
                geomType === 'LineString'
                    ? feature.geometry.coordinates
                    : feature.geometry.coordinates.flat(1);

            const rawTimes = feature.properties?.coordinateProperties?.times;
            const times =
                rawTimes == null
                    ? null
                    : Array.isArray(rawTimes[0])
                      ? rawTimes.flat(1) // multi-segment times
                      : rawTimes;

            const points = coords
                .map((coord, i) => ({
                    lon: coord[0],
                    lat: coord[1],
                    elevation:
                        coord.length > 2 && coord[2] != null && isFinite(coord[2])
                            ? coord[2]
                            : undefined,
                    time: times?.[i] != null ? Date.parse(times[i]) : undefined,
                }))
                .filter(p => isFinite(p.lon) && isFinite(p.lat));

            if (points.length >= 2) {
                tracks.push({ name, sourceFile, transportMode, points });
            }
        } else if (geomType === 'Point') {
            waypoints.push({
                name: feature.properties?.name || 'Unknown',
                lon: feature.geometry.coordinates[0],
                lat: feature.geometry.coordinates[1],
                category: detectCategory(sourceFile, feature.properties?.type),
            });
        }
    }

    return { tracks, waypoints };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a GPX file into tracks and waypoints.
 *
 * @param {string} filePath - absolute path to the .gpx file
 * @returns {ParsedFile}
 */
export function parseGPX(filePath) {
    const content = readFileSync(filePath, 'utf8');
    const dom = domParser.parseFromString(content, 'text/xml');
    const activity = extractGPXActivity(dom);
    const transportMode = resolveTransportMode(activity, filePath);
    return normaliseFeatures(gpx(dom), filePath, transportMode);
}

/**
 * Parse a KML file into tracks and waypoints.
 * KML has no standard activity metadata; transport mode is inferred from filename.
 *
 * @param {string} filePath - absolute path to the .kml file
 * @returns {ParsedFile}
 */
export function parseKML(filePath) {
    const content = readFileSync(filePath, 'utf8');
    const dom = domParser.parseFromString(content, 'text/xml');
    const transportMode = detectTransportMode(filePath);
    return normaliseFeatures(kml(dom), filePath, transportMode);
}

/**
 * Parse a .gpx or .kml file, dispatching by extension.
 *
 * @param {string} filePath
 * @returns {ParsedFile}
 */
export function parseFile(filePath) {
    const ext = extname(filePath).toLowerCase();
    if (ext === '.gpx') return parseGPX(filePath);
    if (ext === '.kml') return parseKML(filePath);
    throw new Error(`Unsupported file format: "${ext}". Expected .gpx or .kml`);
}
