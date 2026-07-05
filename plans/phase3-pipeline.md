# Phase 3: Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline), task-by-task.
> Master plan: `~/.claude/plans/let-s-work-on-the-tingly-pretzel.md`. Design doc: `plans/looking-to-plan-the-piped-nova.md`.
> Branch: `epic/pipeline` (already cut). All work branches; merge `--no-ff` at phase end.

**Goal:** `@nomadpath/preprocess` turns a folder of raw GPX/KML + `nomadpath.yaml` into one validated `trip-data.json` matching `@nomadpath/contract`. Strict producer: collect ALL errors, fail once, publish nothing until clean. Ships `nomadpath-preprocess` (with `--audit`).

**Architecture:** staged pipeline over a common intermediate model. Per-format **parsers** (GPX, KML) are the swappable edge; the middle is format-agnostic stages: resolve config -> compute -> assemble -> validate -> emit. Each stage is a pure function, unit-tested in isolation. Mirrors the UI's core+adapters shape.

**Tech stack additions (pipeline-local deps):** `fast-xml-parser` (GPX/KML), `yaml` (config), `tz-lookup` (timezone from lon/lat), `suncalc` (sun angle), `picomatch` (glob selectors). All single-consumer -> `packages/preprocess/package.json`.

## Global constraints (from design log)

- **GoPro naive timestamps = UTC**; sanity-check loudly if a parsed time is absurd.
- **Transport mode = `osmand:activity` ONLY** (`metadata/extensions` or `trk/extensions`); legacy `transport`/`keywords` are NOT inputs and are ignored (legacy-only detection deferred, no audit mode - see design log 2026-07-04).
- **Missing attribute data accepted as-is** — never derive speed; pass through, absent stays absent.
- **Raw WGS84 lon/lat**, all geo math geodesic.
- **Day = local calendar date of first point** via timezone-from-location; no rollover, config override only.
- Fictional fixtures only; never copy `~/Documents/holidays` (read-only reference).
- Model stays **geometry-agnostic on both panels**; no disaster/category type detection.

## Real-data facts the parsers must handle (from corpus audit)

- **OsmAnd GPX**: `trk/trkseg/trkpt@lat@lon`, child `<ele>`, `<time>` (Zulu), `<hdop>`, `<extensions><osmand:speed>`; `metadata/name`; `metadata/extensions/osmand:activity`. Every trkpt has time.
- **AllTrails GPX**: `trk/name`, `trk/src`, `trk/extensions/osmand:activity`; `<ele>`+`<time>`, NO speed.
- **GoPro GPX**: no name; naive fractional-second `<time>` (UTC); `<ele>` (may be negative); nested `<extensions><speed_2d><value>+<unit>`; junk points `<pdop>99.99</pdop>` + `<fix>none</fix>`.
- **FlightAware KML**: `Placemark/gx:Track` = parallel `<when>` list + `<gx:coord>` list; each `gx:coord` = `lon lat ele` space-separated (lon first). `Placemark/name`,`/description`. Airport `<Placemark><Point>` waypoints in-file (recognised-but-unwanted).
- **Waypoint GPX**: `wpt@lat@lon`, `<name>`,`<desc>`,`<sym>` (URL),`<folder>`.
- **GDACS cyclone KML**: nested `<Folder>`, points+lines+polygons, HTML CDATA — parse tolerantly; disaster _rendering_ deferred, but geometry must round-trip.

## Config schema (locked 2026-07-03)

```yaml
name: Fictional Trip 2030 # optional trip name -> TripData.name
ignore: # path globs skipped entirely (scan + watch)
  - .git/
  - '**/*.swp'
tracks: # keyed by file/folder path glob (anchored at input root)
  flights/: { hidden: true, divider: true }
  flights/scenic-*.kml: { divider: false }
  cyclones/: { excludeFromBounds: true }
  tracks/day9/late-taxi.gpx: { day: 2030-01-23 }
waypoints: # keyed by in-file <folder> value
  Accommodation: { hidden: true }
```

