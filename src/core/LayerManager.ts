import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { ExpressionSpecification, FilterSpecification, Map as MaplibreMap } from 'maplibre-gl';

import type { AttributeRanges, POIFeature, TrackFeature, TripData } from '../data/types';
import { deriveTrackId } from './DataLoader';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported colour visualisation modes for track layers. */
export type ColourAttribute = 'day' | 'speed' | 'elevation' | 'sunAngle' | 'transportMode';

/** Properties stored on each segment feature (2-point LineString). */
interface SegmentProperties {
    trackId: string;
    day: string;
    dayIndex: number;
    transportMode: string;
    elevValue: number | null;
    speedValue: number | null;
    sunValue: number | null;
}

// ---------------------------------------------------------------------------
// MapLibre layer/source IDs
// ---------------------------------------------------------------------------

const TRACK_SOURCE = 'np-tracks';
const TRACK_LAYER = 'np-tracks-layer';
const POI_SOURCE = 'np-pois';
const POI_LAYER = 'np-pois-layer';
const POI_LABEL_LAYER = 'np-pois-labels';

// ---------------------------------------------------------------------------
// Transport mode colours (exported — usable by UI and colour expressions)
// ---------------------------------------------------------------------------

/**
 * Canonical colour map for transport modes.
 * Keys match the transportMode strings from TrackProperties.
 * The fallback colour is used for unknown/unlisted modes.
 */
export const TRANSPORT_MODE_COLOURS: Record<string, string> = {
    walk: '#4CAF50',
    drive: '#2196F3',
    flight: '#F44336',
    boat: '#00BCD4',
    cycling: '#FF9800',
    skiing: '#9C27B0',
};

/** Fallback colour for unrecognised transport modes. */
export const TRANSPORT_MODE_FALLBACK = '#9E9E9E';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Average two nullable numbers. Returns null if either value is absent.
 */
function avgNullable(a: number | null | undefined, b: number | null | undefined): number | null {
    if (a == null || b == null) return null;
    return (a + b) / 2;
}

/**
 * Merge an array of AttributeRanges objects into one, taking global min/max.
 */
function mergeRanges(rangesList: AttributeRanges[]): AttributeRanges {
    const merged: AttributeRanges = {};
    for (const ranges of rangesList) {
        for (const [key, range] of Object.entries(ranges)) {
            if (!range) continue;
            const existing = merged[key];
            if (existing) {
                merged[key] = {
                    min: Math.min(existing.min, range.min),
                    max: Math.max(existing.max, range.max),
                    unit: existing.unit,
                };
            } else {
                merged[key] = { ...range };
            }
        }
    }
    return merged;
}

// ---------------------------------------------------------------------------
// Segment building (pure, exported for testing)
// ---------------------------------------------------------------------------

/** Return value of {@link buildSegmentFeatures}. */
export interface SegmentBuildResult {
    featureCollection: FeatureCollection;
    /** Highest dayIndex value across all tracks. Used for colour interpolation. */
    maxDayIndex: number;
}

/**
 * Explode track features into consecutive 2-point segment features.
 *
 * All attribute values are embedded so that switching colour attribute only
 * requires a setPaintProperty call — no geometry rebuild needed.
 */
export function buildSegmentFeatures(tracks: TrackFeature[]): SegmentBuildResult {
    const days = [...new Set(tracks.map(t => t.properties.day))].sort();
    const dayIndexMap = new Map(days.map((d, i) => [d, i]));
    const maxDayIndex = Math.max(0, days.length - 1);

    const features: Feature<LineString, SegmentProperties>[] = [];

    for (const track of tracks) {
        const { day, transportMode, elevations, speeds, sunAngles } = track.properties;
        const coords = track.geometry.coordinates;
        const trackId = deriveTrackId(track);
        const dayIndex = dayIndexMap.get(day) ?? 0;

        for (let i = 0; i < coords.length - 1; i++) {
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [coords[i], coords[i + 1]],
                },
                properties: {
                    trackId,
                    day,
                    dayIndex,
                    transportMode: transportMode ?? 'drive',
                    elevValue: avgNullable(elevations?.[i], elevations?.[i + 1]),
                    speedValue: avgNullable(speeds?.[i], speeds?.[i + 1]),
                    sunValue: avgNullable(sunAngles?.[i], sunAngles?.[i + 1]),
                },
            });
        }
    }

    return { featureCollection: { type: 'FeatureCollection', features }, maxDayIndex };
}

