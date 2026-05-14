/**
 * Runtime validator for the on-disk trip-data.geojson contract.
 *
 * This file is the single declarative source of truth for the shape and
 * value-level invariants of trip-data.geojson. Types in ./types.ts are
 * inferred from these schemas — there are no hand-written types that can
 * drift from the validator.
 *
 * Library import policy: src/** must NOT import this file. The validator
 * is preprocessing-only to keep the library bundle minimal. Library code
 * imports types from ./types.ts only. Enforced by ESLint
 * no-restricted-imports.
 *
 * The validator's job is to be the predicate "this file is renderable by
 * the library." If a schema-conforming file renders wrong, the schema
 * was wrong; fix the schema.
 */

import * as v from 'valibot';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** ISO calendar date, e.g. "2025-08-14". */
const IsoDateSchema = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/));

/**
 * Day key. Either an ISO date OR a `flight-YYYY-MM-DD-<slug>` key, which
 * preprocessing emits for flights so they sort and group separately from
 * surface-travel days on the same date.
 */
const DayKeySchema = v.pipe(
    v.string(),
    v.regex(/^(\d{4}-\d{2}-\d{2}|flight-\d{4}-\d{2}-\d{2}-[a-z0-9-]+)$/),
);

/** Longitude in [-180, 180]. */
const LongitudeSchema = v.pipe(v.number(), v.minValue(-180), v.maxValue(180));

/** Latitude in [-90, 90]. */
const LatitudeSchema = v.pipe(v.number(), v.minValue(-90), v.maxValue(90));

/**
 * Altitude in metres. Bounds are deliberately wide: lowest land surface
 * is the Dead Sea at ≈ -430 m; commercial flight ceiling is around 13 km.
 * The bound rejects obvious unit mismatches (e.g. centimetres) without
 * gatekeeping legitimate flight tracks.
 */
const AltitudeSchema = v.pipe(v.number(), v.minValue(-500), v.maxValue(15000));

/** 2D or 3D coordinate. */
const CoordinateSchema = v.union([
    v.tuple([LongitudeSchema, LatitudeSchema]),
    v.tuple([LongitudeSchema, LatitudeSchema, AltitudeSchema]),
]);

// ---------------------------------------------------------------------------
// Track properties
// ---------------------------------------------------------------------------

/**
 * Transport mode. Open enum: the canonical four are walk/drive/flight/boat,
 * but OsmAnd activity strings (snorkel, horseback, zipline, etc.) flow
 * through the pipeline unchanged. Library paint expressions handle unknowns
 * via fallback to drive at the segment level.
 */
const TransportModeSchema = v.string();

const ElevationsSchema = v.array(AltitudeSchema);
/** Speed in km/h, ≥ 0. Upper bound rejects obvious unit-leak (e.g. m/s
 *  treated as km/h would put a 100 km/h car at 360). */
const SpeedsSchema = v.array(v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(1500))));
/** Unix timestamps in ms. */
const TimesSchema = v.array(v.pipe(v.number(), v.integer(), v.minValue(0)));
/** Perceptual sun angle in [0, 360]; null where the point has no timestamp. */
const SunAnglesSchema = v.array(v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(360))));

export const TrackPropertiesSchema = v.object({
    name: v.pipe(v.string(), v.minLength(1)),
    day: DayKeySchema,
    type: v.literal('track'),
    defaultVisible: v.boolean(),
    excludeFromAutoBounds: v.optional(v.boolean()),
    transportMode: v.optional(TransportModeSchema),
    group: v.optional(v.nullable(v.string())),
    times: v.optional(TimesSchema),
    elevations: v.optional(ElevationsSchema),
    speeds: v.optional(SpeedsSchema),
    sunAngles: v.optional(SunAnglesSchema),
});

// ---------------------------------------------------------------------------
// Track feature
// ---------------------------------------------------------------------------

/**
 * Track feature. Cross-field invariants enforced via v.check on the parent
 * object so the issue path points at the offending feature:
 *
 *   - coordinates.length ≥ 2 (a 1-point LineString is degenerate).
 *   - Every present parallel array (times, elevations, speeds, sunAngles)
 *     has length === coordinates.length.
 *   - times is monotonically non-decreasing (GPS tracks are time-ordered).
 *
 * These are predicates because TS schema libraries don't express
 * cross-field length equality declaratively. The bug class this catches
 * (silent parallel-array drift) is exactly the kind that produces
 * misaligned colour-by-attribute renders without any runtime error.
 */
