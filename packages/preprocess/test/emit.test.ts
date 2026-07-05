import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validateTripData } from '@nomadpath/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { emit } from '../src/emit.ts';
import { buildRawFeature, buildRawLine, buildRawPoint } from '../src/fixtures.ts';

let dir: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nomadpath-emit-'));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

/** Read back the single emitted item for assertions. */
function emitOne(feature: ReturnType<typeof buildRawFeature>): Record<string, unknown> {
    const out = join(dir, 'trip-data.json');
    emit([feature], undefined, out);
    const data = JSON.parse(readFileSync(out, 'utf8')) as { items: Record<string, unknown>[] };
    const [item] = data.items;
    if (item === undefined) throw new Error('expected emitted data to contain one item');
    return item;
}

describe('emit', () => {
    it('projects activity to transportMode and preserves geometries', () => {
        const item = emitOne(buildRawFeature({ activity: 'Walking' }));
        expect(item.transportMode).toBe('Walking');
        expect(item.geometries).toEqual([buildRawLine()]);
    });

    it('carries folder through on a waypoint feature', () => {
        const item = emitOne(buildRawFeature({ folder: 'Accommodation', geometries: [buildRawPoint()] }));
        expect(item.folder).toBe('Accommodation');
    });

    it('does not emit provenance or any fabricated field', () => {
        const item = emitOne(buildRawFeature());
        for (const absent of ['id', 'panel', 'order', 'sourceFile', 'sourceIndex']) {
            expect(item).not.toHaveProperty(absent);
        }
    });

    it('omits transportMode when the feature has no activity', () => {
        const item = emitOne(buildRawFeature({ activity: undefined }));
        expect(item).not.toHaveProperty('transportMode');
    });

    it('omits name when the feature has none (no fabricated fallback)', () => {
        const item = emitOne(buildRawFeature({ name: undefined }));
        expect(item).not.toHaveProperty('name');
    });

    it('writes a file that round-trips through validateTripData', () => {
        const out = join(dir, 'trip-data.json');
        emit([buildRawFeature()], 'Trip', out);
        const reloaded: unknown = JSON.parse(readFileSync(out, 'utf8'));
        expect(validateTripData(reloaded)).toEqual([]);
    });

    it('writes compact JSON (no pretty-print whitespace)', () => {
        const out = join(dir, 'trip-data.json');
        emit([buildRawFeature()], undefined, out);
        expect(readFileSync(out, 'utf8')).not.toContain('\n  ');
    });

    it('throws and writes nothing when a geometry is invalid', () => {
        // A line whose lon/lat lengths differ fails semantic validation.
        const bad = buildRawFeature({ geometries: [buildRawLine({ lon: [4.1, 4.2, 4.3], lat: [-54.5, -54.6] })] });
        const out = join(dir, 'trip-data.json');
        expect(() => {
            emit([bad], undefined, out);
        }).toThrow(/invalid trip data/);
        expect(existsSync(out)).toBe(false);
    });

    it('leaves no temp file behind after a successful write', () => {
        emit([buildRawFeature()], undefined, join(dir, 'trip-data.json'));
        expect(readdirSync(dir)).toEqual(['trip-data.json']);
    });
});
