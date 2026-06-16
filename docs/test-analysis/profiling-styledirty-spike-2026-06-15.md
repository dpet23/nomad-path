# Stage 0 spike results — `_styleDirty` settle signal (2026-06-15)

Spike for the render-based end-to-end action profiling plan
(`~/.claude/plans/i-m-working-on-profiling-peppy-clarke.md`). Throwaway
instrumentation, run via the `harness/perf` Playwright harness (real OSM tiles
from openfreemap, profiling bundle, `window._map` exposed). MapLibre 4.7.1.

**STATUS: GATE FAILED — `_styleDirty` REJECTED, and SO IS EVERY MapLibre-level
signal.** The headed / real-GPU investigation (§4, §6) proved the visible draw
of a heavy action genuinely takes **~2 seconds**, painted in bursts, but **no
MapLibre flag, event, or query tracks it** — they all stabilize by ~300–860ms
while the canvas pixels keep changing out to ~2s. Confirmed via OS-level
Playwright screenshot diffing (ground truth). The only signal that tracks the
true visible settle is **pixel-change quiescence**, which the headless harness /
perf test CAN observe (screenshots) but the live in-page demo widget CANNOT
(WebGL `preserveDrawingBuffer:false`). This is the central finding for the
re-plan. Headless §1–§3 numbers are real but measure the wrong thing.

## 1. What was proven (headless Chromium)

On a real MapLibre instance with real OSM tiles, driving real actions
(`setColourAttribute`, and unchecking a track via the legend checkbox):

| Claim | Result |
|---|---|
| `_styleDirty === true` immediately after the synchronous mutation returns | ✅ true for both `setPaintProperty` and `setFilter` |
| Flips to `false` within the next frame or two | ✅ cleared on **frame 1** (~22–53ms) every run — no multi-frame transition animation |
| Flip is tile-INDEPENDENT | ✅ with tiles delayed 5s via route interception, `_styleDirty` cleared at t≈22ms with `map.loaded() === false` (tiles still streaming) |
| Field exists and is readable at `map._styleDirty` | ✅ present; survives prod minification (it is a `this.` property access, not renamed) |

`_styleDirty` is confirmed separate from `loaded()`/tiles, exactly as the plan's
investigation claimed. The `idle`-taint problem does not affect it.

## 2. Settle-signal width: narrow vs broad

