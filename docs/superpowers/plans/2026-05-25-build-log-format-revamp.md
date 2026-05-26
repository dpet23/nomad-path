# Build log format revamp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the preprocessing build log to group counts with their breakdowns, announce when builds start (with cause when triggered by the watcher), and report wall-clock runtime on the success line.

**Architecture:**
`logBuildStart()` joins `logOK()` / `logFail()` in `preprocessing/lib/log.js` as the single source of format truth. `build-trip-data.js` emits `[BUILD] Starting [| cause]` near the top of the script — cause flows in from `process.env.NOMADPATH_BUILD_CAUSE` (JSON-encoded `{added, changed, removed}` counts when present). Standalone runs have no env var set → bare line. The script measures wall-clock time and rewrites the `[OK]` line so tracks+modes and POI+categories live in shared parentheticals with runtime appended. `watch.js` accumulates chokidar events into `pendingEvents`, snapshots+resets per build, and (when any count is non-zero) passes the snapshot to the spawned child via the env var. The watcher itself emits no log line.

**Tech Stack:** Node.js (ES modules), Vitest, chokidar, no new deps.

**Spec:** [docs/superpowers/specs/2026-05-25-build-log-format-revamp-design.md](../specs/2026-05-25-build-log-format-revamp-design.md)

---

## File structure

**Modify:**
- `preprocessing/lib/log.js` — add `logBuildStart(cause?)`
- `preprocessing/lib/output.js` — add `stats.poiCategories`
- `preprocessing/build-trip-data.js` — emit start line, measure runtime, rewrite OK line
- `preprocessing/watch.js` — accumulate cause, hand it to spawned child via env var

**Create:**
- `preprocessing/lib/log.test.js` — new tests for `logBuildStart`

**Modify (tests):**
- `preprocessing/lib/output.test.js` — extend stats tests with `poiCategories`
- `preprocessing/build-trip-data.test.js` — extend with `[BUILD]` and runtime assertions

---

## Task 1: Add `logBuildStart` helper to `log.js`

**Files:**
- Test: `preprocessing/lib/log.test.js` (create)
- Modify: `preprocessing/lib/log.js`

### Step 1.1: Write the failing test file

- [ ] Create `preprocessing/lib/log.test.js` with the following content:

```js
// @vitest-environment node
//
// Unit tests for the preprocessing log helpers. Pins the public stdout/stderr
// format used by long-running `nohup npm run watch ... > watch.log 2>&1 &`
// sessions and grepped via ssh — changes here are user-visible.

import { describe, expect, it, vi } from 'vitest';

import { logBuildStart, logFail, logOK } from './log.js';

/** Capture a single console.log call's argument as a string. */
function captureLog(fn) {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
        fn();
        expect(spy).toHaveBeenCalledTimes(1);
        return spy.mock.calls[0][0];
    } finally {
        spy.mockRestore();
    }
}

/** Capture a single console.error call's argument as a string. */
function captureErr(fn) {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
        fn();
        expect(spy).toHaveBeenCalledTimes(1);
        return spy.mock.calls[0][0];
    } finally {
        spy.mockRestore();
    }
}

describe('logOK', () => {
    it('prefixes the summary with the [OK] marker', () => {
        const line = captureLog(() => logOK('hello world'));
        expect(line).toBe('[OK] hello world');
    });
});

describe('logFail', () => {
    it('prefixes the detail with [FAIL] <kind>:', () => {
        const line = captureErr(() => logFail('Parse', 'foo.gpx: bad xml'));
        expect(line).toBe('[FAIL] Parse: foo.gpx: bad xml');
    });
});

describe('logBuildStart', () => {
    it('emits a bare [BUILD] Starting line when called with no arg', () => {
        const line = captureLog(() => logBuildStart());
        expect(line).toBe('[BUILD] Starting');
    });

    it('emits a bare [BUILD] Starting line when all cause counts are zero', () => {
        const line = captureLog(() => logBuildStart({ added: 0, changed: 0, removed: 0 }));
        expect(line).toBe('[BUILD] Starting');
    });

    it('appends a cause clause for a single non-zero kind', () => {
        const line = captureLog(() => logBuildStart({ added: 3, changed: 0, removed: 0 }));
        expect(line).toBe('[BUILD] Starting | 3 added');
    });

    it('appends multiple non-zero kinds in fixed order: added, changed, removed', () => {
        const line = captureLog(() => logBuildStart({ added: 3, changed: 1, removed: 2 }));
        expect(line).toBe('[BUILD] Starting | 3 added, 1 changed, 2 removed');
    });

    it('omits zero counts from the cause clause', () => {
        const line = captureLog(() => logBuildStart({ added: 0, changed: 5, removed: 0 }));
        expect(line).toBe('[BUILD] Starting | 5 changed');
    });
});
```

