# Nomad Path — Claude Code Context

The original project specification is preserved in git history. This file records implementation state and deviations.

## Epic Progress
- [x] Epic 1: Project setup
- [x] Epic 2: Preprocessing pipeline (parsers, enrichment, grouping, output) — 127 unit tests
- [x] Epic 3: Core library (DataLoader, MapEngine, LayerManager) — 127 unit tests + 26 e2e tests
- [x] Epic 4: UI components (TrackLegend, AttributeLegend, POILegend, MobileMenu, MapControls) — 240 unit tests + 66 e2e tests
- [x] Epic 5: Watch mode — `npm run watch` for incremental map building on the go
- [x] Epic 6: Testing — three-level test architecture (unit, integration, e2e), realistic fixtures, test-driven bug discovery. Level 4 (watch) deferred to Epic 9.
- [ ] Epic 7: Cleanup & polish — UX improvements, preprocessing fixes, performance
- [ ] Epic 8: Reactive state sync — replace manual UI/LayerManager wiring with typed events; enables low-maintenance state-sync test layer (plan: `~/.claude/plans/epic8-reactive-state-sync.md`)
- [ ] Epic 9: Preprocessing output guarantee + Level 4 watch tests — atomic writes, unlink-on-failure, status sidecar; tests prove output is library-compatible-or-absent under all watch-mode failure modes (plan: `~/.claude/plans/epic9-preprocessing-guarantee.md`)
- [ ] Future: Natural disaster data parsers (earthquakes, bushfires, cyclones)

## Current Status
- Epic 6 closed: three-level test architecture in place. Level 4 (watch mode) split out as Epic 9 because it requires preprocessing changes (atomic writes, output-or-absent invariant) larger than Epic 6's scope.
- Tests: unit + integration + e2e all green via `npm run test:all`
- Epic 5 additions: `preprocessing/watch.js` (file watcher + serve), `copy:demo`/`clean` scripts, `test/integration/helpers.ts` with shared `TEST_PAGE`/`gotoMap` fast-fail
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
test/           All browser-level tests and fixtures (see Testing Architecture below)
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

## State-sync architecture (Epic 8 prerequisite)
Library has NO internal sync system between `LayerManager` and UI components. Cross-component updates are wired by hand: `TrackLegend.onVisibilityChange` callback → `attrLegend.updateRanges()` → `LayerManager.updateRanges()`; `setBasemap` restoration manually replays each surface (`src/index.ts:189-213`). `LayerManager` mutators emit no events; `UIContext` is a struct of references with no notification channel.

Consequences:
- New code paths that mutate `_visibleIds` / `_ranges` / `_colourAttribute` / `_visiblePOICategories` must remember to invoke every dependent UI component. Forgetting one produces silent UI staleness — this is the bug class behind several Epic 3/4 fixes.
- Broad, low-maintenance state-sync test coverage is not feasible over a manual-callback architecture. Any test design either enumerates per-action expectations (high churn) or asserts mere internal consistency (misses the bug class).

**Fix is Epic 8** — see `~/.claude/plans/epic8-reactive-state-sync.md`. Until then, hand-written integration tests in `test/integration/legends.spec.ts` are the pragmatic floor for state-sync coverage. Do NOT invest in a generic state-sync test framework before Epic 8 lands; it will not survive the architectural change.

## Testing Architecture

Three test levels in place; a fourth (watch) is planned as Epic 9.

**Level 1 — Unit** (`preprocessing/lib/*.test.js`, `src/core/*.test.ts`): Pure logic, no DOM/map/server. `npm run test:unit`

**Level 2 — Integration** (`test/integration/`): JS library in a browser with a pipeline-generated fixture. Tests visibility, filters, paint properties, basemap restore, attribute ranges, DOM sync, stress/stability. `npm run test:integration`

**Level 3 — E2E** (`test/e2e/`): Raw input files → `build:data` → static server → browser → assertions. Tests the seam between pipeline output and library input. `npm run test:e2e`

**Level 4 — Watch** (planned, Epic 9): Raw inputs → `npm run watch` → browser → file mutations → rebuild → reload → assertions. Will test the file lifecycle, concurrency, and the load-bearing invariant *preprocessing output is library-compatible or absent — never partial, never stale*. Plan: `~/.claude/plans/epic9-preprocessing-guarantee.md`.

### Test directory structure
```
test/
  fixtures/
    map/              — raw GPX/KML/yaml for fixture generation (Levels 2+3)
  integration/        — Level 2 Playwright tests + test.html + dist/ + fixture.geojson
  e2e/                — Level 3 Playwright tests
```

### Fixture strategy
Fixtures are realistic and adversarial — real GPX/KML structure, realistic point counts, real extension formats, real edge cases. `build:data -i test/fixtures/map -o test/integration/fixture.geojson` generates the fixture from pipeline output. Test constants are derived from pipeline output, never guessed.

