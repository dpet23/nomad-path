# Build log format revamp

**Date:** 2026-05-25
**Branch:** `epic/preprocessing-improvements`
**Status:** Design approved, ready for plan

## Goal

Reshape the preprocessing build log to:

1. Group each count with its breakdown (tracks with modes; POI with categories) in a single parenthetical clause, so related numbers stay together.
2. Announce when a build starts and, in watch mode, why — so a slow build no longer looks frozen and so log scans can correlate cause with outcome.
3. Report wall-clock runtime on the success line.

The output format is the public log surface — it's grepped from phones via ssh over `nohup watch.log` (see `preprocessing/lib/log.js` and `preprocessing/watch.js`'s USAGE block). Changes here are user-visible and should preserve those grep recipes.

## Output format

### `[BUILD]` start line

Emitted at the start of every build (watcher or standalone).

Initial watch build and standalone `build:data` runs:

```
[BUILD] Starting
```

Watcher rebuild triggered by file events appends a cause clause:

```
[BUILD] Starting | 3 added, 1 changed
[BUILD] Starting | 1 removed
[BUILD] Starting | 50 changed
```

Cause clause uses the same shape as the modes/POI breakdowns: `<count> <kind>` joined by `, `, kinds in fixed order `added, changed, removed`, zero counts omitted. The full clause is omitted when no cause is known.

### `[OK]` success line

New shape:

```
[OK] /home/dan/code/nomad-path/demo/trip-data.geojson | 305 tracks (200 drive, 85 walk, 9 flight, 7 zipline, 3 snorkel, 1 horseback) | 15 POI (8 hotel, 4 restaurant, 3 viewpoint) | 2025-09-12 → 2025-10-10 | 1 skipped (.geojson) | 1.2s
```

Field order, each clause omitted independently when empty:

1. Output path (always present)
2. `<n> tracks (<modes-breakdown>)` — always present; modes breakdown sorted desc by count
3. `<n> POI (<categories-breakdown>)` — omitted when `waypointCount === 0`; categories breakdown sorted desc by count
4. Date range — same condition as today (`stats.dateRange` present)
5. Skip clause — same condition as today
6. Runtime — always present

Runtime format: auto-unit. `< 1000ms` → `<N>ms` (integer); `≥ 1000ms` → `<N.N>s` (one decimal).

### `[FAIL]` line

Unchanged.

## Cause tracking

`watch.js` accumulates per-file events between builds in a snapshot object:

```js
let pendingEvents = { added: 0, changed: 0, removed: 0 };
```

- `add` event → `added++`
- `change` event → `changed++`
- `unlink` event → `removed++`

When `build()` is about to spawn, it snapshots `pendingEvents`, resets it to zero, and uses the snapshot to format the cause clause.

The first build at watch startup has an all-zero snapshot — the cause clause is omitted.

## Architectural decision: who emits `[BUILD]`

The cause information lives in the watcher; the start line should carry it. Two emit sites cooperate:

- **`watch.js`** emits `[BUILD] Starting [| cause]` before spawning the child, then sets `NOMADPATH_SUPPRESS_BUILD_START=1` in the child's env.
- **`build-trip-data.js`** emits `[BUILD] Starting` near the top of the script *only if* `NOMADPATH_SUPPRESS_BUILD_START` is unset — i.e., on standalone runs.

Result: exactly one `[BUILD]` line per build, with cause when the watcher knows it. The CLI surface stays clean (no `--cause-*` flags). Format truth lives in `log.js`.

## Components changed

### `preprocessing/lib/log.js`

Add a helper alongside `logOK` / `logFail`:

```js
/**
 * Emit a build-start marker. `cause` is an optional
 * `{ added, changed, removed }` count snapshot from the watcher.
 */
export function logBuildStart(cause) { … }
```

Cause-clause formatting lives in this function — `watch.js` passes the raw counts.

### `preprocessing/lib/output.js`

Extend the stats object with `poiCategories`:

```js
const poiCategories = {};
for (const w of waypoints) {
    const cat = w.category ?? 'unknown';
    poiCategories[cat] = (poiCategories[cat] ?? 0) + 1;
}
const stats = {
    trackCount: tracks.length,
    waypointCount: waypoints.length,
    dayCount: groundDays.length,
    transportModes,
    poiCategories,
    ...(groundDays.length > 0 && { dateRange: { … } }),
};
```

Parallel to `transportModes`. No fallback to a placeholder string when `category` is missing — waypoints carry a category (see `parsers.js`); if any don't, `'unknown'` is the bucket, matching the `transportMode ?? 'unknown'` pattern already in use for tracks.

