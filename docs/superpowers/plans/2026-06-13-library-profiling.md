# Library Profiling Instrumentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-phase `performance.mark`/`measure` timing to the Nomad Path library, surfaced by a demo-only widget, with profiling code provably absent from the production bundle and a characterization perf test as foundation for a future perf-regression net.

**Architecture:** A single `src/profiling.ts` module holds the sole `NOMADPATH_TIMING` flag and `profile`/`profileAsync` closure wrappers. `@rollup/plugin-replace` substitutes the flag per build output; terser dead-code-eliminates the disabled branch. Two library-owned bundles result: `dist/nomad-path.js` (prod, stripped) and `dist/nomad-path.profiling.js` (demo + perf test). New code lands in a plain `harness/` subfolder; working tests stay put.

**Tech Stack:** TypeScript, Rollup (+ `@rollup/plugin-replace@^6.0.3`, `@rollup/plugin-terser`), Vitest (unit), Playwright/Chromium (browser tests), standard Web `performance` API.

**Design spec:** `docs/superpowers/specs/2026-06-13-library-profiling-design.md` — read for full rationale.

---

## Cross-session execution protocol

This plan runs as **5 stages, one fresh session per stage** (each independently green). Only **Stage 1** is fully expanded into bite-sized TDD tasks below; **Stages 2–5 are scoped briefs** — expand each into bite-sized tasks at the start of its own session, against the real code (the natural per-commit seams aren't knowable up front).

**At the start of every stage session, read:**
1. The design spec (`docs/superpowers/specs/2026-06-13-library-profiling-design.md`).
2. This plan.
3. The **Stage log** in `~/.claude/plans/i-m-working-on-this-zazzy-sutherland.md` — what's done, what's next, mid-stage decisions the next stage depends on.

**At the end of every stage session:**
1. Append a Stage log line to `~/.claude/plans/i-m-working-on-this-zazzy-sutherland.md` (what shipped, commit refs, any deviation from the spec).
2. On the final stage (5), tick the `epic/profiling` entry in `CLAUDE.md`'s Epic Progress list to closed and add a close-out note.

Commit style (project rule): **no `Co-Authored-By` trailers.**

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/profiling.ts` | Create (Stage 1) | Sole `NOMADPATH_TIMING` reference; `profile`/`profileAsync` closure wrappers; emits standard `performance` marks. |
| `src/profiling.test.ts` | Create (Stage 1) | Unit test that `profile`/`profileAsync` call through to `fn` and return its value (behaviour identical whether timing on or off). |
| `rollup.config.js` | Modify (Stage 1: add replace to prod output; Stage 2: add 2nd output) | Library bundle build. Two outputs by Stage 2. |
| `src/core/DataLoader.ts` | Modify (Stage 1 proof, Stage 5 finalise) | Wrap `loadTripData` body in `profileAsync`. |
| `src/core/LayerManager.ts` | Modify (Stage 1 proof, Stage 5 finalise) | Wrap `addLayers` (and sub-phases) in `profile`. |
| `harness/demo/` | Move from `demo/` (Stage 3) | Demo page; loads profiling bundle. |
| `harness/demo/profiling-widget.js` | Create (Stage 3) | Toggle panel reading `performance` entries. |
| `harness/perf/` + perf playwright config | Create (Stage 4) | Characterization perf test: serves profiling bundle, drives ops, prints marks. |
| `package.json` | Modify (Stages 2–4) | Build/copy/serve scripts; `test:perf`. |

---

## STAGE 1 — `profile` wrapper + flag, prod-only build (FULLY EXPANDED)

**Stage goal:** `src/profiling.ts` exists with the closure-wrapper design; `@rollup/plugin-replace` sets `NOMADPATH_TIMING = false` in the existing single prod output; 1–2 phases are instrumented as proof. **GATE:** the built `dist/nomad-path.js` contains no `performance.mark`, no `NOMADPATH_TIMING`, no profiling phase-name strings. This gate is the go/no-go on the entire strip mechanism — everything else rests on it.

**Stage-end state:** prod bundle builds and is provably stripped; `npm run test:unit` green; `npm run typecheck` clean. No profiling bundle yet, no demo/harness change yet.

### Task 1.1: Create `src/profiling.ts` with closure wrappers

**Files:**
- Create: `src/profiling.ts`
- Test: `src/profiling.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/profiling.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { profile, profileAsync } from './profiling';

describe('profile', () => {
    it('returns the wrapped function result', () => {
        expect(profile('x', () => 42)).toBe(42);
    });

    it('calls the wrapped function exactly once', () => {
        const fn = vi.fn(() => 'r');
        profile('x', fn);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('propagates thrown errors', () => {
        expect(() => profile('x', () => { throw new Error('boom'); })).toThrow('boom');
    });
});

describe('profileAsync', () => {
    it('resolves to the wrapped function result', async () => {
        await expect(profileAsync('x', async () => 42)).resolves.toBe(42);
    });

    it('propagates rejected promises', async () => {
        await expect(profileAsync('x', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/profiling.test.ts`
Expected: FAIL — `Failed to resolve import "./profiling"` (module not yet created).

- [ ] **Step 3: Write minimal implementation**

Create `src/profiling.ts`:

```ts
// Build-time constant. Replaced by @rollup/plugin-replace per output:
//   prod bundle      → false  (terser DCEs the timing branch away)
//   profiling bundle → true
// Under vitest/tsc it is neither replaced nor defined at runtime, so we
// declare it and read it through a guarded default below.
declare const NOMADPATH_TIMING: boolean;

// `typeof NOMADPATH_TIMING` is a compile-time-safe probe: in the test/tsc
// context the identifier is undefined, so this evaluates to false without a
// ReferenceError. In a rollup build the identifier is replaced with a literal
// before this file is bundled, so the ternary folds to one branch.
const TIMING_ON = typeof NOMADPATH_TIMING !== 'undefined' && NOMADPATH_TIMING;

/** Time a synchronous operation, emitting a `performance.measure(name)`. */
export const profile = TIMING_ON
    ? <T>(name: string, fn: () => T): T => {
          performance.mark(`${name}:start`);
          try {
              return fn();
          } finally {
              performance.mark(`${name}:end`);
              performance.measure(name, `${name}:start`, `${name}:end`);
          }
      }
    : <T>(_name: string, fn: () => T): T => fn();

/** Time an async operation, emitting a `performance.measure(name)`. */
export const profileAsync = TIMING_ON
    ? async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
          performance.mark(`${name}:start`);
          try {
              return await fn();
          } finally {
              performance.mark(`${name}:end`);
              performance.measure(name, `${name}:start`, `${name}:end`);
          }
      }
    : async <T>(_name: string, fn: () => Promise<T>): Promise<T> => fn();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/profiling.test.ts`
Expected: PASS (5 tests). Note: in the vitest context `TIMING_ON` is `false`, so the identity wrappers run — the tests assert pass-through behaviour, which holds either way.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean (no errors). Confirms the `declare const` + `typeof` guard satisfies tsc.

- [ ] **Step 6: Commit**

```bash
git add src/profiling.ts src/profiling.test.ts
git commit -m "Profiling: add profile/profileAsync closure wrappers behind single flag"
```

### Task 1.2: Wire `@rollup/plugin-replace` into the prod library output

**Files:**
- Modify: `rollup.config.js`

- [ ] **Step 1: Add the replace plugin to the library config**

Replace the entire contents of `rollup.config.js` with:

```js
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

import contract from './rollup.contract.config.js';

const production = !process.env.ROLLUP_WATCH;

// Profiling code (src/profiling.ts) reads the NOMADPATH_TIMING constant.
// Replacing it with `false` here lets terser dead-code-eliminate every
// timing branch from the production bundle — profiling is ABSENT, not just
// disabled. The profiling bundle (Stage 2) sets this to `true`.
const library = {
    input: 'src/index.ts',
    output: {
        file: 'dist/nomad-path.js',
        format: 'esm',
        sourcemap: true,
    },
    plugins: [
        replace({
            preventAssignment: true,
            values: { NOMADPATH_TIMING: 'false' },
        }),
        resolve({ browser: true }),
        commonjs(),
        typescript({ tsconfig: './tsconfig.rollup.json' }),
        production && terser(),
    ].filter(Boolean),
};

/** @type {import('rollup').RollupOptions[]} */
export default [library, contract];
```

- [ ] **Step 2: Build the library bundle**

Run: `npm run build:lib`
Expected: completes without error; `dist/nomad-path.js` regenerated.

- [ ] **Step 3: Commit**

```bash
git add rollup.config.js
git commit -m "Profiling: replace NOMADPATH_TIMING with false in prod rollup output"
```

### Task 1.3: Instrument the proof phases (load + ingestion)

**Files:**
- Modify: `src/core/DataLoader.ts` (`loadTripData`, lines ~24-52)
- Modify: `src/core/LayerManager.ts` (`addLayers`, lines ~250-293)

- [ ] **Step 1: Wrap `loadTripData` body in `profileAsync`**

In `src/core/DataLoader.ts`, add the import at the top (after the existing `import type` line):

```ts
import { profileAsync } from '../profiling';
```

Then change the body of `loadTripData` to wrap the existing `Promise.all(...)` in `profileAsync`. The function becomes:

```ts
export async function loadTripData(urls: string[]): Promise<TripData[]> {
    return profileAsync('nomadpath.loadTripData', () =>
        Promise.all(
            urls.map(async url => {
                let res: Response;
                try {
                    res = await fetch(url);
                } catch (err) {
                    throw new Error(`Network error loading trip data from ${url}: ${(err as Error).message}`);
                }
                if (!res.ok) {
                    throw new Error(`Failed to load trip data from ${url}: HTTP ${res.status}`);
                }
                let data: unknown;
                try {
                    data = await res.json();
                } catch {
                    throw new Error(`Invalid JSON in trip data from ${url}`);
                }
                if (
                    typeof data !== 'object' ||
                    data === null ||
                    (data as Record<string, unknown>).type !== 'FeatureCollection'
                ) {
                    throw new Error(`Trip data from ${url} is not a GeoJSON FeatureCollection`);
                }
                return data as TripData;
            }),
        ),
    );
}
```

- [ ] **Step 2: Wrap the segment-build phase in `addLayers`**

In `src/core/LayerManager.ts`, add the import near the other relative imports at the top:

```ts
import { profile } from '../profiling';
```

Then wrap the `buildSegmentFeatures` call (currently line ~268) so the heaviest sub-phase is timed. Change:

```ts
        const { featureCollection, maxDayIndex } = buildSegmentFeatures(tracks);
```

to:

```ts
        const { featureCollection, maxDayIndex } = profile('nomadpath.buildSegmentFeatures', () =>
            buildSegmentFeatures(tracks),
        );
```

- [ ] **Step 3: Run unit tests**

Run: `npm run test:unit -- src/core/`
Expected: PASS — `DataLoader.test.ts` and `LayerManager.test.ts` unchanged behaviour (the wrappers are pass-through in the test context).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/DataLoader.ts src/core/LayerManager.ts
git commit -m "Profiling: instrument loadTripData and buildSegmentFeatures (proof phases)"
```

### Task 1.4: GATE — verify prod bundle is provably stripped

**Files:** none (verification only).

- [ ] **Step 1: Rebuild the prod bundle**

Run: `npm run build:lib`
Expected: completes; `dist/nomad-path.js` regenerated with terser applied (production).

- [ ] **Step 2: Assert profiling artifacts are absent from the prod bundle**

Run:
```bash
grep -c -E 'performance\.mark|NOMADPATH_TIMING|nomadpath\.loadTripData|nomadpath\.buildSegmentFeatures' dist/nomad-path.js; echo "exit=$?"
```
Expected: prints `0` then `exit=1` (grep finds zero matches → exit code 1). **If any match is found (count > 0, exit=0), STOP** — the strip mechanism is not working; do not proceed to Stage 2. Investigate (terser config, replace `preventAssignment`, whether the `typeof NOMADPATH_TIMING` guard prevented constant-folding — if so, the guard may need to be a bare `NOMADPATH_TIMING` reference in the rollup path with the test context handled differently).

- [ ] **Step 3: Sanity-check the measure names ARE present in source (control)**

Run:
```bash
grep -c -E 'nomadpath\.loadTripData|nomadpath\.buildSegmentFeatures' src/core/DataLoader.ts src/core/LayerManager.ts
```
Expected: prints `1` and `1` — confirms the strings exist in source and their absence from the bundle is due to stripping, not a typo.

- [ ] **Step 4: Full green check**

Run: `npm run test:unit && npm run typecheck`
Expected: all unit tests pass; typecheck clean.

- [ ] **Step 5: Record gate result in Stage log**

Append to the Stage log in `~/.claude/plans/i-m-working-on-this-zazzy-sutherland.md`:
`- stage 1 — DONE. profile/profileAsync in src/profiling.ts; rollup-replace NOMADPATH_TIMING=false in prod; loadTripData + buildSegmentFeatures instrumented. GATE PASS: dist/nomad-path.js grep for profiling artifacts = 0 matches. Commits: <list>.`

(No code commit for this task — it is verification. The Stage log lives outside the repo.)

---

## STAGE 2 — Emit `dist/nomad-path.profiling.js` (BRIEF — expand at session start)

**Stage goal:** add a second library build output that is identical to prod except `NOMADPATH_TIMING` → `true`, so profiling marks are live in that bundle.

**Files:** `rollup.config.js` (add a `libraryProfiling` config to the exported array, same plugins as `library` but `replace` values `{ NOMADPATH_TIMING: 'true' }` and `output.file: 'dist/nomad-path.profiling.js'`); `package.json` (ensure `build:lib` produces both — it already runs `rollup -c` which builds every config in the array, so likely just confirm the CSS copy still happens; verify whether any consumer needs the profiling CSS — it is the same `nomad-path.css`, no second copy needed).

**Verification gate:**
- `npm run build:lib` emits both `dist/nomad-path.js` and `dist/nomad-path.profiling.js`.
- Prod bundle STILL passes the Stage 1 grep gate (0 profiling matches).
- Profiling bundle CONTAINS the marks: `grep -c performance.mark dist/nomad-path.profiling.js` > 0.
- `npm run test:all` green (integration + e2e still load the prod bundle — unchanged).

**Per-commit breakdown:** plan at session start (likely: add profiling output config → verify both-bundle grep contrast → commit).

---

## STAGE 3 — Move `demo/` → `harness/demo/`, add widget, switch to profiling bundle (BRIEF — expand at session start)

**Stage goal:** the demo lives at `harness/demo/`, loads `nomad-path.profiling.js`, and shows a modest-but-real toggle panel of phase→ms timings read from the `performance` API. **This is the show-and-tell deliverable.**

**Files:**
- Move `demo/` → `harness/demo/` (use `git mv` to preserve history).
- `harness/demo/index.html` — change the bundle import to the profiling build, mount the widget, add a toggle control in the existing `#toolbar`.
- Create `harness/demo/profiling-widget.js` — `mountProfilingWidget(toolbarEl)`: sets up a `PerformanceObserver` (type `'measure'`) + renders a toggle panel listing each `nomadpath.*` measure name → latest duration (ms), updating live on re-render.
- `package.json` — `_copy:demo` dest `harness/demo/dist`; `demo` and `watch` scripts `serve ./harness/demo`; `clean` dir list (`demo/dist` → `harness/demo/dist`).

**Bundle-path note:** the demo currently imports `../dist/nomad-path.js` (resolves to root `dist/` from `demo/`). After moving to `harness/demo/`, `../dist/` resolves to `harness/dist/` — WRONG. Decide the correct relative path to root `dist/` at session start (`../../dist/nomad-path.profiling.js`) and verify `serve ./harness/demo` exposes it (it does NOT by default — serve roots at `harness/demo/`, so root `dist/` is outside the served tree). **This is the real work of Stage 3** — likely the demo must serve from a root that includes both `harness/demo/` and `dist/`, OR `_copy:demo` must copy the profiling bundle into `harness/demo/dist/` and the HTML load from `./dist/`. Resolve at session start; the spec's "demo loads profiling bundle" is the requirement, the mechanism is a Stage-3 decision.

**Verification gate:**
- `npm run demo` serves; the page loads the profiling bundle and renders the map.
- Toggling the widget shows non-empty timings; performing a colour-attribute change updates the re-render timing live.
- Prod bundle grep gate still passes. `npm run test:all` green (integration + e2e untouched).

**Per-commit breakdown:** plan at session start (likely: `git mv` demo + fix paths green → switch to profiling bundle → add widget module → wire toggle).

---

## STAGE 4 — Characterization perf test in `harness/` (BRIEF — expand at session start)

**Stage goal:** a printing-only Playwright test that loads the profiling bundle, drives load/ingest/colour-change, reads the `performance` marks via `page.evaluate`, and prints them. Asserts nothing.

**Files:**
- Create `harness/perf/` with a test page (serves the profiling bundle + a fixture geojson) and a perf spec.
- Create a perf Playwright config (mirror `playwright.config.ts` / `playwright.e2e.config.ts` — own `webServer` serving the harness, own project).
- `package.json` — add `test:perf` (build profiling bundle + run the perf playwright project). **NOT** added to `test:all` (no assertions to gate on).

**Verification gate:**
- `npm run test:perf` runs and prints non-empty measurements for each instrumented phase.
- `npm run test:all` unchanged (perf test excluded).
- Prod bundle grep gate still passes.

**Per-commit breakdown:** plan at session start (likely: perf test page + config → spec that reads+prints marks → `test:perf` script).

---

## STAGE 5 — Finish instrumenting remaining phases (BRIEF — expand at session start)

**Stage goal:** with real numbers from Stages 3–4, instrument the remaining meaningful phases and trim any that proved uninformative.

**Candidate phases (confirm against real numbers):** `addLayers` total (map.addSource/addLayer vs the already-timed segment build), initial colour render (`buildColourExpression` + `setPaintProperty` in `addLayers`), colour re-render (`LayerManager.setColourAttribute`, ~line 370). Pick what the numbers show is worth a mark; do not instrument for completeness.

**Files:** `src/core/LayerManager.ts` (and `src/index.ts` if the public `setColourAttribute` boundary is the better mark site).

**Verification gate:**
- New marks appear in `dist/nomad-path.profiling.js` and in `test:perf` output.
- Prod bundle grep gate still passes (extend the grep pattern to the new measure names).
- `npm run test:all` green.

**Stage-end (epic close):** tick the `epic/profiling` entry in `CLAUDE.md` to `[x]` with a close-out note; append final Stage log line. Consider whether a `project_*` memory file is warranted (the strip-mechanism lesson + the harness-new-code-only convention are reusable).

**Per-commit breakdown:** plan at session start (one commit per phase instrumented + the grep-pattern extension).

---

## Self-Review notes

- **Spec coverage:** measurement primitive (Task 1.1), two outputs (Stage 1 prod / Stage 2 profiling), single flag (Task 1.1/1.2), demo widget (Stage 3), characterization test (Stage 4), `harness/` new-code-only (Stages 3–4), held-out items (no workspaces/validation — none planned). All spec sections map to a stage.
- **Strip-mechanism risk:** Task 1.1's `typeof NOMADPATH_TIMING !== 'undefined'` guard is the one design subtlety — it lets the SAME source run under vitest (identifier undefined → `false`) AND fold correctly under rollup (identifier replaced by literal). The Stage 1 GATE (Task 1.4) is the explicit check that this folds to a clean prod bundle. If terser does not strip because the `typeof` guard blocks constant-folding, the fallback (noted in Task 1.4 Step 2) is to use a bare `NOMADPATH_TIMING` reference and provide a vitest-side define instead. This is the go/no-go.
- **Type consistency:** `profile`/`profileAsync` signatures fixed in Task 1.1 and reused verbatim at call sites in Task 1.3.
- **Deferred-by-design:** Stages 2–5 per-commit steps are intentionally not expanded (cross-session protocol); their gates ARE specified so each session knows "done."
