import { describe, expect, it, vi } from 'vitest';

import { profile, profileAsync } from './profiling';

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