### `preprocessing/build-trip-data.js`

- Capture `process.hrtime.bigint()` as the very first executable statement.
- After arg parsing, call `logBuildStart()` unless `process.env.NOMADPATH_SUPPRESS_BUILD_START` is set.
- Compute the new modes parenthetical and POI parenthetical clauses.
- Compute elapsed time from `hrtime.bigint()` delta; format with auto-unit.
- Update the `logOK` call to the new shape:
  ```
  ${outputFile} | ${trackCount} tracks (${modesBreakdown}) | ${poiClause} | ${rangeClause} | ${skipClause} | ${runtime}
  ```
  with `poiClause` / `rangeClause` / `skipClause` each contributing nothing (including no `| `) when empty. Implementation: collect non-empty clauses into an array and `join(' | ')`.

### `preprocessing/watch.js`

- Add the `pendingEvents` accumulator at module scope.
- Wire `add`/`change`/`unlink` handlers to increment counters as well as call `build()`.
- In `build()` (before the `spawn` call), snapshot the counts, reset to zero, and call `logBuildStart(snapshot)` from this process. The snapshot is what's passed; the helper formats the cause clause (omitting when all zero).
- Pass `NOMADPATH_SUPPRESS_BUILD_START=1` to the child via `spawn`'s `env` option: `{ env: { ...process.env, NOMADPATH_SUPPRESS_BUILD_START: '1' } }`.

## Edge cases

- **Build queued during a build.** Today's coalescer collapses bursts into at most one queued rebuild. With cause tracking: events arriving while a build is in-flight accumulate into `pendingEvents`. When the in-flight build finishes and the queued rebuild fires, `build()` snapshots+resets the accumulator. The queued rebuild's `[BUILD]` line shows the cumulative cause across the entire in-flight window.

- **Empty `poiCategories`.** Same condition as `waypointCount === 0` — skip the POI clause entirely. No empty parens.

- **One category, one mode.** No special-casing; `305 tracks (305 drive)` and `15 POI (15 hotel)` are correct and self-explanatory.

- **Sub-millisecond builds.** Unlikely (parse + write dominates) but format would print `0ms`. Acceptable.

## Testing

- **`preprocessing/lib/output.test.js`** — extend the stats assertions:
  - `poiCategories` present when waypoints exist, with correct per-category counts.
  - `poiCategories` is `{}` when waypoints array is empty.
  - Behaviour unchanged on the existing `transportModes` / `dateRange` / etc. assertions (no field renames, only an addition).

- **`preprocessing/lib/log.test.js`** (new file — `log.js` has no existing tests):
  - `logBuildStart()` with no cause emits `[BUILD] Starting\n`.
  - `logBuildStart({ added: 3, changed: 1, removed: 0 })` emits `[BUILD] Starting | 3 added, 1 changed\n` (zero counts omitted, fixed kind order).
  - `logBuildStart({ added: 0, changed: 0, removed: 0 })` emits `[BUILD] Starting\n` (treated as no cause).

- **`preprocessing/build-trip-data.test.js`** — extend:
  - Standalone run emits a `[BUILD] Starting\n` line as the first stdout line.
  - When `NOMADPATH_SUPPRESS_BUILD_START=1` is set, no `[BUILD]` line is emitted.
  - `[OK]` line matches the new shape: contains `<N> tracks (<...>)`, contains `<N> POI (<...>)` when waypoints exist, ends with a runtime token (`/\d+ms$|\d+\.\d+s$/`).

- **Watcher cause-tracking tests** — out of scope. Deferred to the future watcher harness epic. The current watcher coverage stays at manual smoke until that epic builds the harness.

## Out of scope

- Watcher harness tests for the env-var coordination, cause aggregation across in-flight bursts, or the new `[BUILD]` line lifecycle. All deferred to the future watcher harness epic (sequenced in front of Epic 12 per `CLAUDE.md`).
- Renaming or restructuring existing `stats` fields. The change is strictly additive (`poiCategories`).
- Changing the `[FAIL]` line format.
- Adding the `[BUILD]` marker to the watch.js USAGE grep recipes — the existing recipes (`grep '\[FAIL\]'`, `grep -E '\[OK\]|\[FAIL\]'`) still work; users who want start lines can add `\[BUILD\]` themselves.
- Contract / validator changes. `metadata.stats` is not validated by the contract today; adding `poiCategories` is invisible to the validator.
