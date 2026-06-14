import { describe, expect, it, vi } from 'vitest';

import { profile, profileAsync, profileToRendered } from './profiling';

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

describe('profileToRendered', () => {
    // A minimal stand-in for the slice of the MapLibre map API the primitive
    // touches: one-shot `once('idle', cb)` and the matching `off`. In the test
    // (vitest) context NOMADPATH_PROFILING is undefined, so the primitive is the
    // identity passthrough — it must run the trigger and NEVER register a settle
    // listener. The timed behaviour (mark on idle, last-wins coalescing) is
    // exercised by the characterization perf test against the profiling bundle.
    const fakeMap = () => ({
        once: vi.fn(),
        off: vi.fn(),
    });

    it('returns the trigger result', () => {
        expect(profileToRendered('x', fakeMap(), () => 42)).toBe(42);
    });

    it('calls the trigger exactly once', () => {
        const trigger = vi.fn(() => 'r');
        profileToRendered('x', fakeMap(), trigger);
        expect(trigger).toHaveBeenCalledTimes(1);
    });

    it('propagates thrown errors', () => {
        expect(() =>
            profileToRendered('x', fakeMap(), () => {
                throw new Error('boom');
            }),
        ).toThrow('boom');
    });

    it('does not register a settle listener when profiling is off', () => {
        const map = fakeMap();
        profileToRendered('x', map, () => undefined);
        expect(map.once).not.toHaveBeenCalled();
    });
});