### Step 1.2: Run the test to verify it fails

- [ ] Run: `npm run test:unit -- preprocessing/lib/log.test.js`

Expected: FAIL on the `logBuildStart` tests with "logBuildStart is not a function" (or similar). The `logOK` / `logFail` tests should already pass.

### Step 1.3: Implement `logBuildStart`

- [ ] Modify `preprocessing/lib/log.js`. Add a new exported function after `logFail`:

```js
/**
 * Emit a build-start marker. `cause` is an optional snapshot of file events
 * that triggered this build (from the watcher). The line is omitted from the
 * `grep -E '\[OK\]|\[FAIL\]'` outcome scan recipe — `[BUILD]` is a different
 * marker. Format-truth lives here so watch.js and build-trip-data.js both
 * produce identical lines.
 *
 * @param {{ added?: number, changed?: number, removed?: number } | undefined} cause
 */
export function logBuildStart(cause) {
    let clause = '';
    if (cause) {
        const parts = [];
        if (cause.added)   parts.push(`${cause.added} added`);
        if (cause.changed) parts.push(`${cause.changed} changed`);
        if (cause.removed) parts.push(`${cause.removed} removed`);
        if (parts.length) clause = ` | ${parts.join(', ')}`;
    }
    console.log(`[BUILD] Starting${clause}`);
}
```

### Step 1.4: Run the tests to verify they pass

- [ ] Run: `npm run test:unit -- preprocessing/lib/log.test.js`

Expected: All tests in `log.test.js` pass.

### Step 1.5: Commit

- [ ] Run:

```bash
git add preprocessing/lib/log.js preprocessing/lib/log.test.js
git commit -m "Preprocessing: logBuildStart helper for [BUILD] start lines"
```

---

## Task 2: Add `poiCategories` to stats in `output.js`

**Files:**
- Modify: `preprocessing/lib/output.js:155-172`
- Test: `preprocessing/lib/output.test.js:253-286`

### Step 2.1: Write the failing tests

- [ ] In `preprocessing/lib/output.test.js`, locate the existing `describe('buildGeoJSON -- stats', ...)` block (around line 253). Add these tests inside that block, after the existing `it('counts transport modes', ...)` test:

```js
it('exposes poiCategories on stats', () => {
    expect(stats.poiCategories).toBeDefined();
    expect(typeof stats.poiCategories).toBe('object');
});

it('counts POI categories from waypoints', () => {
    // Use a fixture that yields waypoints. The existing waypoint fixture
    // is loaded by the runPipeline call below; we re-run with a waypoints
    // file so we can assert non-empty category counts.
    const r = runPipeline([], [], [join(FIXTURES, 'poi-waypoints.gpx')]);
    const cats = r.metadata.stats.poiCategories;
    // poi-waypoints.gpx contains at least one waypoint; its category must
    // appear with a positive count. Assertion form keeps the test resilient
    // to fixture edits — we're pinning the SHAPE, not exact category names.
    expect(Object.keys(cats).length).toBeGreaterThan(0);
    for (const [cat, count] of Object.entries(cats)) {
        expect(typeof cat).toBe('string');
        expect(count).toBeGreaterThan(0);
    }
});

it('poiCategories is an empty object when waypointCount is zero', () => {
    expect(stats.waypointCount).toBe(0);
    expect(stats.poiCategories).toEqual({});
});
```

**Note for the implementer:** The existing fixture-discovery test in `runPipeline` uses positional args `(gpxPaths, kmlPaths, waypointPaths)` — confirm by reading the helper near the top of the test file (line ~25). If `poi-waypoints.gpx` doesn't exist in `preprocessing/fixtures/`, look for any fixture with a `<wpt>` element (`ls preprocessing/fixtures/`) and substitute. The shape assertion is the load-bearing one.

### Step 2.2: Run the tests to verify they fail

