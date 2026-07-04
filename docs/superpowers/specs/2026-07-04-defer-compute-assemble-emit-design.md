# Design: Defer compute stages; build minimal assemble + emit

Date: 2026-07-04
Branch: `epic/pipeline` (Phase 3)
Status: approved (pending written-spec review)

## Summary

The original Phase 3 Task 6 ("Compute stages": `day`, `sunAngle`, `bounds`) is
**deferred wholesale.** None of these derived fields has a nameable consumer: the
UI does not exist yet, and each field's exact shape is a UI-driven decision.
Preprocessing's job is to prepare data for what the UI needs; where we cannot
name the need, computing now is guessing, and guessing risks throwaway work.

Instead the next unit of real value is an **actual data file**: a minimal
`assemble` + `emit` that turns scanned `RawFeature`s into a validated
`trip-data.json`, stamping **only** fields that need no UI-shaped guessing. The
contract is trimmed to exactly what the pipeline produces today. Anticipated
future fields are captured in docs/roadmap as likely-but-not-committed.

## Evidence behind the deferral

Applied the test "can we name the specific UI consumer of this field?" to each:

- **`bounds`** - no UI; the map library (MapLibre/deck.gl) does viewport-fitting
  itself at render time; antimeridian correctness is a real hazard with no UI to
  validate against. Cannot name the need. Defer.
- **`sunAngle`** - the time-of-day colour proxy; colour is a pure render/UI
  decision and no render code exists. Cannot name the shape. Defer.
- **`day`** - the design log repeatedly wants day-grouped track trees, but there
  is no tree and no UI. By the same standard, cannot point to a consumer. Defer.

Corpus check (`~/Documents/holidays`, read-only) that retired a phantom:

- 447 of 449 GPX files carry `<time>`; 14 of 17 KML files carry a time element.
  The track corpus is effectively 100% timed.
- The only two no-`<time>` GPX files are `accommodation.gpx` and `waypoints.gpx`
  - **waypoint** files (`<wpt>` markers), which group by folder, not by day.
- Therefore the "timeless track -> what day?" edge case that drove much of the
  earlier day-policy debate **does not occur** in real data. It was invented from
  the schema's `.optional()` and design-log assumptions, not observed.

## Isolation guarantee (the user's condition for deferring)

Deferring is only acceptable if adding a field back later is a localized,
additive change - no dominoes. Verified against current code:

The pipeline is a linear chain of pure stages joined only at the CLI seam:
`parse -> scan -> assemble -> emit`. `RawFeature` already carries the raw inputs
any compute stage needs (`lon`, `lat`, `time`, per-point arrays). Adding a
deferred field later is exactly three additive edits, none changing an existing
signature:

1. New pure file `compute/<field>.ts`: `RawFeature -> value`.
2. One call + stamp inside `assemble.ts`.
3. One field added to the contract schema.

No shared state, no interface others implement, no value threaded through
intermediate stages. `cli.ts` has a single wiring point (its Task-7 TODO marker).

## What we build now

### 1. Contract trim (`packages/contract`)

Remove deferred fields from `itemSchema` and `tripDataSchema` so the contract
describes **exactly** today's output:

- Remove from `itemSchema`: `day`, `divider`, `defaultVisible`, `bounds`.
- Remove `bounds` from `tripDataSchema`.
- Remove `sunAngle` from `PER_POINT_ATTRIBUTES` (leaving `ele`, `speed`, which
  parsers already carry faithfully).
- Remove the now-dead `bounds` cross-field check from `validate.ts`
  (`checkBounds` and its south<=north rule) and its schema/validate tests.
- Update `fixtures.ts` to the trimmed shape.

Result `TripItem` fields kept: `id`, `name`, `description?`, `panel`,
`groupLabel?`, `transportMode?`, `order`, `geometries`. `TripData`: `version`,
`name?`, `items`.

Re-adding any field is a one-line schema change when its UI consumer lands.

### 2. `assemble.ts` (`packages/preprocess/src`)

Pure: `assemble(features: RawFeature[], config: Config, name?: string): TripData`.

Per `RawFeature -> TripItem`, stamping only non-guessed fields:

- `id`: stable from `sourceFile` + `sourceIndex` (e.g. `"<sourceFile>#<sourceIndex>"`).
  Unique by construction; traces back to the producing element.
- `name`: from `RawFeature.name`, with a deterministic fallback when absent
  (e.g. the `id`) so the contract's `name.min(1)` always holds.
- `description?`: pass-through.
- `panel`: `waypoints` when the feature is a point/folder-grouped waypoint,
  else `tracks`. (Bucketing rule: point geometry + folder -> waypoints; line
  geometry -> tracks. Disaster/polygon routing stays deferred, as already
  decided.)
