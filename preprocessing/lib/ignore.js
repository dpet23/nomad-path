/**
 * Build a predicate that tests paths against the user's ignore list.
 *
 * The ignore list comes from the nomadpath.yaml `ignore:` key (already
 * parsed; this module does no I/O). Both build-trip-data.js (recursive
 * scan) and watch.js (chokidar) call buildIgnoreMatcher with the same
 * parsed value so they honour identical patterns.
 *
 * Pattern semantics:
 *   - Globs (chokidar/picomatch compatible).
 *   - Anchored to the input root. The pattern "drafts/" matches
 *     <input>/drafts/ only; use "**\/drafts/" to match at any depth.
 *   - A pattern matching a directory also matches that directory's
 *     descendants, matching chokidar's ignored option behaviour.
 *     So ignore: [.git] excludes .git, .git/HEAD, .git/refs/... etc.,
 *     without the user having to write .git/**.
 *
 * Malformed input (e.g. a string where a list was expected) throws a
 * descriptive Error rather than being silently dropped — a typo that
 * disables filtering is worse than a clear failure.
 */

import { relative, sep } from 'path';
import picomatch from 'picomatch';

import { CONFIG_FILE } from './config.js';

/**
 * @param {unknown} rawIgnore   value of the `ignore:` key from a parsed
 *                              nomadpath.yaml, or undefined/null if absent
 * @param {string} inputDir     absolute path the predicate will test paths against
 * @returns {(absPath: string) => boolean}
 * @throws {Error} if rawIgnore is present but not an array of non-empty strings.
 */
export function buildIgnoreMatcher(rawIgnore, inputDir) {
    if (rawIgnore === undefined || rawIgnore === null) return noop;

    const patterns = validatePatterns(rawIgnore);
    if (patterns.length === 0) return noop;

    // Expand each user pattern to also match descendants, so users can
    // write `.git/` (or `.git`) and have it cover `.git/HEAD` too.
    const expanded = [];
    for (const p of patterns) {
        const trimmed = p.endsWith('/') ? p.slice(0, -1) : p;
        expanded.push(trimmed);
        if (!trimmed.endsWith('/**')) expanded.push(`${trimmed}/**`);
    }

    const matcher = picomatch(expanded, { dot: true, nocase: false });

    return (absPath) => {
        // Normalise to forward slashes; picomatch is POSIX-only.
        const rel = relative(inputDir, absPath).split(sep).join('/');
        // The input root itself (rel === '') is never ignored — caller
        // walks INTO inputDir so paths under it are what get tested.
        if (rel === '' || rel === '.') return false;
        return matcher(rel);
    };
}

function noop() {
    return false;
}

/**
 * Validate that rawIgnore is a flat array of non-empty strings.
 * Throws with a message naming the offending value otherwise.
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
function validatePatterns(raw) {
    if (!Array.isArray(raw)) {
        throw new Error(
            `${CONFIG_FILE}: \`ignore\` must be a list of glob patterns; ` +
            `got ${describeType(raw)} (${JSON.stringify(raw)})`,
        );
    }
    for (let i = 0; i < raw.length; i++) {
        if (typeof raw[i] !== 'string') {
            throw new Error(
                `${CONFIG_FILE}: \`ignore[${i}]\` must be a string; ` +
                `got ${describeType(raw[i])} (${JSON.stringify(raw[i])})`,
            );
        }
        if (raw[i].length === 0) {
            throw new Error(`${CONFIG_FILE}: \`ignore[${i}]\` is an empty string`);
        }
    }
    return raw;
}

function describeType(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
}