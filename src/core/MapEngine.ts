import bbox from '@turf/bbox';
import { featureCollection } from '@turf/helpers';
import type { Feature } from 'geojson';
import maplibregl, { type Map, type StyleSpecification } from 'maplibre-gl';

import { profile, PROFILING_ON } from '../profiling';

// ---------------------------------------------------------------------------
// Basemap registry
// ---------------------------------------------------------------------------

export type BasemapId = 'osm' | 'blueMarble';

interface BasemapConfig {
    /** Human-readable label shown in the basemap selector UI. */
    label: string;
    /** MapLibre style URL or inline style object. */
    style: string | StyleSpecification;
    minZoom: number;
    maxZoom: number;
    attribution: string;
}

/**
 * Build a minimal MapLibre style for NASA GIBS Blue Marble raster tiles.
 * The GIBS endpoint tops out at zoom 8; beyond that tiles are unavailable.
 */
function buildBlueMarbleStyle(): StyleSpecification {
    return {
        version: 8,
        // Required for any symbol layer using text-field (including our POI labels).
        // openfreemap uses /fonts/ (not /glyphs/) as the path prefix.
        glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
        sources: {
            'blue-marble': {
                type: 'raster',
                tiles: [
                    'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/' +
                        'BlueMarble_ShadedRelief_Bathymetry/default/' +
                        'GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
                ],
                tileSize: 256,
                minzoom: 0,
                maxzoom: 8,
            },
        },
        layers: [
            {
                id: 'blue-marble',
                type: 'raster',
                source: 'blue-marble',
            },
        ],
    };
}