Track-selector properties: `hidden` (bool -> defaultVisible=!hidden), `divider` (bool), `excludeFromBounds` (bool), `day` (YYYY-MM-DD override). Waypoint-selector properties: `hidden` (bool). Unlisted = defaults (visible, not divider, in bounds, day from first point).

**Resolution (additive, locked):** a path's settings = merge of ALL matching selectors, per-property. More-specific selector wins per conflicting property. **Specificity = path depth + literalness** (exact file > glob segment > parent folder). **Equal-specificity conflict on the same property = hard error** (names both selectors + property).

## Tasks

### Task 1: Common intermediate model + fixtures

**Files:** `packages/preprocess/src/model.ts`, `packages/preprocess/src/fixtures.ts`, tests.
Define the parser-output model (pre-contract): `RawFeature { sourceFile, sourcePath, name?, description?, activity?, folder?, geometries: RawGeometry[] }` where `RawGeometry` carries lon/lat/ele/time/speed parallel arrays (raw, uncomputed). Deliberately simpler than the contract — no day/divider/bounds yet.

- [x] Enumerate the model's state space; write model + fixture-builder tests first.
- [x] Implement model types + `buildRawFeature`/`buildRawGeometry` fictional builders.
- [x] Commit `feat(pipeline): add common intermediate model and fixtures`.

### Task 2: GPX parser

**Files:** `packages/preprocess/src/parse/gpx.ts`, tests with inline fictional GPX strings.
Handle OsmAnd + AllTrails + GoPro + waypoint variants: `trk`->line RawGeometry (ele/time/speed where present, speed absent for AllTrails, nested speed_2d for GoPro), `wpt`->point RawGeometry with folder/sym, `osmand:activity` from either extensions location. GoPro naive time -> UTC epoch. **Parser translates, never filters** (see design log 2026-07-04): every source point (incl. `fix=none`) and segment passes through; missing per-point time/ele/speed -> null (kept, never fabricated). Hard errors (collected, never thrown): malformed XML / non-numeric coords / a segment with < 2 points / a trk with no usable segment. Mechanism: `fast-xml-parser` `XMLParser` + `fast-xml-validator` `SyntaxValidator` (non-deprecated APIs).

- [x] State space: each source variant x each field present/absent/malformed. Write all tests first.
- [x] Implement; return `{ features: RawFeature[], errors: ParseError[] }` (never throw).
- [x] Commit `feat(pipeline): add gpx parser for osmand, alltrails, gopro, waypoints`.

### Task 3: KML parser

**Files:** `packages/preprocess/src/parse/kml.ts`, tests with inline fictional KML.
`gx:Track` (when[] + gx:coord[] "lon lat ele" space-separated) -> line; `LineString`/`Point`/`Polygon` (`coordinates` = comma-separated lon,lat[,ele] tuples) -> line/point/polygon; nested `Folder` recursion, innermost folder name -> `folder`. **One feature per Placemark, translate-not-filter** (design log 2026-07-04): a cyclone's many point+line placemarks each become their own feature; bundling them into one object and dropping recognised-unwanted airport waypoints is a LATER rule stage, NOT a parser guess or special-case. Hard errors (collected): malformed XML / non-numeric coord / when-vs-coord length mismatch / a line with < 2 points. Non-geometry furniture (ScreenOverlay, Style) silently ignored. Same mechanism as GPX (`XMLParser` + `fast-xml-validator` `SyntaxValidator`). Verified against real corpus FlightAware + GDACS cyclone files (0 errors).

- [x] State space + all tests first (incl. when/coord length mismatch = error).
- [x] Implement; same `{ features, errors }` contract as GPX.
- [x] Commit `feat(pipeline): add kml parser for flightaware and gdacs geometry`.

### Task 4: Config load + resolve

**Files:** `packages/preprocess/src/config/schema.ts` (zod), `packages/preprocess/src/config/resolve.ts`, tests.
Parse `nomadpath.yaml` (strict zod, fail loud on unknown keys). `resolveTrackSettings(path, config)` + `resolveWaypointSettings(folder, config)` implementing additive merge + depth/literalness specificity + equal-specificity-conflict hard error. `ignore` matching for the scan.