// ---------------------------------------------------------------------------
// Colour expressions
// ---------------------------------------------------------------------------

const MISSING_COLOUR = '#9E9E9E';

// Rainbow spectrum: red (hue 0) at day 0, violet (hue 270) at the last day.
// Uses interpolate-hcl for perceptual uniformity across the hue range.
const DAY_COLOUR_START = 'hsl(0, 85%, 52%)'; // red
const DAY_COLOUR_END = 'hsl(270, 85%, 52%)'; // violet

// MapLibre's ExpressionSpecification is a complex discriminated union that
// TypeScript cannot verify from manually-built array literals. We cast via
// unknown — the runtime values are valid MapLibre expressions.
type MaplibreExpression = ExpressionSpecification | string;

/** Cast an unknown array literal to a MapLibre expression. */
const expr = (e: unknown): MaplibreExpression => e as MaplibreExpression;

/**
 * Build a MapLibre paint expression for the given colour attribute.
 *
 * @param attribute - which attribute to visualise
 * @param ranges - global min/max ranges from the GeoJSON metadata
 * @param maxDayIndex - highest day index in the data (for spectrum endpoints)
 */
export function buildColourExpression(
    attribute: ColourAttribute,
    ranges: AttributeRanges,
    maxDayIndex: number,
): MaplibreExpression {
    switch (attribute) {
        case 'day':
            // Single day: all red. Multi-day: spread across hue spectrum.
            if (maxDayIndex === 0) return DAY_COLOUR_START;
            return expr([
                'interpolate-hcl',
                ['linear'],
                ['get', 'dayIndex'],
                0,
                DAY_COLOUR_START,
                maxDayIndex,
                DAY_COLOUR_END,
            ]);

        case 'transportMode':
            return expr([
                'match',
                ['get', 'transportMode'],
                ...Object.entries(TRANSPORT_MODE_COLOURS).flat(),
                TRANSPORT_MODE_FALLBACK,
            ]);

        case 'speed': {
            const r = ranges.speed;
            if (!r) return MISSING_COLOUR;
            const mid = (r.min + r.max) / 2;
            return expr([
                'case',
                ['==', ['get', 'speedValue'], null],
                MISSING_COLOUR,
                ['interpolate', ['linear'], ['get', 'speedValue'], r.min, '#4CAF50', mid, '#FFEB3B', r.max, '#F44336'],
            ]);
        }

        case 'elevation': {
            const r = ranges.elevation;
            if (!r) return MISSING_COLOUR;
            const mid = (r.min + r.max) / 2;
            return expr([
                'case',
                ['==', ['get', 'elevValue'], null],
                MISSING_COLOUR,
                ['interpolate', ['linear'], ['get', 'elevValue'], r.min, '#2E7D32', mid, '#FDD835', r.max, '#FFFFFF'],
            ]);
        }

        case 'sunAngle':
            return expr([
                'case',
                ['==', ['get', 'sunValue'], null],
                MISSING_COLOUR,
                [
                    'interpolate',
                    ['linear'],
                    ['get', 'sunValue'],
                    0,
                    '#1A237E', // solar midnight
                    90,
                    '#FF6F00', // sunrise
                    180,
                    '#FDD835', // solar noon
                    270,
                    '#FF6F00', // sunset
                    360,
                    '#1A237E', // solar midnight (end)
                ],
            ]);
    }
}

// ---------------------------------------------------------------------------
// Visibility filter
// ---------------------------------------------------------------------------

/** Build a MapLibre filter expression matching features whose trackId is in the visible set. */
function buildVisibilityFilter(visibleIds: Set<string>): FilterSpecification {
    return ['in', ['get', 'trackId'], ['literal', [...visibleIds]]] as unknown as FilterSpecification;
}

// ---------------------------------------------------------------------------
// LayerManager
// ---------------------------------------------------------------------------

/**
 * Manages MapLibre sources and layers for track and POI rendering.
 *
 * Track segments are added once at initialisation with all attribute values
 * embedded. Switching colour attribute uses setPaintProperty (cheap); track
 * visibility uses setFilter on the shared track layer.
 */
