## **1. System Architecture Diagram**

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PREPROCESSING PHASE                          │
│                        (Local Dev Machine)                           │
└─────────────────────────────────────────────────────────────────────┘

  [Trip Folder]
      ├── tracks/
      │   ├── day1-morning.gpx
      │   ├── day1-afternoon.gpx
      │   ├── flight-SYD-NRT.kml
      │   └── ... (100+ files)
      ├── trip-config.json (optional)
      └── pois.json (optional)
           ↓
  ┌────────────────────────────────────┐
  │  Preprocessing Script (Node.js)    │
  │  ─────────────────────────────────│
  │  1. Parse all GPX/KML files       │
  │  2. Normalize timestamps (UTC)     │
  │  3. Compute local time (offline)   │
  │  4. Calculate sun position         │
  │  5. Detect day boundaries          │
  │  6. Group tracks by day            │
  │  7. Simplify geometry (LOD)        │
  │  8. Detect available attributes    │
  │  9. Validate data integrity        │
  └────────────────────────────────────┘
           ↓
  [Output Files]
      ├── trip-data.geojson (8-12MB)
      ├── metadata.json
      └── errors.json (if any issues)

           ↓ (Upload to server)

┌─────────────────────────────────────────────────────────────────────┐
│                          RUNTIME PHASE                               │
│                      (Browser - Client Side)                         │
└─────────────────────────────────────────────────────────────────────┘

  [HTML Entry Point]
  <script src="travel-map.js"></script>
  <script>
    TravelMap.create({
      container: 'map',
      dataUrls: ['trip-data.geojson'],
      ...config
    });
  </script>
           ↓
  ┌────────────────────────────────────┐
  │     TravelMap Public API           │
  │  (index.ts - Entry Point)          │
  └────────────────────────────────────┘
           ↓
  ┌────────────────────────────────────┐
  │       Core Layer                   │
  ├────────────────────────────────────┤
  │ DataLoader                         │ ← Fetch GeoJSON, parse, validate
  │   ├── Progressive loading          │
  │   ├── Error recovery               │
  │   └── Metadata extraction          │
  │                                    │
  │ MapEngine                          │ ← MapLibre GL abstraction
  │   ├── Initialize map               │
  │   ├── Projection management        │
  │   └── Basemap switching            │
  │                                    │
  │ LayerManager                       │ ← Track rendering & visibility
  │   ├── Add/remove track layers      │
  │   ├── Style tracks by attribute    │
  │   ├── Performance optimization     │
  │   └── LOD selection by zoom        │
  │                                    │
  │ StateManager                       │ ← Application state
  │   ├── Active tracks (visibility)   │
  │   ├── Selected attribute           │
  │   ├── Current zoom/bounds          │
  │   └── Mobile vs desktop mode       │
  └────────────────────────────────────┘
           ↓
  ┌────────────────────────────────────┐
  │       UI Layer                     │
  ├────────────────────────────────────┤
  │ TrackLegend                        │ ← Day-based tree view
  │   ├── Render day groups            │
  │   ├── Visibility checkboxes        │
  │   ├── Zoom to bounds buttons       │
  │   └── Info popup trigger           │
  │                                    │
  │ AttributeLegend                    │ ← Color visualization selector
  │   ├── Dropdown selector            │
  │   ├── Color scale display          │
  │   └── Handle missing data          │
  │                                    │
  │ POILegend                          │ ← Accommodation & POIs
  │   ├── Lettered markers (A/B/C)     │
  │   ├── Tree view for groups         │
  │   └── Zoom to POI                  │
  │                                    │
  │ ZoomControl                        │ ← Custom zoom widget
  │   ├── +/- buttons                  │
  │   ├── Slider (desktop)             │
  │   └── Reset button                 │
  │                                    │
  │ ScaleBar                           │ ← Distance scale
  │   └── Update on zoom/projection    │
  │                                    │
  │ InfoPopup                          │ ← Track details on click
  │   ├── Desktop: overlay at click    │
  │   └── Mobile: bottom sheet         │
  │                                    │
  │ MobileMenu                         │ ← Hamburger menu
  │   └── Contains all legends         │
  └────────────────────────────────────┘
           ↓
  ┌────────────────────────────────────┐
  │     Styling Layer                  │
  ├────────────────────────────────────┤
  │ ColorRamps                         │ ← Attribute → color mapping
  │   ├── Elevation (terrain)          │
  │   ├── Speed (traffic)              │
  │   ├── Sun position (time-of-day)   │
  │   └── Transport mode (categorical) │
  │                                    │
  │ SymbolLibrary                      │ ← POI icons
  │   ├── Generate lettered markers    │
  │   └── Icon set for POI types       │
  └────────────────────────────────────┘
           ↓
  [MapLibre GL JS]
  [Rendered Map in Browser]
