import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config/schema.ts';
import { scanFolder, unmatchedSelectors } from '../src/scan.ts';

/** A minimal valid one-segment GPX track. */
function gpxTrack(name: string): string {
    return `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>${name}</name><trkseg>
    <trkpt lat="-54.501" lon="4.101"/><trkpt lat="-54.502" lon="4.102"/>
  </trkseg></trk>
</gpx>`;
}

/** A GPX waypoint file with a given folder value. */
function gpxWaypoint(folder: string): string {
    return `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="-54.6" lon="4.2"><name>Pin</name><folder>${folder}</folder></wpt>
</gpx>`;
}

/** A minimal KML point placemark. */
function kmlPoint(name: string): string {
    return `<?xml version="1.0"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark><name>${name}</name><Point><coordinates>4.2,-54.6,0</coordinates></Point></Placemark>
</Document></kml>`;
}

let root: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nomadpath-scan-'));
});
afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

/** Create a file at a POSIX-style relative path under the temp root, making parent dirs. */
function write(relative: string, contents: string): void {
    const full = join(root, relative);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, contents);
}

const EMPTY = loadConfig('', 'nomadpath.yaml');

describe('scanFolder: walking and dispatch', () => {
    it('parses gpx and kml files and ignores other extensions', () => {
        write('tracks/walk.gpx', gpxTrack('Walk'));
        write('flights/flight.kml', kmlPoint('Flight'));
        write('notes/readme.txt', 'not geodata');
        const result = scanFolder(root, EMPTY);
        expect(result.errors).toEqual([]);
        expect(result.features.map(f => f.name).sort((a, b) => (a ?? '').localeCompare(b ?? ''))).toEqual([
            'Flight',
            'Walk',
        ]);
    });

    it('recurses into nested subdirectories', () => {
        write('a/b/c/deep.gpx', gpxTrack('Deep'));
        const result = scanFolder(root, EMPTY);
        expect(result.features).toHaveLength(1);
        expect(result.features[0]?.name).toBe('Deep');
    });

    it('sets sourceFile to the POSIX path relative to the input root', () => {
        write('tracks/day1/walk.gpx', gpxTrack('Walk'));
        const result = scanFolder(root, EMPTY);
        expect(result.features[0]?.sourceFile).toBe('tracks/day1/walk.gpx');
    });

    it('produces a stable, path-sorted feature order across files', () => {
        write('b/second.gpx', gpxTrack('Second'));
        write('a/first.gpx', gpxTrack('First'));
        const result = scanFolder(root, EMPTY);
        expect(result.features.map(f => f.sourceFile)).toEqual(['a/first.gpx', 'b/second.gpx']);
    });
});

describe('scanFolder: ignore globs', () => {
    it('skips files matched by an ignore glob', () => {
        write('tracks/walk.gpx', gpxTrack('Walk'));
        write('tracks/walk.gpx.swp', gpxTrack('Editor swap'));
        const cfg = loadConfig("ignore:\n  - '**/*.swp'", 'nomadpath.yaml');
        const result = scanFolder(root, cfg);
        expect(result.features.map(f => f.name)).toEqual(['Walk']);
    });

    it('skips an entire ignored folder', () => {
        write('.git/config.gpx', gpxTrack('Git junk'));
        write('tracks/walk.gpx', gpxTrack('Walk'));
        const cfg = loadConfig('ignore:\n  - .git/', 'nomadpath.yaml');
        const result = scanFolder(root, cfg);
        expect(result.features.map(f => f.name)).toEqual(['Walk']);
    });
});

describe('scanFolder: error collection (never throws)', () => {
    it('collects a parse error for a malformed file and keeps going', () => {
        write('bad.gpx', '<gpx><trk></gpx>');
        write('good.gpx', gpxTrack('Good'));
        const result = scanFolder(root, EMPTY);
        expect(result.features.map(f => f.name)).toEqual(['Good']);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]?.sourceFile).toBe('bad.gpx');
    });

    it('returns zero features and zero errors for an empty folder', () => {
        const result = scanFolder(root, EMPTY);
        expect(result.features).toEqual([]);
        expect(result.errors).toEqual([]);
    });
});

describe('unmatchedSelectors: config keys that matched nothing', () => {
    it('flags a track selector that matched no scanned file', () => {
        write('tracks/walk.gpx', gpxTrack('Walk'));
        const cfg = loadConfig('tracks:\n  flights/: { hidden: true }', 'nomadpath.yaml');
        const result = scanFolder(root, cfg);
        expect(unmatchedSelectors(result, cfg)).toEqual(['tracks:flights/']);
    });

    it('does not flag a track selector that matched at least one file', () => {
        write('flights/qf1.kml', kmlPoint('QF1'));
        const cfg = loadConfig('tracks:\n  flights/: { hidden: true }', 'nomadpath.yaml');
        const result = scanFolder(root, cfg);
        expect(unmatchedSelectors(result, cfg)).toEqual([]);
    });

    it('flags a waypoint selector whose folder value appears in no feature', () => {
        write('wpts/places.gpx', gpxWaypoint('Restaurants'));
        const cfg = loadConfig('waypoints:\n  Accommodation: { hidden: true }', 'nomadpath.yaml');
        const result = scanFolder(root, cfg);
        expect(unmatchedSelectors(result, cfg)).toEqual(['waypoints:Accommodation']);
    });

    it('does not flag a waypoint selector whose folder value is present', () => {
        write('wpts/places.gpx', gpxWaypoint('Accommodation'));
        const cfg = loadConfig('waypoints:\n  Accommodation: { hidden: true }', 'nomadpath.yaml');
        const result = scanFolder(root, cfg);
        expect(unmatchedSelectors(result, cfg)).toEqual([]);
    });

    it('returns an empty list when every selector matched', () => {
        write('flights/qf1.kml', kmlPoint('QF1'));
        write('wpts/places.gpx', gpxWaypoint('Accommodation'));
        const cfg = loadConfig(
            'tracks:\n  flights/: { hidden: true }\nwaypoints:\n  Accommodation: { hidden: true }',
            'nomadpath.yaml',
        );
        const result = scanFolder(root, cfg);
        expect(unmatchedSelectors(result, cfg)).toEqual([]);
    });
});
