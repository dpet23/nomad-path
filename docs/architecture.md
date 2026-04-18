# Architecture

This document describes the internal design of the Nomad Path library — useful if you need
to change rendering behaviour, add a new colour attribute, or understand why things work the
way they do.

---

## Layer overview

```
┌─────────────────────────────────────────────────┐
│  src/index.ts — NomadPath (public API)          │
│  Static factory: NomadPath.create(config)       │
└────────────┬────────────────────────────────────┘
             │
    ┌────────▼────────┐     ┌─────────────────────┐
    │  core/DataLoader │     │  core/MapEngine      │
    │  loadTripData()  │     │  createMap()         │
    │  extractTracks() │     │  waitForLoad()       │
    │  deriveTrackId() │     │  setBasemap()        │
    └────────┬─────────┘     │  fitToFeatures()     │
             │               └──────────┬───────────┘
             └──────────┬───────────────┘
                        │
              ┌─────────▼──────────┐
              │  core/LayerManager  │
              │  addLayers()        │
              │  setTrackVisible()  │
              │  setColourAttribute()│
              │  updateRanges()     │
              └────────────────────┘

UI components (mounted by NomadPath.create, rendered as HTML overlays):

    ┌─────────────┐  ┌──────────────────┐  ┌────────────┐
    │ TrackLegend │  │ AttributeLegend  │  │ POILegend  │
    └─────────────┘  └──────────────────┘  └────────────┘
    ┌─────────────┐  ┌──────────────────┐
    │ MobileMenu  │  │  MapControls     │
    └─────────────┘  └──────────────────┘
```

---

## Initialisation sequence

