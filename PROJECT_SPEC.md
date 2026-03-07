```markdown
# Travel Map Viewer - Project Specification

## Project Overview

A TypeScript library for visualizing GPS travel data (GPX/KML tracks) on interactive web maps. Designed for creating beautiful, interactive travel albums with track visualization, POI markers, and attribute-based styling.

**Key Features:**
- Client-side map rendering with track overlays
- Attribute visualization (elevation, speed, sun position, transport mode)
- Interactive legends with show/hide, zoom controls
- POI markers with labels
- Mobile-responsive design
- Preprocessing pipeline for data optimization

---

## Architecture

### Two-Phase System

**Phase 1: Preprocessing (Node.js, offline)**
- Input: Raw GPX/KML files in `<trip>/tracks/` folder
- Process: Parse, enrich, simplify, validate
- Output: Single `trip-data.geojson` in `<trip>/tracks/`

**Phase 2: Runtime (Browser, client-side)**
- Input: Load `trip-data.geojson` from server
- Process: Render map, handle interactions
- Output: Interactive map in HTML page

### Component Architecture

```
Browser Runtime:
├── Core Layer
│   ├── DataLoader - Fetch and parse GeoJSON
│   ├── MapEngine - MapLibre GL wrapper
│   ├── LayerManager - Track rendering and styling
│   └── StateManager - UI state management
├── UI Layer
│   ├── TrackLegend - Day-based track list
│   ├── AttributeLegend - Color visualization selector
│   ├── POILegend - Points of interest
│   ├── ZoomControl - Zoom slider + buttons
│   ├── ScaleBar - Distance scale
│   ├── InfoPopup - Track details on click
│   └── MobileMenu - Hamburger menu
└── Styling Layer
    ├── ColorRamps - Attribute color mapping
    └── SymbolLibrary - POI icons
```

---

## File Structure

### Input (Trip Folder)

```
/japan-2024/
└── tracks/                          ← Preprocessing reads from here
    ├── 2024-03-15-morning-drive.gpx (track with points)
    ├── 2024-03-15-beach-walk.gpx    (track with points)
    ├── 2024-03-16-hike.gpx          (track with points)
    ├── flight-SYD-NRT.kml           (flight track)
    ├── accommodations.gpx           (waypoints only)
    ├── landmarks.gpx                (waypoints only)
    └── trip-config.json             (optional overrides)
```

### Output (Generated)

```
/japan-2024/
└── tracks/
    └── trip-data.geojson            ← Single output file
```

### Project Structure

```
travel-map-viewer/
├── src/                             ← Library source code
│   ├── core/
│   │   ├── DataLoader.ts
│   │   ├── MapEngine.ts
│   │   ├── LayerManager.ts
│   │   └── StateManager.ts
│   ├── ui/
│   │   ├── TrackLegend.ts
│   │   ├── AttributeLegend.ts
│   │   ├── POILegend.ts
│   │   ├── ZoomControl.ts
│   │   ├── ScaleBar.ts
│   │   ├── InfoPopup.ts
│   │   └── MobileMenu.ts
│   ├── styling/
│   │   ├── ColorRamps.ts
│   │   └── SymbolLibrary.ts
│   └── index.ts                     ← Public API
├── preprocessing/
│   ├── build-trip-data.js           ← Main preprocessing script
│   └── lib/
│       ├── parsers.js               (GPX/KML parsing)
│       ├── enrichment.js            (timezone, sun position)
│       ├── grouping.js              (day boundary detection)
│       └── validation.js            (data validation)
├── docs/
│   ├── README.md
│   ├── architecture.md
│   ├── user-guide.md
│   └── api-reference.md
├── e2e/
│   └── *.spec.ts                    ← Playwright tests
├── dist/                            ← Build output
│   └── travel-map.js
├── package.json
├── tsconfig.json
├── rollup.config.js
├── .eslintrc.cjs
├── .prettierrc
└── vitest.config.ts
```

---

## Data Formats

### trip-config.json (Optional)

```json
{
  "name": "Japan 2024",
  "overrides": {
    "tracks": {
      "flight-*": { "defaultVisible": false }
    },
    "days": {
      "2024-03-15": { "endsAt": "2024-03-16T02:30:00Z" }
    }
  }
}
```

### trip-data.geojson (Output)

```json
{
  "type": "FeatureCollection",
  "metadata": {
    "tripName": "Japan 2024",
    "attributeRanges": {
      "elevation": { "min": 0, "max": 2847, "unit": "m" },
      "speed": { "min": 0, "max": 142, "unit": "km/h" }
    }
  },
  "features": [
    {
      "type": "Feature",
      "id": "day1-morning-drive",
      "geometry": {
        "type": "LineString",
        "coordinates": [[139.69, 35.68, 40], [139.70, 35.69, 42], ...]
      },
      "properties": {
        "name": "Morning drive to coast",
        "day": "2024-03-15",
        "type": "track",
        "defaultVisible": true,
        "transportMode": "drive",
        "times": [1710489600000, 1710489605000, ...],
        "elevations": [40, 42, 45, ...],
        "speeds": [0, 35, 52, ...],
        "sunHours": [8, 8, 9, ...]
      }
    },
    {
      "type": "Feature",
      "id": "poi-accommodation-a",
      "geometry": {
        "type": "Point",
        "coordinates": [139.70, 35.69]
      },
      "properties": {
        "name": "Hotel Gracery Shinjuku",
        "type": "poi",
        "category": "accommodation",
        "label": "A"
      }
    }
  ]
}
```

**Notes:**
- Omit attribute arrays if not available (e.g., no `elevations` if track lacks elevation data)
- `sunHours`: 0-23 for daytime hours, -1 for night
- Parallel arrays for point-level data (reduces file size ~40% vs object arrays)

---

## Preprocessing Algorithm

### High-Level Flow

```
1. Scan tracks/ folder for all .gpx and .kml files
2. Load optional trip-config.json
3. Parse each file:
   - Extract tracks (<trk> elements)
   - Extract waypoints (<wpt> elements)
