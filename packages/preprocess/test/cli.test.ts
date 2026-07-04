import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

describe('cli: hard errors abort with a full report', () => {
    it('exits non-zero and lists every parse error', () => {
        write('a/bad.gpx', '<gpx><trk></gpx>');
        write('b/also-bad.gpx', '<gpx><trk></gpx>');
        write('c/good.gpx', gpxTrack('Good'));
        const result = run([root]);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(/a\/bad\.gpx/);
        expect(result.stderr).toMatch(/b\/also-bad\.gpx/);
    });
});

describe('cli: unmatched config selectors warn but do not block', () => {
    it('exits 0 but warns on stderr about a selector that matched nothing', () => {
        write('tracks/walk.gpx', gpxTrack('Walk'));
        writeFileSync(join(root, 'nomadpath.yaml'), 'tracks:\n  flights/: { hidden: true }\n');
        const result = run([root]);
        expect(result.status).toBe(0);
        expect(result.stderr).toMatch(/flights\//);
        expect(result.stderr).toMatch(/matched no/i);
    });

    it('loads config from --config when given explicitly', () => {
        write('tracks/walk.gpx', gpxTrack('Walk'));
        const cfgPath = join(root, 'custom.yaml');
        writeFileSync(cfgPath, 'tracks:\n  ghost/: { hidden: true }\n');
        const result = run([root, '--config', cfgPath]);
        expect(result.status).toBe(0);
        expect(result.stderr).toMatch(/ghost\//);
    });
});