Investigated whether `_styleDirty` alone under-measures vs the broad
`somethingDirty` = `_styleDirty || _sourcesDirty || _placementDirty || _repaint`
(MapLibre's own pre-`idle` condition, minus the `loaded()`/tile half).

- On the 4-track fixture AND on the real ~6.5MB Hawaii dataset (one 11.9k-point
  track, antimeridian intl flights exploded into many 2-point segments), the
  broad signal and the narrow `_styleDirty` signal **settled on the same frame**.
- `_sourcesDirty` never observably lingered past frame 0 — even for a brute-force
  `map.getSource('np-tracks').setData(...)` (full re-parse/re-tessellation of all
  segments).

**Why:** the library's two bracketed v1 actions don't generate a heavy async
backend tail. `setFilter` on pre-split 2-point segments is a GPU-side filter
toggle, **not** a re-tessellation. `setPaintProperty` is style-only. The cost is
**synchronous** (see §3), not an async multi-frame source job.

**Conclusion:** the plan's original `_styleDirty`-only D1 is sufficient. The
mid-spike worry that it under-measures (by skipping `_sourcesDirty`
re-tessellation) was **disproven** for this library's action set — there is no
async tail for it to miss. Broad signal adds no measured benefit and is slightly
more upgrade-fragile (3 fields vs 1) + marginally more exposed to a concurrent
zoom's stray `_placementDirty` blip.

## 3. Where the cost actually lives (heavy dataset, intl flight uncheck)

- Synchronous trigger (our JS recompute + `setFilter` apply): **~11ms**
- Gap from sync-return to first render: ~22ms
- `_styleDirty` clears: frame 1 (~53ms total)

The dominant measurable cost is the **synchronous** trigger work, which the
bracket already captures (`name:start` is stamped before the trigger; settle is
~1 frame later).

## 4. OPEN — headless vs real-browser discrepancy (must resolve before building)

**The problem.** On the real demo in a GPU-backed browser, unchecking an
international flight visibly takes **a few seconds**, and the user reports it is
**the track geometry itself redrawing** over those seconds (not basemap tiles
re-settling). The headless spike measures **~50ms**. A 50ms-vs-seconds gap for
the same action means one of:

- **Hypothesis A (headless artifact):** headless Chromium (SwiftShader software
  GL, no real compositor/display refresh) clears `_styleDirty` / fires `render`
  on a different schedule than real hardware painting thousands of vector
  segments. If true, the ~50ms is a headless-only number and `_styleDirty` may
  clear *before* the real GPU paint of the geometry completes — which would make
  `_styleDirty` an INVALID "settled frame" signal on real hardware. This would
  invalidate the headless perf number as a proxy for real UX.
- **Hypothesis B (tile tail):** the seconds are the tile tail the plan excludes
  by design. **Ruled less likely** by the user's report that it's the *track*
  redrawing, not tiles.

The user's "track itself redrawing" answer points at **Hypothesis A**.

**Decision needed:** is `_styleDirty`-clear a faithful "the action has painted"
signal on real hardware, or does it clear early there too? If it clears early on
real hardware, the whole causal approach needs rethinking (what *does* mark the
geometry paint complete?).

### RESOLVED 2026-06-15 — Hypothesis A confirmed, signal rejected

Ran the heavy intl-flight uncheck **headed** (real GPU, `DISPLAY=:10.0`,
Playwright `--headed`), capturing the full `render` event stream for 5s:

| Metric | Headless | Headed (real GPU) |
|---|---|---|
| `_styleDirty` clears at | ~50ms | **42–52ms** |
| Last render event | ~90ms (went quiet) | **2471–2749ms** |
| Max inter-frame gap | ~25ms | **660–692ms** |
| Slow (>50ms) frames after clear | 0 | **5** |

Render events continued **~2.7s after `_styleDirty` cleared**, with multiple
600ms+ frames — the visible multi-second geometry redraw the user reported.

**Tile-tail ruled out:** re-ran headed with **all basemap tiles aborted**
(route-abort on `…/{z}/{x}/{y}.(pbf|png)`, style JSON still allowed so create()
works). The multi-second render stream PERSISTED (`_styleDirty` clear 42.6ms,
last render 2471ms, 660ms max gap). So the tail is **genuine vector geometry
repaint** (the real action cost), not tiles.

**Verdict:** `_styleDirty`-clear is NOT "the action has visibly painted." It
clears when the *style recalc* is flushed, long before the GPU finishes
repainting the geometry across many frames. D1 and D2 (both keyed on the dirty
flags clearing) are invalid for the stated goal. The whole settle-signal design
needs rethinking — see "Re-plan directions" below.

## 6. Ground-truth investigation (2026-06-15, headed) — what the 2s tail REALLY is

After the user reported the data visibly draws "bottom-up in bursts" over ~2s,
ran a series of headed diagnostics (all in `harness/perf/spike.spec.ts`):

- **Dirty flags / transitions:** `_styleDirty` last true ~20ms, `hasTransitions()`
  (symbol fade) true only for the first ~300ms (`fadeDuration`), `_placementDirty`
  only blips at the very end. None of these bound the 2s.
- **`fadeDuration:0`:** the long tail is UNCHANGED → not the fade.
- **Steady-frame burst:** the first ~314ms is steady ~20ms frames; afterward the
  render loop fires SPARSE renders with 400–670ms gaps and all flags clear. A
  no-action CONTROL showed the map fires sparse background renders on its own
  (8 renders / 780ms / 430ms gap) — so the render-event stream is NOT a clean
  settle signal; it is contaminated by background renders.
- **`queryRenderedFeatures` + tile count:** ~112,541 painted line segments (the
  antimeridian flights + `tolerance:0` explode the geometry), only 4 source tiles.
  The feature count stabilizes by ~862ms — data is all present early; this is NOT
  incremental tile arrival.
- **GROUND TRUTH (Playwright OS-level screenshot diffing):** composited canvas
  pixels kept CHANGING until **~2042ms** (changes at 431, 955, 1942, 2042ms, then
  quiet). This matches the user's eyes.

**Conclusion:** the 2s is **GPU rasterization of ~112k line segments**, painted in
chunks across many frames. It is real visible work, but **no MapLibre-level event,
flag, or query reflects it** — they all settle by ~300–860ms. (In-page WebGL
canvas readback is blank because MapLibre uses `preserveDrawingBuffer:false`.)

## 7. Re-plan directions (input for the next planning pass)

The true "visible settle" is only observable as **pixel-change quiescence**.
This splits cleanly by environment, and the split is the core design problem:

1. **Perf test / headless (CAN measure it):** Playwright `page.screenshot()` diff
   loop → settle = last screenshot that differs from the next. Renderer-
   independent ground truth. Already prototyped here (§6). Coarse (~100ms/shot)
   but real. This gives a trustworthy regression number.
2. **Live demo widget (CANNOT, as-is):** no in-page access to composited pixels
   with `preserveDrawingBuffer:false`. Options, all with tradeoffs:
   a. Enable `preserveDrawingBuffer:true` in the PROFILING build only, then an
      in-page rAF loop hashes `getCanvas()` pixels for quiescence. **Risk: this
      flag has a real GPU cost and would distort the very number measured.**
   b. Drop the live end-to-end number from the widget; keep only the synchronous
      phase measures there, and surface the true end-to-end number only in the
      perf test (screenshot-based). The widget's value was the side-by-side
      contrast — reconsider whether that's achievable live.
   c. Accept an APPROXIMATE live signal (e.g. render-stream quiescence with a
      background-render discriminator) knowing it under-reports vs ground truth.
3. **Reconsider scope:** the original goal ("live end-to-end action latency in
   the demo widget, causally, no timers, excluding tiles") may be **infeasible**
   as stated — the real cost is GPU fill with no causal completion event, only
   observable as pixel quiescence (a timer/quiescence notion) or via screenshots
   (not available live). The re-plan should decide between: a screenshot-based
   PERF-TEST-ONLY metric (trustworthy, not live), an approximate live widget
   number (live, not trustworthy), or the `preserveDrawingBuffer` route (live +
   trustworthy but perturbs the measurement and prod-bundle cleanliness).

The no-wall-clock-threshold constraint interacts with all of these — deferred per
the user; revisit when choosing among 7.1/7.2/7.3.

Whatever is chosen MUST be validated **headed** — the headless flag/event numbers
are false-positives for this measurement.

## Throwaway spike artifacts (uncommitted, kept for the §4 headed re-run)

- `harness/perf/spike.spec.ts` — the spike spec (all probes above)
- `harness/perf/heavy.html` — harness page loading the real heavy dataset
- `harness/perf/heavy.geojson` — copy of `/home/dan/Documents/holidays/2025 Hawaii/tracks/trip-data.geojson` (DO NOT COMMIT — real trip data)

Delete these once §4 is resolved and the decision is recorded.
