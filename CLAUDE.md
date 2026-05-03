# Nomad Path — Claude Code Context

The original project specification is preserved in git history. This file records implementation state and deviations.

## Epic Progress
- [x] Epic 1: Project setup
- [x] Epic 2: Preprocessing pipeline (parsers, enrichment, grouping, output) — 127 unit tests
- [x] Epic 3: Core library (DataLoader, MapEngine, LayerManager) — 127 unit tests + 26 e2e tests
- [x] Epic 4: UI components (TrackLegend, AttributeLegend, POILegend, MobileMenu, MapControls) — 240 unit tests + 66 e2e tests
- [x] Epic 5: Watch mode — `npm run watch` for incremental map building on the go
- [x] Epic 6: Testing — three test categories (unit, library integration, seam), realistic fixtures, test-driven bug discovery. Watcher tests deferred to Epic 9 (then Epic 10).
- [x] Epic 9: Preprocessing output guarantee — atomic writes, unlink-on-failure, watch.js status sidecar, crash cleanup. Watcher *tests* split out to Epic 10 after a mid-epic audit found foundational test-strategy problems. Plan: `~/.claude/plans/epic9-preprocessing-guarantee.md`.
- [x] Epic 10: Preprocessing & watcher test remediation — closed 2026-05-03 with invariant-only scope after the planned Phase 2 hit a circular dependency between this epic, Epic 11 (schema), and Epic 12 (preprocessing improvements). Final scope: P-Unit gap closures (sun-angle anchors, FlightAware precedence, no-timestamp fallback edge cases, unsupported-file skip-and-continue), library-side `_ranges` pairing test, fixture meta-invariant on non-overlapping ranges, naming refactor (`test:integration` → `test:library`, drop "Level N" terminology). Watcher harness deferred to its own future epic to be sequenced in front of Epic 12. Plan: `~/.claude/plans/let-s-continue-this-epic-logical-dahl.md` (close-out plan), original at `~/.claude/plans/epic10-preprocessing-watcher-tests.md`. Phase 1 analysis at `docs/test-analysis/preprocessing-watcher-2026-04-28.md` (still authoritative input for Epic 11 / 12 / 14 / harness epic).
- [ ] Epic 11: Schema as shared contract — top-level `schema/` folder peer to `src/` and `preprocessing/`, valibot artifact (single source for types + runtime validator), build-time deep validation in preprocessing (refuses to write on failure), load-time light envelope check in library (per-feature skip+warn+count). Library imports types only; no runtime schema-lib in the bundle. Replaces the Phase 1.5 tests-only decision after each test-design loop revealed a new shape of the same preprocessing-vs-library spec drift bug class. Plan: `~/.claude/plans/epic11-schema-shared-contract.md`.
- [ ] Epic 12: Preprocessing improvements — user-configurable input ignores via `nomadpath.yaml` (fixes `.git/` flooding watch.js), default ignore patterns for common noise, chronological output sort, same-date flight grouping, other config items TBD. Plan: `~/.claude/plans/epic12-preprocessing-improvements.md`. Depends on Epic 11's schema foundation.
- [ ] Epic 13: E2E rename + thinning — rename `seam` → `e2e`. Decide thin (if Epics 10 + 11 leave contract solid) or thicken (if not) at start. Reactive state sync (old Epic 8) considered as one possible approach. Plan: `~/.claude/plans/epic13-e2e-rename-thinning.md`.
- [ ] Epic 14: Library test remediation — analysis + cleanup + new tests for library code, modelled on Epic 10. Mobile-only library UI bug class lives here (mobile emulation as Playwright project). No plan file yet. Carry-over from Epic 10 Phase 2 Session A: the `metadata.attributeRanges` → `LayerManager._ranges` initial-load consumption test was deferred here because the natural test surfaces an `AttributeLegend` recompute-vs-metadata precedence question that's better handled as an L-Unit test of `LayerManager.addLayers`. Analysis: `docs/test-analysis/preprocessing-watcher-2026-04-28.md` §3 area 1 #2.
- [ ] Future: Watcher test harness — sequenced in front of Epic 12. Carries the watcher-lifecycle invariant tests (atomic write, unlink-on-failure, status sidecar, crash cleanup, SIGINT/SIGTERM, orphan reaping) and Epic-12-specific watcher behaviour tests once Epic 12's scope crystallises. Split out from Epic 10 because building a bullet-proof harness against today's surface would be invalidated by Epic 12's not-yet-known config/behaviour changes. No plan file yet. Analysis input: `docs/test-analysis/preprocessing-watcher-2026-04-28.md` §3 area 3 (Epic 9 invariants).
- [ ] Future: Library improvements — UI/UX work (mobile sidebar UX rethink, track/day-group and POI category group-level zoom, remove redundant "Colour by" from demo toolbar, etc.). Multiple smaller epics scoped per feature/area when picked up.
- [ ] Future: Performance improvements — colour change performance, MapLibre tile NetworkError noise, sun-angle bucketing decision (gated on perf testing). Needs benchmarks + before/after measurements; own epic when picked up.
- [ ] Future: Natural disaster data parsers (earthquakes, bushfires, cyclones)

## Current Status
- Epic 9 closed 2026-04-26 with preprocessing-side fixes: atomic temp+rename writes, unlink-on-failure on every non-success exit path, watch.js `--status-file` (hidden test instrumentation), `-o`/`-p` flags, crash cleanup of orphaned serve children.
- Tests: unit + library + e2e all green via `npm run test:all`. Watcher tests pending a future epic (sequenced in front of Epic 12).
- Epic 10 closed 2026-05-03 with invariant-only scope (P-Unit math gaps + library `_ranges` pair + fixture meta-invariant + naming refactor). Watcher harness split out because it can't be built bullet-proof until Epics 11 and 12 stabilise the preprocessing surface; building it now would create test infrastructure that future epics would invalidate.
- Epic 11 (schema) plan written 2026-05-02; implementation not yet started.

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

