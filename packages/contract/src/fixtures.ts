/**
 * Deterministic, fictional fixture builders for tests across all packages.
 *
 * All locations are invented (a fictional archipelago in the far south
 * Atlantic); never encode real trip data. Attribute ranges are deliberately
 * non-overlapping so assertions are unambiguous:
 *   speeds 1-2 m/s, elevations 100-200 m, times within 2030-01-15 UTC.
 */

import type { LineGeometry, PointGeometry, PolygonGeometry, TripData, TripItem } from './schema.ts';

/** 2030-01-15T08:00:00Z */
const BASE_TIME = 1894176000;

export function buildLineGeometry(overrides: Partial<LineGeometry> = {}): LineGeometry {
    return {
        type: 'line',
        lon: [4.101, 4.102, 4.104],
        lat: [-54.501, -54.502, -54.503],
        time: [BASE_TIME, BASE_TIME + 10, BASE_TIME + 20],
        ele: [100, 150, 200],
        speed: [1, 1.5, 2],
        ...overrides,
    };
}

export function buildPointGeometry(overrides: Partial<PointGeometry> = {}): PointGeometry {
    return {
        type: 'point',
        lon: 4.2,
        lat: -54.6,
        ...overrides,
    };
}

export function buildPolygonGeometry(overrides: Partial<PolygonGeometry> = {}): PolygonGeometry {
    return {
        type: 'polygon',
        lon: [4.1, 4.3, 4.3, 4.1, 4.1],
        lat: [-54.7, -54.7, -54.5, -54.5, -54.7],
        ...overrides,
    };
}

export function buildTrackItem(overrides: Partial<TripItem> = {}): TripItem {
    return {
        id: 'tracks/2030-01-15/morning-walk.gpx#trk0',
        name: 'Morning walk',
        panel: 'tracks',
        order: 0,
        transportMode: 'Walking',
        geometries: [buildLineGeometry()],
        ...overrides,
    };
}

export function buildWaypointItem(overrides: Partial<TripItem> = {}): TripItem {
    return {
        id: 'accommodation.gpx#wpt0',
        name: 'Harbour View Hotel',
        description: 'Fictional Isle, South Atlantic',
        panel: 'waypoints',
        groupLabel: 'Accommodation',
        order: 1,
        geometries: [buildPointGeometry()],
        ...overrides,
    };
}

export function buildTripData(overrides: Partial<TripData> = {}): TripData {
    return {
        version: 1,
        name: 'Fictional Archipelago 2030',
        items: [buildTrackItem(), buildWaypointItem()],
        ...overrides,
    };
}