```

---

## **2. Data Flow Diagram**

```
USER INTERACTION FLOW:

1. PAGE LOAD
   HTML page loads → travel-map.js executes
   ↓
   TravelMap.create() called with config
   ↓
   DataLoader fetches trip-data.geojson
   ↓
   [Progress indicator: "Loading trip data..."]
   ↓
   Parse GeoJSON + metadata.json
   ↓
   MapEngine initializes MapLibre
   ↓
   LayerManager adds track layers (only defaultVisible: true)
   ↓
   StateManager calculates auto bounds (ignoring hidden tracks)
   ↓
   UI renders all legends + controls
   ↓
   [Map ready - user sees tracks]

2. TOGGLE TRACK VISIBILITY
   User clicks checkbox in TrackLegend
   ↓
   StateManager updates track visibility state
   ↓
   LayerManager removes/adds layer from map
   ↓
   [Track disappears/appears immediately]

3. CHANGE ATTRIBUTE VISUALIZATION
   User selects "Elevation" from AttributeLegend dropdown
   ↓
   StateManager sets activeAttribute = 'elevation'
   ↓
   ColorRamps calculates color scale from metadata (min/max elevation)
   ↓
   LayerManager re-styles all visible tracks
   ↓
   AttributeLegend updates color scale display
   ↓
   [All tracks now colored by elevation]

4. CLICK TRACK ON MAP
   User clicks track line
   ↓
   MapEngine detects click event, identifies track
   ↓
   StateManager sets selectedTrack
   ↓
   LayerManager updates track style (thicker line)
   ↓
   InfoPopup renders with track metadata:
     - Day name
     - Total distance
     - Activity list
   ↓
   Desktop: Popup appears at click location
   Mobile: Bottom sheet slides up
   ↓
   [User sees track details]

5. ZOOM TO TRACK
   User clicks zoom icon in TrackLegend
   ↓
   StateManager gets track bounds from metadata
   ↓
   MapEngine animates to bounds (flyTo)
   ↓
   [Map zooms to fit selected track]

6. RESET MAP
   User clicks reset button
   ↓
   StateManager restores initialBounds
   ↓
   MapEngine animates to initial view
   ↓
   [Map returns to full trip view]

ERROR HANDLING FLOW:

1. FATAL ERROR (data file not found)
   fetch('trip-data.geojson') → 404
   ↓
   DataLoader catches error
   ↓
   ErrorOverlay renders on map
   ↓
   [User sees: "⚠️ Trip data not found"]

2. PARTIAL ERROR (some tracks corrupted)
   Preprocessing validates each track
   ↓
   5 tracks fail → written to errors.json
   ↓
   95 tracks succeed → written to trip-data.geojson
   ↓
   Browser loads trip-data.geojson + errors.json
   ↓
   DataLoader checks errors.json
   ↓
   WarningBanner renders at top
   ↓
   [User sees map with 95 tracks + "⚠️ 5 tracks skipped"]
```

---

## **3. Preprocessing Script Specification**

### **Input Structure**

```
/path/to/japan-2024/
├── tracks/
│   ├── 2024-03-15-morning-drive.gpx
│   ├── 2024-03-15-beach-walk.gpx
│   ├── 2024-03-16-mountain-hike.gpx
│   ├── flight-SYD-NRT.kml
│   └── ... (100+ files)
├── trip-config.json (optional)
└── pois.json (optional)
```

### **Algorithm Pseudocode**

```javascript
// preprocessing/build-trip-data.js

