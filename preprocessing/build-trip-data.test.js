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
// JSON write) is verified by the future watcher-tests epic, where racing
// readers can be exercised. Here we cover the behavioural contract:
// success produces valid output, failure removes any previous output.

import { spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse as parseYAML } from 'yaml';

import { CONFIG_FILE, OUTPUT_FILE } from './lib/config.js';

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
        const output = join(tmp, OUTPUT_FILE);

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
        const output = join(tmp, OUTPUT_FILE);

        // Pre-existing stale file — must be replaced.
        writeFileSync(output, '{"stale": true}');

        const r = runBuild(['-i', input, '-o', output, '-n', 'Fresh Trip']);

        expect(r.status, r.stderr).toBe(0);
        const json = JSON.parse(readFileSync(output, 'utf8'));
        expect(json.metadata?.tripName).toBe('Fresh Trip');
        expect(json.stale).toBeUndefined();
    });

    it('skips unsupported files and continues building from the parseable ones', () => {
        // docs/preprocessing.md:16 — "All other file types are skipped with a
        // warning." Pin the outer behaviour: a mixed input (valid GPX + an
        // unsupported file) must produce successful output containing the
        // GPX's data, with the skip count surfaced in the script's summary.
        const input = join(tmp, 'input');
        mkdirSync(input);
        cpSync(join(FIXTURES, 'sample-track.gpx'), join(input, 'track.gpx'));
        writeFileSync(join(input, 'notes.txt'), 'unrelated text file');
        const output = join(tmp, OUTPUT_FILE);

        const r = runBuild(['-i', input, '-o', output, '-n', 'Mixed Input Trip']);

        expect(r.status, r.stderr).toBe(0);
        expect(existsSync(output)).toBe(true);

        const json = JSON.parse(readFileSync(output, 'utf8'));
        expect(json.features.length).toBeGreaterThan(0);
        // The summary reports 1 parsed and 1 skipped.
        expect(r.stdout).toMatch(/1 file\(s\) parsed, 1 skipped/);
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
//      below, and the watcher-tests epic covers the broader invariant under
//      arbitrary input.
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
        const output = join(tmp, OUTPUT_FILE);

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
        const output = join(tmp, OUTPUT_FILE);

        writeFileSync(output, '{"stale": true}');

        const r = runBuild(['-i', input, '-o', output]);

        expect(r.status).not.toBe(0);
        expect(existsSync(output)).toBe(false);
    });

    it('exits non-zero AND deletes the prior output when GPX/KML is malformed', () => {
        const input = join(tmp, 'input');
        mkdirSync(input);
        writeFileSync(join(input, 'broken.gpx'), '<gpx><not-closed>');
        const output = join(tmp, OUTPUT_FILE);

        writeFileSync(output, '{"stale": true}');

        const r = runBuild(['-i', input, '-o', output]);

        expect(r.status).not.toBe(0);
        expect(existsSync(output)).toBe(false);
    });

    it('does not crash when output does not exist on no-tracks-found', () => {
        const input = join(tmp, 'input');
        mkdirSync(input);
        const output = join(tmp, OUTPUT_FILE);

        const r = runBuild(['-i', input, '-o', output]);

        expect(r.status).not.toBe(0);
        expect(existsSync(output)).toBe(false);
        // ENOENT during unlink would surface here.
        expect(r.stderr).not.toMatch(/ENOENT|EACCES|cannot unlink/i);
    });
});

// ---------------------------------------------------------------------------
// --init template generation
// ---------------------------------------------------------------------------

