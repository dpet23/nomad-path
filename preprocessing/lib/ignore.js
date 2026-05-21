/**
 * Resolve the ignore list from a nomadpath.yaml config into a predicate
 * that both build-trip-data.js (recursive scan) and watch.js (chokidar)
 * can use to filter the same set of paths.
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
 * Malformed config (e.g. a string where a list was expected) throws
 * a descriptive Error rather than being silently dropped — a typo
 * that disables filtering is worse than a clear failure.
 */

import { readFileSync } from 'fs';
import { join, relative, sep } from 'path';
import picomatch from 'picomatch';
import { parse as parseYAML } from 'yaml';

/**
 * Read nomadpath.yaml from inputDir, validate the `ignore:` list, and
 * return a matcher predicate.
 *
 * Returns empty patterns + always-false predicate if no yaml file exists
 * or the yaml has no `ignore:` key.
 *
 * @param {string} inputDir   absolute path to the watched/scanned directory
 * @returns {{
 *   patterns: string[],
 *   shouldIgnore: (absPath: string) => boolean,
 * }}
 * @throws {Error} if `ignore` exists but is not an array of strings.
 */
export function loadIgnore(inputDir) {
    let parsed;
    try {
        parsed = parseYAML(readFileSync(join(inputDir, 'nomadpath.yaml'), 'utf8'));
    } catch (err) {
        if (err.code === 'ENOENT') return emptyResult();
        // Re-throw parse / IO errors — caller decides whether to surface or warn.
        // (build-trip-data.js's existing yaml block warns + continues; we
        // intentionally do the same shape here.)
        throw new Error(`failed to read ${join(inputDir, 'nomadpath.yaml')}: ${err.message}`);
    }

    if (!parsed || parsed.ignore === undefined || parsed.ignore === null) return emptyResult();

    const patterns = validatePatterns(parsed.ignore);
    if (patterns.length === 0) return emptyResult();

    return {
        patterns,
        shouldIgnore: buildMatcher(inputDir, patterns),
    };
}

function emptyResult() {
    return { patterns: [], shouldIgnore: () => false };
}

/**
 * Validate that the user's ignore value is a flat array of strings.
 * Throws with a message naming the offending value otherwise.
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
function validatePatterns(raw) {
    if (!Array.isArray(raw)) {
        throw new Error(
            `nomadpath.yaml: \`ignore\` must be a list of glob patterns; ` +
            `got ${describeType(raw)} (${JSON.stringify(raw)})`,
        );
    }
    for (let i = 0; i < raw.length; i++) {
        if (typeof raw[i] !== 'string') {
            throw new Error(
                `nomadpath.yaml: \`ignore[${i}]\` must be a string; ` +
                `got ${describeType(raw[i])} (${JSON.stringify(raw[i])})`,
            );
        }
        if (raw[i].length === 0) {
            throw new Error(`nomadpath.yaml: \`ignore[${i}]\` is an empty string`);
        }
    }
    return raw;
}

function describeType(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
}

/**
 * Build a predicate that matches a given pattern set against absolute
 * paths, treating each pattern as matching the directory AND its
 * descendants (chokidar convention).
 *
 * @param {string} inputDir
 * @param {string[]} patterns
 * @returns {(absPath: string) => boolean}
 */
function buildMatcher(inputDir, patterns) {
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
