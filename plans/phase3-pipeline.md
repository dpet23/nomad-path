# Phase 3: Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline), task-by-task.
> Master plan: `~/.claude/plans/let-s-work-on-the-tingly-pretzel.md`. Design doc: `plans/looking-to-plan-the-piped-nova.md`.
> Branch: `epic/pipeline` (already cut). All work branches; merge `--no-ff` at phase end.

**Goal:** `@nomadpath/pipeline` turns a folder of raw GPX/KML + `nomadpath.yaml` into one validated `trip-data.json` matching `@nomadpath/contract`. Strict producer: collect ALL errors, fail once, publish nothing until clean. Ships `nomadpath-build` (with `--audit`).

**Architecture:** staged pipeline over a common intermediate model. Per-format **parsers** (GPX, KML) are the swappable edge; the middle is format-agnostic stages: resolve config -> compute -> assemble -> validate -> emit. Each stage is a pure function, unit-tested in isolation. Mirrors the UI's core+adapters shape.

**Tech stack additions (pipeline-local deps):** `fast-xml-parser` (GPX/KML), `yaml` (config), `tz-lookup` (timezone from lon/lat), `suncalc` (sun angle), `picomatch` (glob selectors). All single-consumer -> `packages/pipeline/package.json`.

## Global constraints (from design log)

- **GoPro naive timestamps = UTC**; sanity-check loudly if a parsed time is absurd.
- **Transport mode = `osmand:activity` ONLY** (`metadata/extensions` or `trk/extensions`); legacy `transport`/`keywords` are NOT inputs; `--audit` flags legacy-only files.
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

**Files:** `packages/pipeline/src/model.ts`, `packages/pipeline/src/fixtures.ts`, tests.
Define the parser-output model (pre-contract): `RawFeature { sourceFile, sourcePath, name?, description?, activity?, folder?, geometries: RawGeometry[] }` where `RawGeometry` carries lon/lat/ele/time/speed parallel arrays (raw, uncomputed). Deliberately simpler than the contract — no day/divider/bounds yet.

- [x] Enumerate the model's state space; write model + fixture-builder tests first.
- [x] Implement model types + `buildRawFeature`/`buildRawGeometry` fictional builders.
- [x] Commit `feat(pipeline): add common intermediate model and fixtures`.

### Task 2: GPX parser

**Files:** `packages/pipeline/src/parse/gpx.ts`, tests with inline fictional GPX strings.
Handle OsmAnd + AllTrails + GoPro + waypoint variants: `trk`->line RawGeometry (ele/time/speed where present, speed absent for AllTrails, nested speed_2d for GoPro), `wpt`->point RawGeometry with folder/sym, `osmand:activity` from either extensions location. GoPro naive time -> UTC epoch. **Parser translates, never filters** (see design log 2026-07-04): every source point (incl. `fix=none`) and segment passes through; missing per-point time/ele/speed -> null (kept, never fabricated). Hard errors (collected, never thrown): malformed XML / non-numeric coords / a segment with < 2 points / a trk with no usable segment. Mechanism: `fast-xml-parser` `XMLParser` + `fast-xml-validator` `SyntaxValidator` (non-deprecated APIs).

- [x] State space: each source variant x each field present/absent/malformed. Write all tests first.
- [x] Implement; return `{ features: RawFeature[], errors: ParseError[] }` (never throw).
- [x] Commit `feat(pipeline): add gpx parser for osmand, alltrails, gopro, waypoints`.

### Task 3: KML parser

**Files:** `packages/pipeline/src/parse/kml.ts`, tests with inline fictional KML.
`gx:Track` (when[] + gx:coord[] "lon lat ele" space-separated) -> line; `LineString`/`Point`/`Polygon` (`coordinates` = comma-separated lon,lat[,ele] tuples) -> line/point/polygon; nested `Folder` recursion, innermost folder name -> `folder`. **One feature per Placemark, translate-not-filter** (design log 2026-07-04): a cyclone's many point+line placemarks each become their own feature; bundling them into one object and dropping recognised-unwanted airport waypoints is a LATER rule stage, NOT a parser guess or special-case. Hard errors (collected): malformed XML / non-numeric coord / when-vs-coord length mismatch / a line with < 2 points. Non-geometry furniture (ScreenOverlay, Style) silently ignored. Same mechanism as GPX (`XMLParser` + `fast-xml-validator` `SyntaxValidator`). Verified against real corpus FlightAware + GDACS cyclone files (0 errors).

