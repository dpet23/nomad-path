/**
 * Runtime validator for trip-data.geojson. Preprocessing calls this before
 * atomic-rename; invalid output is rejected and the file is not written.
 *
 * Two checks:
 *   1. GeoJSON spec compliance via @mapbox/geojsonhint (RFC 7946).
 *   2. Capability requirements: iterate CAPABILITIES and run each entry's
 *      predicate against the matching property on every track feature.
 *
 * POI features are not capability-checked; capabilities describe colour
 * visualisations, which apply to tracks only.
 *
 * Returns a result object; never throws. The producer (this file) owns the
 * `ValidationResult` type definition; consumers import it via JSDoc or TS
 * imports rather than redeclaring the shape locally.
 */

// @ts-expect-error -- @mapbox/geojsonhint has no published type definitions.
import * as geojsonhint from '@mapbox/geojsonhint';
import type { Feature, FeatureCollection } from 'geojson';

import { CAPABILITIES } from './capabilities';

/**
 * One failure record. Discriminated union covering the three conceptual error
 * sources the validator distinguishes. Consumers switch on `kind` and render.
 *
 *  - `feature`:   a track feature failed one or more capability checks. The
 *                 validator returns only the feature index; mapping it to a
 *                 human-readable source (e.g. the input filename it was
 *                 parsed from) is the consumer's responsibility. Multiple
 *                 failed checks on the same feature collapse into one entry.
 *  - `top-level`: an RFC 7946 / GeoJSON envelope problem from geojsonhint.
 *                 Each hint message becomes its own entry.
 *  - `metadata`:  a problem with the FeatureCollection's `metadata` block
 *                 (e.g. missing or malformed `tripName`).
 */
export type ValidationFailure =
    | { kind: 'feature'; featureIndex: number; checks: string[] }
    | { kind: 'top-level'; message: string }
    | { kind: 'metadata'; message: string };

export type ValidationResult = { ok: true } | { ok: false; failures: ValidationFailure[] };

/** Run capability checks against a single track feature, recording any failures. */
function checkTrackFeature(feature: Feature, i: number, failures: ValidationFailure[]): void {
    const props = feature.properties;
    if (!props || props.type !== 'track') return;
    if (feature.geometry.type !== 'LineString') return;

    const coordsLen = feature.geometry.coordinates.length;
    const checks: string[] = [];

    for (const [name, cap] of Object.entries(CAPABILITIES)) {
        const value = (props as Record<string, unknown>)[name];

        if (value === undefined) {
            if (!('optional' in cap) || !cap.optional) checks.push(`${name} (required, but missing)`);
            continue;
        }

        const err = cap.check(value, { coordsLen, ...cap });
        if (err) checks.push(`${name} (${err})`);
    }

    if (checks.length > 0) failures.push({ kind: 'feature', featureIndex: i, checks });
}

/** Validate a trip-data.geojson value against the capability contract. */
export function validate(geojson: unknown): ValidationResult {
    const failures: ValidationFailure[] = [];

    const hintIssues: { message: string }[] = geojsonhint.hint(geojson);
    for (const issue of hintIssues) failures.push({ kind: 'top-level', message: issue.message });

    // Bail before deeper checks if the envelope is broken — features may
    // not be in array form, and indexing into it would throw.
    if (failures.length > 0) return { ok: false, failures };

    const fc = geojson as FeatureCollection & { metadata?: { tripName?: unknown } };

    if (!fc.metadata || typeof fc.metadata !== 'object') {
        failures.push({ kind: 'metadata', message: 'missing or not an object' });
    } else if (typeof fc.metadata.tripName !== 'string' || fc.metadata.tripName.length === 0) {
        failures.push({ kind: 'metadata', message: 'tripName missing or not a non-empty string' });
    }

    fc.features.forEach((feature, i) => checkTrackFeature(feature, i, failures));

    return failures.length === 0 ? { ok: true } : { ok: false, failures };
}
