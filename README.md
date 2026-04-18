# Nomad Path

A TypeScript library for visualising GPS travel data (GPX/KML tracks) on interactive web maps.
No backend required — everything runs in the browser from a single pre-built GeoJSON file.

---

## Overview

1. **Pre-process** your GPS files once with the CLI → produces `trip-data.geojson`
2. **Embed** the map in any HTML page with a `<script>` tag and two lines of JS
3. **Style** tracks by day, speed, elevation, sun position, or transport mode

---

## Quick Start

### Step 1 — Preprocess your GPS data

Organise your GPS files under a `tracks/` folder:

```
japan-2024/
└── tracks/
    ├── 2024-03-15-morning-drive.gpx
    ├── 2024-03-15-beach-walk.gpx
    ├── 2024-03-16-hike.gpx
    ├── flight-SYD-NRT.kml          ← transport mode inferred from filename
    └── accommodations.gpx           ← waypoints become POI markers
```

Run the preprocessor:

```bash
npm run build:data -- -i ./japan-2024/tracks
```

This produces `japan-2024/tracks/trip-data.geojson`.

**Options:**
```
-i, --input  <dir>   Directory to scan for .gpx/.kml files (recursive) [required]
-o, --output <file>  Output path (default: <input>/trip-data.geojson)
-n, --name   <name>  Trip name (default: parent dir name, title-cased)
```

**Examples:**
```bash
# Minimal — output goes to ./trips/japan-2024/tracks/trip-data.geojson
npm run build:data -- -i ./trips/japan-2024/tracks

# Custom name and output path
npm run build:data -- -i ./trips/japan-2024/tracks -n "Japan 2024" -o ./public/japan.geojson
```

See [docs/preprocessing.md](docs/preprocessing.md) for file naming conventions, transport mode detection,
and GPX extension support.


### Step 2 — Build the library

```bash
npm run build:lib   # → dist/nomad-path.js
```


### Step 3 — Add the map to your HTML page

```html
<!doctype html>
<html>
<head>
  <link rel="stylesheet" href="nomad-path.css" />
  <style>#map { width: 100%; height: 100vh; }</style>
</head>
<body>
  <div id="map"></div>

  <script src="nomad-path.js"></script>
  <script type="module">
    import { NomadPath } from './nomad-path.js';

    const map = await NomadPath.create({
      container: 'map',
      dataUrls: ['tracks/trip-data.geojson'],
    });
  </script>
</body>
</html>
```


### Multi-trip (meta-map)

Load multiple trips in one map — great for comparing multiple visits to the same region:

```javascript
const map = await NomadPath.create({
  container: 'map',
  dataUrls: [
    'nz-2022/trip-data.geojson',
    'nz-2023/trip-data.geojson',
    'nz-2024/trip-data.geojson',
  ],
});
```

---

## Configuration Reference

```typescript
NomadPath.create({
  // Required
  container: 'map',                    // HTML element ID
  dataUrls: ['trip-data.geojson'],     // one or more GeoJSON URLs

  // Optional
  defaultBasemap: 'osm',              // 'osm' (default) | 'blueMarble'
  initialBounds: 'auto',              // 'auto' (default) | [[lat,lng],[lat,lng]]
});
```

### Available basemaps

| ID | Description | Max zoom |
|----|-------------|----------|
| `osm` | OpenStreetMap (OpenFreeMap bright style) | 20 |
| `blueMarble` | NASA Blue Marble shaded relief + bathymetry | 8 |

Blue Marble is great for overview/flight maps; switch to OSM for ground-level detail.


### Colour attributes

Switch track colouring at runtime:

```javascript
map.setColourAttribute('day');           // rainbow spectrum across all days
map.setColourAttribute('speed');         // green → yellow → red
map.setColourAttribute('elevation');     // dark green → yellow → white
map.setColourAttribute('sunAngle');      // night blue → orange → noon yellow
map.setColourAttribute('transportMode'); // per-mode fixed colours
```

Transport mode colours are exported for use in custom UI:

```javascript
import { TRANSPORT_MODE_COLOURS } from './nomad-path.js';
// { walk: '#4CAF50', drive: '#2196F3', flight: '#F44336', ... }
```


### Track visibility

```javascript
map.setTrackVisible('2024-03-15::Morning Drive', false);
map.isTrackVisible('2024-03-15::Morning Drive'); // false

// Track IDs are derived as `${day}::${name}` from the GPX track name
```


### Basemap switching

```javascript
map.setBasemap('blueMarble');
map.setBasemap('osm');
// Track layers are automatically re-added; visibility and colour state are preserved
```


### Accessing loaded data

```javascript
const trips = map.trips;  // TripData[]
trips.forEach(trip => {
  console.log(trip.metadata.tripName);
  console.log(trip.features.length, 'features');
});
```

---

## GPX File Tips

**Transport mode** is read from OsmAnd's `<osmand:activity>` extension, falling back to filename keywords:

| Filename pattern | Mode |
|-----------------|------|
| `*flight*`, `*fly*`, `*plane*`, `*air*` | flight |
| `*walk*`, `*hike*`, `*trek*`, `*run*` | walk |
| `*cycle*`, `*bike*` | cycling |
| `*boat*`, `*sail*`, `*ferry*` | boat |
| (anything else) | drive |

**Waypoints** in `.gpx` files become POI markers. The `<type>` element sets the POI category:
```xml
<wpt lat="35.69" lon="139.70">
  <name>Hotel Gracery</name>
  <type>accommodation</type>
</wpt>
```

---

## Development

```bash
npm install
npm run dev        # Rollup watch mode
npm run build:lib  # Production bundle → dist/nomad-path.js
npm run typecheck  # TypeScript type-check
npm run lint       # ESLint
npm run lint:fix   # ESLint with auto-fix
npm run format     # Prettier
npm run test:unit  # Vitest (112 tests)
npm run test:e2e   # Playwright end-to-end
```

---

## Requirements

- **Node.js** 18+ (preprocessing and build toolchain only)
- **Browsers** — any modern browser with WebGL support (Chrome, Firefox, Safari, last 2 years)
- **Server** — static file hosting only; no backend, no API keys required

---

## Further Reading

- [docs/architecture.md](docs/architecture.md) — how the rendering pipeline works
- [docs/preprocessing.md](docs/preprocessing.md) — GPS file conventions and data pipeline details