- [ ] Run: `npm run test:unit -- preprocessing/lib/output.test.js`

Expected: The three new tests fail (`stats.poiCategories` undefined). Existing tests still pass.

### Step 2.3: Implement `poiCategories` in stats

- [ ] In `preprocessing/lib/output.js`, locate the stats-building block (around line 155-172). Replace it with:

```js
    // Stats
    const transportModes = {};
    for (const t of tracks) {
        const mode = t.transportMode ?? 'unknown';
        transportModes[mode] = (transportModes[mode] ?? 0) + 1;
    }
    const poiCategories = {};
    for (const w of waypoints) {
        const cat = w.category ?? 'unknown';
        poiCategories[cat] = (poiCategories[cat] ?? 0) + 1;
    }
    const groundDays = [...new Set(
        tracks.map(t => t.day).filter(d => !d.startsWith('flight-')),
    )].sort();
    const stats = {
        trackCount: tracks.length,
        waypointCount: waypoints.length,
        dayCount: groundDays.length,
        transportModes,
        poiCategories,
        ...(groundDays.length > 0 && {
            dateRange: { start: groundDays[0], end: groundDays[groundDays.length - 1] },
        }),
    };
```

### Step 2.4: Run the tests to verify they pass

- [ ] Run: `npm run test:unit -- preprocessing/lib/output.test.js`

Expected: All tests pass, including the three new `poiCategories` tests.

### Step 2.5: Commit

- [ ] Run:

```bash
git add preprocessing/lib/output.js preprocessing/lib/output.test.js
git commit -m "Preprocessing: count POI categories in stats"
```

---

## Task 3: Emit `[BUILD] Starting` from `build-trip-data.js`

**Files:**
- Modify: `preprocessing/build-trip-data.js` (top of script + import)
- Modify: `preprocessing/build-trip-data.test.js` (success-path tests)

**Design recap:** Single emit site lives in the child (`build-trip-data.js`). Cause data, when present, flows in from the parent (the watcher) via `process.env.NOMADPATH_BUILD_CAUSE` — a JSON string of `{added, changed, removed}` counts. Standalone runs have no env var set → bare `[BUILD] Starting`. Watch runs set it → `[BUILD] Starting | 3 added, 1 changed`. No suppression, no coordination — the watcher just hands the child a payload and lets it log.

### Step 3.1: Write the failing tests

- [ ] In `preprocessing/build-trip-data.test.js`, add these tests inside the `describe('successful build', ...)` block (after `'writes a valid GeoJSON file when input contains parseable tracks'`):

```js
it('emits a bare [BUILD] Starting line on standalone runs', () => {
    const input = join(tmp, 'input');
    mkdirSync(input);
    cpSync(join(FIXTURES, 'sample-track.gpx'), join(input, 'track.gpx'));
    const output = join(tmp, OUTPUT_FILE);

    const r = runBuild(['-i', input, '-o', output, '-n', 'Test Trip']);

    expect(r.status, r.stderr).toBe(0);
    // [BUILD] is the first line of stdout — emitted before any parse/validate work.
    expect(r.stdout.split('\n')[0]).toBe('[BUILD] Starting');
});

it('emits [BUILD] Starting with cause when NOMADPATH_BUILD_CAUSE is set', () => {
    const input = join(tmp, 'input');
    mkdirSync(input);
    cpSync(join(FIXTURES, 'sample-track.gpx'), join(input, 'track.gpx'));
    const output = join(tmp, OUTPUT_FILE);

    const r = spawnSync('node', [SCRIPT, '-i', input, '-o', output, '-n', 'Test Trip'], {
        encoding: 'utf8',
        timeout: 15_000,
        env: {
            ...process.env,
            NOMADPATH_BUILD_CAUSE: JSON.stringify({ added: 3, changed: 1, removed: 0 }),
        },
    });

    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.split('\n')[0]).toBe('[BUILD] Starting | 3 added, 1 changed');
});
```

### Step 3.2: Run the test to verify it fails

- [ ] Run: `npm run test:unit -- preprocessing/build-trip-data.test.js`

Expected: Both new tests fail — no `[BUILD]` line is emitted yet.

### Step 3.3: Emit `[BUILD] Starting` near the top of `build-trip-data.js`

- [ ] In `preprocessing/build-trip-data.js`, update the import on line 16 to include `logBuildStart`:

```js
import { logBuildStart, logFail, logOK } from './lib/log.js';
```

- [ ] Then, immediately after the arg-parsing block (after the `if (!values.input) {...}` exit guard, around line 57, BEFORE `const inputDir = expandPath(values.input);`), insert:

```js
const causeRaw = process.env.NOMADPATH_BUILD_CAUSE;
logBuildStart(causeRaw ? JSON.parse(causeRaw) : undefined);
```

**Why no try/catch around `JSON.parse`:** the only setter of `NOMADPATH_BUILD_CAUSE` is the watcher in this same codebase. A malformed value would be a bug in our own encode, caught by tests, not a runtime concern. Defensive parsing here would be cargo-culting.

### Step 3.4: Run the tests to verify they pass

- [ ] Run: `npm run test:unit -- preprocessing/build-trip-data.test.js`

Expected: Both new tests pass. All existing tests still pass.

### Step 3.5: Commit

- [ ] Run:

```bash
git add preprocessing/build-trip-data.js preprocessing/build-trip-data.test.js
git commit -m "Preprocessing: emit [BUILD] Starting line"
```

---

## Task 4: Measure build runtime and append to `[OK]` line

**Files:**
- Modify: `preprocessing/build-trip-data.js` (top of script + bottom logOK)
- Modify: `preprocessing/build-trip-data.test.js`

### Step 4.1: Write the failing test

- [ ] In `preprocessing/build-trip-data.test.js`, add this test inside `describe('successful build', ...)`:

```js
it('appends a runtime token to the [OK] line', () => {
    const input = join(tmp, 'input');
    mkdirSync(input);
    cpSync(join(FIXTURES, 'sample-track.gpx'), join(input, 'track.gpx'));
    const output = join(tmp, OUTPUT_FILE);

    const r = runBuild(['-i', input, '-o', output, '-n', 'Test Trip']);

    expect(r.status, r.stderr).toBe(0);
    const okLine = r.stdout.split('\n').find(l => l.startsWith('[OK] '));
    expect(okLine).toBeDefined();
    // Runtime is the last `|`-separated field, formatted as `<N>ms` (integer)
    // or `<N.N>s` (one decimal).
    expect(okLine).toMatch(/\| (\d+ms|\d+\.\d+s)$/);
});
```

### Step 4.2: Run the test to verify it fails

- [ ] Run: `npm run test:unit -- preprocessing/build-trip-data.test.js -t "appends a runtime token"`

Expected: FAIL — the current `[OK]` line doesn't end with a runtime token.

### Step 4.3: Capture start time and format runtime

- [ ] In `preprocessing/build-trip-data.js`, add this as the very first executable statement after the imports (before `const USAGE = ...` block, around line 19):

```js
const startNs = process.hrtime.bigint();
```

- [ ] At the bottom of the file, replace the final `logOK(...)` line (around line 336) with:

```js
const elapsedMs = Number((process.hrtime.bigint() - startNs) / 1_000_000n);
const runtime = elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`;

logOK(`${outputFile} | ${stats.trackCount} tracks | ${stats.waypointCount} POI | ${modesBreakdown}${rangeClause}${skipClause} | ${runtime}`);
```

**Note:** This is a transitional state — the tracks-modes and POI-categories parentheticals come in Task 5. The line still passes the existing `1 skipped (.txt)` and `[OK] /...` assertions because those parts are unchanged.

### Step 4.4: Run all tests in this file to verify nothing regresses

- [ ] Run: `npm run test:unit -- preprocessing/build-trip-data.test.js`

Expected: All tests pass, including the new runtime token test.

### Step 4.5: Commit

- [ ] Run:

```bash
git add preprocessing/build-trip-data.js preprocessing/build-trip-data.test.js
git commit -m "Preprocessing: append runtime to [OK] line"
```

---

## Task 5: Rewrite `[OK]` line to group tracks+modes and POI+categories

**Files:**
- Modify: `preprocessing/build-trip-data.js` (bottom OK-line block)
- Modify: `preprocessing/build-trip-data.test.js`

### Step 5.1: Write the failing tests

- [ ] In `preprocessing/build-trip-data.test.js`, add these inside `describe('successful build', ...)`:

```js
it('formats tracks with a modes breakdown in parentheses', () => {
    const input = join(tmp, 'input');
    mkdirSync(input);
    cpSync(join(FIXTURES, 'sample-track.gpx'), join(input, 'track.gpx'));
    const output = join(tmp, OUTPUT_FILE);

    const r = runBuild(['-i', input, '-o', output, '-n', 'Test Trip']);

    expect(r.status, r.stderr).toBe(0);
    const okLine = r.stdout.split('\n').find(l => l.startsWith('[OK] '));
    // `<N> tracks (<modes>)` — single mode renders as e.g. `1 tracks (1 drive)`.
    expect(okLine).toMatch(/\| \d+ tracks \([^)]+\) \|/);
});