- [x] State space + all tests first (incl. when/coord length mismatch = error).
- [x] Implement; same `{ features, errors }` contract as GPX.
- [x] Commit `feat(pipeline): add kml parser for flightaware and gdacs geometry`.

### Task 4: Config load + resolve

**Files:** `packages/pipeline/src/config/schema.ts` (zod), `packages/pipeline/src/config/resolve.ts`, tests.
Parse `nomadpath.yaml` (strict zod, fail loud on unknown keys). `resolveTrackSettings(path, config)` + `resolveWaypointSettings(folder, config)` implementing additive merge + depth/literalness specificity + equal-specificity-conflict hard error. `ignore` matching for the scan.

- [ ] State space: single match, multiple additive matches, override, inheritance, equal-specificity conflict, no match (defaults), ignore globs. ALL tests first — this is the subtlest logic in the phase.
- [ ] Implement. Commit `feat(pipeline): add config schema and additive resolution`.

### Task 5: Folder scan + audit mode

**Files:** `packages/pipeline/src/scan.ts`, `packages/pipeline/src/audit.ts`, `packages/pipeline/src/cli.ts` (bin `nomadpath-build`), tests.
Walk input dir (respect `ignore`), dispatch by extension to parsers, collect features+errors. `--audit`: parse read-only, report every anomaly (parse errors, legacy-transport-only files, missing-time lines, unmatched config selectors) and emit NOTHING. Wire `bin` in package.json. CLI = convention+flags (`nomadpath-build <dir>` + `--config`/`--out`/`--audit`).

- [ ] Tests over a fictional fixture folder tree (built in a temp dir).
- [ ] Implement. Commit `feat(pipeline): add folder scan, cli, and audit mode`.
- [ ] **Verify `--audit` over `~/Documents/holidays` read-only** — expect zero hard errors on known-good trips; record findings.

### Task 6: Compute stages

**Files:** `packages/pipeline/src/compute/*.ts` (timezone, day, sunAngle, distance/bounds), tests.
Geodesic, on raw lon/lat: timezone-from-location (tz-lookup, first point) -> local day (calendar date) unless config `day` override; sunAngle per point (suncalc); per-item bounds + trip bounds (antimeridian-aware, excluding `excludeFromBounds`). NO speed derivation.

- [ ] State space incl. antimeridian bounds, dateline day assignment, config day override. All tests first.
- [ ] Implement each as a pure stage. Commit `feat(pipeline): add timezone, day, sun-angle, and bounds compute`.

### Task 7: Assemble + validate + emit

**Files:** `packages/pipeline/src/assemble.ts`, `packages/pipeline/src/emit.ts`, wire into `cli.ts`, tests.
RawFeature + resolved settings + computed fields -> contract `TripItem`s (stable `id` from sourcePath+element, `order` chronological, `panel`, stamped fields). Assemble `TripData`, run `validateTripData` (collect-all), fail loud with full report if any issue, else emit compact JSON (atomic write). Waypoint routing: `wpt`+folder -> waypoints panel; tracks -> tracks panel (disaster routing deferred).

- [ ] Tests: full fixture folder -> valid TripData that `validateTripData` passes AND round-trips; injected bad data -> full error report, no file written.
- [ ] Commit `feat(pipeline): assemble, validate, and emit trip data`.

### Task 8: Config docs + phase gate

**Files:** `docs/usage/configuration.md` (NEW, in mkdocs nav), `docs/architecture/pipeline.md` (NEW), update `data-formats` note.

- [ ] Write `configuration.md`: the full config reference with **worked inheritance + conflict examples** (user explicitly asked for good docs on the additive resolution). Every key, defaults, specificity rules, the equal-specificity error.
- [ ] Write `pipeline.md`: stage diagram, parser edge, three-bucket handling, audit mode, CLI usage.
- [ ] All gates green (`check` + `test:e2e`). Tick checkboxes; update design log + memory; merge `epic/pipeline` -> master `--no-ff`.