## State-sync architecture
Library has NO internal sync system between `LayerManager` and UI components. Cross-component updates are wired by hand: `TrackLegend.onVisibilityChange` callback → `attrLegend.updateRanges()` → `LayerManager.updateRanges()`; `setBasemap` restoration manually replays each surface (`src/index.ts:189-213`). `LayerManager` mutators emit no events; `UIContext` is a struct of references with no notification channel.

Consequences:
- New code paths that mutate `_visibleIds` / `_ranges` / `_colourAttribute` / `_visiblePOICategories` must remember to invoke every dependent UI component. Forgetting one produces silent UI staleness — this is the bug class behind several earlier fixes.
- Broad, low-maintenance state-sync test coverage is not feasible over a manual-callback architecture. Any test design either enumerates per-action expectations (high churn) or asserts mere internal consistency (misses the bug class).

**Possible fix considered for Epic 13** — see `~/.claude/plans/epic13-e2e-rename-thinning.md` (and the superseded Epic 8 plan it references for full implementation details). Until then, hand-written integration tests in `test/integration/legends.spec.ts` are the pragmatic floor for state-sync coverage. Do NOT invest in a generic state-sync test framework that assumes the manual-callback design is permanent; it may not survive Epic 13.

## Testing Architecture

Three test categories in place; a watcher harness is pending a future epic (sequenced in front of Epic 12).

**`npm run test:unit`** (`preprocessing/lib/*.test.js`, `src/core/*.test.ts`): Pure logic, no DOM/map/server. Vitest.

**`npm run test:library`** (`test/integration/`): JS library in a browser with a pipeline-generated fixture. Tests visibility, filters, paint properties, basemap restore, attribute ranges, DOM sync, stress/stability. Playwright + Chromium.

**`npm run test:e2e`** (`test/e2e/`): Raw input files → `build:data` → static server → browser → assertions. Tests the seam between pipeline output and library input. Playwright + Chromium.

**Watcher tests** (pending future epic): raw inputs → `npm run watch` → browser → file mutations → rebuild → reload → assertions. Will test the file lifecycle, concurrency, and the load-bearing invariant *preprocessing output is library-compatible or absent — never partial, never stale*. Sequenced in front of Epic 12 so its preprocessing changes ship with regression cover.

### Test directory structure
```
test/
  fixtures/
    map/              — raw GPX/KML/yaml for fixture generation (library + e2e)
  integration/        — test:library Playwright tests + test.html + dist/ + fixture.geojson
  e2e/                — test:e2e Playwright tests
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
- **Playwright browsers**: binaries in `~/.cache/ms-playwright/` (global/shared, not in node_modules). First-time setup: `npm run test:library:install`. `clean` script only removes `dist/`.
- **MapLibre 4.7.1**: does NOT emit `style.load` after `setStyle()`. Use `styledata` event + check for source absence + try/catch on `addLayers`. `isStyleLoaded()` also unreliable (depends on tile loading). See `src/index.ts setBasemap()`.
- **MapLibre GeoJSON + symbol layers**: Adding a symbol layer to the same source as a circle layer gates circle tile delivery on glyph loading. Always use a SEPARATE source for label/symbol layers.
- **Playwright headless**: `idle` event never fires with OSM basemap (tile fetches stay pending). `querySourceFeatures` unreliable; use `source.serialize().data.features` for data checks. Use `waitForFunction` polling `queryRenderedFeatures` for render checks. `isMoving()` is reliable; `isStyleLoaded()` is not.
- **serve.json trailingSlash**: `serve.json` has `trailingSlash: true` (needed for demo routing). Integration tests use `serve ./test/integration` (scoped, not `serve .`) so this no longer affects tests. `test/integration/test.html` uses absolute paths (`/dist/nomad-path.js`, `/fixture.geojson`) which resolve correctly from the `test/integration/` root.
- **Integration test helpers**: shared `test/integration/helpers.ts` exports `TEST_PAGE = '/test.html'` and `gotoMap()`. `gotoMap` checks `response.status() === 200` immediately (fails fast on wrong path) then waits up to 1s for `nomadMapReady`. `playwright.config.ts` imports nothing from helpers — `webServer.url` is just `BASE_URL` (server-up check only).
- **Locator ambiguity**: `.np-day-group .np-track-row__checkbox` matches BOTH the group-level checkbox (in `.np-day-header`) AND track-row checkboxes. Always use `.np-track-row .np-track-row__checkbox` for track-level only.

## npm Scripts
See [docs/developer.md](docs/developer.md) for full descriptions.
Scripts: `build:lib` / `build:data` / `build:demo` / `demo` / `watch` / `typecheck` / `lint` / `lint:fix` / `format` / `test:unit` / `test:coverage` / `test:unit:watch` / `test:library` / `test:e2e` / `test:all` / `test:all:browsers` / `test:library:debug` / `test:e2e:debug` / `test:library:install` / `clean`
Private (composition only): `_copy:demo` / `_copy:library` / `_build:library`
Pre-commit hook: lint-staged → typecheck → test:coverage (fails if thresholds drop).
Dev process: `test:unit` or `test:library` during development. `test:all` before merge/end of epic. `test:all:browsers` before major milestones.

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
