import type { Map as MaplibreMap } from 'maplibre-gl';

import { deriveTrackId, extractTracks, loadTripData } from './core/DataLoader';
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
            const visibleTracks = extractTracks(trips).filter(
                t => layers.visibleIds.has(deriveTrackId(t)) && !t.properties.excludeFromAutoBounds,
            );
            fitToFeatures(map, visibleTracks);
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

        // MapLibre 4 does not emit a 'style.load' event after setStyle(). We use
        // 'styledata' instead, but avoid isStyleLoaded() — it returns false until
        // tiles finish loading, which may never happen in headless environments.
        //
        // Strategy: wait for our source to disappear (style cleared), then call
        // addLayers(). MapLibre's addSource internally checks style._loaded (not
        // tile-loading state), so it throws only if the style JSON isn't applied
        // yet. Catch and retry on the next styledata if that happens.
        const onStyleData = () => {
            if (this._map.getSource('np-tracks')) {
                // Old style still active — wait for the next styledata event.
                this._map.once('styledata', onStyleData);
                return;
            }
            try {
                this._layers.addLayers(this._trips);
            } catch {
                // Style JSON not yet applied — retry.
                this._map.once('styledata', onStyleData);
                return;
            }
            // Restore exact previous visibility for every track.
            for (const track of extractTracks(this._trips)) {
                const id = deriveTrackId(track);
                const wasVisible = prevVisibleIds.has(id);
                if (this._layers.isTrackVisible(id) !== wasVisible) {
                    this._layers.setTrackVisible(id, wasVisible);
                }
            }
            if (prevAttribute !== 'day') {
                this._layers.setColourAttribute(prevAttribute);
            }
        };

        this._map.once('styledata', onStyleData);
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
    // Viewport
    // ---------------------------------------------------------------------------

    /** Fit the viewport to all currently visible tracks, handling antimeridian crossings. */
    fitToTracks(padding = 40): this {
        const visibleTracks = extractTracks(this._trips).filter(t => this._layers.visibleIds.has(deriveTrackId(t)));
        fitToFeatures(this._map, visibleTracks, padding);
        return this;
    }

    // ---------------------------------------------------------------------------
    // Data access (for UI components in Epic 4)
    // ---------------------------------------------------------------------------

    /** Loaded trip data — available to UI components. */
    get trips(): TripData[] {
        return this._trips;
    }
}
