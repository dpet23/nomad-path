// @vitest-environment node
//
// Meta-test on the library-test fixture (test/integration/fixture.geojson).
//
// CLAUDE.md "Fixture design principles": fixtures must use NON-OVERLAPPING
// attribute ranges per track so any hidden-track leakage is detectable by
// exact value. Without this guard, a future fixture edit (raising one
// track's speed range to overlap another) would silently weaken every
// range-based assertion in legends.spec.ts and map.spec.ts without
// breaking any test.
//
// This file pins the invariant on the fixture itself. If it fails, the
// fixture is wrong — fix the fixture, not the test.

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, 'fixture.geojson');

interface TrackProps {
    type: 'track';
    name: string;
    elevations?: (number | null)[];
    speeds?: (number | null)[];
}

interface Feature {
    properties: TrackProps | { type: string };
}

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { features: Feature[] };

const tracks: { name: string; elevations: number[]; speeds: number[] }[] = fixture.features
    .filter((f): f is Feature & { properties: TrackProps } => f.properties.type === 'track')
    .map((f) => ({
        name: f.properties.name,
        elevations: (f.properties.elevations ?? []).filter((v): v is number => v != null),
        speeds: (f.properties.speeds ?? []).filter((v): v is number => v != null),
    }));

function range(values: number[]): { min: number; max: number } {
    return { min: Math.min(...values), max: Math.max(...values) };
}

function overlaps(a: { min: number; max: number }, b: { min: number; max: number }): boolean {
    return a.min <= b.max && b.min <= a.max;
}

describe('test/integration/fixture.geojson — non-overlapping attribute ranges', () => {
    it('contains at least two tracks (otherwise the invariant is vacuous)', () => {
        expect(tracks.length).toBeGreaterThanOrEqual(2);
    });

    it('every pair of tracks has non-overlapping elevation ranges', () => {
        const offenders: string[] = [];
        for (let i = 0; i < tracks.length; i++) {
            for (let j = i + 1; j < tracks.length; j++) {
                if (tracks[i].elevations.length === 0 || tracks[j].elevations.length === 0) continue;
                const ri = range(tracks[i].elevations);
                const rj = range(tracks[j].elevations);
                if (overlaps(ri, rj)) {
                    offenders.push(
                        `"${tracks[i].name}" [${ri.min}, ${ri.max}] overlaps "${tracks[j].name}" [${rj.min}, ${rj.max}]`,
                    );
                }
            }
        }
        expect(offenders, offenders.join('; ')).toEqual([]);
    });

    it('every pair of tracks has non-overlapping speed ranges', () => {
        const offenders: string[] = [];
        for (let i = 0; i < tracks.length; i++) {
            for (let j = i + 1; j < tracks.length; j++) {
                if (tracks[i].speeds.length === 0 || tracks[j].speeds.length === 0) continue;
                const ri = range(tracks[i].speeds);
                const rj = range(tracks[j].speeds);
                if (overlaps(ri, rj)) {
                    offenders.push(
                        `"${tracks[i].name}" [${ri.min}, ${ri.max}] overlaps "${tracks[j].name}" [${rj.min}, ${rj.max}]`,
                    );
                }
            }
        }
        expect(offenders, offenders.join('; ')).toEqual([]);
    });
});