async function processTrip(tripPath) {
  // 1. Load config (if exists)
  const config = loadConfig(`${tripPath}/trip-config.json`);
  
  // 2. Discover all track files
  const trackFiles = glob(`${tripPath}/tracks/**/*.{gpx,kml}`);
  
  // 3. Parse all tracks with validation
  const tracks = [];
  const errors = [];
  
  for (const file of trackFiles) {
    try {
      const track = await parseTrackFile(file); // Returns normalized track object
      
      // 4. Enrich with computed data
      track.localTimes = computeLocalTimes(track.points); // Offline timezone lookup
      track.sunPositions = computeSunPositions(track.points, track.localTimes);
      track.simplifiedGeometry = simplifyTrack(track.points); // Douglas-Peucker
      
      // 5. Extract metadata
      track.bounds = calculateBounds(track.points);
      track.distance = calculateDistance(track.points);
      track.duration = track.points[track.points.length - 1].time - track.points[0].time;
      
      // 6. Detect available attributes
      track.attributes = detectAttributes(track.points); // ['elevation', 'speed', 'heartrate']
      
      tracks.push(track);
    } catch (err) {
      errors.push({ file, error: err.message });
      console.warn(`Skipping ${file}: ${err.message}`);
    }
  }
  
  // 7. Group tracks by day
  const days = groupTracksByDay(tracks, config.overrides?.days);
  
  // 8. Apply track overrides (default visibility, etc.)
  applyTrackOverrides(tracks, config.overrides?.tracks);
  
  // 9. Load POIs
  const pois = loadPOIs(`${tripPath}/pois.json`);
  
  // 10. Generate metadata
  const metadata = {
    tripName: config.name || path.basename(tripPath),
    bounds: calculateOverallBounds(tracks),
    attributes: aggregateAttributes(tracks), // Global attribute ranges
    days: days.map(day => ({
      date: day.date,
      trackIds: day.tracks.map(t => t.id),
      bounds: calculateBounds(day.tracks)
    })),
    pois: pois
  };
  
  // 11. Convert to GeoJSON
  const geojson = {
    type: 'FeatureCollection',
    features: tracks.map(track => ({
      type: 'Feature',
      id: track.id,
      geometry: {
        type: 'LineString',
        coordinates: track.points.map(p => [p.lon, p.lat, p.elevation])
      },
      properties: {
        name: track.name,
        day: track.day,
        defaultVisible: track.defaultVisible,
        attributes: track.points.map(p => ({
          time: p.time,
          localTime: p.localTime,
          elevation: p.elevation,
          speed: p.speed,
          sunPosition: p.sunPosition,
          // ... other attributes
        }))
      }
    }))
  };
  
  // 12. Write output files
  writeFile(`${tripPath}/trip-data.geojson`, JSON.stringify(geojson));
  writeFile(`${tripPath}/metadata.json`, JSON.stringify(metadata));
  if (errors.length > 0) {
    writeFile(`${tripPath}/errors.json`, JSON.stringify({ errors }));
  }
  
  console.log(`✓ Processed ${tracks.length} tracks (${errors.length} failed)`);
}
```

### **Key Functions**

**1. Local Time Computation (Offline)**

```javascript
import tzlookup from '@photostructure/tz-lookup';
import { DateTime } from 'luxon';

function computeLocalTimes(points) {
  return points.map(point => {
    // Reverse geocode to timezone (offline, no API calls)
    const timezone = tzlookup(point.lat, point.lon);
    
    // Convert UTC to local time
    const localTime = DateTime.fromMillis(point.time, { zone: timezone });
    
    return {
      ...point,
      localTime: localTime.toISO(),
      timezone: timezone
    };
  });
}
```

**2. Sun Position Calculation**

```javascript
import SunCalc from 'suncalc';