`NomadPath.create()` does two things **in parallel** (they're independent):

1. **Fetch data** — `loadTripData(config.dataUrls)` fetches each URL, validates the GeoJSON, and returns `TripData[]`
2. **Init map** — `createMap()` creates a MapLibre instance, then `waitForLoad()` waits for the `load` event

Once both are done:
- `LayerManager.addLayers(trips)` builds segment features and adds sources/layers to the map
- `fitToFeatures()` or `fitBounds()` sets the initial viewport

---

## Per-segment rendering

This is the key architectural decision. Instead of rendering each GPS track as a single LineString, tracks are **exploded into consecutive 2-point segment features** at load time:

```
Track with 1000 points → 999 segment features, each with:
  { trackId, day, dayIndex, transportMode, elevValue, speedValue, sunValue }
```

**Why?** MapLibre's `setPaintProperty` can swap the entire `line-color` expression instantly — no geometry re-upload, no reparse. Switching from "colour by day" to "colour by speed" is a single call that takes milliseconds even with 50,000 segments.

The alternative (storing one feature per track, rebuilding on colour switch) would require `setData()` which re-uploads all geometry to the GPU — slow and causes a visual flash.

**Cost:** ~2–3× more features in the GeoJSON source. Acceptable for typical travel data (a month-long trip generates ~30,000–100,000 segments).

**Track visibility** uses `setFilter` with an `['in', ['get', 'trackId'], ['literal', [...]]]` expression — no geometry rebuild needed.


### Segment IDs

Track IDs are derived as `${day}::${name}` (e.g. `2024-03-15::Morning Drive`). This is stable across preprocessing runs as long as the filename and day don't change. The `deriveTrackId()` function in `DataLoader.ts` is the single source of truth.


---

## Colour expressions

All colour expressions are MapLibre `line-color` paint property expressions. They're built by `buildColourExpression()` in `LayerManager.ts` and applied via `setPaintProperty`.

| Attribute | Expression type | Notes |
|-----------|----------------|-------|
| `day` | `interpolate-hcl` | Red (hue 0) → Violet (hue 270) across the actual number of days. Single-day trips use flat red. |
| `transportMode` | `match` | Fixed per-mode colours from `TRANSPORT_MODE_COLOURS` |
| `speed` | `case` + `interpolate` | Green → Yellow → Red. Grey for null (no speed data). |
| `elevation` | `case` + `interpolate` | Dark green → Yellow → White. Grey for null (no elevation). |
| `sunAngle` | `case` + `interpolate` | Night blue → Orange (sunrise/sunset) → Noon yellow. Grey for null (no timestamp). |

`sunAngle` is a **solar day angle (0–360°)** computed by the preprocessor: 0 = solar midnight, 90 = sunrise, 180 = solar noon, 270 = sunset. The paint expression interpolates directly over this 0–360 range. Points without timestamps get `null`.

The `TRANSPORT_MODE_COLOURS` record is exported from the library so UI components can display matching colour swatches without hardcoding.


---

## Basemap switching

MapLibre's `setStyle()` wipes all user-added sources and layers. To handle this:

1. Before switching: capture `colourAttribute` and `visibleIds` snapshot
2. Call `engineSetBasemap()` which updates style, min/max zoom
3. Listen to the `styledata` event: re-call `addLayers()`, then restore visibility and colour state. (MapLibre 4.7.1 does not emit `style.load` after `setStyle()`.)


This means there's a brief moment where tracks disappear while the new style loads — acceptable for a basemap switch. The zoom is clamped to the new basemap's limits before switching (e.g. NASA Blue Marble max zoom 8).


---

## Data flow: preprocessing → browser

```
GPS files (.gpx, .kml)
        │
        ▼ preprocessing/build-trip-data.js
        │
        ├── parsers.js      parse → RawTrack[], RawWaypoint[]
        ├── enrichment.js   compute speed fallback, sun angle
        ├── grouping.js     assign day keys (local timezone)
        └── output.js       build GeoJSON FeatureCollection
        │
        ▼
trip-data.geojson
  {
    type: 'FeatureCollection',
    metadata: { tripName, attributeRanges: { speed: {min,max}, elevation: {min,max} } },
    features: [
      { type: 'Feature', geometry: LineString, properties: { type:'track', name, day,
          transportMode, times?, elevations?, speeds?, sunAngles? } },
      { type: 'Feature', geometry: Point, properties: { type:'poi', name, category } },
    ]
  }
        │
        ▼ browser: DataLoader.loadTripData()
        │
        ▼ LayerManager.buildSegmentFeatures()
        │
        ▼ MapLibre GL (GPU rendering)
```

The `attributeRanges` in metadata are pre-computed global min/max for each attribute across all tracks. They're used to set the endpoints of the colour interpolation expressions.


---

## Source and layer IDs

These are the MapLibre source/layer IDs used internally. Avoid using these names in custom layers added to the same map instance:

| Constant | Value | Type |
|----------|-------|------|
| `TRACK_SOURCE` | `np-tracks` | GeoJSON source |
| `TRACK_LAYER` | `np-tracks-layer` | line layer |
| `POI_SOURCE` | `np-pois` | GeoJSON source |
| `POI_LAYER` | `np-pois-layer` | circle layer |
| `POI_LABEL_LAYER` | `np-pois-labels` | symbol layer |


---

## Adding a new colour attribute

1. Add the attribute name to the `ColourAttribute` type in `LayerManager.ts`
2. Embed the per-point values as a parallel array in `TrackProperties` (`src/data/types.ts`)
3. Average adjacent values in `buildSegmentFeatures()` and store on segment properties
4. Add a `case` in `buildColourExpression()` returning an appropriate MapLibre expression
5. Compute the attribute in `preprocessing/lib/enrichment.js` and include in output


---

## TypeScript casting notes

MapLibre's `ExpressionSpecification` is a complex discriminated union that TypeScript cannot verify from manually-built array literals. The codebase uses two patterns:

```typescript
// For line-color paint property (requires ExpressionSpecification, not string):
'line-color': buildColourExpression(...) as ExpressionSpecification

// For MapLibre expressions built as array literals:
const expr = (e: unknown): MaplibreExpression => e as unknown as MaplibreExpression;

// For filter expressions (FilterSpecification, not ExpressionSpecification):
return ['in', ['get', 'trackId'], ['literal', [...]]] as unknown as FilterSpecification;
```

This is intentional — the runtime values are valid MapLibre expressions, but TypeScript's type system can't verify array literal structure against the union.

---

The original pre-implementation project specification is preserved in git history as `PROJECT_SPEC.md`.
