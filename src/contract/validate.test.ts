import { describe, expect, it } from 'vitest';

import { validate } from './validate';

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
// Envelope (geojsonhint)
// ---------------------------------------------------------------------------

describe('validate: envelope', () => {
    it('rejects input missing the type member', () => {
        const result = validate({ features: [] });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.join('\n')).toMatch(/type/i);
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
// Metadata
// ---------------------------------------------------------------------------

describe('validate: metadata', () => {
    it('rejects missing metadata', () => {
        // Build inline to avoid default-parameter substitution in the fc() helper.
        const result = validate({
            type: 'FeatureCollection',
            features: [trackFeature()],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.join('\n')).toMatch(/metadata/);
    });

    it('rejects empty tripName', () => {
        const result = validate(fc([trackFeature()], { tripName: '' }));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.join('\n')).toMatch(/tripName/);
    });

    it('rejects non-string tripName', () => {
        const result = validate(fc([trackFeature()], { tripName: 42 }));
        expect(result.ok).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Capability checks
// ---------------------------------------------------------------------------

describe('validate: scalar capabilities', () => {
    it('rejects a track without day', () => {
        const result = validate(fc([trackFeature({ day: undefined })]));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.join('\n')).toMatch(/day.*required/);
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
        if (!result.ok) expect(result.errors.join('\n')).toMatch(/length 3.*coordinates length 2/);
    });

    it('accepts null entries in speeds (nullable)', () => {
        const result = validate(fc([trackFeature({ speeds: [null, null] })]));
        expect(result.ok).toBe(true);
    });

    it('rejects null entries in elevations (not nullable)', () => {
        const result = validate(fc([trackFeature({ elevations: [100, null] })]));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.join('\n')).toMatch(/null not permitted/);
    });

    it('rejects non-finite entries', () => {
        const result = validate(fc([trackFeature({ elevations: [100, Infinity] })]));
        expect(result.ok).toBe(false);
    });

    it('rejects sunAngles out of range', () => {
        const result = validate(fc([trackFeature({ sunAngles: [0, 400] })]));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.join('\n')).toMatch(/400 out of range/);
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

    it('identifies the failing track by its name and day', () => {
        const result = validate(
            fc([trackFeature({ name: 'Good Track' }), trackFeature({ name: 'Bad Track', day: undefined })]),
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.join('\n')).toMatch(/Bad Track/);
    });
});