function computeSunPositions(points, localTimes) {
  return points.map((point, i) => {
    const sunPos = SunCalc.getPosition(
      new Date(point.time),
      point.lat,
      point.lon
    );
    
    // Quantize to hourly buckets for visualization
    const hourBucket = Math.floor(localTimes[i].localTime.hour);
    
    // Classify sun state
    let sunState;
    if (sunPos.altitude < -0.105) { // -6 degrees (civil twilight)
      sunState = 'night';
    } else if (sunPos.altitude < 0) {
      sunState = 'twilight';
    } else {
      sunState = 'day';
    }
    
    return {
      altitude: sunPos.altitude,
      azimuth: sunPos.azimuth,
      hourBucket: hourBucket,
      state: sunState
    };
  });
}
```

**3. Day Boundary Detection**

```javascript
function groupTracksByDay(tracks, dayOverrides = {}) {
  // Sort tracks by start time
  tracks.sort((a, b) => a.points[0].time - b.points[0].time);
  
  const days = new Map();
  let currentDay = null;
  
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const startLocal = track.points[0].localTime;
    const dayKey = startLocal.split('T')[0]; // YYYY-MM-DD
    
    // Check for manual override
    if (dayOverrides[dayKey]?.endsAt) {
      const endTime = new Date(dayOverrides[dayKey].endsAt);
      if (track.points[0].time < endTime) {
        currentDay = dayKey;
      } else {
        // Track starts after override end time → new day
        currentDay = track.points[0].localTime.split('T')[0];
      }
    } else {
      // Auto-detect: check gap to previous track
      if (i > 0) {
        const prevTrack = tracks[i - 1];
        const gap = track.points[0].time - prevTrack.points[prevTrack.points.length - 1].time;
        const gapHours = gap / (1000 * 60 * 60);
        
        if (gapHours > 3 && dayKey !== currentDay) {
          // Gap > 3 hours and crossed midnight → new day
          currentDay = dayKey;
        }
        // Otherwise keep currentDay (stayed up late)
      } else {
        currentDay = dayKey;
      }
    }
    
    track.day = currentDay;
    
    if (!days.has(currentDay)) {
      days.set(currentDay, []);
    }
    days.get(currentDay).push(track);
  }
  
  return Array.from(days.entries()).map(([date, tracks]) => ({
    date,
    tracks
  }));
}
```

**4. Geometry Simplification (LOD)**

```javascript
import simplify from 'simplify-js';

function simplifyTrack(points) {
  // Generate 3 levels of detail
  return {
    full: points, // All points (zoom >= 12)
    medium: simplify(points, 0.0001, true), // ~50% points (zoom 8-12)
    low: simplify(points, 0.001, true) // ~10% points (zoom < 8)
  };
}
```

### **Output Format**

**trip-data.geojson:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "day1-morning-drive",
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [139.6917, 35.6895, 40], // [lon, lat, elevation]
          [139.7006, 35.6938, 42],
          // ... thousands more
        ]
      },
      "properties": {
        "name": "Morning drive to coast",
        "day": "2024-03-15",
        "defaultVisible": true,
        "distance": 142000, // meters
        "duration": 9000, // seconds
        "bounds": [[139.6917, 35.6895], [139.9000, 35.7500]],
        "attributes": {
          "elevation": { "min": 10, "max": 847, "available": true },
          "speed": { "min": 0, "max": 95, "available": true },
          "heartrate": { "available": false }
        },
        // Point-level data (parallel arrays for efficiency)
        "pointData": {
          "times": [1710489600000, 1710489605000, ...],
          "localTimes": ["2024-03-15T08:00:00+09:00", ...],
          "elevations": [40, 42, 45, ...],
          "speeds": [0, 35, 52, ...],
          "sunPositions": [6, 6, 7, ...], // Hour bucket (0-23) or night=-1
          "transportModes": ["drive", "drive", ...]
        }
      }
    },
    // ... more features
  ]
}
```

**metadata.json:**
```json
{
  "tripName": "Japan 2024",
  "bounds": [[139.6917, 35.6895], [140.1234, 35.8000]],
  "totalDistance": 1247000,
  "totalDuration": 432000,
  "attributes": {
    "elevation": { "min": 0, "max": 2847, "unit": "m", "type": "continuous" },
    "speed": { "min": 0, "max": 142, "unit": "km/h", "type": "continuous" },
    "sunPosition": { "type": "quantized", "buckets": 24 },
    "transportMode": { "type": "categorical", "values": ["walk", "drive", "flight", "boat"] }
  },
  "days": [
    {
      "date": "2024-03-15",
      "name": "Day 1",
      "trackIds": ["day1-morning-drive", "day1-beach-walk", "day1-return-drive"],
      "bounds": [[139.6917, 35.6895], [139.9500, 35.7800]],
      "distance": 287000,
      "activities": ["Morning drive to coast", "Beach walk", "Return drive"]
    },
    // ... more days
  ],
  "pois": [
    {
      "id": "accommodation-a",
      "name": "Hotel Gracery Shinjuku",
      "lat": 35.6938,
      "lng": 139.7006,
      "type": "accommodation",
      "label": "A",
      "group": "Accommodation"
    }
  ]
}
```

