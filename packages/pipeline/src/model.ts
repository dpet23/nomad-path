/**
 * The common intermediate model: what every parser emits, before config
 * resolution and computation. Deliberately simpler than the contract — no
 * day/divider/bounds/order yet, and attributes are raw pass-throughs.
 *
 * One RawFeature = one future contract item (one toggle/zoom unit). A track
 * file yields one feature with a line geometry per segment; a waypoint file
 * yields one feature per <wpt>; a FlightAware KML yields the flight feature
 * plus point features for its airport placemarks (dropping those is a rule
 * decision made later, never a parser guess).
 */

export interface RawLine {
    type: 'line';
    /** Parallel arrays, WGS84. */
    lon: number[];
    lat: number[];
    /** Epoch seconds UTC, parallel to lon/lat. */
    time?: number[];
    /** Metres; null = missing at that point. */
    ele?: (number | null)[];
    /** Metres per second; null = missing at that point. Never derived. */
    speed?: (number | null)[];
}

export interface RawPoint {
    type: 'point';
    lon: number;
    lat: number;
    /** Marker image URL from a GPX <sym>. */
    sym?: string;
}

export interface RawPolygon {
    type: 'polygon';
    /** Single outer ring, parallel arrays. */
    lon: number[];
    lat: number[];
}

export type RawGeometry = RawLine | RawPoint | RawPolygon;

export interface RawFeature {
    /** Path of the source file, relative to the input root (POSIX separators). */
    sourceFile: string;
    /** Index of this feature's source element within the file; with sourceFile it derives the stable item id. */
    sourceIndex: number;
    name?: string;
    description?: string;
    /** Transport mode from osmand:activity, verbatim. */
    activity?: string;
    /** In-file <folder> value (waypoint grouping input). */
    folder?: string;
    geometries: RawGeometry[];
}

/** A problem that must fail the build (collected, never thrown). */
export interface ParseError {
    sourceFile: string;
    message: string;
}

/** A non-fatal anomaly surfaced by --audit (e.g. legacy transport markers). */
export interface ParseWarning {
    sourceFile: string;
    /** Stable machine-readable kind, e.g. "legacy-transport", "missing-time". */
    code: string;
    message: string;
}

export interface ParseResult {
    features: RawFeature[];
    errors: ParseError[];
    warnings: ParseWarning[];
}
