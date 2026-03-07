# Nomad Path

A TypeScript library for visualising GPS travel data (GPX/KML tracks) on interactive web maps. Create beautiful, interactive travel albums with track overlays, POI markers, and attribute-based styling (elevation, speed, sun position, transport mode).

## Features

- Client-side map rendering with track overlays (powered by MapLibre GL JS)
- Attribute visualisation — elevation, speed, sun position, transport mode
- Interactive legends with show/hide and zoom controls
- POI markers with labels and category grouping
- Mobile-responsive design with hamburger menu
- Preprocessing pipeline for GPX/KML → optimised GeoJSON

## Quick Start

### 1. Preprocess your GPS data

```bash
node preprocessing/build-trip-data.js --trip /path/to/japan-2024
```

This reads all `.gpx` and `.kml` files from the `tracks/` folder and outputs a single `trip-data.geojson`.

### 2. Add the map to your HTML page

```html
<div id="map" style="width: 100%; height: 60vh;"></div>

<script src="nomad-path.js"></script>
<script>
  NomadPath.create({
    container: 'map',
    dataUrls: ['tracks/trip-data.geojson'],
    initialBounds: 'auto',
    defaultBasemap: 'satellite',
    legends: {
      tracks:     { position: 'topright',    collapsed: false },
      attributes: { position: 'bottomleft',  collapsed: false },
      pois:       { position: 'bottomright', collapsed: true  },
    },
    mobile: { legendMenu: 'hamburger' },
  });
</script>
```

### Multi-trip meta-map

```javascript
NomadPath.create({
  container: 'map',
  dataUrls: [
    'nz-2022/tracks/trip-data.geojson',
    'nz-2023/tracks/trip-data.geojson',
    'nz-2024/tracks/trip-data.geojson',
  ],
});
```

## Input Folder Structure

```
/japan-2024/
└── tracks/
    ├── 2024-03-15-morning-drive.gpx
    ├── 2024-03-15-beach-walk.gpx
    ├── 2024-03-16-hike.gpx
    ├── flight-SYD-NRT.kml
    ├── accommodations.gpx       ← waypoints become POIs
    ├── landmarks.gpx            ← waypoints become POIs
    ├── trip-config.json         ← optional overrides
    └── trip-data.geojson        ← generated output
```

## Development

```bash
npm install
npm run dev        # watch mode
npm run build      # production bundle → dist/nomad-path.js
npm run typecheck  # TypeScript type check
npm run lint       # ESLint
npm run test:unit  # Vitest unit tests
npm run test:e2e   # Playwright end-to-end tests
```

## Architecture

```
src/
  data/      TypeScript interfaces (TripData, TrackFeature, Config, …)
  core/      Business logic — DataLoader, MapEngine, LayerManager, StateManager
  ui/        HTML overlay components — TrackLegend, AttributeLegend, POILegend, …
  styling/   Pure functions — ColorRamps, SymbolLibrary
  index.ts   Public API

preprocessing/
  build-trip-data.js   CLI entry point
  lib/                 parsers, enrichment, grouping, validation
```

See [architecture.md](architecture.md) for a detailed design walkthrough.

## Requirements

- **Node.js** 18+ (preprocessing)
- **Modern browsers** — Chrome, Firefox, Safari (last 2 years)
- **Server** — static file serving only, no backend required