**errors.json (if any):**
```json
{
  "errors": [
    {
      "file": "tracks/corrupted-track.gpx",
      "error": "Invalid XML: Unexpected token at line 42"
    },
    {
      "file": "tracks/incomplete.gpx",
      "error": "No valid track points found"
    }
  ]
}
```

---

## **4. MVP Implementation Checklist**

### **Epic 1: Project Setup & Infrastructure** (1-2 days)

- [ ] **Task 1.1:** Initialize project structure
  - Create repo with `src/`, `preprocessing/`, `docs/`, `e2e/`
  - Setup `.gitignore`, `.gitattributes` (line endings)
  - **Time:** 30 min

- [ ] **Task 1.2:** Configure TypeScript + build tools
  - `tsconfig.json` with strict mode
  - Rollup config for ESM bundle output
  - **Time:** 1 hour

- [ ] **Task 1.3:** Setup linting & formatting
  - ESLint + Prettier configs
  - Husky pre-commit hooks
  - **Time:** 1 hour

- [ ] **Task 1.4:** Configure testing framework
  - Vitest for unit/integration tests
  - Playwright for e2e tests
  - **Time:** 1.5 hours

- [ ] **Task 1.5:** Create npm scripts
  - `build`, `dev`, `test:unit`, `test:e2e`, `lint`, `format`, `typecheck`
  - **Time:** 30 min

- [ ] **Task 1.6:** Write initial documentation
  - `README.md` (project overview, setup instructions)
  - `docs/architecture.md` (based on diagrams above)
  - **Time:** 1 hour

---

### **Epic 2: Preprocessing Script** (3-4 days)

- [ ] **Task 2.1:** Setup preprocessing project structure
  - `preprocessing/build-trip-data.js` entry point
  - `preprocessing/lib/` for modules
  - **Time:** 30 min

- [ ] **Task 2.2:** Implement GPX/KML parsers
  - Parse GPX using `gpxparser` or `fast-xml-parser`
  - Parse KML using `@tmcw/togeojson`
  - Normalize to common track format
  - **Tests:** Valid GPX, malformed XML, missing data
  - **Time:** 3 hours

- [ ] **Task 2.3:** Implement timezone lookup (offline)
  - Integrate `@photostructure/tz-lookup`
  - Convert UTC → local time per point
  - **Tests:** Flight crossing timezones, DST edge cases
  - **Time:** 2 hours

- [ ] **Task 2.4:** Implement sun position calculation
  - Integrate `suncalc`
  - Quantize to hourly buckets
  - Classify day/twilight/night
  - **Tests:** Noon, midnight, sunrise, southern hemisphere
  - **Time:** 2 hours

- [ ] **Task 2.5:** Implement day boundary detection
  - Algorithm from pseudocode above
  - Support manual overrides from config
  - **Tests:** Normal day split, stayed-up-late, multi-timezone
  - **Time:** 3 hours

- [ ] **Task 2.6:** Implement geometry simplification
  - Douglas-Peucker algorithm (use `simplify-js`)
  - Generate 3 LOD levels
  - **Tests:** Preserve critical points, reduce non-critical
  - **Time:** 2 hours

- [ ] **Task 2.7:** Implement attribute detection & aggregation
  - Scan all tracks for available attributes
  - Calculate global min/max ranges
  - **Tests:** Mixed attributes across tracks, missing data
  - **Time:** 2 hours

- [ ] **Task 2.8:** Implement GeoJSON generation
  - Convert normalized tracks → GeoJSON
  - Generate metadata.json
  - Handle errors gracefully → errors.json
  - **Tests:** Complete trip, partial failures
  - **Time:** 3 hours

- [ ] **Task 2.9:** Add CLI interface with args
  - `--trip <path>` flag
  - `--config <path>` for custom config
  - Progress logging
  - **Time:** 1.5 hours

