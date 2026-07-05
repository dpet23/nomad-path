// Subprocess smoke tests for real-bin wiring; build() logic is unit-tested in build.test.ts.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateTripData } from '@nomadpath/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.ts');

interface Run {
    status: number;
    stdout: string;
    stderr: string;
}

/** Run the CLI as a real subprocess; capture exit code and both streams. */
function run(args: string[]): Run {
    const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
    return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

function gpxTrack(name: string): string {
    return `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>${name}</name><trkseg>
    <trkpt lat="-54.501" lon="4.101"/><trkpt lat="-54.502" lon="4.102"/>
  </trkseg></trk>
</gpx>`;
}

let root: string;
beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nomadpath-cli-'));
});
afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

function write(relative: string, contents: string): void {
    const full = join(root, relative);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
}

describe('cli: arguments and success', () => {
    it('exits 0 and reports the feature count on stdout for a clean folder', () => {
        write('tracks/walk.gpx', gpxTrack('Walk'));
        const result = run([root]);
        expect(result.status).toBe(0);
        // Success status is info-level output -> stdout; stderr stays clean.
        expect(result.stdout).toMatch(/1 feature/);
        expect(result.stderr).toBe('');
    });

    it('exits 2 and complains on stderr when no input dir is given', () => {
        const result = run([]);
        expect(result.status).toBe(2);
        expect(result.stderr).toMatch(/missing required argument/i);
    });

    it('prints auto-generated help to stdout on --help and exits 0', () => {
        const result = run(['--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toMatch(/Usage: nomadpath-preprocess/);
        expect(result.stdout).toMatch(/--config/);
    });

    it('exits non-zero when the input dir does not exist', () => {
        const result = run([join(root, 'nope')]);
        expect(result.status).not.toBe(0);
    });
});

describe('cli: emit', () => {
    it('writes trip-data.json for a clean fixture folder and exits 0', () => {
        write('walk.gpx', gpxTrack('Walk'));
        const result = run([root]);
        expect(result.status).toBe(0);
        expect(existsSync(join(root, 'trip-data.json'))).toBe(true);
        const data: unknown = JSON.parse(readFileSync(join(root, 'trip-data.json'), 'utf8'));
        expect(validateTripData(data)).toEqual([]);
    });
});

// This block exercises the REAL shipped entry point - the installed `bin` symlink
// (node_modules/.bin/nomadpath-preprocess), which is how users and the watch-mode
// git hook actually invoke the tool. Every other test here spawns the SOURCE file
// (src/cli.ts) directly, so it takes a path production never takes: the entry-point
// guard distinguishes "run as entry" from "imported", and a symlink used to make a
// hand-rolled guard silently no-op the whole CLI via the bin - invisible to the
// source-path tests. This is really a packaged-executable / e2e-layer concern; it
// belongs in the future full-system e2e suite and should move there once that is
// designed. It lives here for now as the regression guard for that layer.
describe('cli: real bin invocation (packaged-executable layer)', () => {
    const BIN = join(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        '..',
        '..',
        'node_modules',
        '.bin',
        'nomadpath-preprocess',
    );

    /** Run the tool via its installed bin symlink, the way it actually ships. */
    function runBin(args: string[]): Run {
        const result = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
        return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
    }

    it('prints help and exits 0 when invoked through the bin symlink', () => {
        const result = runBin(['--help']);
        expect(result.status).toBe(0);
        expect(result.stdout).toMatch(/Usage: nomadpath-preprocess/);
    });

    it('builds a trip file when the real bin is run over a folder', () => {
        write('tracks/walk.gpx', gpxTrack('Walk'));
        const result = runBin([root]);
        expect(result.status).toBe(0);
        expect(existsSync(join(root, 'trip-data.json'))).toBe(true);
    });
});
