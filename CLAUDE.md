# Nomad Path — Claude Code Context

See `PROJECT_SPEC.md` for full requirements. This file records implementation state and deviations.

## Epic Progress
- [x] Epic 1: Project setup
- [x] Epic 2: Preprocessing pipeline (parsers, enrichment, grouping, output) — 127 unit tests
- [x] Epic 3: Core library (DataLoader, MapEngine, LayerManager) — 127 unit tests + 26 e2e tests
- [x] Epic 4: UI components (TrackLegend, AttributeLegend, POILegend, MobileMenu, MapControls) — 240 unit tests + 66 e2e tests
- [x] Epic 5: Watch mode — `npm run watch` for incremental map building on the go
- [ ] Epic 6: Testing — close e2e and unit test gaps identified in Epic 4 retrospective
- [ ] Epic 7: Cleanup & polish — UX improvements, preprocessing fixes, performance
- [ ] Future: Natural disaster data parsers (earthquakes, bushfires, cyclones)

## Current Status
- Epic 5 complete (branch `epic/watch`, not yet merged to master). Starting Epic 6.
- 240 unit tests + 66 Playwright e2e tests, all passing
- Epic 4 additions: TrackLegend, AttributeLegend, POILegend, MobileMenu, MapControls, CSS injection, BasePanel, ColorRamps extraction, dynamic attribute ranges, POI category visibility + defaultVisible from yaml, setBasemap state restoration (tracks + colour attribute + ranges + POI categories), native MapControls (fit-to-tracks button top-left, basemap select top-right)
- Bugs fixed in Epic 4: setBasemap() discarded dynamic ranges (AttributeLegend constructor didn't sync LayerManager._ranges); setBasemap() POI category restoration was one-directional; serve.json trailingSlash broke test.html relative paths (fixed with absolute paths)
- Bugs fixed in Epic 3: basemap switch layer restoration, fitToTracks visibility filter, initial bounds visibility filter, POI circles not rendering on OSM, POI labels not rendering (wrong glyph URL path + missing text-font)

## Key Deviations from Spec
- Public API class is `NomadPath` (not `TravelMap` — spec name is outdated)
- `build:lib` not `build` (npm script name)

## Architecture
```
src/data/       TypeScript interfaces (Model)
src/core/       DataLoader, MapEngine, LayerManager (Controller)
src/ui/         HTML overlay components (View) — Epic 4
src/styling/    ColorRamps, SymbolLibrary (pure functions)
src/index.ts    Public API (NomadPath.create)
preprocessing/  Node.js GPX/KML → trip-data.geojson pipeline
demo/           index.html demo page (npx serve .)
e2e/            Playwright tests (fixture.geojson, test.html, map.spec.ts, legends.spec.ts)
```

## Rendering Architecture
- Per-segment: each track → 2-point LineString features with all attributes embedded
- Antimeridian: segments with |dLon| > 180 split at ±180° in `buildSegmentFeatures`
- Day rainbow: `interpolate-hcl` with stops at 1/3 (green) and 2/3 (cyan) — forces forward 270° arc
- Flight day keys: `flight-YYYY-MM-DD-name-slug` — embed date for chronological sorting in legend

## Group / Visibility System
Named immediate subfolders define track groups. Optional `nomadpath.yaml` at input root:
```yaml
groups:
  flights-2025:
    defaultVisible: false
```
Generate template: `npm run build:data -- -i <dir> --init`

## Dynamic Attribute Ranges
On visibility toggle, recompute elevation/speed min/max from visible tracks only.
`AttributeLegend.updateRanges(visibleIds)` calls `computeVisibleRanges()`, updates label, calls `ctx.layers.updateRanges()` to sync MapLibre paint property.
CRITICAL: `AttributeLegend` constructor must call `ctx.layers.updateRanges(this._ranges)` immediately after computing ranges — otherwise `LayerManager._ranges` stays at static merged-metadata until first toggle.

## Two-Layer Observable State (testing lesson)
Range LABEL and map PAINT PROPERTY are separate state. Tests that only check the legend label pass even when map colours are wrong. Always test BOTH:
- Label: text content of `.np-attr-range`
- Layer ranges: `(window as any).nomadMap._layers._ranges?.speed?.min` (TypeScript private = JS runtime public)

## e2e Fixture Design
`e2e/fixture.geojson` uses NON-OVERLAPPING attribute ranges per track so any hidden-track leakage is detectable by exact value:
- Tokyo Drive (visible): speed [30,45,60] km/h, elevation [10,15,20] m
- Sydney Walk (defaultVisible: false): speed [3,5,7] km/h, elevation [1,2,3] m
- Helsinki Flight (visible): speed [200,500,800] km/h, elevation [5000,7500,10000] m
- POI: "Mount Takao" viewpoint, defaultVisible: false
Expected label constants (write from memory, not from running code):
  `SPEED_LABEL_VISIBLE = 'Speed: 30-800 km/h'` (Tokyo+Helsinki only)
  `SPEED_LABEL_ALL     = 'Speed: 3-800 km/h'`  (all 3 tracks)
  `SPEED_LABEL_TOKYO   = 'Speed: 30-60 km/h'`  (Tokyo only)

## Toolchain Gotchas
- **ESLint**: v8.57, legacy `.eslintrc.json` format. `eslint-plugin-prefer-arrow-functions` removed (ESLint 9+ only)
- **Vitest**: v2, `passWithNoTests: true`
- **suncalc**: CJS module — `import suncalc from 'suncalc'; const { getPosition, getTimes } = suncalc;`
- **tsconfig split**: `tsconfig.json` (IDE), `tsconfig.rollup.json` (Rollup), `tsconfig.node.json` (preprocessing)
- **Playwright browsers**: binaries in `~/.cache/ms-playwright/` (global/shared, not in node_modules). First-time setup: `npm run test:e2e:install`. `clean` script only removes `dist/`.
- **MapLibre 4.7.1**: does NOT emit `style.load` after `setStyle()`. Use `styledata` event + check for source absence + try/catch on `addLayers`. `isStyleLoaded()` also unreliable (depends on tile loading). See `src/index.ts setBasemap()`.
- **MapLibre GeoJSON + symbol layers**: Adding a symbol layer to the same source as a circle layer gates circle tile delivery on glyph loading. Always use a SEPARATE source for label/symbol layers.
- **Playwright headless**: `idle` event never fires with OSM basemap (tile fetches stay pending). `querySourceFeatures` unreliable; use `source.serialize().data.features` for data checks. Use `waitForFunction` polling `queryRenderedFeatures` for render checks. `isMoving()` is reliable; `isStyleLoaded()` is not.
- **serve.json trailingSlash**: `serve.json` has `trailingSlash: true` (needed for demo routing). This redirects `/e2e/test.html` → `/e2e/test` → `/e2e/test/`. Browser base URL becomes `/e2e/test/`, so relative paths like `../dist/` resolve to `/e2e/dist/` (404). Fix: always use ABSOLUTE paths in `e2e/test.html`: `/dist/nomad-path.js`, `/dist/nomad-path.css`, `/e2e/fixture.geojson`.
- **Locator ambiguity**: `.np-day-group .np-track-row__checkbox` matches BOTH the group-level checkbox (in `.np-day-header`) AND track-row checkboxes. Always use `.np-track-row .np-track-row__checkbox` for track-level only.

## npm Scripts
```
build:lib          rollup -c  →  dist/nomad-path.js
build:data         node preprocessing/build-trip-data.js -i <dir> [-o <file>] [-n <name>]
test:unit          vitest run  (fast, no coverage report)
test:coverage      npm run test:unit -- --coverage  (unit + coverage gate, used in pre-commit)
test:e2e:install   playwright install chromium  (one-time per machine)
demo               build:lib + copy:demo + npx serve ./demo  (requires demo/trip-data.geojson from build:data)
watch              build:lib + copy:demo + node preprocessing/watch.js -i <dir> [-n <name>]
test:e2e           build:lib + copy:e2e + playwright test --project=chromium
test:e2e:all       build:lib + playwright test  (chromium + firefox + webkit)
test:e2e -- --grep "pattern"   run specific tests by name
dev / lint / lint:fix / format / typecheck / test:watch / clean
```
Pre-commit hook: lint-staged → typecheck → test:coverage (fails if thresholds drop).
E2e tests run at the end of each epic via `npm run test:e2e`.

## Real Data
- `/home/dan/Documents/holidays/` — DO NOT COPY OR COMMIT
- 5 trips: 2022 Europe, 2024 NZ Auckland, 2024 Vanuatu, 2025 Fiji, 2025 Hawaii
- FlightAware KML: `gx:Track` format, detected by `<Document><name>` starting with "FlightAware"
- OsmAnd activities: car, passenger, Public transport, Snorkel, Horseback, Zipline, Driving, Hiking, Walking

## Commit Style
- No `Co-Authored-By` trailers
