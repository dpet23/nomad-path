/**
 * The capability map: one entry per visualisation the library can render.
 * Each entry declares the property the renderer reads from a track's
 * `properties`, and a predicate that the validator runs against it.
 *
 * Keys are the exact `track.properties` field names the renderer reads.
 * `ColourAttribute = keyof typeof CAPABILITIES`.
 *
 *   - check: predicate run against the value (see ./checks).
 *   - optional: when true, validator accepts the property being absent.
 *   - entry / nullable: additional context passed to the predicate (used
 *     by isParallelArray).
 */

import { inRange, isFiniteNumber, isNonEmptyString, isParallelArray } from './checks';

export const CAPABILITIES = {
    day: { check: isNonEmptyString },
    transportMode: { check: isNonEmptyString, optional: true },
    speeds: { check: isParallelArray, entry: isFiniteNumber, nullable: true, optional: true },
    elevations: { check: isParallelArray, entry: isFiniteNumber, optional: true },
    sunAngles: { check: isParallelArray, entry: inRange(0, 360), nullable: true, optional: true },
} as const;