- `groupLabel?`: raw `folder` value (waypoint grouping input), pass-through.
- `transportMode?`: from `RawFeature.activity`, verbatim.
- `order`: global chronological integer. Sort by first available point time;
  features without time sort after timed ones, by scan order (paths are already
  sorted deterministically). Assign a unique 0..n-1 integer.
- `geometries`: pass-through of `RawGeometry[]`.

Assemble the `TripData`: `version = CONTRACT_VERSION`, optional `name` (from
config), `items`.

Config application at assemble time is limited to what the trimmed contract
still expresses: `name`. `hidden`/`divider`/`excludeFromBounds`/`day` config
resolution is **deferred** with their target fields (still parsed and validated
by the config schema; simply not consumed yet). This is noted in the roadmap so
the config surface is not mistaken for dead.

### 3. `emit.ts` (`packages/preprocess/src`)

`emit(data: TripData, outPath: string): void`:

1. Run `validateTripData(data)` (collect-all semantics already in contract).
2. If any issues: throw with the full report (fail loud); write nothing.
3. Else: serialize compact JSON and write **atomically** (write to a temp
   sibling, then rename) so a crash never leaves a half-written file.

### 4. Wire into `cli.ts`

At the existing TODO marker, after a clean scan: `assemble` the scanned features
(config name applied) then `emit` to `--out` (default `<input-dir>/trip-data.json`).
A validation failure at emit is a hard error -> full report to stderr, exit 1,
nothing written (matches the existing scan-error path and the stdout/stderr
convention). On success, the status line already printed continues to stdout.

## Testing (TDD, full state space, tests first)

Fictional fixtures only (south-Atlantic archipelago; speeds 1-2; ele 100-200;
times 2030-01-15+; compute epoch constants, never eyeball).

### assemble

- Track file (line geometry) -> one `tracks`-panel item; `transportMode` from
  activity; `order` present; `geometries` preserved.
- Waypoint file (point + folder) -> `waypoints`-panel item; `groupLabel` = folder.
- `id` uniqueness across two files with the same internal element index.
- `name` fallback when `RawFeature.name` absent (item still valid, `name` non-empty).
- `order`: chronological across features with time; timed-before-untimed;
  untimed keep deterministic scan order; all `order` values unique.
- Feature with no `activity` -> `transportMode` absent (not empty string).

### emit

- Valid `TripData` -> file written; re-reading + `validateTripData` passes
  (producer-emits AND consumer-loads, the cross-side signal).
- Injected invalid `TripData` (e.g. empty `name`) -> throws full report; assert
  **no file at outPath** (nothing written on failure).
- Atomicity: no temp/partial file remains after a successful write.

### CLI end-to-end (real subprocess, as Task 5 established)

- Fixture folder -> exit 0, `trip-data.json` written, re-validates.
- Fixture with an injected hard parse error -> exit 1, no file written.

### Corpus verification (read-only, not a committed test)

- All 5 `~/Documents/holidays` trips produce a valid `trip-data.json` with zero
  hard errors via `npm run preprocess -- <dir>`.

## Records to update

- **Design log** (`plans/looking-to-plan-the-piped-nova.md`), dated 2026-07-04,
  append-only supersede entries:
  - Defer `day`/`sunAngle`/`bounds` compute until a UI consumer names the need
    (rationale: preprocessing computes exactly what the UI needs; no UI yet).
  - Contract trimmed to today's output; deferred fields removed, not made
    optional (contract = what we actually produce).
  - Corpus finding: timeless _tracks_ do not exist; the no-time files are
    waypoint files -> the earlier day-for-timeless-track policy question is moot.
  - Note that the 2026-06-20 "Day = plain local calendar date" / "Timezone is a
    REQUIRED core compute" rows are **not reversed in intent**, only deferred in
    timing; they return when the tree UI exists.
- **Phase plan** (`plans/phase3-pipeline.md`): mark Task 6 deferred with a
  pointer to this spec; fold the minimal assemble/emit into Task 7's checkboxes;
  add an "Anticipated later" note listing likely-future fields (`day`,
  `sunAngle`, `bounds`, `divider`, `defaultVisible`) as non-committal.
- **Contract note** wherever it documents fields, kept in sync with the trim.

## Non-goals / explicitly deferred

- Any geodesic compute (`tz-lookup`, `suncalc`, `@turf/bbox`) - not installed.
- Antimeridian bounds algorithm.
- Consuming `hidden`/`divider`/`excludeFromBounds`/`day` config (parsed, not applied).
- Polyline simplification / LOD / binary packing (profiling-gated to phase 7).
- Disaster/polygon routing.
