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
    stats?: TripStats;
}

/** Summary statistics embedded in the GeoJSON metadata. */
export interface TripStats {
    /** Total number of GPS tracks. */
    trackCount: number;
    /** Total number of POI waypoints. */
    waypointCount: number;
    /** Number of unique calendar days covered (flight-day keys excluded). */
    dayCount: number;
    /** Track count per transport mode, e.g. { drive: 12, walk: 8, flight: 3 }. */
    transportModes: Record<string, number>;
    /** Earliest and latest date-string day keys (ISO date, flight keys excluded). */
    dateRange?: { start: string; end: string };
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
    /** When true, this track is excluded from the initial auto-fit bounds even if visible. */
    excludeFromAutoBounds?: boolean;
    transportMode?: 'walk' | 'drive' | 'flight' | 'boat' | string;
    /** Subfolder group this track belongs to (e.g. 'flights', 'disasters'), or null for root-level files. */
    group?: string | null;
    /** Parallel array: Unix timestamps (ms) per point. */
    times?: number[];
    /** Parallel array: elevation (m) per point. */
    elevations?: number[];
    /** Parallel array: speed (km/h) per point. null where speed could not be determined. */
    speeds?: (number | null)[];
    /** Parallel array: perceptual sun angle (0–360°) per point.
     *  0/360 = midnight, 90 = sunrise/sunset horizon, 180 = solar noon.
     *  Mapped from solar altitude via a piecewise twilight scale.
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
    /** Whether this POI's category is shown at map load. Defaults to true when absent. */
    defaultVisible?: boolean;
}
