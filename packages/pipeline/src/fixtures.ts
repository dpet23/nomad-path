/**
 * Deterministic fictional fixtures for pipeline tests. Same rules as the
 * contract fixtures: invented locations only (the fictional south-Atlantic
 * archipelago), non-overlapping attribute ranges (speeds 1-2 m/s,
 * elevations 100-200 m), times within 2030-01-15 UTC.
 */

import type { RawFeature, RawLine, RawPoint } from './model.ts';

/** 2030-01-15T08:00:00Z */
export const FIXTURE_BASE_TIME = 1894176000;

export function buildRawLine(overrides: Partial<RawLine> = {}): RawLine {
    return {
        type: 'line',
        lon: [4.101, 4.102, 4.104],
        lat: [-54.501, -54.502, -54.503],
        time: [FIXTURE_BASE_TIME, FIXTURE_BASE_TIME + 10, FIXTURE_BASE_TIME + 20],
        ele: [100, 150, 200],
        speed: [1, 1.5, 2],
        ...overrides,
    };
}

export function buildRawPoint(overrides: Partial<RawPoint> = {}): RawPoint {
    return {
        type: 'point',
        lon: 4.2,
        lat: -54.6,
        ...overrides,
    };
}

export function buildRawFeature(overrides: Partial<RawFeature> = {}): RawFeature {
    return {
        sourceFile: 'tracks/2030-01-15/morning-walk.gpx',
        sourceIndex: 0,
        name: 'Morning walk',
        activity: 'Walking',
        geometries: [buildRawLine()],
        ...overrides,
    };
}
