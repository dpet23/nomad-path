import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { ExpressionSpecification, FilterSpecification, Map as MaplibreMap } from 'maplibre-gl';

import type { AttributeRange, AttributeRanges, POIFeature, TrackFeature, TripData } from '../contract/types';
import { profile, PROFILING_ON } from '../profiling';
import { buildColourExpression, type ColourAttribute, type MaplibreExpression } from '../styling/ColorRamps';
import { deriveTrackId } from './DataLoader';
import { measureToFirstFrame } from './MapEngine';

// Re-export for consumers that imported from LayerManager previously.
export type { ColourAttribute, MaplibreExpression };

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
// Labels use a separate source so glyph-loading (required by symbol layers) does
// not block the circle source from delivering tiles to np-pois-layer.
const POI_LABEL_SOURCE = 'np-pois-labels-src';
const POI_LABEL_LAYER = 'np-pois-labels';

// Re-export transport mode colours for consumers that imported from here.
export { TRANSPORT_MODE_COLOURS, TRANSPORT_MODE_FALLBACK } from '../styling/ColorRamps';

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
 * Circular average of two nullable angles in [0, 360].
 * Handles the midnight wraparound correctly (e.g. avg(350, 10) → 0, not 180).
 */
function avgCircular360(a: number | null | undefined, b: number | null | undefined): number | null {
    if (a == null || b == null) return null;
    const toRad = Math.PI / 180;
    const sinAvg = (Math.sin(a * toRad) + Math.sin(b * toRad)) / 2;
    const cosAvg = (Math.cos(a * toRad) + Math.cos(b * toRad)) / 2;
    let deg = Math.atan2(sinAvg, cosAvg) / toRad;
    if (deg < 0) deg += 360;
    return deg;
}

type Coord = [number, number] | [number, number, number];

/**
 * If a segment crosses the antimeridian (|dLon| > 180), split it at ±180°
 * and return the two boundary points [westBoundary, eastBoundary].
 *
 * Returns null for normal segments that don't cross.
 *
 * The boundary pair represents the same geographic location (the antimeridian)
 * as seen from each side: [180, lat] and [-180, lat]. Altitude is preserved
 * if both endpoints carry it.
 */
function antimeridianSplit(c1: Coord, c2: Coord): [Coord, Coord] | null {
    const dLon = c2[0] - c1[0];
    if (Math.abs(dLon) <= 180) return null;

    // Unwrap c2's longitude so we can linearly interpolate to the boundary.
    // Eastward crossing: c1 near 180°E, c2 near 180°W → unwrap c2 by +360
    // Westward crossing: c1 near 180°W, c2 near 180°E → unwrap c2 by -360
    const lon2Unwrapped = dLon < -180 ? c2[0] + 360 : c2[0] - 360;
    const boundaryLon = dLon < -180 ? 180 : -180;
    const t = (boundaryLon - c1[0]) / (lon2Unwrapped - c1[0]);
    const boundaryLat = c1[1] + t * (c2[1] - c1[1]);

    const a1 = c1.length === 3 ? c1[2] : undefined;
    const a2 = c2.length === 3 ? c2[2] : undefined;
    const boundary: Coord =
        a1 !== undefined && a2 !== undefined
            ? [boundaryLon, boundaryLat, a1 + t * (a2 - a1)]
            : [boundaryLon, boundaryLat];
    const mirrorBoundary: Coord =
        boundary.length === 3 ? [-boundaryLon, boundaryLat, boundary[2]] : [-boundaryLon, boundaryLat];

    // Return the boundary as seen from each side of the antimeridian.
    return [boundary, mirrorBoundary];
}

/**
 * Merge two AttributeRange objects on the same attribute key. Throws if their
 * units disagree — silently picking one would render the other trip with the
 * wrong colour scale.
 */