it('omits the POI clause when there are no waypoints', () => {
    const input = join(tmp, 'input');
    mkdirSync(input);
    cpSync(join(FIXTURES, 'sample-track.gpx'), join(input, 'track.gpx'));
    const output = join(tmp, OUTPUT_FILE);

    const r = runBuild(['-i', input, '-o', output, '-n', 'Test Trip']);

    expect(r.status, r.stderr).toBe(0);
    const okLine = r.stdout.split('\n').find(l => l.startsWith('[OK] '));
    // No `N POI (...)` clause and no bare `0 POI` clause when waypointCount is 0.
    expect(okLine).not.toMatch(/\bPOI\b/);
});
```

**Note for the implementer:** A "POI present" assertion isn't added here because `build-trip-data.test.js` doesn't currently have a fixture-driven path that produces waypoints. The shape of the POI parenthetical is covered indirectly by `output.test.js` (which asserts `poiCategories` correctness on stats) and `log.test.js` (which doesn't test this), plus the modes-parenthetical test above which uses the same `joinClauses` mechanism. If you want belt-and-braces, add a fixture run that includes `preprocessing/fixtures/<some-waypoints-file>` and assert `/\| \d+ POI \(([^)]+)\) \|/` — but skip that if no such fixture exists; the shape is identical to modes by construction.

### Step 5.2: Run the tests to verify they fail

- [ ] Run: `npm run test:unit -- preprocessing/build-trip-data.test.js`

Expected: The "tracks with modes breakdown" test fails (currently prints `305 tracks | 200 drive, ...`, not `305 tracks (200 drive, ...)`). The "no POI" test fails (currently prints `0 POI |`).

### Step 5.3: Rewrite the OK-line composition

- [ ] In `preprocessing/build-trip-data.js`, replace the entire OK-line section at the bottom of the file (from `const { stats } = geojson.metadata;` through `logOK(...)`) with:

```js
const { stats } = geojson.metadata;

const modesBreakdown = Object.entries(stats.transportModes)
    .sort((a, b) => b[1] - a[1])
    .map(([mode, count]) => `${count} ${mode}`)
    .join(', ');
const tracksClause = `${stats.trackCount} tracks (${modesBreakdown})`;

let poiClause = null;
if (stats.waypointCount > 0) {
    const categoriesBreakdown = Object.entries(stats.poiCategories)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, count]) => `${count} ${cat}`)
        .join(', ');
    poiClause = `${stats.waypointCount} POI (${categoriesBreakdown})`;
}

// Skip breakdown: one bucket → bare extension `(.txt)`; multiple buckets →
// `(.ext: count, ...)` sorted by count desc. No cap on bucket count; a long
// line is itself a diagnostic signal that ignore: needs more entries.
const skipTotal = [...skippedByExt.values()].reduce((a, b) => a + b, 0);
let skipClause = null;
if (skipTotal > 0) {
    const entries = [...skippedByExt.entries()].sort((a, b) => b[1] - a[1]);
    const breakdown = entries.length === 1
        ? entries[0][0]
        : entries.map(([ext, n]) => `${ext}: ${n}`).join(', ');
    skipClause = `${skipTotal} skipped (${breakdown})`;
}

const rangeClause = stats.dateRange
    ? `${stats.dateRange.start} → ${stats.dateRange.end}`
    : null;

const elapsedMs = Number((process.hrtime.bigint() - startNs) / 1_000_000n);
const runtime = elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`;

const clauses = [outputFile, tracksClause, poiClause, rangeClause, skipClause, runtime]
    .filter(c => c !== null);
logOK(clauses.join(' | '));
```

### Step 5.4: Run the tests to verify they pass