4. For each track:
   - Normalize to common format
   - Compute local time (offline timezone lookup)
   - Calculate sun position per point
   - Simplify geometry (3 LOD levels)
5. Group tracks by day (algorithm below)
6. Apply config overrides (default visibility, etc.)
7. Aggregate attribute ranges globally
8. Convert to GeoJSON
9. Write trip-data.geojson
```

### Day Boundary Detection

```javascript
// Algorithm pseudocode
tracks.sort(by startTime);

for each track:
  localDay = track.firstPoint.localTime.date;
  
  if (manual override exists for this day):
    use override.endsAt;
  else:
    if (gap to previous track > 3 hours AND crossed midnight):
      start new day;
    else:
      continue previous day (stayed up late);
  
  track.day = currentDay;
```

### Sun Position Calculation

```javascript
// For each point:
const sunPos = SunCalc.getPosition(point.time, point.lat, point.lon);
const localHour = convertToLocalTime(point.time, point.lat, point.lon).hour;

if (sunPos.altitude < -0.105) {  // Civil twilight threshold
  sunHour = -1;  // Night
} else {
  sunHour = Math.floor(localHour);  // 0-23
}
```

---

## Library Public API

### HTML Usage

```html
<div id="map" style="width: 80%; height: 40vh;"></div>

<script src="travel-map.js"></script>
<script>
  TravelMap.create({
    container: 'map',
    dataUrls: ['tracks/trip-data.geojson'],
    initialBounds: 'auto',  // or [[lat,lng], [lat,lng]]
    defaultBasemap: 'satellite',  // 'osm' | 'satellite' | 'terrain'
    legends: {
      tracks: { position: 'topright', collapsed: false },
      attributes: { position: 'bottomleft', collapsed: false },
      pois: { position: 'bottomright', collapsed: true }
    },
    mobile: {
      legendMenu: 'hamburger'  // 'hamburger' | 'tabs' | 'stack'
    }
  });