- [ ] **Task 2.10:** Write preprocessing documentation
  - `preprocessing/README.md` (usage guide)
  - `docs/data-format.md` (GeoJSON schema)
  - **Time:** 1.5 hours

---

### **Epic 3: Core Library - Data & Map Engine** (4-5 days)

- [ ] **Task 3.1:** Implement DataLoader
  - Fetch trip-data.geojson with progress tracking
  - Parse JSON with validation
  - Load metadata.json and errors.json
  - **Tests:** Successful load, 404 error, malformed JSON
  - **Time:** 3 hours

- [ ] **Task 3.2:** Implement MapEngine (MapLibre wrapper)
  - Initialize MapLibre GL map
  - Handle container sizing
  - Setup projection (Mercator for MVP)
  - **Tests:** Map initialization, projection switching
  - **Time:** 3 hours

- [ ] **Task 3.3:** Implement basemap management
  - Add OSM, ESRI Satellite sources
  - Switch basemap function
  - **Tests:** Basemap switching, tile loading
  - **Time:** 2 hours

- [ ] **Task 3.4:** Implement StateManager
  - Track visibility state
  - Active attribute selection
  - Current zoom/bounds
  - Mobile vs desktop detection
  - **Tests:** State updates, persistence
  - **Time:** 2.5 hours

- [ ] **Task 3.5:** Implement LayerManager
  - Add track layers to MapLibre
  - Remove layers on visibility toggle
  - Style tracks by selected attribute
  - LOD selection based on zoom
  - **Tests:** Add/remove layers, style updates, zoom-based LOD
  - **Time:** 4 hours

- [ ] **Task 3.6:** Implement auto bounds calculation
  - Calculate bounds from visible tracks only
  - Ignore defaultVisible: false tracks
  - **Tests:** All tracks visible, some hidden, all hidden
  - **Time:** 1.5 hours

- [ ] **Task 3.7:** Write core library documentation
  - `docs/api-reference.md` (JSDoc export via TypeDoc)
  - **Time:** 1 hour

---

### **Epic 4: UI Components** (5-6 days)

- [ ] **Task 4.1:** Implement TrackLegend
  - Render day groups from metadata
  - Checkboxes for visibility toggle
  - Zoom-to-bounds buttons
  - Trigger info popup on click
  - **Tests:** Render legend, toggle visibility, zoom interaction
  - **Time:** 4 hours

- [ ] **Task 4.2:** Implement AttributeLegend
  - Dropdown selector for attributes
  - Render color scale based on ColorRamps
  - Handle missing data warning
  - **Tests:** Attribute switching, color scale display
  - **Time:** 3 hours

- [ ] **Task 4.3:** Implement POILegend
  - Render POI tree view
  - Lettered markers (A, B, C)
  - Zoom to POI functionality
  - **Tests:** Render POIs, zoom interaction
  - **Time:** 3 hours

- [ ] **Task 4.4:** Implement ZoomControl
  - +/- buttons
  - Slider (desktop only)
  - Reset button
  - **Tests:** Zoom in/out, slider interaction, reset
  - **Time:** 3 hours

- [ ] **Task 4.5:** Implement ScaleBar
  - Calculate scale based on zoom/projection
  - Update dynamically
  - **Tests:** Scale updates on zoom
  - **Time:** 2 hours

- [ ] **Task 4.6:** Implement InfoPopup
  - Desktop: overlay at click location
  - Mobile: bottom sheet
  - Display track metadata (day, distance, activities)
  - **Tests:** Desktop popup, mobile sheet, content rendering
  - **Time:** 4 hours

- [ ] **Task 4.7:** Implement MobileMenu (hamburger)
  - Collapsible drawer
  - Contains all legends
  - Responsive behavior
  - **Tests:** Menu open/close, responsive layout
  - **Time:** 3 hours

- [ ] **Task 4.8:** Implement ColorRamps
  - Terrain color scale (elevation)
  - Traffic color scale (speed)
  - Time-of-day scale (sun position)
  - Categorical colors (transport mode)
  - **Tests:** Color calculation for various attribute values
  - **Time:** 3 hours

