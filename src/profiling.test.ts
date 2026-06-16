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
