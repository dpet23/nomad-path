import { describe, expect, it } from 'vitest';

import { validate, type ValidationFailure } from './validate';

/** Build a valid track Feature with overridable properties for capability tests. */
function trackFeature(props: Record<string, unknown> = {}, coordsLen = 2) {
    const coords: [number, number][] = [];
    for (let i = 0; i < coordsLen; i++) coords.push([i, i]);
    return {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: coords },
        properties: { type: 'track', name: 'Test', day: '2026-01-01', ...props },
    };
}

/** Wrap a list of features in a minimally-valid FeatureCollection envelope. */
function fc(features: unknown[], metadata: unknown = { tripName: 'Test' }) {
    return { type: 'FeatureCollection' as const, metadata, features };
}

/** Flatten failures into a single string for substring assertions. */
function flatten(failures: ValidationFailure[]): string {
    return failures
        .map(f => {
            if (f.kind === 'feature') return `features[${f.featureIndex}]: ${f.checks.join(', ')}`;
            return `${f.kind}: ${f.message}`;
        })
        .join('\n');
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('validate: happy path', () => {
    it('accepts a minimal valid FeatureCollection with one track', () => {
        const result = validate(fc([trackFeature()]));
        expect(result.ok).toBe(true);
    });

    it('accepts a track with all optional capability properties present', () => {
        const result = validate(
            fc([
                trackFeature({
                    transportMode: 'walk',
                    speeds: [10, null],
                    elevations: [100, 200],
                    sunAngles: [180, 90],
                }),
            ]),
        );
        expect(result.ok).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Envelope (geojsonhint) — kind: 'top-level'
// ---------------------------------------------------------------------------

describe('validate: envelope', () => {
    it('rejects input missing the type member', () => {
        const result = validate({ features: [] });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(flatten(result.failures)).toMatch(/type/i);
    });

    it('tags envelope errors with kind="top-level"', () => {
        const result = validate({ features: [] });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failures.every(f => f.kind === 'top-level')).toBe(true);
    });

    it('rejects features that is not an array', () => {
        const result = validate({ type: 'FeatureCollection', features: 'oops' });
        expect(result.ok).toBe(false);
    });

    it('rejects bad coordinate shape', () => {
        const bad = {
            type: 'FeatureCollection',
            metadata: { tripName: 'x' },
            features: [
                {
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: 'oops' },
                    properties: {},
                },
            ],
        };
        const result = validate(bad);
        expect(result.ok).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Metadata — kind: 'metadata'
// ---------------------------------------------------------------------------

describe('validate: metadata', () => {
    it('rejects missing metadata', () => {
        // Build inline to avoid default-parameter substitution in the fc() helper.
        const result = validate({
            type: 'FeatureCollection',
            features: [trackFeature()],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(flatten(result.failures)).toMatch(/metadata/);
    });

    it('tags metadata errors with kind="metadata"', () => {
        const result = validate({
            type: 'FeatureCollection',
            features: [trackFeature()],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.failures.some(f => f.kind === 'metadata')).toBe(true);
    });

    it('rejects empty tripName', () => {
        const result = validate(fc([trackFeature()], { tripName: '' }));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(flatten(result.failures)).toMatch(/tripName/);
    });

    it('rejects non-string tripName', () => {
        const result = validate(fc([trackFeature()], { tripName: 42 }));
        expect(result.ok).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Capability checks — kind: 'feature'
// ---------------------------------------------------------------------------

describe('validate: scalar capabilities', () => {
    it('rejects a track without day', () => {
        const result = validate(fc([trackFeature({ day: undefined })]));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(flatten(result.failures)).toMatch(/day.*required/);
    });

    it('accepts a track without transportMode (optional)', () => {
        const result = validate(fc([trackFeature({ transportMode: undefined })]));
        expect(result.ok).toBe(true);
    });

    it('rejects an empty-string day', () => {
        const result = validate(fc([trackFeature({ day: '' })]));
        expect(result.ok).toBe(false);
    });
});

describe('validate: parallel-array capabilities', () => {
    it('rejects speeds of wrong length', () => {
        const result = validate(fc([trackFeature({ speeds: [1, 2, 3] }, 2)]));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(flatten(result.failures)).toMatch(/length 3.*coordinates length 2/);
    });

    it('accepts null entries in speeds (nullable)', () => {
        const result = validate(fc([trackFeature({ speeds: [null, null] })]));
        expect(result.ok).toBe(true);
    });

    it('rejects null entries in elevations (not nullable)', () => {
        const result = validate(fc([trackFeature({ elevations: [100, null] })]));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(flatten(result.failures)).toMatch(/null not permitted/);
    });

    it('rejects non-finite entries', () => {
        const result = validate(fc([trackFeature({ elevations: [100, Infinity] })]));
        expect(result.ok).toBe(false);
    });

    it('rejects sunAngles out of range', () => {
        const result = validate(fc([trackFeature({ sunAngles: [0, 400] })]));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(flatten(result.failures)).toMatch(/400 out of range/);
    });

    it('accepts sunAngles at the boundary values 0 and 360', () => {
        const result = validate(fc([trackFeature({ sunAngles: [0, 360] })]));
        expect(result.ok).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Mixed features
// ---------------------------------------------------------------------------

describe('validate: mixed feature types', () => {
    it('ignores POI features (not capability-checked)', () => {
        const poi = {
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [0, 0] },
            properties: { type: 'poi', name: 'Hotel', category: 'accommodation' },
        };
        const result = validate(fc([trackFeature(), poi]));
        expect(result.ok).toBe(true);
    });

    it('identifies the failing feature by its index', () => {
        const result = validate(
            fc([trackFeature({ name: 'Good Track' }), trackFeature({ name: 'Bad Track', day: undefined })]),
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
            const featureFailures = result.failures.filter(f => f.kind === 'feature');
            expect(featureFailures).toHaveLength(1);
            if (featureFailures[0].kind === 'feature') {
                expect(featureFailures[0].featureIndex).toBe(1);
            }
        }
    });
});

// ---------------------------------------------------------------------------
// Failure grouping and structure (new in the discriminated-union shape)
// ---------------------------------------------------------------------------

describe('validate: failure grouping', () => {
    it('groups multiple failed checks on a single feature into one entry', () => {
        // Coords length 2, but speeds/elevations both have length 3 — two check failures on one feature.
        const result = validate(fc([trackFeature({ speeds: [1, 2, 3], elevations: [10, 20, 30] }, 2)]));
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.failures).toHaveLength(1);
            const f = result.failures[0];
            expect(f.kind).toBe('feature');
            if (f.kind === 'feature') {
                expect(f.featureIndex).toBe(0);
                expect(f.checks).toHaveLength(2);
                expect(f.checks.join(',')).toMatch(/speeds/);
                expect(f.checks.join(',')).toMatch(/elevations/);
            }
        }
    });

    it('emits one failure entry per failing feature, preserving index', () => {
        const result = validate(
            fc([
                trackFeature({ name: 'A', day: undefined }),
                trackFeature({ name: 'B', day: undefined }),
                trackFeature({ name: 'C' }), // ok
            ]),
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
            const featureFailures = result.failures.filter(f => f.kind === 'feature');
            expect(featureFailures).toHaveLength(2);
            const indices = featureFailures.map(f => (f.kind === 'feature' ? f.featureIndex : -1));
            expect(indices).toEqual([0, 1]);
        }
    });

    it('embeds the check name and detail in each checks[] entry', () => {
        // speeds of wrong length — message should include both "speeds" and the length detail.
        const result = validate(fc([trackFeature({ speeds: [1, 2, 3] }, 2)]));
        expect(result.ok).toBe(false);
        if (!result.ok) {
            const failure = result.failures.find(f => f.kind === 'feature');
            expect(failure).toBeDefined();
            if (failure?.kind === 'feature') {
                expect(failure.checks[0]).toMatch(/^speeds /);
                expect(failure.checks[0]).toMatch(/length 3/);
            }
        }
    });
});
