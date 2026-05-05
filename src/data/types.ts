/**
 * Library-only types for runtime construction and UI configuration.
 *
 * These are NOT part of the on-disk geojson contract — they describe how
 * a library consumer constructs and configures a NomadPath instance at
 * runtime. The shared contract types live in schema/types.ts.
 */

/**
 * Configuration object passed to NomadPath.create().
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

/**
 * Mobile layout configuration.
 *
 * Note: currently defined but unused — wired through TravelMapConfig but no
 * consumer reads it. To be addressed in Epic 14 (library test remediation /
 * library improvements). Kept here to preserve the public-API surface until
 * that epic decides whether to wire it up or remove it.
 */
export interface MobileConfig {
    legendMenu?: 'hamburger' | 'tabs' | 'stack';
}