function mergeOneRange(key: string, existing: AttributeRange, incoming: AttributeRange): AttributeRange {
    if (existing.unit !== incoming.unit) {
        throw new Error(
            `Conflicting units for attribute "${key}" across trips: ` +
                `"${existing.unit ?? '(none)'}" vs "${incoming.unit ?? '(none)'}". ` +
                'Re-export the trips with matching units.',
        );
    }
    return {
        min: Math.min(existing.min, incoming.min),
        max: Math.max(existing.max, incoming.max),
        unit: existing.unit,
    };
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
            merged[key] = existing ? mergeOneRange(key, existing, range) : { ...range };
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
    /**
     * Number of rendered segments contributed by each track, keyed by derived
     * trackId. Antimeridian-crossing segments count as the two sub-segments they
     * become. Summed over a visible set this is the count the backend must paint
     * — the proxy for GPU paint cost (see profiling epic).
     *
     * Profiling-only: `undefined` in the prod build (the whole counting structure
     * is gated behind NOMADPATH_PROFILING and terser-DCE'd away).
     */
    segmentsByTrack?: Map<string, number>;
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
    // Profiling-only; gated so the whole counting structure DCEs from prod.
    const segmentsByTrack = PROFILING_ON ? new Map<string, number>() : undefined;

    for (const track of tracks) {
        const { day, transportMode, elevations, speeds, sunAngles } = track.properties;
        const coords = track.geometry.coordinates;
        const trackId = deriveTrackId(track);
        const dayIndex = dayIndexMap.get(day) ?? 0;
        // Profiling-only: track where this track's segments begin so we can count
        // them. Gated so terser DCEs the counting from the prod bundle entirely.
        const beforeCount = PROFILING_ON ? features.length : 0;

        for (let i = 0; i < coords.length - 1; i++) {
            const props: SegmentProperties = {
                trackId,
                day,
                dayIndex,
                transportMode: transportMode ?? 'drive',
                elevValue: avgNullable(elevations?.[i], elevations?.[i + 1]),
                speedValue: avgNullable(speeds?.[i], speeds?.[i + 1]),
                sunValue: avgCircular360(sunAngles?.[i], sunAngles?.[i + 1]),
            };

            const split = antimeridianSplit(coords[i], coords[i + 1]);
            if (split) {
                // Antimeridian crossing: emit two sub-segments, one on each side.
                const [boundaryA, boundaryB] = split;
                features.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: [coords[i], boundaryA] },
                    properties: props,
                });
                features.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: [boundaryB, coords[i + 1]] },
                    properties: props,
                });
            } else {
                features.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: [coords[i], coords[i + 1]] },
                    properties: props,
                });
            }
        }

        // Profiling-only (gated for prod-cleanliness). Accumulate (not set): a
        // duplicate (day, name) track ID would otherwise clobber the earlier
        // track's contribution.
        if (segmentsByTrack) {
            const added = features.length - beforeCount;
            segmentsByTrack.set(trackId, (segmentsByTrack.get(trackId) ?? 0) + added);
        }
    }

    return { featureCollection: { type: 'FeatureCollection', features }, maxDayIndex, segmentsByTrack };
}

// ---------------------------------------------------------------------------
// Visibility filter
// ---------------------------------------------------------------------------

/** Build a MapLibre filter expression matching features whose trackId is in the visible set. */
function buildVisibilityFilter(visibleIds: Set<string>): FilterSpecification {
    return ['in', ['get', 'trackId'], ['literal', [...visibleIds]]] as unknown as FilterSpecification;
}

