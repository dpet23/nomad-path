# Library profiling instrumentation — design

Status: brainstormed 2026-06-13. Awaiting implementation planning.

## Motivation

We want to know the current performance characteristics of the Nomad Path UI library — which actions are efficient and which aren't — broken down by major phase (geojson parse, track ingestion, colour render, colour re-render on attribute change). There is a show-and-tell of the current state coming up; concrete timing numbers would be valuable for it.

Beyond the one-off numbers, the real prize is a **performance-regression safety net**: a way to catch (or at least surface) significant profiling regressions *before* the planned packaging refactor or any library rewrite. Per `feedback_sessions_create_bugs.md` ("bias toward moves whose product is itself a safety net"), a perf net is exactly the kind of work to do before a structural refactor that moves library code wholesale. This epic lays the foundation for that net; full regression validation (baselines, thresholds, CI) is a deliberate future iteration.

The demo page is the natural place to *display* the numbers for the show-and-tell: it's mostly a dev tool already, and it's usually accessed from a mobile browser where opening devtools to read `performance` entries is awkward.

## Hard constraints

1. **The profiling code must not be present in the production library build artifact** (`dist/nomad-path.js`). Not merely disabled at runtime — absent. The prod bundle must be diff-able as clean.
2. **The demo must remain realistic** — same source, same rollup pipeline, same minification as prod. The only permitted difference is the profiling flag.
3. **Clean, maintainable instrumentation** — no scattered `if (FLAG)` blocks. A single source of truth for the flag, and call sites that read as one wrapping line.

## Core measurement primitive: standard `performance` marks

The library emits **standard `performance.mark` / `performance.measure` entries** and exposes **no new public API** for timings. Every consumer reads them via the web standard:

- **Demo widget** — `performance.getEntriesByName(...)` / a `PerformanceObserver`.
- **Characterization perf test** — `page.evaluate(() => performance.getEntriesByName(...))` (same seam the integration harness already uses to reach into the page).
- **Browser devtools** — for free.

Choosing this primitive is what makes the future perf-regression test a drop-in: the test and the human read the *same* marks. The interface is deliberately test-readable, not just DOM-readable.

## Instrumentation design

### Two build outputs from one source

Rollup already produces multiple bundles (`nomad-path.js`, `contract.js`). We add a profiling variant of the library bundle:

- `dist/nomad-path.js` — **prod.** `NOMADPATH_TIMING` replaced with `false`. Terser dead-code-eliminates every profiling path. Clean of profiling code. What real consumers load; what the existing integration + e2e harnesses load.
- `dist/nomad-path.profiling.js` — **profiling.** Same source, same pipeline, same minification; `NOMADPATH_TIMING` replaced with `true`. Profiling paths live. Loaded by the demo and the characterization perf test.

"Realistic" is preserved because the profiling build is the prod build *plus measurement* — identical source and pipeline, one boolean differs at the replace step.

