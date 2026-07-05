# The preprocessing pipeline

`@nomadpath/preprocess` is the deploy-time half of the system: it turns a folder of raw GPS recordings plus a [`nomadpath.yaml`](../usage/configuration.md) into one validated `trip-data.json` that satisfies the [data contract](data-contract.md). Its user is the trip author at a terminal, so it is **strict and fail-loud** — it collects every error across the whole folder, reports them once, and publishes nothing until the build is clean.

## Stages

The pipeline is a staged flow over a **common intermediate model** (`RawFeature`). Per-format parsers are the swappable edge; the middle stages are format-agnostic.

```text
  input folder                                                        trip-data.json
       |                                                                   ^
       v                                                                   |
  [ scan ] --dispatch by extension--> [ parse (gpx | kml) ] --RawFeature[]--> [ emit ]
       |                                       |                               |
   ignore globs                       translate, never filter          project -> validate
   collect paths                      collect errors                   -> atomic write
```

- **scan** ([`scan.ts`](../../packages/preprocess/src/scan.ts)) walks the input directory, skips paths matching an `ignore` glob, dispatches each recognised file (`.gpx`, `.kml`) to its parser, and collects all features and errors. Unrecognised extensions are ignored silently. Source paths are recorded as POSIX paths relative to the input root, so a build is identical across machines.
- **parse** ([`parse/gpx.ts`](../../packages/preprocess/src/parse/gpx.ts), [`parse/kml.ts`](../../packages/preprocess/src/parse/kml.ts)) translates one source format into `RawFeature`s. Parsers **translate, never filter** (see below).
- **emit** ([`emit.ts`](../../packages/preprocess/src/emit.ts)) projects each `RawFeature` to a contract item, validates the whole trip, and writes the file — or fails loud, writing nothing.

Config resolution ([`config/`](../../packages/preprocess/src/config/)) runs alongside as a pure lookup; see the [configuration reference](../usage/configuration.md) for its additive-merge rules. The `build()` function ([`build.ts`](../../packages/preprocess/src/build.ts)) wires these together and returns an exit code; the CLI ([`cli.ts`](../../packages/preprocess/src/cli.ts)) is thin bin wiring around it.

> **Deferred stages.** A `compute` stage (day grouping, sun angle, bounds) was designed but **deferred wholesale** — those are derived values whose exact shape only the not-yet-built UI can specify, so building them now would be guessing. Each returns additively — one `compute/<x>.ts`, one field in emit, one schema field — when a UI consumer names it. See the design log, 2026-07-04.

## The parser edge: translate, never filter

Each parser's only job is to render one source format faithfully into the common model. It makes **no judgements** about what is wanted:

- **Every point and segment passes through**, including ones a downstream rule might later drop — a GoPro `fix=none` junk point, a Null-Island coordinate, an airport waypoint bundled into a flight KML. Discarding them is a _later_ rule stage's decision, not a parser guess.
- **One feature per source element.** A GPX `trk` becomes one line feature; each KML `Placemark` becomes its own feature. A cyclone file's many point and line placemarks each become a separate feature — the parser never bundles or special-cases them.
- **Missing per-point data becomes `null`, never fabricated.** Absent `time`/`ele`/`speed` is kept as a null hole; the pipeline never derives speed or interpolates a gap.

This keeps parsers small, independently testable, and free of policy — the messy "what did the author actually want" reconciliation lives in config and (future) rule stages behind the model, not in the format readers.

### What is a hard error

Parsers **collect** errors and never throw; the scan aggregates them. A file is rejected (contributing to the fail-loud report) for structural corruption only:

- malformed XML,
- a non-numeric coordinate,
- a KML `<when>` list whose length disagrees with its `<gx:coord>` list,
- a geometry left with no usable points (a line with fewer than 2 points, a track with no usable segment).

A **short segment** (fewer than 2 points) is _skipped and counted_, not an error — real OsmAnd recordings contain stray single-point segments from pause/resume, and failing on them would break legitimate builds. The count surfaces in the build status line.

## Emit: project, validate, write

The emit stage projects each `RawFeature` to the contract's raw item — a thin field rename (`activity` -> `transportMode`), dropping build-internal provenance (`sourceFile`, `sourceIndex`), adding **no** fabricated fields (no item id, panel, order, or day). It wraps the items in `{ version, name?, items }`, then runs the contract's `validateTripData` (collect-all, never-throw). If there is a single issue, it throws with the full list and **writes nothing** — the last good file on disk is preserved. Otherwise it writes compact JSON **atomically** (temp sibling + rename), so a crash can never leave a half-written or invalid file.

## CLI usage

```bash
nomadpath-preprocess <input-dir> [--config <path>] [--out <path>]
```

| Argument / flag       | Default                      | Meaning                                                            |
| --------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `<input-dir>`         | (required)                   | Folder of raw GPX/KML recordings.                                  |
| `-c, --config <path>` | `<input-dir>/nomadpath.yaml` | Config file. Missing default = all defaults.                       |
| `-o, --out <path>`    | `<input-dir>/trip-data.json` | Output file; a directory means write the default filename into it. |

Output is split **by severity**:

- **stdout** — the successful-run status line (files scanned, feature count, stats such as `N short segment(s) skipped`), and `--help` / `--version`.
- **stderr** — non-fatal warnings and the fail-loud error report.

Exit codes: **0** = file emitted, **1** = hard errors (nothing written), **2** = bad invocation (missing input dir, missing explicit `--config`).

### Unmatched-selector warnings

A `tracks:` or `waypoints:` key in the config that matched zero scanned files or folders is surfaced as a non-fatal warning to stderr (`warning: config selector "..." matched no files`). It is almost always a stale path or typo, but a config pointing at not-yet-present files is occasionally intentional, so it never blocks the build.

## Testability notes

- `build()` is a pure-of-process-effects function (logging via an injected `Logger`, returning an exit code, never calling `process.exit`), so it runs in-process and is fully coverage-instrumented. The bin wiring in `cli.ts` — commander parsing plus `process.exit` — is exercised via real subprocess tests and excluded from the coverage floor.
- The CLI is verified end-to-end through the installed `bin` **symlink** (how a user actually invokes it), not only by importing `cli.ts`, because entry-point behaviour (`import.meta.main`) differs between the two.
