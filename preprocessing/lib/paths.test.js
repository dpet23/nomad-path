// @vitest-environment node
//
// Unit tests for the tilde-expansion helper.
//
// The shell normally strips ~ from unquoted args. Tests cover the
// quoted-arg path: Node receives a literal ~ and the helper expands it.

import { homedir } from 'os';
import { join, resolve } from 'path';
import { describe, expect, it } from 'vitest';

import { expandPath } from './paths.js';

const HOME = homedir();

describe('expandPath -- tilde expansion', () => {
    it('expands a bare ~ to the user home directory', () => {
        expect(expandPath('~')).toBe(HOME);
    });

    it('expands ~/foo to HOME/foo', () => {
        expect(expandPath('~/foo/bar')).toBe(join(HOME, 'foo', 'bar'));
    });

    it('leaves ~user/ unchanged (we do not resolve other users)', () => {
        // untildify only matches `~` followed by end-of-string, `/`, or `\`.
        // `~someone/foo` is left alone; path.resolve then treats it as a
        // relative path under cwd.
        expect(expandPath('~someone/foo')).toBe(resolve('~someone/foo'));
    });
});

describe('expandPath -- non-tilde paths preserve today\'s behaviour', () => {
    it('resolves a relative path against the current working directory', () => {
        expect(expandPath('./test/fixtures/map')).toBe(resolve('test/fixtures/map'));
    });

    it('passes an absolute path through unchanged', () => {
        expect(expandPath('/tmp/np-abs')).toBe('/tmp/np-abs');
    });

    it('resolves a bare relative name against cwd', () => {
        expect(expandPath('foo.gpx')).toBe(resolve('foo.gpx'));
    });
});

describe('expandPath -- nullish pass-through', () => {
    it('returns undefined for undefined input', () => {
        expect(expandPath(undefined)).toBeUndefined();
    });

    it('returns null for null input', () => {
        expect(expandPath(null)).toBeNull();
    });
});