- [x] State space: single match, multiple additive matches, override, inheritance, equal-specificity conflict, no match (defaults), ignore globs. ALL tests first — this is the subtlest logic in the phase.
- [x] Implement. Commit `feat(pipeline): add config schema and additive resolution`.

**As built:** `loadConfig(yaml, sourceFile)` (strict zod, unknown keys + bad types + non-ISO `day` fail loud). Specificity scored on the ORIGINAL selector as `[segment-depth, literal-segment-count]` — a folder-prefix (`flights/`, depth 1) is deliberately less specific than a same-area file glob (`flights/scenic-*.kml`, depth 2); exact file beats glob at equal depth. Glob matching via picomatch with `{ dot: true }` (so `.git/` and `*.swp` match). Equal-specificity same-property disagreement -> hard error naming both selectors.

### Task 5: Folder scan + CLI

**Files:** `packages/preprocess/src/scan.ts`, `packages/preprocess/src/cli.ts` (bin `nomadpath-preprocess`), tests. (No `audit.ts` / `--audit` - dropped, see design log 2026-07-04.)
`scanFolder(inputDir, config)`: walk input dir, skip `ignore` matches, dispatch by extension (`.gpx` -> parseGpx, `.kml` -> parseKml, others ignored), return collected `{ features, errors }` with `sourceFile` = POSIX path relative to input root. `unmatchedSelectors(scannedPaths, folders, config)`: config `tracks:`/`waypoints:` keys that matched zero scanned files/folders (non-fatal warning input). CLI = convention+flags (`nomadpath-preprocess <dir>` + `--config` default `<dir>/nomadpath.yaml`, `--out` default `<dir>/trip-data.json`); prints unmatched-selector warnings to stderr (non-blocking); hard errors abort with the full report and emit nothing. (Emit itself wired in Task 7; Task 5 stops at scan + collected errors + warnings + arg handling.)

- [x] Tests over a fictional fixture folder tree (built in a temp dir): nested dirs, ignore globs, mixed extensions, an unreadable/bad file -> collected error, unmatched selector -> warning.
- [x] Implement. Commit `feat(preprocess): add folder scan and cli`.
- [x] **Verify over `~/Documents/holidays` read-only** — all 5 real trips scan with ZERO hard errors. Finding: 2025 Hawaii has 152 stray single-point segments (OsmAnd pause/resume); originally a fatal error, now correctly SKIPPED + counted in the status line (see design log 2026-07-04 short-segment decision). Other trips: Europe 127 features, NZ 16, Vanuatu 29, Fiji 125.

**As built:** `scanFolder` + `unmatchedSelectors` in `scan.ts`; CLI in `cli.ts` uses `commander` (auto-help). Output by severity: build status (incl. `N short segment(s) skipped`) -> stdout; unmatched-selector warnings + error report -> stderr; exit 0/1/2. `ParseResult`/`ScanResult` gained a `stats: BuildStats` channel (`shortSegmentsSkipped`, extensible). NB: TS parameter properties + enums etc. are NOT supported by Node's type-stripping (no build step) - use explicit field + assignment. CLI tested via real subprocess (`spawnSync`), so `cli.ts` shows 0% coverage though it is exercised.

### Task 6: Compute stages — DEFERRED

**Deferred wholesale** (design log 2026-07-04; spec `docs/superpowers/specs/2026-07-04-defer-compute-assemble-emit-design.md`). `day`/`sunAngle`/`bounds` are derived data whose exact shape only the (not-yet-built) UI can specify - building now is guessing. Each returns additively (one `compute/<x>.ts` + one stamp in emit + one schema field) when a UI consumer names it. `tz-lookup`/`suncalc`/`@turf/bbox` not installed.

**Anticipated later (non-committal):** `day` (+ config `day` override) and `sunAngle` return with the tree/colour UI (phase 4+/6); `bounds` (+ `excludeFromBounds`) with the map-fit need, decided on measured deck.gl evidence.

