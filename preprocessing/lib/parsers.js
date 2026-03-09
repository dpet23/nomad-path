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
 * @property {number|undefined} speedKmh - speed in km/h from trkpt extensions
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
    car: 'drive',
    passenger: 'drive',
    'public transport': 'drive',
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
 * Find an element with local name "activity" among direct children of a parent.
 *
 * @param {Element} parent
 * @returns {string|null}
 */
function findActivityInChildren(parent) {
    for (let i = 0; i < parent.childNodes.length; i++) {
        const node = parent.childNodes[i];
        if (node.nodeType !== 1) continue;
        const localName = node.localName || node.nodeName.split(':').pop();
        if (localName === 'activity') return node.textContent?.trim() || null;
    }
    return null;
}

/**
 * Extract the activity value from a GPX document. Checked in order:
 *   1. <metadata><extensions><*:activity>
 *   2. <trk> direct children with local name "activity"
 *   3. <trk><extensions><*:activity>
 *
 * @param {Document} dom
 * @returns {string|null}
 */
function extractGPXActivity(dom) {
    // Priority 1: <metadata><extensions>
    const metadataEls = dom.getElementsByTagName('metadata');
    for (let m = 0; m < metadataEls.length; m++) {
        const extEls = metadataEls[m].getElementsByTagName('extensions');
        for (let e = 0; e < extEls.length; e++) {
            const found = findActivityInChildren(extEls[e]);
            if (found) return found;
        }
    }

    // Priority 2 & 3: <trk> direct children, then <trk><extensions>
    const trkEls = dom.getElementsByTagName('trk');
    for (let t = 0; t < trkEls.length; t++) {
        const direct = findActivityInChildren(trkEls[t]);
        if (direct) return direct;
        const extEls = trkEls[t].getElementsByTagName('extensions');
        for (let e = 0; e < extEls.length; e++) {
            const found = findActivityInChildren(extEls[e]);
            if (found) return found;
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
    if (/\bflight/.test(name) || /\b(fly|plane|air)\b/.test(name)) return 'flight';
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
// GPX speed extraction
// ---------------------------------------------------------------------------

/**
 * Extract speed in m/s from a single trkpt element's <extensions>, or null.
 *
 * Priority:
 *   1. Any element whose local name is "speed" (covers <osmand:speed>)
 *   2. <speed_2d><value> — used by some OsmAnd variants
 *
 * @param {Element} trkpt
 * @returns {number|null} speed in m/s, or null if absent/invalid
 */
function extractTrkptSpeedMs(trkpt) {
    const extEls = trkpt.getElementsByTagName('extensions');
    if (extEls.length === 0) return null;
    const ext = extEls[0];

    // Priority 1: element with local name "speed" (e.g. <osmand:speed>)
    for (let i = 0; i < ext.childNodes.length; i++) {
        const node = ext.childNodes[i];
        if (node.nodeType !== 1) continue;
        const localName = node.localName || node.nodeName.split(':').pop();
        if (localName === 'speed') {
            const val = parseFloat(node.textContent?.trim() ?? '');
            if (isFinite(val)) return val;
        }
    }

    // Priority 2: <speed_2d><value>
    const speed2d = ext.getElementsByTagName('speed_2d');
    if (speed2d.length > 0) {
        const valueEl = speed2d[0].getElementsByTagName('value');
        if (valueEl.length > 0) {
            const val = parseFloat(valueEl[0].textContent?.trim() ?? '');
            if (isFinite(val)) return val;
        }
    }

    return null;
}

/**
 * Build a flat array of speed values (km/h, or null) for every trkpt in the
 * document, in document order. The array is aligned 1:1 with the coordinate
 * arrays produced by togeojson for the same document.
 *
 * @param {Document} dom
 * @returns {(number|null)[]}
 */
function buildTrkptSpeedArray(dom) {
    const trkpts = dom.getElementsByTagName('trkpt');
    const speeds = [];
    for (let i = 0; i < trkpts.length; i++) {
        const ms = extractTrkptSpeedMs(trkpts[i]);
        speeds.push(ms !== null ? ms * 3.6 : null);
    }
    return speeds;
}

// ---------------------------------------------------------------------------
// GeoJSON normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a togeojson FeatureCollection into internal tracks and waypoints.
 *
 * @param {Object} geojson
 * @param {string} sourceFile
 * @param {string} transportMode
 * @param {(number|null)[]} speedsKmh - flat per-trkpt speed array (GPX only)
 * @returns {ParsedFile}
 */
function normaliseFeatures(geojson, sourceFile, transportMode, speedsKmh = []) {
    const tracks = [];
    const waypoints = [];
    let trkptOffset = 0;

    for (const feature of geojson.features) {
        const geomType = feature.geometry?.type;
        if (!geomType) continue;

        if (geomType === 'LineString' || geomType === 'MultiLineString') {
            const name =
                feature.properties?.name || basename(sourceFile, extname(sourceFile));

            // Flatten multi-segment tracks into a single coordinate sequence.
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
                .map((coord, i) => {
                    /** @type {RawPoint} */
                    const point = { lon: coord[0], lat: coord[1] };
                    if (coord.length > 2 && coord[2] != null && isFinite(coord[2])) {
                        point.elevation = coord[2];
                    }
                    if (times?.[i] != null) {
                        const ms = Date.parse(times[i]);
                        if (isFinite(ms)) point.time = ms;
                    }
                    const speedKmh = speedsKmh[trkptOffset + i];
                    if (speedKmh != null) {
                        point.speedKmh = speedKmh;
                    }
                    return point;
                })
                .filter(p => isFinite(p.lon) && isFinite(p.lat));

            trkptOffset += coords.length;

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
 * Uses togeojson for structural parsing (coordinates, timestamps, track names,
 * waypoints) and a targeted DOM query for per-trkpt speed extensions that
 * togeojson does not expose.
 *
 * @param {string} filePath - absolute path to the .gpx file
 * @returns {ParsedFile}
 */
export function parseGPX(filePath) {
    const content = readFileSync(filePath, 'utf8');
    const dom = domParser.parseFromString(content, 'text/xml');
    const activity = extractGPXActivity(dom);
    const transportMode = resolveTransportMode(activity, filePath);
    const speedsKmh = buildTrkptSpeedArray(dom);
    return normaliseFeatures(gpx(dom), filePath, transportMode, speedsKmh);
}

/**
 * Extract the text content of the first <Document><name> element in a KML DOM.
 *
 * FlightAware KML files identify themselves here with a "FlightAware ✈ …" prefix,
 * regardless of how the file was renamed by the user.
 *
 * @param {Document} dom
 * @returns {string|null}
 */
function getKMLDocumentName(dom) {
    const docs = dom.getElementsByTagName('Document');
    if (docs.length === 0) return null;
    const names = docs[0].getElementsByTagName('name');
    if (names.length === 0) return null;
    return names[0].textContent?.trim() || null;
}

/**
 * Parse a KML file into tracks and waypoints.
 *
 * Transport mode priority:
 *   1. FlightAware document name (covers renamed files without "flight" in filename)
 *   2. Filename keyword inference
 *
 * @param {string} filePath - absolute path to the .kml file
 * @returns {ParsedFile}
 */
export function parseKML(filePath) {
    const content = readFileSync(filePath, 'utf8');
    const dom = domParser.parseFromString(content, 'text/xml');
    const docName = getKMLDocumentName(dom);
    const transportMode = docName?.startsWith('FlightAware')
        ? 'flight'
        : detectTransportMode(filePath);
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