describe(`--init ${CONFIG_FILE} template`, () => {
    it(`writes ${CONFIG_FILE} at <input>/ and exits 0`, () => {
        const input = join(tmp, 'input');
        mkdirSync(input);

        const r = runBuild(['-i', input, '--init']);

        expect(r.status, r.stderr).toBe(0);
        expect(existsSync(join(input, CONFIG_FILE))).toBe(true);
    });

    it('includes the legend header listing all available settings', () => {
        const input = join(tmp, 'input');
        mkdirSync(input);

        runBuild(['-i', input, '--init']);
        const yaml = readFileSync(join(input, CONFIG_FILE), 'utf8');

        // Legend header must mention each setting by name so a user
        // editing on a phone (vim, no autocomplete) can read it in-file.
        expect(yaml).toMatch(/hidden/);
        expect(yaml).toMatch(/excludeFromAutoBounds/);
        expect(yaml).toMatch(/poi_categories/);
    });

    it('emits one uncommented `<subdir>: {}` line per immediate subdirectory, sorted', () => {
        const input = join(tmp, 'input');
        mkdirSync(input);
        // Create in non-alphabetical order to verify sorting.
        mkdirSync(join(input, 'flights-2025'));
        mkdirSync(join(input, 'drafts-2026'));
        mkdirSync(join(input, 'australia'));

        runBuild(['-i', input, '--init']);
        const yaml = readFileSync(join(input, CONFIG_FILE), 'utf8');

        // Each subdir appears as `  <name>: {}` (two-space indent under groups:).
        expect(yaml).toMatch(/^ {2}australia: \{\}$/m);
        expect(yaml).toMatch(/^ {2}drafts-2026: \{\}$/m);
        expect(yaml).toMatch(/^ {2}flights-2025: \{\}$/m);

        // Sorted order: australia < drafts-2026 < flights-2025.
        const a = yaml.indexOf('australia:');
        const d = yaml.indexOf('drafts-2026:');
        const f = yaml.indexOf('flights-2025:');
        expect(a).toBeGreaterThan(0);
        expect(a).toBeLessThan(d);
        expect(d).toBeLessThan(f);
    });

    it('skips hidden subdirectories (.git, .DS_Store, etc.)', () => {
        const input = join(tmp, 'input');
        mkdirSync(input);
        mkdirSync(join(input, '.git'));
        mkdirSync(join(input, '.cache'));
        mkdirSync(join(input, 'flights'));

        runBuild(['-i', input, '--init']);
        const yaml = readFileSync(join(input, CONFIG_FILE), 'utf8');

        expect(yaml).toMatch(/^ {2}flights: \{\}$/m);
        // Hidden dirs must not become group entries.
        expect(yaml).not.toMatch(/^ {2}\.git: /m);
        expect(yaml).not.toMatch(/^ {2}\.cache: /m);
    });

    it('falls back to a commented example entry when no subdirs exist', () => {
        const input = join(tmp, 'input');
        mkdirSync(input);

        runBuild(['-i', input, '--init']);
        const yaml = readFileSync(join(input, CONFIG_FILE), 'utf8');

        // No real entries; show the user what one would look like.
        expect(yaml).toMatch(/^ {2}#.*my-flights/m);
    });

    it('writes valid yaml that round-trips through the parser', () => {
        const input = join(tmp, 'input');
        mkdirSync(input);
        mkdirSync(join(input, 'flights-2025'));
        mkdirSync(join(input, 'drafts-2026'));

        runBuild(['-i', input, '--init']);
        const yaml = readFileSync(join(input, CONFIG_FILE), 'utf8');

        // Must parse without throwing, and yield the expected scaffold.
        const parsed = parseYAML(yaml);
        expect(parsed).toHaveProperty('groups');
        expect(parsed.groups).toHaveProperty('flights-2025');
        expect(parsed.groups).toHaveProperty('drafts-2026');
        // Empty body — `{}` in flow style — parses to empty object.
        expect(parsed.groups['flights-2025']).toEqual({});
    });
});

// ---------------------------------------------------------------------------
// Tilde expansion in path args
// ---------------------------------------------------------------------------
//
// The shell strips a leading ~ only when the arg is unquoted. Quoted args
// reach Node as a literal ~, which fs operations don't expand. Regression
// test: passing -i "~/<nonexistent>" must fail with an error that names
// the EXPANDED path (proving the helper ran before the fs lookup).

describe('tilde expansion in -i argument', () => {
    it('expands ~ before resolving the input directory', () => {
        // Use a long unlikely path so the "no such file" error from fs
        // names the home-expanded location. We expect a non-zero exit.
        const r = runBuild(['-i', '~/np-tilde-test-doesnt-exist']);

        expect(r.status).not.toBe(0);
        // The expanded form must appear in stderr; literal "~" must not
        // be relative to cwd in the error.
        expect(r.stderr).toContain(homedir());
        expect(r.stderr).not.toMatch(/[^a-zA-Z]~\/np-tilde-test-doesnt-exist/);
    });
});
