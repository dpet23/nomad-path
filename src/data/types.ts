/**
 * Configuration object passed to TravelMap.create().
 */
export interface TravelMapConfig {
    /** ID of the HTML container element. */
    container: string;
    /** URLs to one or more trip-data.geojson files. */
    dataUrls: string[];
    /** Initial map bounds, or 'auto' to fit all visible tracks. */
    initialBounds?: 'auto' | [[number, number], [number, number]];
    /** Default basemap style. */
    defaultBasemap?: 'osm' | 'satellite' | 'terrain';
    /** Legend panel configuration. */
    legends?: LegendsConfig;
    /** Mobile layout configuration. */
    mobile?: MobileConfig;
}

/** Configuration for individual legend panels. */
export interface LegendsConfig {
    tracks?: LegendPanelConfig;
    attributes?: LegendPanelConfig;
    pois?: LegendPanelConfig;
}

/** Per-panel legend configuration. */
export interface LegendPanelConfig {
    position?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright';
    collapsed?: boolean;
}

/** Mobile layout configuration. */
export interface MobileConfig {
    legendMenu?: 'hamburger' | 'tabs' | 'stack';
}
