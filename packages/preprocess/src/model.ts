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
    /** Epoch seconds UTC, parallel to lon/lat; null = missing at that point. */
    time?: (number | null)[];
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

/**
 * Counters for droppable-but-normal events, aggregated into the end-of-build
 * status line. Not errors and not per-item warnings - a stray single-point
 * segment (OsmAnd pause/resume artifact) is normal, so it is skipped and tallied
 * here.
 *
 * The plain interface stays serialisable; its behaviour lives on the same-named
 * companion object below. Add a counter in ONE place - the field here plus the
 * three companion methods - and zero/merge/format all follow.
 */
export interface BuildStats {
    /** Segments/geometries dropped because a line needs >= 2 points. */
    shortSegmentsSkipped: number;
}

export const BuildStats = {
    /** A fresh zeroed stats object. */
    zero(): BuildStats {
        return { shortSegmentsSkipped: 0 };
    },

    /** Sum two stats field-by-field (scan aggregates per-file stats with this). */
    merge(a: BuildStats, b: BuildStats): BuildStats {
        return { shortSegmentsSkipped: a.shortSegmentsSkipped + b.shortSegmentsSkipped };
    },

    /** Human-readable status-line fragments for the non-zero counters (empty if all zero). */
    format(stats: BuildStats): string[] {
        const parts: string[] = [];
        if (stats.shortSegmentsSkipped > 0) {
            parts.push(`${String(stats.shortSegmentsSkipped)} short segment(s) skipped`);
        }
        return parts;
    },
};

export interface ParseResult {
    features: RawFeature[];
    errors: ParseError[];
    stats: BuildStats;
}
