// @vitest-environment node
//
// Unit tests for the shared ignore-resolution module. Both
// build-trip-data.js (recursive scan) and watch.js (chokidar) consume
// this module's predicate; pinning behaviour here keeps the two
// callers in sync.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CONFIG_FILE } from './config.js';
import { loadIgnore } from './ignore.js';

let tmp;

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'np-ignore-test-'));
});

afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
});

/** Write a config file to the temp input dir. */
function writeYaml(body) {
    writeFileSync(join(tmp, CONFIG_FILE), body);
}

// ---------------------------------------------------------------------------
// No / empty config
// ---------------------------------------------------------------------------

describe('loadIgnore -- no/empty config', () => {
    it('returns empty patterns + always-false predicate when no yaml file exists', () => {
        const { patterns, shouldIgnore } = loadIgnore(tmp);
        expect(patterns).toEqual([]);
        expect(shouldIgnore(join(tmp, 'anything.gpx'))).toBe(false);
        expect(shouldIgnore(join(tmp, '.git', 'HEAD'))).toBe(false);
    });

    it('returns empty when yaml exists but has no ignore: key', () => {
        writeYaml('groups:\n  flights: { hidden: true }\n');
        const { patterns, shouldIgnore } = loadIgnore(tmp);
        expect(patterns).toEqual([]);
        expect(shouldIgnore(join(tmp, '.git', 'HEAD'))).toBe(false);
    });

    it('returns empty when ignore is an empty list', () => {
        writeYaml('ignore: []\n');
        const { patterns, shouldIgnore } = loadIgnore(tmp);
        expect(patterns).toEqual([]);
        expect(shouldIgnore(join(tmp, '.git', 'HEAD'))).toBe(false);
    });

    it('returns empty when ignore is null', () => {
        writeYaml('ignore:\n');
        const { patterns, shouldIgnore } = loadIgnore(tmp);
        expect(patterns).toEqual([]);
        expect(shouldIgnore(join(tmp, '.git', 'HEAD'))).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Anchoring (root vs nested)
// ---------------------------------------------------------------------------

describe('loadIgnore -- anchored to input root', () => {
    it('ignores a root-level directory by name, including its descendants', () => {
        writeYaml('ignore:\n  - .git/\n');
        const { shouldIgnore } = loadIgnore(tmp);
        expect(shouldIgnore(join(tmp, '.git'))).toBe(true);
        expect(shouldIgnore(join(tmp, '.git', 'HEAD'))).toBe(true);
        expect(shouldIgnore(join(tmp, '.git', 'refs', 'heads', 'main'))).toBe(true);
    });

    it('does NOT match a nested directory of the same name (anchor enforced)', () => {
        writeYaml('ignore:\n  - .git/\n');
        const { shouldIgnore } = loadIgnore(tmp);
        expect(shouldIgnore(join(tmp, 'europe', '.git'))).toBe(false);
        expect(shouldIgnore(join(tmp, 'europe', '.git', 'HEAD'))).toBe(false);
    });

    it('trailing slash on the pattern is optional for directories', () => {
        writeYaml('ignore:\n  - .git\n');
        const { shouldIgnore } = loadIgnore(tmp);
        expect(shouldIgnore(join(tmp, '.git'))).toBe(true);
        expect(shouldIgnore(join(tmp, '.git', 'HEAD'))).toBe(true);
    });

    it('matches a root-level file', () => {
        writeYaml('ignore:\n  - Thumbs.db\n');
        const { shouldIgnore } = loadIgnore(tmp);
        expect(shouldIgnore(join(tmp, 'Thumbs.db'))).toBe(true);
        // Same filename, nested — anchor means no match.
        expect(shouldIgnore(join(tmp, 'sub', 'Thumbs.db'))).toBe(false);
    });

    it('matches at any depth with **/ prefix', () => {
        writeYaml('ignore:\n  - "**/*.swp"\n');
        const { shouldIgnore } = loadIgnore(tmp);
        expect(shouldIgnore(join(tmp, 'notes.swp'))).toBe(true);
        expect(shouldIgnore(join(tmp, 'europe', 'plan.swp'))).toBe(true);
        expect(shouldIgnore(join(tmp, 'a', 'b', 'c.swp'))).toBe(true);
        expect(shouldIgnore(join(tmp, 'notes.gpx'))).toBe(false);
    });

    it('combines multiple patterns with OR semantics', () => {
        writeYaml('ignore:\n  - .git/\n  - "**/*.swp"\n  - drafts/\n');
        const { shouldIgnore } = loadIgnore(tmp);
        expect(shouldIgnore(join(tmp, '.git', 'HEAD'))).toBe(true);
        expect(shouldIgnore(join(tmp, 'notes.swp'))).toBe(true);
        expect(shouldIgnore(join(tmp, 'drafts', 'mid-trip.gpx'))).toBe(true);
        // Things NOT in any pattern stay visible.
        expect(shouldIgnore(join(tmp, 'europe', 'day1.gpx'))).toBe(false);
    });

    it('does not match the input root itself', () => {
        // Even if the user wrote a pattern that would match `.`, we never
        // ignore the input directory itself; the caller walks INTO it.
        writeYaml('ignore:\n  - "**"\n');
        const { shouldIgnore } = loadIgnore(tmp);
        expect(shouldIgnore(tmp)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Malformed config — fail loudly
// ---------------------------------------------------------------------------

describe('loadIgnore -- malformed config throws', () => {
    it('throws when ignore is a string instead of a list', () => {
        writeYaml('ignore: drafts/\n');
        expect(() => loadIgnore(tmp)).toThrow(/ignore.*must be a list/);
    });

    it('throws when ignore is an object', () => {
        writeYaml('ignore:\n  drafts: true\n');
        expect(() => loadIgnore(tmp)).toThrow(/ignore.*must be a list/);
    });

    it('throws when an entry is not a string', () => {
        writeYaml('ignore:\n  - 42\n');
        expect(() => loadIgnore(tmp)).toThrow(/ignore\[0\].*must be a string/);
    });

    it('throws when an entry is an empty string', () => {
        writeYaml('ignore:\n  - ""\n');
        expect(() => loadIgnore(tmp)).toThrow(/ignore\[0\].*empty string/);
    });

    it('throws when an entry is null', () => {
        writeYaml('ignore:\n  - null\n  - .git/\n');
        expect(() => loadIgnore(tmp)).toThrow(/ignore\[0\].*must be a string/);
    });
});
