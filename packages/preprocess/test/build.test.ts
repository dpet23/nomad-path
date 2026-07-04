import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { validateTripData } from '@nomadpath/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { build } from '../src/build.ts';
import { CapturingLogger } from '../src/logger.ts';

let root: string;
beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nomadpath-build-'));
});
afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

function write(relative: string, contents: string): void {
    const full = join(root, relative);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
}

const gpx = (name: string): string =>
    `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">` +
    `<trk><name>${name}</name><trkseg>` +
    `<trkpt lat="-54.501" lon="4.101"/><trkpt lat="-54.502" lon="4.102"/>` +
    `</trkseg></trk></gpx>`;

// A KML polygon whose four-point outer ring is NOT closed (first position != last).
// It parses cleanly - the parser keeps rings verbatim, closing them is not its job -
// but the contract's semantic check rejects an open ring, so emit() throws on it.
const openPolygonKml = (name: string): string =>
    `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>` +
    `<Placemark><name>${name}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>` +
    `4.10,-54.50,0 4.20,-54.50,0 4.20,-54.60,0 4.15,-54.55,0` +
    `</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;

describe('build: output path', () => {
    it('writes <inputDir>/trip-data.json by default and exits 0', () => {
        write('walk.gpx', gpx('Walk'));
        const log = new CapturingLogger();
        const code = build(root, {}, log);
        expect(code).toBe(0);
        expect(existsSync(join(root, 'trip-data.json'))).toBe(true);
        expect(validateTripData(JSON.parse(readFileSync(join(root, 'trip-data.json'), 'utf8')))).toEqual([]);
    });

    it('writes trip-data.json INTO a directory passed as --out (the `-o .` case)', () => {
        write('walk.gpx', gpx('Walk'));
        const outDir = join(root, 'dist');
        mkdirSync(outDir);
        const code = build(root, { out: outDir }, new CapturingLogger());
        expect(code).toBe(0);
        expect(existsSync(join(outDir, 'trip-data.json'))).toBe(true);
        // The bug: it must NOT leave a stray '<dir>.tmp' or crash.
        expect(existsSync(`${outDir}.tmp`)).toBe(false);
    });

    it('writes to an exact file path when --out names a file', () => {
        write('walk.gpx', gpx('Walk'));
        const out = join(root, 'custom.json');
        const code = build(root, { out }, new CapturingLogger());
        expect(code).toBe(0);
        expect(existsSync(out)).toBe(true);
    });
});

describe('build: exit codes and logging', () => {
    it('returns 2 and logs an error when the input dir does not exist', () => {
        const log = new CapturingLogger();
        const code = build(join(root, 'nope'), {}, log);
        expect(code).toBe(2);
        expect(log.entries.some(e => e.level === 'error' && e.msg.includes('input dir not found'))).toBe(true);
    });

    it('returns 2 when an explicit --config is missing', () => {
        write('walk.gpx', gpx('Walk'));
        const log = new CapturingLogger();
        const code = build(root, { config: join(root, 'nope.yaml') }, log);
        expect(code).toBe(2);
        expect(log.entries.some(e => e.level === 'error' && e.msg.includes('config file not found'))).toBe(true);
    });

    it('returns 1 and writes nothing when a file has a hard parse error', () => {
        write('bad.gpx', '<gpx><trk></gpx>');
        const log = new CapturingLogger();
        const code = build(root, {}, log);
        expect(code).toBe(1);
        expect(existsSync(join(root, 'trip-data.json'))).toBe(false);
        expect(log.entries.some(e => e.level === 'error')).toBe(true);
    });

    it('returns 1 and writes nothing when a parsed feature fails contract validation at emit', () => {
        // Scans clean (no parse errors) but emit() throws because the polygon ring is open.
        write('area.kml', openPolygonKml('Open area'));
        const log = new CapturingLogger();
        const code = build(root, {}, log);
        expect(code).toBe(1);
        expect(existsSync(join(root, 'trip-data.json'))).toBe(false);
        expect(log.entries.some(e => e.level === 'error' && e.msg.includes('polygon ring must be closed'))).toBe(true);
    });

    it('logs the success status as info (stdout severity), not warn/error', () => {
        write('walk.gpx', gpx('Walk'));
        const log = new CapturingLogger();
        build(root, {}, log);
        const info = log.entries.filter(e => e.level === 'info');
        expect(info.some(e => e.msg.includes('1 feature'))).toBe(true);
    });

    it('warns (not fatal) about a config selector that matched nothing', () => {
        write('walk.gpx', gpx('Walk'));
        writeFileSync(join(root, 'nomadpath.yaml'), 'tracks:\n  ghost/: { hidden: true }\n');
        const log = new CapturingLogger();
        const code = build(root, {}, log);
        expect(code).toBe(0);
        expect(log.entries.some(e => e.level === 'warn' && e.msg.includes('ghost/'))).toBe(true);
    });
});