**Ownership rule (refactor-safe):** the profiling bundle is a **library-owned build output** — `rollup.config.js` (the library's config) emits both files to the library's own `dist/`. Consumers only ever *choose which already-built file to load*. No demo-local or harness-local profiling flag. This config moves into `packages/library/` wholesale in the future refactor's library step, carrying both outputs.

### Build-time constant replacement (the mechanism)

JS/TS has no native `#ifdef`. The idiom — already used here — is build-time constant replacement + dead-code elimination. `rollup.contract.config.js:21-24` already does this (`@rollup/plugin-replace` rewrites `require.main === module` → `false`, terser drops the branch). We follow the same pattern with a `NOMADPATH_TIMING` bare identifier replaced per output.

### Single profiling module, single flag, closure wrapper

The flag is referenced in **exactly one file**. Call sites wrap timed work in a closure — no branching at the call site.

```ts
// src/profiling.ts — the ONLY place NOMADPATH_TIMING is referenced
declare const NOMADPATH_TIMING: boolean; // replaced at build time by rollup-replace

export const profile = NOMADPATH_TIMING
  ? <T>(name: string, fn: () => T): T => {
      performance.mark(`${name}:start`);
      try { return fn(); }
      finally {
        performance.mark(`${name}:end`);
        performance.measure(name, `${name}:start`, `${name}:end`);
      }
    }
  : <T>(_name: string, fn: () => T): T => fn(); // identity — terser inlines away

// + an async variant `profileAsync` for awaited phases (e.g. data load)
```

The ternary is evaluated once at module load. In prod (`false ? … : identity`), terser folds `profile` to the identity function and inlines every `profile(name, fn)` call down to just `fn()` — the wrapper vanishes. No dead `if` blocks; the flag lives in one file.

Call sites read as a single wrapping line:

```ts
const features = profile('addLayers.segments', () => buildSegmentFeatures(tracks));
profile('addLayers.maplibre', () => {
  this.map.addSource(/* … */);
  this.map.addLayer(/* … */);
});
```

**Trade-off (accepted):** the wrapper must enclose the timed code, so bare statement sequences get wrapped in an arrow function (or extracted to a helper). Light touch, tends to make phases more legible. The alternative — scattered start/end mark *statements* — is the "if blocks everywhere" mess we're avoiding.

### Phases to instrument (final selection during implementation)

Candidates (confirm/trim after reading the code — pick what's genuinely meaningful):

- **GeoJSON load + parse** — `DataLoader.loadTripData` (`src/core/DataLoader.ts:24`).
- **Track ingestion** — `LayerManager.addLayers` (`src/core/LayerManager.ts:250`); likely heaviest. Sub-marks candidate: `buildSegmentFeatures` vs `map.addSource`/`addLayer`.
- **Initial colour render** — first `buildColourExpression` + `setPaintProperty` during initial setup.
- **Re-render on colour change** — `setColourAttribute` (`src/index.ts:277` → `LayerManager.setColourAttribute` `src/core/LayerManager.ts:370`); the interactive one users feel.

## Demo display widget

- A small, **demo-only** widget (not in the prod library) surfacing the `performance` measurements on-page.
- **Toggle panel, plain list** of phase → ms; re-render timings update live; shown/hidden via a control in the demo's own toolbar (not the library menu). UX may change once seen — start simple.
- **Form:** a self-contained module `harness/demo/profiling-widget.js` exporting something like `mountProfilingWidget(toolbarEl)` (sets up a `PerformanceObserver` + renders the panel). Kept out of the inline bootstrap so `index.html` stays legible; ambition is "modest but real," which justifies its own file.
- The demo loads `nomad-path.profiling.js`. No prod/profiling switch in the demo.

## Characterization perf test

A **printing test, not a regression test.** It loads the profiling bundle in a harness, drives the operations (load, ingest, colour change), reads the `performance` marks, and **prints them — asserts nothing.** Its job is to prove the timing seam works end-to-end in a test context and emit reproducible numbers. You can't set thresholds before seeing the numbers; this is how you see them. Adding assertions is the clean future iteration.

- **Home:** `harness/` (see below). Loads `nomad-path.profiling.js`.
- **Wiring:** its own `test:perf` npm script + its own Playwright project (serves the harness with the profiling bundle). **Not part of `test:all`** — it has no assertions to gate on, so it would only add runtime for output nobody reads in CI. Run on demand.

## `harness/` folder — new code only

Create a plain `harness/` **subfolder** (like `src/`, `demo/`, `preprocessing/` are today) — **NOT** an npm workspace package, no resolver, no `package.json`. Governing rule: **only code this epic creates or modifies goes in; everything that already works stays where it is.**

- **Moves in** (modified by this epic anyway, so lands in its target home on first touch — no double-move at refactor time):
  - `demo/` → `harness/demo/` (widget + profiling-bundle switch).
- **New, lands here:**
  - the characterization perf test + its harness page (serves the profiling bundle).
- **Stays put, untouched** (works; disturbing it is pure churn):
  - `test/integration/` and `test/e2e/` — serve the **prod** bundle, verify the shipped artifact, pass. They are also the guarantee that the stripped prod build is correct (a bug only in the stripped build wouldn't show in an always-profiling demo).
  - `preprocessing/watch.js`, `enable-git-rebuilds` — preprocessing-side; this epic doesn't touch them. (Also correct toward the refactor target: these belong in `@nomad-path/preprocessing`, not the harness.)

This is the "new code lands in the target shape; working code is left alone until the real refactor" principle. It avoids both *adding churn the refactor re-does* (no folder moves of working tests, no workspaces) and *moving the same code twice* (new/modified code goes to its eventual home now).

**Demo-move cost (accepted, ~4 small edits):** `_copy:demo` → `harness/demo/dist`; the `demo` and `watch` scripts' `serve ./demo` → `serve ./harness/demo`; `clean`'s dir list. Cheaper than moving `test/` too (which would be ~12 path rewrites and isn't touched by this epic).

## Scope held OUT (explicit)

- **No npm workspaces / resolver.** The thing that actually deletes the three `_copy:*` copies is the workspace resolver, not a folder move — that's the real refactor, deferred.
- **No folder move of `test/integration` or `test/e2e`.** They work and this epic doesn't touch them.
- **No harness *package* extraction** (`@nomad-path/harness` with declared deps). `harness/` here is just a directory.
- **No perf-regression validation** — no baseline storage, thresholds, CI gating, or flakiness policy. The characterization test prints only; validation is the next iteration.
- **No `watch`/`git-rebuilds` move.**

## Interaction with the packaging refactor

This work is sequenced **before** the packaging refactor (`2026-05-26-packaging-refactor-design.md`) and is structured so every piece relocates cleanly when the refactor runs — adding no net-new refactor payload:

| Piece | Lands in now | Refactor destination |
|---|---|---|
| `src/profiling.ts`, instrumented phases | `src/` | `packages/library/` (library step), as a unit |
| Two rollup outputs | `rollup.config.js` | `packages/library/` (library step), wholesale |
| Widget, moved demo | `harness/demo/` | `packages/harness/demo/` (harness step) |
| Characterization perf test | `harness/` | `packages/harness/` as its perf/e2e mode (harness step) |

The post-refactor end state is consistent: in `@nomad-path/harness`, demo mode and the perf test serve the library's `nomad-path.profiling.js`; e2e mode serves `nomad-path.js` — all "pick which built file to serve," per the packaging design's "harness consumes build artifacts, not source" (line 76). The harness is still extracted *last* in the real refactor (it's the dep-graph root, design lines 127-129); the `harness/` subfolder here is not that extraction, just an early home for new code.

## Implementation step ordering (each step independently green & committable)

1. **`profile` wrapper + flag, prod-only build.** Add `src/profiling.ts`; wire `@rollup/plugin-replace` to set `NOMADPATH_TIMING = false` in the existing single output; instrument one or two phases as proof. Green: prod bundle builds, timing tree-shakes to nothing (grep-verify), tests pass. *Load-bearing thing now exists: instrumentation in the library, provably absent from prod.*
2. **Emit the second bundle.** Add the `nomad-path.profiling.js` output (`NOMADPATH_TIMING = true`). Green: both bundles build; nothing consumes profiling yet.
3. **Move demo → `harness/demo/`, add widget, switch to profiling bundle.** Update the ~4 demo script paths; build the toggle-panel widget. Green: demo shows numbers; integration/e2e untouched on prod. *Show-and-tell deliverable exists.*
4. **Characterization perf test in `harness/`.** New Playwright project + `test:perf` script serving the profiling bundle; drives ops, prints marks, no assertions. Green: `test:perf` runs and prints; `test:all` unchanged.
5. **Finish instrumenting** remaining phases, guided by the real numbers from steps 3–4.

## Verification

- **Prod bundle is clean:** after `build:lib`, grep/diff `dist/nomad-path.js` for `performance.mark` / `NOMADPATH_TIMING` / phase names — must be absent. Load-bearing check for constraint 1.
- **Profiling bundle works:** load the demo against `dist/nomad-path.profiling.js`, perform a colour-attribute change, confirm `performance.getEntriesByName(...)` returns the expected measurements and the widget shows them.
- **Demo realistic:** confirm the profiling bundle is the same minified pipeline as prod (not an unminified dev build).
- **Perf seam test-readable:** `test:perf` loads the profiling bundle and prints non-empty measurements for each instrumented phase.
- **Existing suites unaffected:** `npm run test:all` green after each step (integration + e2e still on the prod bundle).
