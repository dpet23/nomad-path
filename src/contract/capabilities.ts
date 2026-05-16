/**
 * The capability map: one entry per visualisation the library can render.
 * Each entry declares what the renderer reads from a track's `properties`.
 * The validator (step c) iterates these declarations to check preprocessing
 * output before atomic-rename.
 *
 * Keys are the exact `track.properties` field names the renderer reads.
 * `ColourAttribute = keyof typeof CAPABILITIES`.
 *
 *   - kind SCALAR: a string-valued property on `track.properties`.
 *   - kind PARALLEL_ARRAY: a numeric array whose length equals
 *     `track.geometry.coordinates.length`.
 *   - optional: when true, validator accepts the property being absent.
 *   - nullable: when true, parallel-array entries may be null.
 *   - range: inclusive value bounds for numeric entries.
 */

export const REQUIREMENT_KIND = {
    SCALAR: 'scalar',
    PARALLEL_ARRAY: 'parallel-array',
} as const;

export const CAPABILITIES = {
    day: { kind: REQUIREMENT_KIND.SCALAR },
    transportMode: { kind: REQUIREMENT_KIND.SCALAR, optional: true },
    speeds: { kind: REQUIREMENT_KIND.PARALLEL_ARRAY, optional: true, nullable: true },
    elevations: { kind: REQUIREMENT_KIND.PARALLEL_ARRAY, optional: true },
    sunAngles: {
        kind: REQUIREMENT_KIND.PARALLEL_ARRAY,
        optional: true,
        nullable: true,
        range: { min: 0, max: 360 },
    },
} as const;