### Console error detection
All browser-level tests use a shared Playwright fixture that listens for `page.on('pageerror')` and `console.error`, collecting errors and failing the test with the actual message. Prevents silent hangs — tests fail fast with "Uncaught TypeError: ..." not "Timeout of 30000ms exceeded." MapLibre tile fetch 404s are filtered.

### Discovery process
Do NOT follow test checklists. Read the code, think about what can go wrong, write a test that asserts what SHOULD happen, fix what breaks, follow the threads. Failure mode categories (thinking framework, not checklist): state integrity, seam correctness, stress/stability, graceful degradation, cleanup, file lifecycle, concurrency, reset behaviour.

### Fixture design principles
Fixtures must use NON-OVERLAPPING attribute ranges per track so any hidden-track leakage is detectable by exact value. Test constants (track IDs, speed labels) are derived from pipeline output after generation.

## Toolchain Gotchas
- **ESLint**: v8.57, legacy `.eslintrc.json` format. `eslint-plugin-prefer-arrow-functions` removed (ESLint 9+ only)
- **Vitest**: v2, `passWithNoTests: true`
- **suncalc**: CJS module — `import suncalc from 'suncalc'; const { getPosition, getTimes } = suncalc;`
- **tsconfig split**: `tsconfig.json` (IDE), `tsconfig.rollup.json` (Rollup), `tsconfig.node.json` (preprocessing)
- **Playwright browsers**: binaries in `~/.cache/ms-playwright/` (global/shared, not in node_modules). First-time setup: `npm run test:integration:install`. `clean` script only removes `dist/`.
- **MapLibre 4.7.1**: does NOT emit `style.load` after `setStyle()`. Use `styledata` event + check for source absence + try/catch on `addLayers`. `isStyleLoaded()` also unreliable (depends on tile loading). See `src/index.ts setBasemap()`.
- **MapLibre GeoJSON + symbol layers**: Adding a symbol layer to the same source as a circle layer gates circle tile delivery on glyph loading. Always use a SEPARATE source for label/symbol layers.
- **Playwright headless**: `idle` event never fires with OSM basemap (tile fetches stay pending). `querySourceFeatures` unreliable; use `source.serialize().data.features` for data checks. Use `waitForFunction` polling `queryRenderedFeatures` for render checks. `isMoving()` is reliable; `isStyleLoaded()` is not.
- **serve.json trailingSlash**: `serve.json` has `trailingSlash: true` (needed for demo routing). Integration tests use `serve ./test/integration` (scoped, not `serve .`) so this no longer affects tests. `test/integration/test.html` uses absolute paths (`/dist/nomad-path.js`, `/fixture.geojson`) which resolve correctly from the `test/integration/` root.
- **Integration test helpers**: shared `test/integration/helpers.ts` exports `TEST_PAGE = '/test.html'` and `gotoMap()`. `gotoMap` checks `response.status() === 200` immediately (fails fast on wrong path) then waits up to 1s for `nomadMapReady`. `playwright.config.ts` imports nothing from helpers — `webServer.url` is just `BASE_URL` (server-up check only).
- **Locator ambiguity**: `.np-day-group .np-track-row__checkbox` matches BOTH the group-level checkbox (in `.np-day-header`) AND track-row checkboxes. Always use `.np-track-row .np-track-row__checkbox` for track-level only.

## npm Scripts
See [docs/developer.md](docs/developer.md) for full descriptions.
Scripts: `build:lib` / `build:data` / `build:demo` / `demo` / `watch` / `typecheck` / `lint` / `lint:fix` / `format` / `test:unit` / `test:coverage` / `test:unit:watch` / `test:integration` / `test:e2e` / `test:all` / `test:all:browsers` / `test:integration:debug` / `test:e2e:debug` / `test:integration:install` / `clean`
Private (composition only): `_copy:demo` / `_copy:integration` / `_build:integration`
Pre-commit hook: lint-staged → typecheck → test:coverage (fails if thresholds drop).
Dev process: `test:unit` or `test:integration` during development. `test:all` before merge/end of epic. `test:all:browsers` before major milestones.

## Real Data
- `/home/dan/Documents/holidays/` — DO NOT COPY OR COMMIT
- 5 trips: 2022 Europe, 2024 NZ Auckland, 2024 Vanuatu, 2025 Fiji, 2025 Hawaii
- FlightAware KML: `gx:Track` format, detected by `<Document><name>` starting with "FlightAware"
- OsmAnd activities: car, passenger, Public transport, Snorkel, Horseback, Zipline, Driving, Hiking, Walking

## Release Process
Tag-then-bump. See [docs/developer.md](docs/developer.md#release-process) for the full commands.

## Commit Style
- No `Co-Authored-By` trailers
See [docs/developer.md](docs/developer.md#commit-style) for full guidelines.
