// @vitest-environment node
//
// Unit tests for the pure ignore-matcher builder. Both build-trip-data.js
// (recursive file scan) and watch.js (chokidar) call buildIgnoreMatcher
// with the same parsed `ignore:` value, so pinning behaviour here keeps
// the two callers in sync.

import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { buildIgnoreMatcher } from './ignore.js';

const ROOT = '/tmp/np-test-root';

// ---------------------------------------------------------------------------
// Empty / absent ignore list — predicate matches nothing
// ---------------------------------------------------------------------------

describe('buildIgnoreMatcher -- no patterns', () => {
    it('undefined ignore list yields a predicate that matches nothing', () => {
        const isIgnored = buildIgnoreMatcher(undefined, ROOT);
        expect(isIgnored(join(ROOT, 'anything.gpx'))).toBe(false);
        expect(isIgnored(join(ROOT, '.git', 'HEAD'))).toBe(false);
    });

    it('null ignore list yields a no-op predicate', () => {
        const isIgnored = buildIgnoreMatcher(null, ROOT);
        expect(isIgnored(join(ROOT, '.git', 'HEAD'))).toBe(false);
    });

    it('empty list yields a no-op predicate', () => {
        const isIgnored = buildIgnoreMatcher([], ROOT);
        expect(isIgnored(join(ROOT, '.git', 'HEAD'))).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Anchoring (root vs nested)
// ---------------------------------------------------------------------------

describe('buildIgnoreMatcher -- anchored to input root', () => {
    it('matches a root-level directory and its descendants', () => {
        const isIgnored = buildIgnoreMatcher(['.git/'], ROOT);
        expect(isIgnored(join(ROOT, '.git'))).toBe(true);
        expect(isIgnored(join(ROOT, '.git', 'HEAD'))).toBe(true);
        expect(isIgnored(join(ROOT, '.git', 'refs', 'heads', 'main'))).toBe(true);
    });

    it('does NOT match a nested directory of the same name (anchor enforced)', () => {
        const isIgnored = buildIgnoreMatcher(['.git/'], ROOT);
        expect(isIgnored(join(ROOT, 'europe', '.git'))).toBe(false);
        expect(isIgnored(join(ROOT, 'europe', '.git', 'HEAD'))).toBe(false);
    });

    it('trailing slash on the pattern is optional for directories', () => {
        const isIgnored = buildIgnoreMatcher(['.git'], ROOT);
        expect(isIgnored(join(ROOT, '.git'))).toBe(true);
        expect(isIgnored(join(ROOT, '.git', 'HEAD'))).toBe(true);
    });

    it('matches a root-level file by name only', () => {
        const isIgnored = buildIgnoreMatcher(['Thumbs.db'], ROOT);
        expect(isIgnored(join(ROOT, 'Thumbs.db'))).toBe(true);
        // Same filename nested — anchor means no match.
        expect(isIgnored(join(ROOT, 'sub', 'Thumbs.db'))).toBe(false);
    });

    it('matches at any depth with **/ prefix', () => {
        const isIgnored = buildIgnoreMatcher(['**/*.swp'], ROOT);
        expect(isIgnored(join(ROOT, 'notes.swp'))).toBe(true);
        expect(isIgnored(join(ROOT, 'europe', 'plan.swp'))).toBe(true);
        expect(isIgnored(join(ROOT, 'a', 'b', 'c.swp'))).toBe(true);
        expect(isIgnored(join(ROOT, 'notes.gpx'))).toBe(false);
    });

    it('combines multiple patterns with OR semantics', () => {
        const isIgnored = buildIgnoreMatcher(['.git/', '**/*.swp', 'drafts/'], ROOT);
        expect(isIgnored(join(ROOT, '.git', 'HEAD'))).toBe(true);
        expect(isIgnored(join(ROOT, 'notes.swp'))).toBe(true);
        expect(isIgnored(join(ROOT, 'drafts', 'mid-trip.gpx'))).toBe(true);
        // Things NOT in any pattern stay visible.
        expect(isIgnored(join(ROOT, 'europe', 'day1.gpx'))).toBe(false);
    });

    it('does not match the input root itself', () => {
        // Even with a pattern that would match `.`, we never ignore the
        // input directory itself; the caller walks INTO it.
        const isIgnored = buildIgnoreMatcher(['**'], ROOT);
        expect(isIgnored(ROOT)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Malformed input — fail loudly
// ---------------------------------------------------------------------------

describe('buildIgnoreMatcher -- malformed input throws', () => {
    it('throws when ignore is a string instead of a list', () => {
        expect(() => buildIgnoreMatcher('drafts/', ROOT)).toThrow(/ignore.*must be a list/);
    });

    it('throws when ignore is an object', () => {
        expect(() => buildIgnoreMatcher({ drafts: true }, ROOT)).toThrow(/ignore.*must be a list/);
    });

    it('throws when an entry is not a string', () => {
        expect(() => buildIgnoreMatcher([42], ROOT)).toThrow(/ignore\[0\].*must be a string/);
    });

    it('throws when an entry is an empty string', () => {
        expect(() => buildIgnoreMatcher([''], ROOT)).toThrow(/ignore\[0\].*empty string/);
    });

    it('throws when an entry is null', () => {
        expect(() => buildIgnoreMatcher([null, '.git/'], ROOT)).toThrow(/ignore\[0\].*must be a string/);
    });
});