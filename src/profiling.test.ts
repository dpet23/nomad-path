import { afterEach, describe, expect, it, vi } from 'vitest';

import { profile, profileAsync, PROFILING_ON } from './profiling';

describe('profile', () => {
    it('returns the wrapped function result', () => {
        expect(profile('x', () => 42)).toBe(42);
    });

    it('calls the wrapped function exactly once', () => {
        const fn = vi.fn(() => 'r');
        profile('x', fn);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('propagates thrown errors', () => {
        expect(() =>
            profile('x', () => {
                throw new Error('boom');
            }),
        ).toThrow('boom');
    });
});

describe('profileAsync', () => {
    it('resolves to the wrapped function result', async () => {
        await expect(profileAsync('x', async () => 42)).resolves.toBe(42);
    });

    it('propagates rejected promises', async () => {
        await expect(
            profileAsync('x', async () => {
                throw new Error('boom');
            }),
        ).rejects.toThrow('boom');
    });
});

// Under unit test NOMADPATH_PROFILING is defined `true` (vitest.config.ts), so
// the timed wrappers are live and emit measures. These assert the active path.
describe('timed path (profiling on)', () => {
    afterEach(() => performance.clearMeasures());

    it('runs with profiling enabled under test', () => {
        expect(PROFILING_ON).toBe(true);
    });

    it('emits a performance.measure named after the phase', () => {
        profile('nomadpath.test-phase', () => 1);
        const names = performance.getEntriesByType('measure').map(m => m.name);
        expect(names).toContain('nomadpath.test-phase');
    });

    it('emits a measure for an async phase', async () => {
        await profileAsync('nomadpath.test-async', async () => 1);
        const names = performance.getEntriesByType('measure').map(m => m.name);
        expect(names).toContain('nomadpath.test-async');
    });
});

describe('profile with detail payload', () => {
    afterEach(() => performance.clearMeasures());

    it('returns the wrapped function result', () => {
        expect(
            profile(
                'nomadpath.d',
                () => 99,
                () => ({ segments: 7 }),
            ),
        ).toBe(99);
    });

    it('attaches detail to the emitted measure entry', () => {
        profile(
            'nomadpath.detail-phase',
            () => 1,
            () => ({ segments: 112541 }),
        );
        const entry = performance.getEntriesByType('measure').find(m => m.name === 'nomadpath.detail-phase') as
            | PerformanceMeasure
            | undefined;
        expect(entry).toBeDefined();
        expect((entry!.detail as { segments: number }).segments).toBe(112541);
    });

    it('evaluates the detail thunk AFTER fn() — captures post-action state', () => {
        // Guards the stale-detail bug: detail must reflect state mutated by fn(),
        // not the value at call time. A plain (non-thunk) detail would capture 0.
        let count = 0;
        profile(
            'nomadpath.post-action',
            () => {
                count = 42; // the "action" mutates state
            },
            () => ({ segments: count }),
        );
        const entry = performance.getEntriesByType('measure').find(m => m.name === 'nomadpath.post-action') as
            | PerformanceMeasure
            | undefined;
        expect((entry!.detail as { segments: number }).segments).toBe(42);
    });

    it('omits detail cleanly when not provided', () => {
        profile('nomadpath.no-detail', () => 1);
        const entry = performance.getEntriesByType('measure').find(m => m.name === 'nomadpath.no-detail') as
            | PerformanceMeasure
            | undefined;
        expect(entry).toBeDefined();
        // No detail passed → entry.detail is null/undefined, not an error.
        expect(entry!.detail ?? null).toBeNull();
    });

    it('propagates thrown errors', () => {
        expect(() =>
            profile(
                'nomadpath.d',
                () => {
                    throw new Error('boom');
                },
                () => ({ segments: 0 }),
            ),
        ).toThrow('boom');
    });
});
