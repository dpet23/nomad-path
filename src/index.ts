import type { Map as MaplibreMap } from 'maplibre-gl';

import { extractTracks, loadTripData } from './core/DataLoader';
import { type ColourAttribute, LayerManager, TRANSPORT_MODE_COLOURS } from './core/LayerManager';
import {
    type BasemapId,
    BASEMAPS,
    createMap,
    fitToFeatures,
    setBasemap as engineSetBasemap,
    waitForLoad,
} from './core/MapEngine';
import type { TravelMapConfig, TripData } from './data/types';

export type { AttributeRange, AttributeRanges, TravelMapConfig, TripData, TripMetadata } from './data/types';
export type { BasemapId, ColourAttribute };
export { BASEMAPS, TRANSPORT_MODE_COLOURS };

// ---------------------------------------------------------------------------
// NomadPath
// ---------------------------------------------------------------------------

/**
 * A fully initialised Nomad Path map instance.
 * Obtain one via {@link NomadPath.create}.
 */
export class NomadPath {
    private readonly _map: MaplibreMap;
    private readonly _layers: LayerManager;
    private readonly _trips: TripData[];

    /**
     * Private — use {@link NomadPath.create} to obtain an instance.
     *
     * @param map - initialised MapLibre map instance
     * @param layers - layer manager bound to the map
     * @param trips - loaded trip data
     */
    private constructor(map: MaplibreMap, layers: LayerManager, trips: TripData[]) {
        this._map = map;
        this._layers = layers;
        this._trips = trips;
    }

    /**
     * Initialise a Nomad Path map in the given container.
     *
     * @example
     * ```html
     * <div id="map" style="width: 100%; height: 60vh;"></div>
     * <script type="module">
     *   import { NomadPath } from './nomad-path.js';
     *   NomadPath.create({
     *     container: 'map',
     *     dataUrls: ['tracks/trip-data.geojson'],
     *   }).then(map => { console.log('ready'); });
     * </script>
     * ```
     */
    static async create(config: TravelMapConfig): Promise<NomadPath> {
        const basemapId = (config.defaultBasemap as BasemapId | undefined) ?? 'osm';

        // Load trip data and initialise the map in parallel
        const [trips, map] = await Promise.all([
            loadTripData(config.dataUrls),
            (async () => {
                const m = createMap(config.container, basemapId);
                await waitForLoad(m);
                return m;
            })(),
        ]);

        const layers = new LayerManager(map);
        layers.addLayers(trips);

        if ((config.initialBounds ?? 'auto') === 'auto') {
            fitToFeatures(map, extractTracks(trips));
        } else if (Array.isArray(config.initialBounds)) {
            const [[lat1, lng1], [lat2, lng2]] = config.initialBounds;
            map.fitBounds([
                [lng1, lat1],
                [lng2, lat2],
            ]);
        }

        return new NomadPath(map, layers, trips);
    }

    // ---------------------------------------------------------------------------
    // Basemap
    // ---------------------------------------------------------------------------

    /**
     * Switch the active basemap. Zoom is clamped to the new basemap's limits.
     * Track layers are automatically re-added after the style reloads.
     */
    setBasemap(basemapId: BasemapId): this {
        const prevAttribute = this._layers.colourAttribute;
        const prevVisibleIds = new Set(this._layers.visibleIds);

        // Register BEFORE setStyle: for inline styles (e.g. BlueMarble) the
        // style.load event can fire synchronously, before a post-call once() fires.
        this._map.once('style.load', () => {
            this._layers.addLayers(this._trips);
            // Restore previous visibility and colour state
            for (const id of this._layers.visibleIds) {
                if (!prevVisibleIds.has(id)) {
                    this._layers.setTrackVisible(id, false);
                }
            }
            if (prevAttribute !== 'day') {
                this._layers.setColourAttribute(prevAttribute);
            }
        });

        engineSetBasemap(this._map, basemapId);

        return this;
    }

    // ---------------------------------------------------------------------------
    // Track visibility
    // ---------------------------------------------------------------------------

    /** Show or hide a track by its derived ID. */
    setTrackVisible(trackId: string, visible: boolean): this {
        this._layers.setTrackVisible(trackId, visible);
        return this;
    }

    /** Return true if the given track is currently visible. */
    isTrackVisible(trackId: string): boolean {
        return this._layers.isTrackVisible(trackId);
    }

    // ---------------------------------------------------------------------------
    // Colour attribute
    // ---------------------------------------------------------------------------

    /** Switch the colour attribute used to style the track layer. */
    setColourAttribute(attribute: ColourAttribute): this {
        this._layers.setColourAttribute(attribute);
        return this;
    }

    /** The currently active colour attribute. */
    get colourAttribute(): ColourAttribute {
        return this._layers.colourAttribute;
    }

    // ---------------------------------------------------------------------------
    // Data access (for UI components in Epic 4)
    // ---------------------------------------------------------------------------

    /** Loaded trip data — available to UI components. */
    get trips(): TripData[] {
        return this._trips;
    }
}
