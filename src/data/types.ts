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

/**
 * Root GeoJSON FeatureCollection with embedded trip metadata.
 */
export interface TripData {
    type: 'FeatureCollection';
    metadata: TripMetadata;
    features: (TrackFeature | POIFeature)[];
}

/** Trip-level metadata embedded in the GeoJSON. */
export interface TripMetadata {
    tripName: string;
    attributeRanges: AttributeRanges;
}

/** Global min/max ranges for each continuous attribute. */
export interface AttributeRanges {
    elevation?: AttributeRange;
    speed?: AttributeRange;
    [key: string]: AttributeRange | undefined;
}

/** Min/max range for a single attribute. */
export interface AttributeRange {
    min: number;
    max: number;
    unit?: string;
}

/**
 * GeoJSON Feature representing a GPS track (LineString).
 */
export interface TrackFeature {
    type: 'Feature';
    geometry: {
        type: 'LineString';
        coordinates: ([number, number] | [number, number, number])[];
    };
    properties: TrackProperties;
}

/** Properties attached to a track feature. */
export interface TrackProperties {
    name: string;
    day: string;
    type: 'track';
    defaultVisible: boolean;
    transportMode?: 'walk' | 'drive' | 'flight' | 'boat' | string;
    /** Parallel array: Unix timestamps (ms) per point. */
    times?: number[];
    /** Parallel array: elevation (m) per point. */
    elevations?: number[];
    /** Parallel array: speed (km/h) per point. null where speed could not be determined. */
    speeds?: (number | null)[];
    /** Parallel array: solar altitude angle (degrees, −90 to +90) per point.
     *  Negative = below horizon (night), ~0 = dawn/dusk, positive = daytime.
     *  null entries indicate points with no timestamp. */
    sunAngles?: (number | null)[];
}

/**
 * GeoJSON Feature representing a Point of Interest.
 */
export interface POIFeature {
    type: 'Feature';
    geometry: {
        type: 'Point';
        coordinates: [number, number];
    };
    properties: POIProperties;
}

/** Properties attached to a POI feature. */
export interface POIProperties {
    name: string;
    type: 'poi';
    category: string;
    label?: string;
}
