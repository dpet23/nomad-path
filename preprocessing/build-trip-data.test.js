// @vitest-environment node
//
// Script-level tests for preprocessing/build-trip-data.js.
//
// These tests spawn the script as a child process against ad-hoc input
// directories and assert exit code + filesystem state. They protect the
// load-bearing invariant of the preprocessing pipeline:
//
//     The output file is library-compatible-or-absent — never partial,
//     never stale. If a build cannot produce valid output, any prior
//     output must be removed before the script exits.
//
// Atomic-rename behaviour (no concurrent reader ever observes a partial
// JSON write) is verified at Level 4 (test/watch) where racing readers
// can be exercised. Here we cover the behavioural contract: success
// produces valid output, failure removes any previous output.

import { spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'build-trip-data.js');
const FIXTURES = join(HERE, 'fixtures');

/** Run the script. Returns { status, stdout, stderr }. */
function runBuild(args) {
    return spawnSync('node', [SCRIPT, ...args], {
        encoding: 'utf8',
        timeout: 15_000,
    });
}

let tmp;

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'np-build-test-'));
});

afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Success path
// ---------------------------------------------------------------------------

describe('successful build', () => {
    it('writes a valid GeoJSON file when input contains parseable tracks', () => {
        const input = join(tmp, 'input');
        mkdirSync(input);
        cpSync(join(FIXTURES, 'sample-track.gpx'), join(input, 'track.gpx'));
        const output = join(tmp, 'trip-data.geojson');

        const r = runBuild(['-i', input, '-o', output, '-n', 'Test Trip']);

        expect(r.status, r.stderr).toBe(0);
        expect(existsSync(output)).toBe(true);

        const json = JSON.parse(readFileSync(output, 'utf8'));
        expect(json.type).toBe('FeatureCollection');
        expect(json.metadata?.tripName).toBe('Test Trip');
        expect(Array.isArray(json.features)).toBe(true);
        expect(json.features.length).toBeGreaterThan(0);
    });

    it('overwrites an existing output file with new content', () => {
        const input = join(tmp, 'input');
        mkdirSync(input);
        cpSync(join(FIXTURES, 'sample-track.gpx'), join(input, 'track.gpx'));
        const output = join(tmp, 'trip-data.geojson');

        // Pre-existing stale file — must be replaced.
        writeFileSync(output, '{"stale": true}');

        const r = runBuild(['-i', input, '-o', output, '-n', 'Fresh Trip']);

        expect(r.status, r.stderr).toBe(0);
        const json = JSON.parse(readFileSync(output, 'utf8'));
        expect(json.metadata?.tripName).toBe('Fresh Trip');
        expect(json.stale).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Failure paths — invariant: output must be absent after any non-success exit.
//
// The script has two reachable failure exit points after `outputFile` is
// resolved (exits before that point have no output to clean up):
//
//   1. "Real parse failure" — an exception other than "Unsupported file format"
//      bubbling out of `parseFile`. Today no input produces this branch
//      naturally (only the "Unsupported file format" exception is thrown by
//      parsers; downstream lib code throws nothing). It's reachable only via
//      runtime crashes (e.g. previous tz-lookup bug). We don't synthesise a
//      crashing parser; the unlink path is exercised by the no-tracks tests
//      below, and Level 4 covers the broader invariant under arbitrary input.
//
//   2. "No tracks found" — input parses (or is skipped) but yields zero
//      tracks. Includes: empty dir, dir of only unsupported file types,
//      dir of malformed-but-parseable XML, dir of valid GPX with no <trk>.
//
// Each case below also pairs with a "no prior output" variant to ensure the
// unlink path is robust to ENOENT.
// ---------------------------------------------------------------------------

describe('no-tracks-found removes stale output', () => {
    it('exits non-zero AND deletes the prior output when input dir is empty', () => {
        const input = join(tmp, 'input');
        mkdirSync(input);
        const output = join(tmp, 'trip-data.geojson');

        writeFileSync(output, '{"stale": true}');
        expect(existsSync(output)).toBe(true);

        const r = runBuild(['-i', input, '-o', output]);

        expect(r.status).not.toBe(0);
        expect(existsSync(output)).toBe(false);
    });

    it('exits non-zero AND deletes the prior output when files are unsupported types', () => {
        const input = join(tmp, 'input');
        mkdirSync(input);
        writeFileSync(join(input, 'readme.txt'), 'not a gps file');
        writeFileSync(join(input, 'image.jpg'), 'not a gps file either');
        const output = join(tmp, 'trip-data.geojson');

        writeFileSync(output, '{"stale": true}');

        const r = runBuild(['-i', input, '-o', output]);

        expect(r.status).not.toBe(0);
        expect(existsSync(output)).toBe(false);
    });

    it('exits non-zero AND deletes the prior output when GPX/KML is malformed', () => {
        const input = join(tmp, 'input');
        mkdirSync(input);
        writeFileSync(join(input, 'broken.gpx'), '<gpx><not-closed>');
        const output = join(tmp, 'trip-data.geojson');

        writeFileSync(output, '{"stale": true}');

        const r = runBuild(['-i', input, '-o', output]);

        expect(r.status).not.toBe(0);
        expect(existsSync(output)).toBe(false);
    });

    it('does not crash when output does not exist on no-tracks-found', () => {
        const input = join(tmp, 'input');
        mkdirSync(input);
        const output = join(tmp, 'trip-data.geojson');

        const r = runBuild(['-i', input, '-o', output]);

        expect(r.status).not.toBe(0);
        expect(existsSync(output)).toBe(false);
        // ENOENT during unlink would surface here.
        expect(r.stderr).not.toMatch(/ENOENT|EACCES|cannot unlink/i);
    });
});
