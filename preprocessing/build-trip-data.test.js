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

    it('emits a [BUILD] Starting line on standalone runs', () => {
        const input = join(tmp, 'input');
        mkdirSync(input);
        cpSync(join(FIXTURES, 'sample-track.gpx'), join(input, 'track.gpx'));
        const output = join(tmp, OUTPUT_FILE);

        const r = runBuild(['-i', input, '-o', output, '-n', 'Test Trip']);

        expect(r.status, r.stderr).toBe(0);
        // [BUILD] is the first line of stdout — emitted before any parse/validate work.
        expect(r.stdout.split('\n')[0]).toBe('[BUILD] Starting');
    });

    it('emits [BUILD] Starting with cause when NOMADPATH_BUILD_CAUSE is set', () => {
        const input = join(tmp, 'input');
        mkdirSync(input);
        cpSync(join(FIXTURES, 'sample-track.gpx'), join(input, 'track.gpx'));
        const output = join(tmp, OUTPUT_FILE);

        const r = spawnSync('node', [SCRIPT, '-i', input, '-o', output, '-n', 'Test Trip'], {
            encoding: 'utf8',
            timeout: 15_000,
            env: {
                ...process.env,
                NOMADPATH_BUILD_CAUSE: JSON.stringify({ added: 3, changed: 1, removed: 0 }),
            },
        });

        expect(r.status, r.stderr).toBe(0);
        expect(r.stdout.split('\n')[0]).toBe('[BUILD] Starting | 3 added, 1 changed');
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
        // [OK] summary surfaces the skip breakdown with the extension bucket.
        expect(r.stdout).toMatch(/^\[OK\] /m);
        expect(r.stdout).toMatch(/1 skipped \(\.txt\)/);
    });

    it('appends a runtime token to the [OK] line', () => {
        const input = join(tmp, 'input');
        mkdirSync(input);
        cpSync(join(FIXTURES, 'sample-track.gpx'), join(input, 'track.gpx'));
        const output = join(tmp, OUTPUT_FILE);

        const r = runBuild(['-i', input, '-o', output, '-n', 'Test Trip']);

        expect(r.status, r.stderr).toBe(0);
        const okLine = r.stdout.split('\n').find(l => l.startsWith('[OK] '));
        expect(okLine).toBeDefined();
        // Runtime is the last `|`-separated field, formatted as `<N>ms` (integer)
        // or `<N.N>s` (one decimal).
        expect(okLine).toMatch(/\| (\d+ms|\d+\.\d+s)$/);
    });

    it('does not count its own output file as a skipped input', () => {
        // Regression: when -o points inside -i (the default when -o is
        // omitted, or when a previous run left an output behind), the file
        // walker used to re-discover the geojson and bucket it as `.geojson`
        // skipped. Output count was misleading and noisy.
        const input = join(tmp, 'input');
        mkdirSync(input);
        cpSync(join(FIXTURES, 'sample-track.gpx'), join(input, 'track.gpx'));
        // Output written inside the input dir.
        const output = join(input, 'trip-data.geojson');
        // Simulate a prior run by pre-creating the output file.
        writeFileSync(output, '{"type":"FeatureCollection","features":[]}');

        const r = runBuild(['-i', input, '-o', output]);

        expect(r.status, r.stderr).toBe(0);
        // Output is rewritten; the prior content is gone (atomic rename).
        // No skip clause at all — the walker must not see its own output.
        // (The [OK] line itself contains the output path, which ends in
        // .geojson — that's fine; we only care that there's no `skipped (...)`
        // clause naming the geojson bucket.)
        expect(r.stdout).toMatch(/^\[OK\] /m);
        expect(r.stdout).not.toMatch(/skipped/);
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
// ignore: list filters the recursive scan
//
// The `ignore:` key in nomadpath.yaml feeds buildIgnoreMatcher, which is
// applied INSIDE collectFiles before statSync / recursion. That means
// ignored directories (notably .git, which floods watch mode with events)
// are never opened, not just filtered out after the walk.
// ---------------------------------------------------------------------------

describe('nomadpath.yaml ignore: filters file collection', () => {
    /** Build a tmp input dir with a valid GPX, plus extra dirs/files
     *  that may or may not get ignored depending on the yaml config. */
    function setupTmpInput({ yaml }) {
        const input = join(tmp, 'input');
        mkdirSync(input);
        cpSync(join(FIXTURES, 'sample-track.gpx'), join(input, 'track.gpx'));
        // Drop a .git/HEAD and a drafts/scratch.gpx to test ignore patterns.
        mkdirSync(join(input, '.git'));
        writeFileSync(join(input, '.git', 'HEAD'), 'ref: refs/heads/main\n');
        mkdirSync(join(input, 'drafts'));
        cpSync(join(FIXTURES, 'sample-track.gpx'), join(input, 'drafts', 'mid-trip.gpx'));
        if (yaml !== null) writeFileSync(join(input, CONFIG_FILE), yaml);
        return input;
    }

    it('without ignore config, .git/HEAD is reached and produces an "Unsupported file format" warning', () => {
        // Sanity check pinning today's behaviour: with no ignore list, the
        // walker enters .git and hits HEAD as an unsupported file. The
        // config file itself is never counted as a skipped input.
        const input = setupTmpInput({ yaml: 'groups: {}\n' });
        const output = join(tmp, OUTPUT_FILE);

        const r = runBuild(['-i', input, '-o', output]);

        expect(r.status, r.stderr).toBe(0);
        // 2 GPX parsed (track.gpx + drafts/mid-trip.gpx), 1 unsupported (.git/HEAD)
        // — HEAD has no extension, so it lands in the `no-ext` bucket.
        expect(r.stdout).toMatch(/^\[OK\] /m);
        expect(r.stdout).toMatch(/1 skipped \(no-ext\)/);
    });

    it('with ignore: [.git/], the walker never opens .git', () => {
        const input = setupTmpInput({ yaml: 'ignore:\n  - .git/\n' });
        const output = join(tmp, OUTPUT_FILE);

        const r = runBuild(['-i', input, '-o', output]);

        expect(r.status, r.stderr).toBe(0);
        // .git is excluded entirely; only the 2 GPX files remain — no skips.
        expect(r.stdout).toMatch(/^\[OK\] /m);
        expect(r.stdout).not.toMatch(/skipped/);
    });

    it('with ignore: [drafts/], drafts subdir contents are excluded', () => {
        const input = setupTmpInput({ yaml: 'ignore:\n  - drafts/\n' });
        const output = join(tmp, OUTPUT_FILE);

        const r = runBuild(['-i', input, '-o', output]);

        expect(r.status, r.stderr).toBe(0);
        const json = JSON.parse(readFileSync(output, 'utf8'));
        const names = json.features.map(f => f.properties.name);
        // drafts/mid-trip.gpx must not be in the output.
        // (sample-track.gpx contains a track called "Morning Drive".)
        expect(names).toContain('Morning Drive');
        expect(names.filter(n => n === 'Morning Drive')).toHaveLength(1);
    });

    it('malformed ignore: (string instead of list) exits non-zero with a clear error', () => {
        const input = setupTmpInput({ yaml: 'ignore: drafts/\n' });
        const output = join(tmp, OUTPUT_FILE);

        const r = runBuild(['-i', input, '-o', output]);

        expect(r.status).not.toBe(0);
        expect(r.stderr).toMatch(/^\[FAIL\] Config: /m);
        expect(r.stderr).toMatch(/ignore.*must be a list/);
        // Invariant: failed builds leave no output.
        expect(existsSync(output)).toBe(false);
    });

    it('a non-string entry in ignore: also fails loudly with index', () => {
        const input = setupTmpInput({ yaml: 'ignore:\n  - 42\n' });
        const output = join(tmp, OUTPUT_FILE);

        const r = runBuild(['-i', input, '-o', output]);

        expect(r.status).not.toBe(0);
        expect(r.stderr).toMatch(/^\[FAIL\] Config: /m);
        expect(r.stderr).toMatch(/ignore\[0\].*must be a string/);
        expect(existsSync(output)).toBe(false);
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
        expect(yaml).toMatch(/ignore/);
    });

    it('seeds a non-empty default ignore list', () => {
        // The exact list is a UX choice that may shift over time; the
        // contract is that the template ships *some* defaults so a fresh
        // --init isn't a blank slate. Behaviour for the headline case
        // (.git filtered out of the box) is asserted end-to-end below.
        const input = join(tmp, 'input');
        mkdirSync(input);

        runBuild(['-i', input, '--init']);
        const parsed = parseYAML(readFileSync(join(input, CONFIG_FILE), 'utf8'));

        expect(Array.isArray(parsed.ignore)).toBe(true);
        expect(parsed.ignore.length).toBeGreaterThan(0);
    });

    it('default ignore list filters .git out of the box (end-to-end)', () => {
        // The reason this epic exists: a fresh --init template should
        // make watch mode immune to .git noise without any user edits.
        // Build pipeline mirror: --init then build with .git/HEAD and
        // a real GPX → 0 skipped, .git untouched.
        const input = join(tmp, 'input');
        mkdirSync(input);
        cpSync(join(FIXTURES, 'sample-track.gpx'), join(input, 'track.gpx'));
        mkdirSync(join(input, '.git'));
        writeFileSync(join(input, '.git', 'HEAD'), 'ref: refs/heads/main\n');

        const initR = runBuild(['-i', input, '--init']);
        expect(initR.status, initR.stderr).toBe(0);

        const output = join(tmp, OUTPUT_FILE);
        const buildR = runBuild(['-i', input, '-o', output]);
        expect(buildR.status, buildR.stderr).toBe(0);
        // Default ignore: list covers .git, so no skips. [OK] line has no skip clause.
        expect(buildR.stdout).toMatch(/^\[OK\] /m);
        expect(buildR.stdout).not.toMatch(/skipped/);
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
