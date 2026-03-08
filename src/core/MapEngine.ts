import bbox from '@turf/bbox';
import { featureCollection } from '@turf/helpers';
import type { Feature } from 'geojson';
import maplibregl, { type Map, type StyleSpecification } from 'maplibre-gl';

// ---------------------------------------------------------------------------
// Basemap registry
// ---------------------------------------------------------------------------

export type BasemapId = 'osm' | 'blueMarble';

interface BasemapConfig {
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
        style: 'https://tiles.openfreemap.org/styles/bright',
        minZoom: 0,
        maxZoom: 20,
        attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
    blueMarble: {
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
// Basemap switching
// ---------------------------------------------------------------------------

/**
 * Switch the active basemap. Clamps current zoom to the new basemap's limits.
 */
export function setBasemap(map: Map, basemapId: BasemapId): void {
    const basemap = BASEMAPS[basemapId];
    const currentZoom = map.getZoom();
    const clampedZoom = Math.min(Math.max(currentZoom, basemap.minZoom), basemap.maxZoom);

    map.setStyle(basemap.style);
    map.setMinZoom(basemap.minZoom);
    map.setMaxZoom(basemap.maxZoom);

    if (clampedZoom !== currentZoom) {
        map.once('style.load', () => map.setZoom(clampedZoom));
    }
}

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

/**
 * Fit the map viewport to a set of GeoJSON features using @turf/bbox.
 * No-ops if the features array is empty.
 */
export function fitToFeatures(map: Map, features: Feature[], padding = 40): void {
    if (features.length === 0) return;
    const [minLng, minLat, maxLng, maxLat] = bbox(featureCollection(features));
    map.fitBounds(
        [
            [minLng, minLat],
            [maxLng, maxLat],
        ],
        { padding },
    );
}