- [ ] **Task 4.9:** Implement SymbolLibrary
  - Generate lettered markers programmatically
  - POI icon set
  - **Tests:** Marker generation, icon loading
  - **Time:** 2 hours

- [ ] **Task 4.10:** Style all UI components
  - CSS for legends, controls, popups
  - Responsive breakpoints
  - **Time:** 3 hours

---

### **Epic 5: Integration & Polish** (2-3 days)

- [ ] **Task 5.1:** Create public API (index.ts)
  - `TravelMap.create()` function
  - Config validation
  - Error handling wrapper
  - **Tests:** API initialization, config validation
  - **Time:** 2 hours

- [ ] **Task 5.2:** Implement error handling
  - Fatal error overlay (data not found)
  - Warning banner (partial errors)
  - Toast notifications
  - **Tests:** Various error scenarios
  - **Time:** 3 hours

- [ ] **Task 5.3:** Implement loading states
  - Progress indicator during data load
  - Skeleton screens for legends
  - **Tests:** Loading states render correctly
  - **Time:** 2 hours

- [ ] **Task 5.4:** Create example HTML page
  - Simple single-trip example
  - Multi-trip meta-map example
  - **Time:** 1.5 hours

- [ ] **Task 5.5:** Write user documentation
  - `docs/user-guide.md` (how to use library)
  - `docs/configuration.md` (config options)
  - `docs/examples.md` (code examples)
  - **Time:** 3 hours

- [ ] **Task 5.6:** Run full e2e test suite
  - Test all user interactions
  - Cross-browser testing (Chrome, Firefox, Safari)
  - Mobile device testing
  - **Time:** 3 hours

- [ ] **Task 5.7:** Performance optimization
  - Profile rendering with large datasets
  - Optimize LOD thresholds
  - Bundle size analysis
  - **Time:** 3 hours

- [ ] **Task 5.8:** Final polish & bug fixes
  - Address any issues from testing
  - UI/UX refinements
  - **Time:** 4 hours

---

### **Total Time Estimate: 15-20 days** (aggressive but achievable)

---

## **5. Testing Matrix**

| Component | Unit Tests | Integration Tests | E2E Tests |
|-----------|-----------|------------------|-----------|
| **Preprocessing** | ✅ Parse GPX/KML<br>✅ Timezone lookup<br>✅ Sun calculation<br>✅ Day boundaries<br>✅ Simplification | ✅ Full trip processing<br>✅ Error handling | N/A |
| **DataLoader** | ✅ Fetch & parse JSON<br>✅ Validation<br>✅ Error handling | ✅ Load real GeoJSON file | ✅ Network failures |
| **MapEngine** | ✅ Initialization<br>✅ Projection setup | ✅ Basemap switching | ✅ Map renders in browser |
| **LayerManager** | ✅ Add/remove layers<br>✅ Style calculation<br>✅ LOD selection | ✅ Layer interactions with map | ✅ Track visibility toggle |
| **StateManager** | ✅ State updates<br>✅ Getters/setters | ✅ State changes trigger UI updates | N/A |
| **TrackLegend** | ✅ Render logic<br>✅ Event handlers | ✅ Legend interacts with map | ✅ Click checkbox hides track |
| **AttributeLegend** | ✅ Color scale generation | ✅ Attribute change updates map | ✅ Select attribute, verify colors |
| **POILegend** | ✅ Render POIs<br>✅ Marker generation | ✅ POIs appear on map | ✅ Click POI, map zooms |
| **ZoomControl** | ✅ Button actions<br>✅ Slider value | ✅ Zoom changes map | ✅ Click +/-, verify zoom |
| **InfoPopup** | ✅ Content rendering | ✅ Popup positioning | ✅ Click track, popup appears |
| **ColorRamps** | ✅ Color calculations<br>✅ Edge cases (min/max) | N/A | N/A |
| **Public API** | ✅ Config validation<br>✅ Error handling | ✅ Full initialization flow | ✅ Load example HTML page |

**Edge Cases to Test:**
- Empty trip (no tracks)
- Single track
- 100+ tracks (performance)
- Track with no elevation data
- All tracks hidden by default
- Multi-trip meta-map
- Mobile viewport (<600px)
- Slow network (throttle to 3G)
- Malformed GeoJSON
- Missing metadata.json