- [ ] Run: `npm run test:unit -- preprocessing/build-trip-data.test.js`

Expected: All tests pass — both new assertions plus existing ones (including `'1 skipped (.txt)'` regex and the no-skip-when-output-inside-input regression).

### Step 5.5: Run the wider test suite to catch regressions

- [ ] Run: `npm run test:unit`

Expected: All 362 tests pass (plus the new ones added in Tasks 1, 2, 3, 4, 5).

### Step 5.6: Commit

- [ ] Run:

```bash
git add preprocessing/build-trip-data.js preprocessing/build-trip-data.test.js
git commit -m "Preprocessing: group tracks+modes and POI+categories in [OK] line"
```

---

## Task 6: Pass file-event cause from `watch.js` to the spawned child

**Files:**
- Modify: `preprocessing/watch.js`

**Note:** No tests in this task. Watcher tests are deferred to the future watcher harness epic per the spec (`Out of scope` section). The behaviour is verified by manual smoke at the end of Task 7.

**Design recap:** The watcher accumulates per-file events from chokidar into `pendingEvents = { added, changed, removed }`. When `build()` fires, the snapshot is reset and — only when at least one count is non-zero — passed to the spawned child via `process.env.NOMADPATH_BUILD_CAUSE` as a JSON string. The watcher itself emits no log line. The child (`build-trip-data.js`, wired in Task 3) reads the env var and emits the `[BUILD] Starting [| cause]` line.

### Step 6.1: Wire cause tracking into `build()`

- [ ] In `preprocessing/watch.js`, replace the build-coalescing section (the comment block + `let buildInFlight = ...` through the end of `function build()`, around lines 105-140) with:

```js
// Coalesce file-event bursts. chokidar's awaitWriteFinish handles per-file
// debouncing (one event per file, only after that file stops changing).
// What it doesn't do is coalesce across files or across builds — a `git push`
// landing 50 files fires 50 events, and without queueing each one would start
// its own build.
//
//   - At most one build in flight.
//   - At most one rebuild queued. Events arriving during a build collapse
//     into a single follow-up build that picks up the full state.
//
// No wall-clock timer: the queued build fires when the current one exits, so
// a 50-file burst produces at most 2 builds total.
//
// Cause tracking: chokidar event handlers increment pendingEvents. When build()
// fires, the snapshot is reset and (when any count > 0) handed to the spawned
// child via NOMADPATH_BUILD_CAUSE. The child emits the [BUILD] start line.
// Events arriving while a build is in-flight accumulate into the next snapshot,
// so a queued rebuild's start line shows cumulative cause across the in-flight
// window.
let buildInFlight = false;
let rebuildPending = false;
let pendingEvents = { added: 0, changed: 0, removed: 0 };

function build() {
    if (buildInFlight) {
        rebuildPending = true;
        return;
    }
    buildInFlight = true;
    rebuildPending = false;
    const cause = pendingEvents;
    pendingEvents = { added: 0, changed: 0, removed: 0 };
    const childEnv = { ...process.env };
    if (cause.added || cause.changed || cause.removed) {
        childEnv.NOMADPATH_BUILD_CAUSE = JSON.stringify(cause);
    }
    // spawn (not execFile) — execFile buffers stdio and ignores 'inherit'.
    // We want the child's [BUILD]/[OK]/[FAIL] lines streamed through to the log.
    const child = spawn('node', buildArgs, { stdio: 'inherit', env: childEnv });
    child.on('exit', (code) => {
        // build-trip-data.js handles its own failures by unlinking OUTPUT
        // before exiting non-zero. But if the spawned process died abnormally
        // (signalled, OOM, etc.) it may not have run that cleanup. Belt-and-
        // braces: ensure stale output is gone on any non-zero exit. The child
        // has already printed its own [FAIL] line(s); no extra summary needed.
        if (code !== 0) removeOutputIfExists();
        buildInFlight = false;
        if (rebuildPending) build();
    });
}
```

### Step 6.2: Wire chokidar event handlers to increment counters

- [ ] In `preprocessing/watch.js`, replace the final three chokidar handler chain lines (around lines 219-221):

```js
    .on('add',    () => build())
    .on('change', () => build())
    .on('unlink', () => build());
```

with:

```js
    .on('add',    () => { pendingEvents.added++;   build(); })
    .on('change', () => { pendingEvents.changed++; build(); })
    .on('unlink', () => { pendingEvents.removed++; build(); });
```

