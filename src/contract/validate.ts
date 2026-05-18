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
 * Returns a result object; never throws.
 */

// @ts-expect-error -- @mapbox/geojsonhint has no published type definitions.
import * as geojsonhint from '@mapbox/geojsonhint';
import type { Feature, FeatureCollection } from 'geojson';

import { CAPABILITIES } from './capabilities';

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

/** Identify a track for error messages: name + day key, or feature index when name is absent. */
function trackLabel(props: Record<string, unknown> | null, i: number): string {
    const name = typeof props?.name === 'string' && props.name.length > 0 ? props.name : `features[${i}]`;
    const day = typeof props?.day === 'string' && props.day.length > 0 ? ` (day: ${props.day})` : '';
    return `${name}${day}`;
}

/** Run capability checks against a single track feature, appending any errors. */
function checkTrackFeature(feature: Feature, i: number, errors: string[]): void {
    const props = feature.properties;
    if (!props || props.type !== 'track') return;
    if (feature.geometry.type !== 'LineString') return;

    const coordsLen = feature.geometry.coordinates.length;
    const label = trackLabel(props, i);

    for (const [name, cap] of Object.entries(CAPABILITIES)) {
        const value = (props as Record<string, unknown>)[name];

        if (value === undefined) {
            if (!('optional' in cap) || !cap.optional) errors.push(`${label}: ${name} is required, but missing`);
            continue;
        }

        const err = cap.check(value, { coordsLen, ...cap });
        if (err) errors.push(`${label}: ${name}: ${err}`);
    }
}

/** Validate a trip-data.geojson value against the capability contract. */
export function validate(geojson: unknown): ValidationResult {
    const errors: string[] = [];

    const hintIssues: { message: string }[] = geojsonhint.hint(geojson);
    for (const issue of hintIssues) errors.push(issue.message);

    // Bail before deeper checks if the envelope is broken — features may
    // not be in array form, and indexing into it would throw.
    if (errors.length > 0) return { ok: false, errors };

    const fc = geojson as FeatureCollection & { metadata?: { tripName?: unknown } };

    if (!fc.metadata || typeof fc.metadata !== 'object') {
        errors.push('metadata: missing or not an object');
    } else if (typeof fc.metadata.tripName !== 'string' || fc.metadata.tripName.length === 0) {
        errors.push('metadata.tripName: missing or not a non-empty string');
    }

    fc.features.forEach((feature, i) => checkTrackFeature(feature, i, errors));

    return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