/** Build a MapLibre filter expression showing only features whose category is visible. */
function buildPOICategoryFilter(visibleCategories: Set<string>): FilterSpecification {
    return ['in', ['get', 'category'], ['literal', [...visibleCategories]]] as unknown as FilterSpecification;
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
    private _visiblePOICategories = new Set<string>();
    private _colourAttribute: ColourAttribute = 'day';
    private _ranges: AttributeRanges = {};
    private _maxDayIndex = 0;
    /**
     * Per-track rendered-segment counts, populated during addLayers.
     * Profiling-only: stays undefined in the prod build (gated + DCE'd).
     */
    private _segmentsByTrack: Map<string, number> | undefined;

    /**
     * Create a LayerManager bound to the given MapLibre map instance.
     */
    constructor(map: MaplibreMap) {
        this._map = map;
    }

    /**
     * Add track and POI layers to the map from the loaded trip data.
     *
     * Tracks with `hidden: true` start hidden. Must be called after the
     * map's style has loaded.
     */
    addLayers(trips: TripData[]): void {
        const tracks = trips.flatMap(t => t.features.filter((f): f is TrackFeature => f.properties.type === 'track'));
        const pois = trips.flatMap(t => t.features.filter((f): f is POIFeature => f.properties.type === 'poi'));

        // Defensive cleanup: setStyle() clears sources/layers, but guard against
        // any case where they still exist (e.g. race conditions or double calls).
        for (const id of [POI_LABEL_LAYER, POI_LAYER, TRACK_LAYER]) {
            if (this._map.getLayer(id)) this._map.removeLayer(id);
        }
        for (const id of [POI_LABEL_SOURCE, POI_SOURCE, TRACK_SOURCE]) {
            if (this._map.getSource(id)) this._map.removeSource(id);
        }

        this._ranges = mergeRanges(trips.map(t => t.metadata.attributeRanges));
        // Respect the `hidden` flag set during preprocessing (absent/false = visible).
        this._visibleIds = new Set(tracks.filter(t => !t.properties.hidden).map(deriveTrackId));
        this._visiblePOICategories = new Set(pois.filter(p => !p.properties.hidden).map(p => p.properties.category));

        // Load-time phase 1 — our CPU: explode tracks into segment features.
        const { featureCollection, maxDayIndex, segmentsByTrack } = profile(
            'nomadpath.Initial load/Build segments',
            () => buildSegmentFeatures(tracks),
        );
        this._maxDayIndex = maxDayIndex;
        this._segmentsByTrack = segmentsByTrack;

        // Load-time phase 2 — hand the geojson to MapLibre (ingest/tessellation
        // kicks off here). Separated from buildSegments so the two costs are
        // distinguishable: "our build" vs "MapLibre ingest".
        profile('nomadpath.Initial load/Add to map', () => {
            // tolerance: 0 disables tile simplification, preventing short segments
            // from being collapsed to dots at low zoom levels.
            this._map.addSource(TRACK_SOURCE, { type: 'geojson', data: featureCollection, tolerance: 0 });
            this._map.addLayer({
                id: TRACK_LAYER,
                type: 'line',
                source: TRACK_SOURCE,
                filter: buildVisibilityFilter(this._visibleIds),
                paint: {
                    'line-color': buildColourExpression(
                        'day',
                        this._ranges,
                        this._maxDayIndex,
                    ) as ExpressionSpecification,
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
        });
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
            filter: buildPOICategoryFilter(this._visiblePOICategories),
            paint: {
                'circle-radius': 12,
                'circle-color': '#FF4081',
                'circle-stroke-color': '#fff',
                'circle-stroke-width': 2,
            },
        });
        // Labels use a separate GeoJSON source (same data) so that the symbol
        // layer's glyph-loading requirement does not block np-pois tile delivery.
        this._map.addSource(POI_LABEL_SOURCE, { type: 'geojson', data: poiGeoJSON });
        this._map.addLayer({
            id: POI_LABEL_LAYER,
            type: 'symbol',
            source: POI_LABEL_SOURCE,
            filter: buildPOICategoryFilter(this._visiblePOICategories),
            layout: {
                'text-field': ['get', 'name'],
                // Explicitly match openfreemap's available fonts; the MapLibre default
                // ("Open Sans Regular") is not served by openfreemap's font endpoint.
                'text-font': ['literal', ['Noto Sans Regular']],
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
        // Measured here (not at the public NomadPath method) because the legend
        // dropdown calls this directly. The sync measure and its .firstFrame
        // share the base name so the widget pairs them into one action row.
        // A colour change re-paints every visible segment → segments is the cost
        // driver, carried as detail on the sync measure.
        measureToFirstFrame(this._map, 'nomadpath.Colour change', () => {
            profile(
                'nomadpath.Colour change',
                () => {
                    this._map.setPaintProperty(
                        TRACK_LAYER,
                        'line-color',
                        buildColourExpression(attribute, this._ranges, this._maxDayIndex),
                    );
                },
                { segments: this.visibleSegmentCount },
            );
        });
    }

    /** The currently active colour attribute. */
    get colourAttribute(): ColourAttribute {
        return this._colourAttribute;
    }

    /**
     * Update the attribute ranges used for colour interpolation and re-apply
     * the current colour expression. Call this after visibility changes to
     * reflect dynamic ranges (e.g. "Elevation: 0–847m · visible tracks").
     */
    updateRanges(ranges: AttributeRanges): void {
        this._ranges = ranges;
        // This is the re-paint that follows a track-visibility toggle, so it is
        // the action we surface as "visibilityToggle". visibleSegmentCount
        // reflects the post-toggle visible set. Sync + .firstFrame share the base
        // name so the widget pairs them into one row.
        measureToFirstFrame(this._map, 'nomadpath.Toggle track', () => {
            profile(
                'nomadpath.Toggle track',
                () => {
                    this._map.setPaintProperty(
                        TRACK_LAYER,
                        'line-color',
                        buildColourExpression(this._colourAttribute, this._ranges, this._maxDayIndex),
                    );
                },
                { segments: this.visibleSegmentCount },
            );
        });
    }

    /** The current attribute ranges (for legend display). */
    get ranges(): Readonly<AttributeRanges> {
        return this._ranges;
    }

    /** The highest day index in the loaded data (used for colour scale endpoints). */
    get maxDayIndex(): number {
        return this._maxDayIndex;
    }

    /**
     * Number of rendered segments the backend must paint for the current visible
     * set — the sum of per-track segment counts over the visible tracks. O(visible
     * tracks), no geometry walk. The proxy for GPU paint cost (see profiling epic);
     * for a colour change this is "all currently-visible segments" (the paint
     * expression touches every visible segment).
     */
    get visibleSegmentCount(): number {
        // Gated so the getter (and the map it reads) DCE out of the prod bundle —
        // it exists only to feed profiling measures.
        if (!PROFILING_ON || !this._segmentsByTrack) return 0;
        const counts = this._segmentsByTrack;
        let total = 0;
        for (const id of this._visibleIds) total += counts.get(id) ?? 0;
        return total;
    }

    /** The set of POI categories currently visible. */
    get visiblePOICategories(): ReadonlySet<string> {
        return this._visiblePOICategories;
    }

    /** Show or hide all POIs belonging to the given category. */
    setPOICategoryVisible(category: string, visible: boolean): void {
        if (visible) {
            this._visiblePOICategories.add(category);
        } else {
            this._visiblePOICategories.delete(category);
        }
        const filter = buildPOICategoryFilter(this._visiblePOICategories);
        if (this._map.getLayer(POI_LAYER)) this._map.setFilter(POI_LAYER, filter);
        if (this._map.getLayer(POI_LABEL_LAYER)) this._map.setFilter(POI_LABEL_LAYER, filter);
    }

    /** Return true if the given POI category is currently visible. */
    isPOICategoryVisible(category: string): boolean {
        return this._visiblePOICategories.has(category);
    }
}