</script>
```

### Multi-Trip Meta-Map

```javascript
TravelMap.create({
  container: 'map',
  dataUrls: [
    'nz-2022/tracks/trip-data.geojson',
    'nz-2023/tracks/trip-data.geojson',
    'nz-2024/tracks/trip-data.geojson'
  ],
  // ... rest of config
});
```

---

## UI Behavior Specifications

### Track Legend

- **Structure:** Day-based grouping
  ```
  ✓ Day 1 - March 15 [🔍] [ℹ️]
  ✓ Day 2 - March 16 [🔍] [ℹ️]
  □ Flight SYD-NRT [🔍] [ℹ️]  (unchecked = hidden)
  ```
- **Checkbox:** Toggle track visibility (actually removes layer from map for performance)
- **Zoom icon [🔍]:** Fit map to track bounds
- **Info icon [ℹ️]:** Show info popup with track details

### Attribute Legend

- **Dropdown selector:** Choose visualization attribute
  - Default: "Color by day"
  - Options: Elevation, Speed, Sun Position, Transport Mode, (+ any custom attributes)
- **Color scale display:** Shows current color ramp with labels
- **Missing data:** Gray color for tracks lacking selected attribute

### POI Legend

- **Tree view:** Group POIs by category
  ```
  ▼ Accommodation
    A - Hotel Gracery Shinjuku [🔍]
    B - Ryokan Kyoto [🔍]
  ▼ Landmarks (collapsed by default)
    • Mt. Fuji viewpoint [🔍]
  ```
- **Zoom icon [🔍]:** Center map on POI

### Zoom Control

```
[+]              ← Zoom in button
[────●──────]    ← Slider (desktop only)
[-]              ← Zoom out button
[⟲]              ← Reset to initial bounds
```

### Info Popup (on track click)

**Desktop:** Overlay at click location
```
┌─────────────────┐
│ Day 1 - Mar 15  │
│ Distance: 287km │
│                 │
│ Activities:     │
│ • Morning drive │
│ • Beach walk    │
│ • Return drive  │
└─────────────────┘
```

**Mobile:** Bottom sheet slides up
```
┌──────────────┐
│              │
│     Map      │
├──────────────┤ ← Swipe up
│ Day 1        │
│ Activities...│
└──────────────┘
```

### Mobile Menu (Hamburger)

- **Button:** Top-left corner `[☰]`
- **Drawer:** Slides in from left
- **Contents:** All three legends stacked vertically
- **Behavior:** Tap outside to close

---

## Color Schemes

### Elevation (Terrain Style)
- Low: Green (#2E7D32)
- Mid: Yellow (#FDD835)
- High: Brown (#6D4C41)
- Peak: White (#FFFFFF)
- Color scale: Linear interpolation

### Speed (Traffic Style)
- Slow (0-30 km/h): Green (#4CAF50)
- Medium (30-70 km/h): Yellow (#FFEB3B)
- Fast (70+ km/h): Red (#F44336)
- Color scale: Continuous

### Sun Position (Time of Day)
- Night (sunHour = -1): Dark blue (#1A237E)
- Dawn/Dusk (5-7, 18-20): Orange (#FF6F00)
- Daytime (8-17): Yellow (#FDD835) → Light yellow (#FFF59D)
- Color scale: Quantized by hour

### Transport Mode (Categorical)
- Walk: Green (#4CAF50)
- Drive: Blue (#2196F3)
- Flight: Red (#F44336)
- Boat: Cyan (#00BCD4)
- Other: Gray (#9E9E9E)

### Default (No Attribute Selected)
- Each day gets a unique color (cycle through palette)

---

## Track Styling

- **Line width:** 3px (fixed, all zoom levels)
- **Opacity:** 0.8 (semi-transparent)
- **Selected state:** 6px width, opacity 1.0
- **Hover state:** Cursor changes to pointer

---

## Error Handling

### Fatal Errors (Data Not Found)

**Trigger:** `fetch('trip-data.geojson')` returns 404 or network error

**UI Response:**
```
┌─────────────────────┐
│   ⚠️ Error          │
│                     │
│ Trip data not found │
│                     │
│ [Retry]             │
└─────────────────────┘
```

### Partial Errors (Track Parsing Fails)

**Preprocessing:** If ANY track fails to parse, preprocessing exits with error
- **No partial outputs**
- **User must fix corrupted files before deployment**

**Runtime:** If client-side parsing fails (malformed GeoJSON):
- Show error overlay
- Log detailed error to console

---

## Dependencies

### Production (Bundled)

- `maplibre-gl` (^4.0.0) - Map rendering
- `@turf/bbox` (^7.0.0) - Bounding box calculations
- `@turf/length` (^7.0.0) - Distance calculations

**Bundle size target:** <500KB (minified + gzipped)

### Preprocessing (Node.js, not bundled)

- `@mapbox/togeojson` (^5.0.0) - GPX/KML parsing
- `@photostructure/tz-lookup` (^8.0.0) - Offline timezone
- `suncalc` (^1.9.0) - Sun position
- `simplify-js` (^1.2.4) - Geometry simplification

### Development

- `typescript` (^5.3.0)
- `rollup` (^4.0.0) + plugins
- `vitest` (^1.0.0) - Testing
- `playwright` (^1.40.0) - E2E testing
- `eslint` (^8.55.0) + `@typescript-eslint/*`
- `prettier` (^3.1.0)

---

## Development Workflow

### Git Commit Convention

```
feat(data-loader): add GeoJSON parsing with validation
test(data-loader): add unit tests for malformed data
docs(readme): update preprocessing instructions
fix(track-legend): correct visibility toggle bug
chore(deps): update rollup to 4.x
```

### Pre-commit Checks (via Husky)

```bash
npm run lint       # ESLint + Prettier
npm run typecheck  # TypeScript compilation
npm run test:unit  # Fast unit tests
```

### Testing Strategy

- **Unit tests:** Vitest, co-located with source (`*.test.ts`)
- **Integration tests:** Vitest with happy-dom (DOM simulation)
- **E2E tests:** Playwright (real browser automation)
- **Coverage target:** 80% minimum, prioritize edge cases over coverage percentage

### npm Scripts

```json
{
  "scripts": {
    "dev": "rollup -c -w",
    "build": "rollup -c",
    "build:data": "node preprocessing/build-trip-data.js",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "format": "prettier --write src",
    "test:unit": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "typecheck": "tsc --noEmit",
    "clean": "node -e \"require('fs').rmSync('dist',{recursive:true,force:true})\""
  }
}
```

---

## Implementation Plan (MVP)

### Epic 1: Project Setup (15-20 min)

- [ ] Initialize project structure
- [ ] Configure TypeScript, Rollup, ESLint, Prettier
- [ ] Setup Vitest + Playwright
- [ ] Create npm scripts
- [ ] Write initial documentation
- [ ] Git initialization

### Epic 2: Preprocessing Script (2-3 hours)

- [ ] Setup preprocessing project structure
- [ ] Implement GPX/KML parsers
- [ ] Implement timezone lookup (offline)
- [ ] Implement sun position calculation
- [ ] Implement day boundary detection
- [ ] Implement geometry simplification
- [ ] Implement attribute detection & aggregation
- [ ] Implement GeoJSON generation
- [ ] Add CLI interface
- [ ] Write preprocessing documentation

### Epic 3: Core Library (2-3 hours)

- [ ] Implement DataLoader
- [ ] Implement MapEngine (MapLibre wrapper)
- [ ] Implement basemap management
- [ ] Implement StateManager
- [ ] Implement LayerManager
- [ ] Implement auto bounds calculation
- [ ] Write API documentation

### Epic 4: UI Components (3-4 hours)

- [ ] Implement TrackLegend
- [ ] Implement AttributeLegend
- [ ] Implement POILegend
- [ ] Implement ZoomControl
- [ ] Implement ScaleBar
- [ ] Implement InfoPopup
- [ ] Implement MobileMenu
- [ ] Implement ColorRamps
- [ ] Implement SymbolLibrary
- [ ] Style all components (CSS)

### Epic 5: Integration & Polish (1-2 hours)

- [ ] Create public API (index.ts)
- [ ] Implement error handling
- [ ] Implement loading states
- [ ] Create example HTML pages
- [ ] Write user documentation
- [ ] Run full E2E test suite
- [ ] Performance optimization
- [ ] Final polish & bug fixes

**Total estimated time:** 8-12 hours of active coding

---

## Key Technical Decisions

1. **Map Library:** MapLibre GL JS (WebGL-based, supports custom projections, good performance)
2. **Data Format:** Single GeoJSON file with embedded metadata (minimize network requests)
3. **Preprocessing:** Node.js script, offline enrichment (no API calls)
4. **Build Tool:** Rollup (optimized for libraries, tree-shaking)
5. **Testing:** Vitest (fast, modern) + Playwright (E2E)
6. **Module Format:** ESM (modern browsers, can add UMD later if needed)
7. **Browser Support:** Modern browsers (last 2 years), no IE11
8. **Mobile Strategy:** Hamburger menu with stacked legends
9. **Error Strategy:** Preprocessing fails loudly, runtime shows error overlays

---

## Performance Targets

- **Data load:** <3 seconds for 10MB GeoJSON on 10Mbps connection
- **Initial render:** <1 second after data loaded
- **Track toggle:** <100ms response time
- **Zoom/pan:** 60fps at all zoom levels
- **Max dataset:** 100K points across all tracks without performance degradation

---

## Edge Cases to Handle

- Empty trip (no tracks)
- Single track
- Track with no elevation/speed data
- All tracks hidden by default
- Multi-trip meta-map with 3+ trips
- Overnight activities (crossing midnight)
- Flights crossing multiple timezones
- Malformed GPX/KML files
- Network failures during data load
- Mobile viewport <400px width
- Very long trips (30+ days)

---

## Next Steps

1. **Epic 1:** Initialize project with all config files
2. **Epic 2:** Build preprocessing script, test with real GPX data
3. **Epic 3:** Implement core library, verify MapLibre integration
4. **Epic 4:** Build UI components, test mobile responsiveness
5. **Epic 5:** Polish, optimize, write docs

---

## Contact & Assumptions

**Assumptions:**
- User has Node.js 18+ installed
- User has basic command-line familiarity
- Trip data is in GPX/KML format (standard GPS formats)
- Server serves static files (no backend API)
- User manually runs preprocessing script locally before deployment

**Out of Scope (Post-MVP):**
- Real-time GPS tracking
- Collaborative editing
- Cloud-based preprocessing
- 3D terrain visualization
- Globe view (MapLibre supports it, but deferred for complexity)
- On-the-go incremental updates
- Authentication/privacy controls
```