### Step 6.3: Verify nothing in the existing test suite regresses

- [ ] Run: `npm run test:unit`

Expected: All tests pass. `watch.js` has no unit-test coverage (deferred to future watcher harness epic), but tests for `log.js`, `output.js`, and `build-trip-data.js` all still pass.

### Step 6.4: Manual smoke test

- [ ] In a terminal, run:

```bash
npm run watch -- -i /home/dan/Documents/holidays/2025-hawaii
```

(Substitute any input directory containing GPX/KML files. The real-data path `/home/dan/Documents/holidays/2025-hawaii` is the canonical large-corpus smoke target per CLAUDE.md.)

Expected stdout includes, in order:
1. `[BUILD] Starting` (no cause clause — initial build)
2. (eventually) `[OK] /path/to/trip-data.geojson | 305 tracks (200 drive, ...) | 15 POI (...) | 2025-09-12 → 2025-10-10 | 1 skipped (.geojson) | 1.2s`
3. (the `serve` process URL line continues to print)

Then, in another terminal, `touch` a file in the watched directory. Expected new lines:
1. `[BUILD] Starting | 1 changed`
2. `[OK] ... | <runtime>`

Press Ctrl+C to exit.

### Step 6.5: Commit

- [ ] Run:

```bash
git add preprocessing/watch.js
git commit -m "Preprocessing: watch passes file-event cause to spawned build"
```

---

## Task 7: Final verification

### Step 7.1: Run the full unit suite

- [ ] Run: `npm run test:unit`

Expected: All tests pass (no failures, no skips that weren't skipped before).

### Step 7.2: Run the library and e2e suites

- [ ] Run: `npm run test:library`
- [ ] Run: `npm run test:e2e`

Expected: All pass. The log-format change shouldn't affect library or e2e behaviour — these runs are belt-and-braces confirmation that the GeoJSON output (and the `metadata.stats` addition of `poiCategories`) hasn't broken any downstream consumer.

### Step 7.3: Manual demo smoke

- [ ] Run: `npm run demo` (this auto-builds first)

Expected: The demo build emits a `[BUILD] Starting` line followed by an `[OK]` line in the new format, before serving starts.

### Step 7.4: Final commit (only if changes were needed)

If steps 7.1–7.3 surfaced any issues, fix and commit per their respective task numbers. Otherwise, no final commit is needed — the work is already in atomic commits from Tasks 1–6.

---

## Self-review notes

Done after writing the plan:

- **Spec coverage:** every spec section is implemented.
  - `[BUILD] Starting` line — Task 3 (single emit site in child; reads `NOMADPATH_BUILD_CAUSE` env var if set).
  - Cause clause format — Task 1 (helper format truth), Task 6 (watcher cause accumulation + env-var handoff to child).
  - New `[OK]` shape with grouped breakdowns — Task 5.
  - `poiCategories` in stats — Task 2.
  - Runtime measurement & format — Task 4 (introduces it), refined in Task 5 (final composition).
  - Cause env var (`NOMADPATH_BUILD_CAUSE`) — Task 3 (child reads + parses), Task 6 (watcher conditionally sets).
  - Cumulative-cause across in-flight bursts — Task 6 (snapshot+reset semantics; documented in comment).
  - Out-of-scope items (watcher harness tests, `[FAIL]` format, contract changes) — not added as tasks. ✓

- **Placeholder scan:** no TBDs, no "add appropriate", no "similar to".

- **Type consistency:** `logBuildStart(cause)` signature consistent at definition (Task 1) and call site (Task 3, passing `undefined` or a parsed `{added, changed, removed}` object). `pendingEvents` shape consistent across watcher init, increments, and the JSON-encoded handoff. Env var name `NOMADPATH_BUILD_CAUSE` identical at set (Task 6) and read (Task 3).

- **Cross-task ordering risk:** Task 4 introduces runtime via a transitional `logOK` rewrite; Task 5 rewrites the whole composition. This is deliberate — Task 4 keeps the diff small and the runtime test green on its own commit. If Task 5 lands without Task 4, runtime tests will fail; if Task 4 lands without Task 5, the existing `1 skipped (.txt)` regex still matches because the skip clause is unchanged. Order matters but each commit is internally consistent.
