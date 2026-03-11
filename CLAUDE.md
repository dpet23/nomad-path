# Nomad Path — Claude Code Context

See `PROJECT_SPEC.md` for full requirements. This file records implementation state and deviations.

## Epic Progress
- [x] Epic 1: Project setup
- [x] Epic 2: Preprocessing pipeline (parsers, enrichment, grouping, output) — 127 unit tests
- [x] Epic 3: Core library (DataLoader, MapEngine, LayerManager) — 127 unit tests + 26 e2e tests
- [ ] Epic 4: UI components (TrackLegend, AttributeLegend, POI markers, mobile menu)
- [ ] Epic 5: Integration & polish
- [ ] Future: Natural disaster data parsers (earthquakes, bushfires, cyclones)

## Current Status
- Epic 3 complete and manually verified. Starting Epic 4.
- 127 unit tests + 26 Playwright e2e tests, all passing
- Bugs fixed in Epic 3: basemap switch layer restoration, fitToTracks visibility filter, initial bounds visibility filter, POI circles not rendering on OSM, POI labels not rendering (wrong glyph URL path + missing text-font)
- POI root cause: MapLibre gates GeoJSON tile delivery on glyph loading when a symbol layer shares the source. Fix: `np-pois` (circles) and `np-pois-labels-src` (labels) are now separate sources.
- openfreemap font server: use `/fonts/` path (not `/glyphs/`) and `Noto Sans Regular` (not the MapLibre default "Open Sans Regular" which openfreemap doesn't serve)

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
e2e/            Playwright tests (fixture.geojson, test.html, map.spec.ts)
```

## Rendering Architecture
- Per-segment: each track → 2-point LineString features with all attributes embedded
- Antimeridian: segments with |dLon| > 180 split at ±180° in `buildSegmentFeatures`
- Day rainbow: `interpolate-hcl` with stops at 1/3 (green) and 2/3 (cyan) — forces forward 270° arc
- Flight day keys: `flight-YYYY-MM-DD-name-slug` — embed date for chronological sorting in Epic 4 legend

## Group / Visibility System
Named immediate subfolders define track groups. Optional `nomadpath.yaml` at input root:
```yaml
groups:
  flights-2025:
    defaultVisible: false
```
Generate template: `npm run build:data -- -i <dir> --init`

## Dynamic Attribute Ranges (deferred to Epic 4)
On visibility toggle, recompute elevation/speed min/max from visible tracks in GeoJSON source.
Show "Elevation: 0–847m · based on visible tracks" in attribute legend.

## Toolchain Gotchas
- **ESLint**: v8.57, legacy `.eslintrc.json` format. `eslint-plugin-prefer-arrow-functions` removed (ESLint 9+ only)
- **Vitest**: v2, `passWithNoTests: true`
- **suncalc**: CJS module — `import suncalc from 'suncalc'; const { getPosition, getTimes } = suncalc;`
- **tsconfig split**: `tsconfig.json` (IDE), `tsconfig.rollup.json` (Rollup), `tsconfig.node.json` (preprocessing)
- **Playwright browsers**: binaries in `~/.cache/ms-playwright/` (global/shared, not in node_modules). First-time setup: `npm run test:e2e:install`. `clean` script only removes `dist/`.
- **MapLibre 4.7.1**: does NOT emit `style.load` after `setStyle()`. Use `styledata` event + check for source absence + try/catch on `addLayers`. `isStyleLoaded()` also unreliable (depends on tile loading). See `src/index.ts setBasemap()`.
- **MapLibre GeoJSON + symbol layers**: Adding a symbol layer to the same source as a circle layer gates circle tile delivery on glyph loading. Always use a SEPARATE source for label/symbol layers.
- **Playwright headless**: `idle` event never fires with OSM basemap (tile fetches stay pending). `querySourceFeatures` unreliable; use `source.serialize().data.features` for data checks. Use `waitForFunction` polling `queryRenderedFeatures` for render checks. `isMoving()` is reliable; `isStyleLoaded()` is not.

## npm Scripts
```
build:lib          rollup -c  →  dist/nomad-path.js
build:data         node preprocessing/build-trip-data.js -i <dir> [-o <file>] [-n <name>]
test:unit          vitest run  (fast, no coverage report)
test:coverage      npm run test:unit -- --coverage  (unit + coverage gate, used in pre-commit)
test:e2e:install   playwright install chromium  (one-time per machine)
demo               build:lib + npx serve .  (requires demo/trip-data.geojson from build:data)
test:e2e           build:lib + playwright test --project=chromium
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
