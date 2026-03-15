import type { Map as MaplibreMap } from 'maplibre-gl';

import { deriveTrackId, extractTracks, loadTripData } from './core/DataLoader';
import { type ColourAttribute, LayerManager, TRANSPORT_MODE_COLOURS } from './core/LayerManager';
import {
    type BasemapId,
    BASEMAPS,
    createMap,
    fitToFeatures,
    fitToPOI as engineFitToPOI,
    setBasemap as engineSetBasemap,
    waitForLoad,
} from './core/MapEngine';
import type { TravelMapConfig, TripData } from './data/types';
import { AttributeLegend } from './ui/AttributeLegend';
import { MapControls } from './ui/MapControls';
import { MobileMenu } from './ui/MobileMenu';
import { POILegend } from './ui/POILegend';
import { TrackLegend } from './ui/TrackLegend';
import type { UIContext } from './ui/UIContext';

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
/** Internal UI component references. */
/** References to the active legend UI components. */
interface UIComponents {
    trackLegend: TrackLegend;
    attrLegend: AttributeLegend;
    poiLegend: POILegend;
    mobileMenu: MobileMenu;
    mapControls: MapControls;
}

/**
 * A fully initialised Nomad Path map instance.
 * Obtain one via {@link NomadPath.create}.
 */
export class NomadPath {
    private readonly _map: MaplibreMap;
    private readonly _layers: LayerManager;
    private readonly _trips: TripData[];
    private _ui: UIComponents | null;

    /**
     * Private — use {@link NomadPath.create} to obtain an instance.
     *
     * @param map - initialised MapLibre map instance
     * @param layers - layer manager bound to the map
     * @param trips - loaded trip data
     * @param ui - optional UI component references
     */
    private constructor(map: MaplibreMap, layers: LayerManager, trips: TripData[], ui: UIComponents | null) {
        this._map = map;
        this._layers = layers;
        this._trips = trips;
        this._ui = ui;
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

        const instance = new NomadPath(map, layers, trips, null);

        // Wire legend UI if the map container element is available.
        const containerEl = map.getContainer();
        const ctx: UIContext = {
            map,
            layers,
            trips,
            fitToTrack: (trackId: string) => instance.fitToTrack(trackId),
            fitToTrackGroup: (trackIds: string[]) => instance.fitToTrackGroup(trackIds),
            fitToPOI: (coords: [number, number], zoom?: number) => engineFitToPOI(map, coords, zoom),
        };

        const legendCfg = config.legends ?? {};
        const attrLegend = new AttributeLegend(containerEl, ctx, legendCfg.attributes);
        const trackLegend = new TrackLegend(containerEl, ctx, legendCfg.tracks, {
            onVisibilityChange: () => {
                attrLegend.updateRanges(layers.visibleIds);
            },
        });
        const poiLegend = new POILegend(containerEl, ctx, legendCfg.pois);
        const mobileMenu = new MobileMenu(containerEl, [trackLegend, attrLegend, poiLegend]);
        const mapControls = new MapControls(
            containerEl,
            () => instance.fitToTracks(),
            id => instance.setBasemap(id),
            basemapId,
        );

        instance._ui = { trackLegend, attrLegend, poiLegend, mobileMenu, mapControls };

        return instance;
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
        const prevVisiblePOICategories = new Set(this._layers.visiblePOICategories);

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
            // Restore exact previous POI category visibility (bidirectional).
            for (const category of this._layers.visiblePOICategories) {
                if (!prevVisiblePOICategories.has(category)) {
                    this._layers.setPOICategoryVisible(category, false);
                }
            }
            for (const category of prevVisiblePOICategories) {
                if (!this._layers.visiblePOICategories.has(category)) {
                    this._layers.setPOICategoryVisible(category, true);
                }
            }
            // Recompute attribute ranges from the restored visible set so the
            // colour scale stays consistent with the visible tracks.
            this._ui?.attrLegend.updateRanges(this._layers.visibleIds);
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

    /** Return true if the given POI category is currently visible. */
    isPOICategoryVisible(category: string): boolean {
        return this._layers.isPOICategoryVisible(category);
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

    /** Fit the viewport to the track with the given ID. No-op if the ID is not found. */
    fitToTrack(trackId: string): this {
        const track = extractTracks(this._trips).find(t => deriveTrackId(t) === trackId);
        if (track) fitToFeatures(this._map, [track]);
        return this;
    }

    /** Fit the viewport to all tracks matching the given IDs. No-op if none are found. */
    fitToTrackGroup(trackIds: string[]): this {
        const ids = new Set(trackIds);
        const tracks = extractTracks(this._trips).filter(t => ids.has(deriveTrackId(t)));
        if (tracks.length > 0) fitToFeatures(this._map, tracks);
        return this;
    }

    /** Fit the viewport to all currently visible tracks, handling antimeridian crossings. */
    fitToTracks(padding = 40): this {
        const visibleTracks = extractTracks(this._trips).filter(
            t => this._layers.visibleIds.has(deriveTrackId(t)) && !t.properties.excludeFromAutoBounds,
        );
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
