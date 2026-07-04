# Design: Defer compute; emit the validated raw trip file

Date: 2026-07-04 (revised after review - the first draft's `assemble`/id/panel/order was rejected as unjustified)
Branch: `epic/pipeline` (Phase 3)
Status: approved (pending written-spec review)

## Summary

Two decisions, both driven by the governing principle (name the concrete UI
consumer, or do not build it - see `plans/looking-to-plan-the-piped-nova.md`
"Governing principles"):

1. **Compute stages deferred** (`day`, `sunAngle`, `bounds`): each is derived
   data whose shape only the UI can specify, and there is no UI. Deferred until
   a UI consumer names the need.
2. **The pipeline emits a validated file of the raw parsed features** - NOT a
   UI-shaped "assembled" model. The first (and only current) named consumer of
   the file is "the UI library loads it and draws the geometry". So the file
   carries exactly the raw facts that reach the UI, validated hard, and nothing
   fabricated.

An earlier draft of this spec proposed an `assemble` stage stamping `id`,
`panel`, and `order`. Those were rejected: each is a fabricated derived value
with **no named consumer**, and each is cheaply derivable UI-side from data
already in the file (provenance, geometry type, timestamps). Precompute is only
justified when expensive or when the input is unavailable later - none applies.

## What has a named consumer (kept) vs not (dropped)

Applied "name the concrete UI consumer" to every field:

**Kept - named consumer:**

- `geometries` (raw lon/lat parallel arrays + raw per-point `time`/`ele`/`speed`)
  - the UI draws these and colours by the attributes. Core.
- `transportMode` (from `activity`) - a core UI feature (colour-by / filter-by
  transport mode), named by the user.
- `name`, `description` - displayed by the UI.
- `folder` - waypoint grouping is a real UI feature; carry the raw fact under
  its raw name (no rename to UI vocabulary like `groupLabel`).

**Dropped - no named consumer, cheaply UI-derivable, or UI-internal:**

- `id` - the UI will mint item keys when it needs to address items; provenance
  is not even shipped, so there is nothing to pre-key against. Cheap = no
  precompute justification.
- `panel` - UI widget routing. Encodes UI structure in preprocessing. The UI
  buckets on the raw facts (geometry type, `folder`) itself.
- `order` - a chronological sort the UI can do from the timestamps already in
  the geometry.
- `sourceFile` / `sourceIndex` (provenance) - build-internal (error messages
  trace to source); the UI does not need it to draw. Kept in `RawFeature` for
  the build, stripped from the emitted file.

## The binding contract stays

`@nomadpath/contract` remains: it is the compatibility agreement between
preprocessing and the future UI (producer validates rigorously; consumer
trusts). It is NOT retired. It shrinks to describe the raw trip shape above and
validate it. This preserves the two-component design's core mechanism.

Separation for swappability (the user's binding constraint - the format must be
simple to change): the **logical shape + semantic validation** live in the
contract package, encoding-agnostic; the **physical JSON serialization** is
isolated to `emit`. Changing the physical format later (binary, different
structure) touches one function, not the schema or the validation.

## Isolation guarantee (adding things back is cheap - no dominoes)

The pipeline is a linear chain of pure stages joined at the CLI seam:
`parse -> scan -> emit`. `RawFeature` carries the raw inputs any future compute
stage needs (`lon`, `lat`, `time`, per-point arrays). Adding a deferred compute
field later is additive: a new pure `compute/<field>.ts` (`RawFeature -> value`),
one stamp where the emitted item is built, one field on the contract schema. No
existing signature changes; no shared state.

## Corpus check (retired a phantom)

- 447/449 GPX files carry `<time>`; 14/17 KML files carry a time element. The
  track corpus is effectively 100% timed.
- The only two no-`<time>` GPX files are `accommodation.gpx` / `waypoints.gpx` -
  **waypoint** files (group by folder, not day). So the "timeless track -> what
  day?" edge case that drove earlier day-policy debate does not occur in real
  data.

## What we build now

### 1. Contract: shrink to the raw trip shape (`packages/contract`)

The previous task already removed `day`/`divider`/`defaultVisible`/`bounds`/
`sunAngle`. This step removes the remaining UI-shaped item fields and the panel
registry:

- Remove from `itemSchema`: `id`, `panel`, `order`.
- Rename nothing; add `folder` (raw waypoint-group fact), `activity` OR keep the
  UI-named `transportMode` - see decision below.
- Remove the `PANELS` registry, `Panel`/`PANEL_NAMES` exports, and the stale
  `PANELS.tracks.description` prose ("grouped by local day, split by dividers").
- Keep the geometry schemas (line/point/polygon) and ALL their semantic checks
  in `validate.ts` (coord ranges, monotonic time, attribute/point-count parity,
  polygon-ring closure). These are the hard producer-side validation - they stay.
- Keep `checkUniqueness`? No - it checks `id`/`order`, both removed. Remove it.
- Update `fixtures.ts` + contract tests to the shrunk shape.

**Resulting emitted item:**
`{ name?, description?, transportMode?, folder?, geometries[] }`
**Container:** `{ version, name?, items[] }`

**Naming decision (transportMode vs activity):** keep the field named
`transportMode` in the contract (it is the UI-facing name of a core UI feature,
and the user named it that way), sourced from `RawFeature.activity`. This is the
one place a UI-facing name is justified by a named consumer. `folder` stays raw
because its consumer (waypoint grouping) does not yet dictate a name.

### 2. `emit.ts` (`packages/preprocess/src`)

`emit(features: RawFeature[], name: string | undefined, outPath: string): void`:

1. Map each `RawFeature` to the emitted item shape: keep `name`/`description`/
   `geometries`; `folder` -> `folder`; `activity` -> `transportMode`; DROP
   `sourceFile`/`sourceIndex`. Optional fields set only when present. This is a
   thin field projection, not a second model.
2. Build the container `{ version: CONTRACT_VERSION, name?, items }`.
3. `validateTripData(container)` (collect-all). Any issues -> throw a full
   fail-loud report; write nothing.
4. Serialize compact JSON (`JSON.stringify`, no indent) and write atomically
   (temp sibling + rename) so a crash never leaves a half-written or bad file
   in place (honours "preserve last-good on failure").

The field projection is small enough to live inside `emit.ts` (a private
`toItem`), not a separate `assemble.ts` - there is no transformation worth its
own module, and a second module was the ceremony the review rejected.

### 3. Wire into `cli.ts`

At the existing TODO marker, after a clean scan: `emit(scan.features,
config.name, outPath)` where `outPath = options.out ?? <input-dir>/trip-data.json`.
A validation failure at emit is a hard error -> full report to stderr, exit 1,
nothing written (matches the existing scan-error path + stdout/stderr
convention). The success status line already printed continues to stdout.

## Config surface (reviewed - kept, with roadmap justification)

The config schema declares `name`, `ignore`, and four selector keys `hidden`,
`divider`, `excludeFromBounds`, `day`. `ignore` and `name` are consumed today
(scan + emit). The other four are NOT consumed yet, but each has a real, planned
consumer on the roadmap (`~/.claude/plans/let-s-work-on-the-tingly-pretzel.md`):

- `hidden` (default visibility) and `divider` (track-tree section splits) ->
  **phase 6** (widgets: track tree with tri-state group checkboxes, divider
  rows, reset-to-config-defaults).
- `excludeFromBounds` and `day` -> consumed by the **compute stages** (bounds
  with exclusions; local-day override) when those return (phase 4+).

This is the "planned consumer" case, not the "inferred consumer" case the
governing principle rejects - so the keys stay. They are a deliberate forward
declaration, documented with their phase pointers so a future session does not
re-litigate them. This spec does NOT build their application (their consumers do
not exist yet); it only records that keeping them is justified.

## Testing (TDD, full state space, tests first)

Fictional fixtures only (south-Atlantic archipelago; speeds 1-2; ele 100-200;
times 2030-01-15+; compute epoch constants, never eyeball).

### emit (field projection + validate + write)

- Track feature -> item with `transportMode` from `activity`, `geometries`
  preserved, NO `id`/`panel`/`order`/`sourceFile` fields present.
- Waypoint feature (point + folder) -> item with `folder` carried through.
- Feature with no `activity` -> `transportMode` absent (not empty string).
- Feature with no `name` -> item `name` absent (the contract allows optional
  name; NO fabricated fallback - the previous draft's id-fallback is gone with id).
- Valid features -> file written; re-read + `validateTripData` returns `[]`
  (producer-emits AND consumer-loads - the cross-side signal).
- Compact output: written text contains no pretty-print whitespace.
- Injected invalid feature (e.g. a line geometry with mismatched lon/lat lengths)
  -> `emit` throws a full report; assert NO file at outPath.
- Atomicity: no temp/partial file remains after a successful write.

### CLI end-to-end (real subprocess, as Task 5 established; reuse `run`/`write`/`gpxTrack`)

- Fixture folder -> exit 0, `trip-data.json` written, re-validates clean.
- `--out` honoured.
- Fixture with an injected hard parse error -> exit 1, no file written.

### Corpus verification (read-only, not a committed test)

- All 5 `~/Documents/holidays` trips produce a valid `trip-data.json` with zero
  hard errors via `npm run preprocess -- <dir>`; emitted artifacts cleaned up
  afterward (the corpus is read-only reference, not an output dir).

## Records to update

- **Design log**, dated 2026-07-04 (in addition to the governing-principles
  block already added): compute deferred; the file is the raw validated trip
  shape (id/panel/order rejected as unjustified); contract shrunk, not retired,
  as the binding compatibility contract; corpus timeless-track finding.
- **Phase plan** (`plans/phase3-pipeline.md`): Task 6 deferred (pointer to this
  spec); Task 7 becomes "emit the validated raw trip file" (this work); an
  "Anticipated later (non-committal)" note for compute fields.
- **`docs/architecture/data-contract.md`**: update to the shrunk shape (drop the
  UI-shaped fields it documents).

## Non-goals / explicitly deferred

- Any geodesic compute (`tz-lookup`, `suncalc`, `@turf/bbox`) - not installed.
- Antimeridian bounds.
- Acting on `hidden`/`divider`/`excludeFromBounds`/`day` config (their consumers
  arrive phase 4+/6; the keys stay declared as a justified forward declaration).
- Polyline simplification / LOD / binary packing (profiling-gated).
- Disaster/polygon routing.
- Any fabricated item field (`id`, `panel`, `order`) - rejected, not deferred.