export class LayerManager {
    private readonly _map: MaplibreMap;
    private _visibleIds = new Set<string>();
    private _colourAttribute: ColourAttribute = 'day';
    private _ranges: AttributeRanges = {};
    private _maxDayIndex = 0;

    /**
     * Create a LayerManager bound to the given MapLibre map instance.
     */
    constructor(map: MaplibreMap) {
        this._map = map;
    }

    /**
     * Add track and POI layers to the map from the loaded trip data.
     *
     * All tracks start visible. Must be called after the map has loaded.
     */
    addLayers(trips: TripData[]): void {
        const tracks = trips.flatMap(t => t.features.filter((f): f is TrackFeature => f.properties.type === 'track'));
        const pois = trips.flatMap(t => t.features.filter((f): f is POIFeature => f.properties.type === 'poi'));

        this._ranges = mergeRanges(trips.map(t => t.metadata.attributeRanges));
        this._visibleIds = new Set(tracks.map(deriveTrackId));

        const { featureCollection, maxDayIndex } = buildSegmentFeatures(tracks);
        this._maxDayIndex = maxDayIndex;

        this._map.addSource(TRACK_SOURCE, { type: 'geojson', data: featureCollection });
        this._map.addLayer({
            id: TRACK_LAYER,
            type: 'line',
            source: TRACK_SOURCE,
            filter: buildVisibilityFilter(this._visibleIds),
            paint: {
                'line-color': buildColourExpression('day', this._ranges, this._maxDayIndex) as ExpressionSpecification,
                'line-width': 3,
                'line-opacity': 0.8,
            },
            layout: {
                'line-cap': 'round',
                'line-join': 'round',
            },
        });

        if (pois.length > 0) {
            this._addPoiLayers(pois);
        }
    }

    /** Add circle and label layers for POI features. */
    private _addPoiLayers(pois: POIFeature[]): void {
        const poiGeoJSON: FeatureCollection<Point> = {
            type: 'FeatureCollection',
            features: pois.map(p => ({
                type: 'Feature',
                geometry: p.geometry,
                properties: p.properties,
            })),
        };
        this._map.addSource(POI_SOURCE, { type: 'geojson', data: poiGeoJSON });
        this._map.addLayer({
            id: POI_LAYER,
            type: 'circle',
            source: POI_SOURCE,
            paint: {
                'circle-radius': 6,
                'circle-color': '#FFD700',
                'circle-stroke-color': '#333',
                'circle-stroke-width': 1.5,
            },
        });
        this._map.addLayer({
            id: POI_LABEL_LAYER,
            type: 'symbol',
            source: POI_SOURCE,
            layout: {
                'text-field': ['get', 'name'],
                'text-size': 12,
                'text-offset': [0, 1.2],
                'text-anchor': 'top',
            },
            paint: {
                'text-color': '#333',
                'text-halo-color': '#fff',
                'text-halo-width': 1.5,
            },
        });
    }

    // ---------------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------------

    /**
     * Show or hide an individual track by its derived ID.
     */
    setTrackVisible(trackId: string, visible: boolean): void {
        if (visible) {
            this._visibleIds.add(trackId);
        } else {
            this._visibleIds.delete(trackId);
        }
        this._map.setFilter(TRACK_LAYER, buildVisibilityFilter(this._visibleIds));
    }

    /** Return true if the given track is currently visible. */
    isTrackVisible(trackId: string): boolean {
        return this._visibleIds.has(trackId);
    }

    /** Snapshot of currently visible track IDs — used to restore state after a basemap switch. */
    get visibleIds(): ReadonlySet<string> {
        return this._visibleIds;
    }

    /** Switch the colour attribute used to style the track layer. */
    setColourAttribute(attribute: ColourAttribute): void {
        this._colourAttribute = attribute;
        this._map.setPaintProperty(
            TRACK_LAYER,
            'line-color',
            buildColourExpression(attribute, this._ranges, this._maxDayIndex),
        );
    }

    /** The currently active colour attribute. */
    get colourAttribute(): ColourAttribute {
        return this._colourAttribute;
    }
}