### Task 7: Emit the validated raw trip file — DONE

**Files:** `packages/preprocess/src/emit.ts`, wired into `cli.ts`, tests. (No `assemble` module - `id`/`panel`/`order` were rejected as fabricated fields with no named consumer; design log 2026-07-04.)

**As built:** `emit(features, name, outPath)` projects each `RawFeature` to the shrunk contract item `{ name?, description?, transportMode?, folder?, geometries }` (drops provenance `sourceFile`/`sourceIndex`; `activity` -> `transportMode`; `folder` raw), wraps in `{ version, name?, items }`, runs `validateTripData` (collect-all, fail loud, nothing written on failure), else writes compact JSON atomically (temp sibling + rename). Wired into `cli.ts` at the scan seam; emit-failure = exit 1 + full stderr report. Contract shrunk to the raw shape and the within-track monotonic-time check dropped (corpus verification found it rejected legitimate multi-device merges). Verified: all 5 `~/Documents/holidays` trips emit valid files (Hawaii = 320 items, 0 issues).

- [x] Tests: fixture features -> valid trip file that `validateTripData` passes AND round-trips; injected bad geometry -> full error report, no file written; provenance/fabricated fields absent; atomic (no temp leftover).
- [x] Commits: `feat(preprocess): project, validate, and atomically emit the trip file` + `feat(preprocess): wire emit into the cli` + `refactor(contract): shrink to the raw trip shape` + `fix(contract): drop within-track monotonic-time check`.

### Task 8: Config docs + phase gate

**Files:** `docs/usage/configuration.md` (NEW, in mkdocs nav), `docs/architecture/pipeline.md` (NEW), reconcile the model note in `docs/architecture/overview.md` with the shipped shrunk contract (there is no separate `data-formats` file - the live note lives in overview.md/data-contract.md).

- [x] Write `configuration.md`: the full config reference with **worked inheritance + conflict examples** (user explicitly asked for good docs on the additive resolution). Every key, defaults, specificity rules, the equal-specificity error.
- [x] Write `pipeline.md`: stage diagram, parser edge (translate-not-filter), CLI usage, unmatched-selector warning.
- [x] All gates green (`check` + `test:e2e`). Tick checkboxes; update design log + memory; merge `epic/pipeline` -> master `--no-ff`.

**As built:** `docs/usage/configuration.md` (full reference: top-level keys, `tracks`/`waypoints` properties + defaults, additive-merge algorithm, specificity tiers, two worked inheritance examples + the equal-specificity conflict error with its exact message, glob semantics, full example) and `docs/architecture/pipeline.md` (stage diagram scan->parse->emit, translate-not-filter, hard-error list, short-segment skip, emit atomic/fail-loud, CLI usage + exit codes + severity-split output, unmatched-selector warning, testability notes). Both added to `mkdocs.yml` nav. Reconciled `overview.md`'s stale model note (dropped the rejected pre-stamped group-label/day/divider/defaultVisible/ordering wording; now matches the shrunk contract) and its `pipeline`->`preprocess` boundary bullet.

**Docs build tooling (added mid-Task-8 on user steer):** `build:docs`/`serve:docs` npm scripts run MkDocs Material via `uvx --with mkdocs-material==9.7.6` (ephemeral, only prereq is `uv` - no committed Python venv). `build:docs` is `--strict`, which caught `pipeline.md`'s source-file links (resolve on disk so `linkinator` passed, but not in the rendered site) - converted to inline code refs. `site/` output git/eslint/prettier-ignored. `exclude_docs: superpowers/` in `mkdocs.yml` keeps agentic specs/plans out of the strict build; the three completed superpowers spec/plan temp files were deleted (finished work). Staying on mkdocs-material for now (zensical pre-parity); `mkdocs.yml` kept as the config so the eventual switch is a script change. Docs are NOT in `check`/pre-commit (need `uv` + network).

`npm run check` (incl. lint:links) + `build:docs --strict` + `test:e2e` all green.