export const TrackFeatureSchema = v.pipe(
    v.object({
        type: v.literal('Feature'),
        geometry: v.object({
            type: v.literal('LineString'),
            coordinates: v.array(CoordinateSchema),
        }),
        properties: TrackPropertiesSchema,
    }),
    v.check(
        ({ geometry }) => geometry.coordinates.length >= 2,
        'Track must have at least 2 coordinates (LineString cannot be degenerate)',
    ),
    v.check(
        ({ geometry, properties }) => {
            const n = geometry.coordinates.length;
            const arrays: ReadonlyArray<readonly [string, ReadonlyArray<unknown> | undefined]> = [
                ['times', properties.times],
                ['elevations', properties.elevations],
                ['speeds', properties.speeds],
                ['sunAngles', properties.sunAngles],
            ];
            return arrays.every(([, arr]) => arr === undefined || arr.length === n);
        },
        'Parallel arrays (times/elevations/speeds/sunAngles) must each have length equal to coordinates.length',
    ),
    v.check(({ properties }) => {
        const t = properties.times;
        if (t === undefined) return true;
        for (let i = 1; i < t.length; i++) {
            if (t[i] < t[i - 1]) return false;
        }
        return true;
    }, 'times array must be monotonically non-decreasing'),
);

// ---------------------------------------------------------------------------
// POI feature
// ---------------------------------------------------------------------------

export const POIPropertiesSchema = v.object({
    name: v.pipe(v.string(), v.minLength(1)),
    type: v.literal('poi'),
    category: v.pipe(v.string(), v.minLength(1)),
    label: v.optional(v.string()),
    defaultVisible: v.optional(v.boolean()),
});

export const POIFeatureSchema = v.object({
    type: v.literal('Feature'),
    geometry: v.object({
        type: v.literal('Point'),
        coordinates: v.tuple([LongitudeSchema, LatitudeSchema]),
    }),
    properties: POIPropertiesSchema,
});

// ---------------------------------------------------------------------------
// Feature union (discriminated by properties.type)
// ---------------------------------------------------------------------------

const FeatureSchema = v.variant('properties', [TrackFeatureSchema, POIFeatureSchema]);

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/**
 * Min/max range for a single attribute. min ≤ max enforced via v.check
 * (cross-field — TS schemas don't have native ordering combinators).
 */
export const AttributeRangeSchema = v.pipe(
    v.object({
        min: v.number(),
        max: v.number(),
        unit: v.optional(v.string()),
    }),
    v.check(({ min, max }) => min <= max, 'AttributeRange.min must be ≤ max'),
);

/**
 * Map of attribute name → range. Known keys (elevation, speed) are
 * documented for type ergonomics; arbitrary additional keys are allowed
 * because the library is generic over attribute names.
 *
 * v.record is the right combinator: it accepts any string key with a
 * matching value schema, and the inferred type is Record<string, ...>.
 */
export const AttributeRangesSchema = v.record(v.string(), AttributeRangeSchema);

export const TripStatsSchema = v.pipe(
    v.object({
        trackCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
        waypointCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
        dayCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
        transportModes: v.record(v.string(), v.pipe(v.number(), v.integer(), v.minValue(0))),
        dateRange: v.optional(
            v.pipe(
                v.object({
                    start: IsoDateSchema,
                    end: IsoDateSchema,
                }),
                v.check(
                    ({ start, end }) => start <= end,
                    'TripStats.dateRange.start must be ≤ end',
                ),
            ),
        ),
    }),
);

export const TripMetadataSchema = v.object({
    tripName: v.pipe(v.string(), v.minLength(1)),
    attributeRanges: AttributeRangesSchema,
    stats: v.optional(TripStatsSchema),
});

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export const TripDataSchema = v.object({
    type: v.literal('FeatureCollection'),
    metadata: TripMetadataSchema,
    features: v.array(FeatureSchema),
});