export const BASEMAPS: Record<BasemapId, BasemapConfig> = {
    osm: {
        label: 'OpenStreetMap',
        style: 'https://tiles.openfreemap.org/styles/bright',
        minZoom: 0,
        maxZoom: 20,
        attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
    blueMarble: {
        label: 'Blue Marble',
        style: buildBlueMarbleStyle(),
        minZoom: 0,
        maxZoom: 8,
        attribution: 'Imagery courtesy of <a href="https://nasa.gov">NASA</a>',
    },
};

// ---------------------------------------------------------------------------
// Map initialisation
// ---------------------------------------------------------------------------

/**
 * Create and return a MapLibre Map instance for the given container.
 * The map is not yet ready for layer operations; await {@link waitForLoad}.
 */
export function createMap(container: string, basemapId: BasemapId = 'osm'): Map {
    const basemap = BASEMAPS[basemapId];
    return new maplibregl.Map({
        container,
        style: basemap.style,
        minZoom: basemap.minZoom,
        maxZoom: basemap.maxZoom,
        attributionControl: { customAttribution: basemap.attribution },
    });
}

/** Resolve when the map's style is fully loaded and ready for layer mutations. */
export function waitForLoad(map: Map): Promise<void> {
    return new Promise(resolve => {
        if (map.isStyleLoaded()) {
            resolve();
        } else {
            map.once('load', () => resolve());
        }
    });
}

// ---------------------------------------------------------------------------
// Profiling: to-first-frame timing (quarantined backend code)
// ---------------------------------------------------------------------------

/**
 * Run a synchronous map mutation and measure the time from the mutation to the
 * first MapLibre `render` event after it — "to first frame". Emits a
 * `performance.measure(<name>.firstFrame)` whose duration captures our JS plus
 * the backend's style recalc and first composited frame (which the synchronous
 * `profile()` measure around the mutation is blind to).
 *
 * IMPORTANT: this is FIRST-FRAME, explicitly NOT settle. The GPU keeps painting
 * for ~2s after this fires on a heavy action (rasterizing ~112k line segments);
 * the visible-segment count is the proxy for that ongoing cost, not this number.
 * Captured causally via the first `render` event — NOT by reading the private
 * `_styleDirty` flag, which a Stage 0 spike found is reset before the event
 * fires (and so reads unreliably). One-shot listener; no leak. Tile-independent
 * (a `render` fires for our change before tiles finish).
 *
 * The measure resolves on a later frame, so callers cannot await it — it is
 * fire-and-forget, which keeps the public action methods synchronous/chainable.
 *
 * This whole helper is gated by PROFILING_ON, so terser DCEs the render-wiring
 * out of the prod bundle entirely. Quarantined here because MapEngine is the
 * backend boundary — the only place that touches `map.once('render')`.
 */
export function measureToFirstFrame(map: Map, name: string, trigger: () => void): void {
    if (!PROFILING_ON) {
        trigger();
        return;
    }
    const startMark = `${name}.firstFrame:start`;
    performance.mark(startMark);
    trigger();
    map.once('render', () => {
        const endMark = `${name}.firstFrame:end`;
        performance.mark(endMark);
        performance.measure(`${name}.firstFrame`, startMark, endMark);
    });
}

/**
 * Measure a whole user action (a UI event handler) under one measure `name`:
 * the synchronous `action` is timed via `profile(name, …, detail)` AND bracketed
 * to its first composited frame via {@link measureToFirstFrame} (`name.firstFrame`).
 * `detail` is a thunk evaluated after the action, so post-action state (e.g. the
 * visible-segment count) is captured. Bracket at the UI handler so the measure
 * covers the entire action, not one storm-called mutator step. Prod-clean: both
 * halves fold away under `PROFILING_ON`.
 */
export function profileAction(
    map: Map,
    name: string,
    action: () => void,
    detail?: () => Record<string, unknown>,
): void {
    measureToFirstFrame(map, name, () => profile(name, action, detail));
}

// ---------------------------------------------------------------------------
// Basemap switching
// ---------------------------------------------------------------------------

/**
 * Switch the active basemap. Clamps current zoom to the new basemap's limits.
 */
export function setBasemap(map: Map, basemapId: BasemapId): void {
    const basemap = BASEMAPS[basemapId];

    map.setStyle(basemap.style);
    // setMinZoom/setMaxZoom clamp the current zoom automatically.
    map.setMinZoom(basemap.minZoom);
    map.setMaxZoom(basemap.maxZoom);
}

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

/**
 * Fit the map viewport to a set of GeoJSON features.
 *
 * Handles trips that cross the antimeridian (e.g. Australia → Hawaii): if the
 * raw bbox spans more than 180° of longitude, negative longitudes are shifted
 * by +360 so that MapLibre receives an unwrapped bbox and fits correctly.
 *
 * No-ops if the features array is empty.
 */
export function fitToFeatures(map: Map, features: Feature[], padding = 40): void {
    if (features.length === 0) return;
    const [minLng, minLat, maxLng, maxLat] = bbox(featureCollection(features));

    let west = minLng;
    let east = maxLng;

    if (east - west > 180) {
        // Likely an antimeridian-crossing trip. Shift negative longitudes by
        // +360 so the bbox stays contiguous (e.g. -161°W becomes 199°E).
        const lons: number[] = [];
        for (const f of features) {
            const geom = f.geometry;
            if (geom.type === 'LineString') {
                for (const [lon] of geom.coordinates as [number, number][]) lons.push(lon);
            } else if (geom.type === 'Point') {
                lons.push((geom.coordinates as [number, number])[0]);
            }
        }
        const shifted = lons.map(l => (l < 0 ? l + 360 : l));
        west = Math.min(...shifted);
        east = Math.max(...shifted);
    }

    map.fitBounds(
        [
            [west, minLat],
            [east, maxLat],
        ],
        { padding },
    );
}

/**
 * Fly the map to a single POI coordinate.
 *
 * @param map - MapLibre map instance
 * @param coords - [longitude, latitude] of the POI
 * @param zoom - target zoom level (default 14)
 */
export function fitToPOI(map: Map, coords: [number, number], zoom = 14): void {
    map.flyTo({ center: coords, zoom });
}
