// Pipeline integration test: drives the real CLI over a real fixture folder on
// disk and re-validates the emitted file. Complements cli.test.ts (which
// exercises CLI argument/exit-code behaviour) by proving the whole raw-folder
// -> trip-data.json path produces contract-valid output for a realistic,
// multi-file, multi-subfolder trip.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateTripData } from '@nomadpath/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.ts');

function gpxTrack(name: string, points: readonly (readonly [lat: number, lon: number])[]): string {
    const trkpts = points
        .map(([lat, lon]) => `    <trkpt lat="${lat.toFixed(3)}" lon="${lon.toFixed(3)}"/>`)
        .join('\n');
    return `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>${name}</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>`;
}

let root: string;
beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nomadpath-pipeline-'));
});
afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

function write(relative: string, contents: string): void {
    const full = join(root, relative);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
}

describe('pipeline integration: raw folder -> validated trip file', () => {
    it('builds a multi-file, multi-subfolder trip folder into one valid trip-data.json', () => {
        const trackFiles: readonly (readonly [string, string])[] = [
            [
                'day1/morning.gpx',
                gpxTrack('Morning walk', [
                    [-54.501, 4.101],
                    [-54.502, 4.102],
                    [-54.503, 4.104],
                ]),
            ],
            [
                'day1/evening.gpx',
                gpxTrack('Evening walk', [
                    [-54.51, 4.11],
                    [-54.511, 4.112],
                ]),
            ],
            [
                'day2/hike.gpx',
                gpxTrack('Hike', [
                    [-54.52, 4.12],
                    [-54.521, 4.121],
                    [-54.522, 4.123],
                    [-54.523, 4.125],
                ]),
            ],
        ];
        for (const [relative, contents] of trackFiles) {
            write(relative, contents);
        }

        const result = spawnSync(process.execPath, [CLI, root], { encoding: 'utf8' });

        expect(result.status).toBe(0);

        const outPath = join(root, 'trip-data.json');
        expect(existsSync(outPath)).toBe(true);

        const data: unknown = JSON.parse(readFileSync(outPath, 'utf8'));
        expect(validateTripData(data)).toEqual([]);

        const items = (data as { items: unknown[] }).items;
        expect(items).toHaveLength(trackFiles.length);
    });
});
