# Phase 4: UI core (DOM-less) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (fresh subagent per task, review between tasks).
> Master plan: `~/.claude/plans/let-s-work-on-the-tingly-pretzel.md`. Design doc: `plans/looking-to-plan-the-piped-nova.md`.
> Branch: `epic/ui-core` (cut). All work branches; merge `--no-ff` at phase end.

**Goal:** `@nomadpath/ui` gains its map-agnostic, DOM-less core: tiered data decode, a central reactive store, attribute availability, and per-point colour mapping — exactly the surface the phase 5 renderer consumes to draw coloured, toggleable tracks.

**Architecture:** `packages/ui/src/core/` holds pure, Vitest-tested logic. The store is built on a framework-agnostic signal primitive (chosen by the Task 1 spike) so `src/core` never imports the widget framework, map libs, or DOM APIs. Decode implements the locked tiered error model (file -> error state; item -> skip + notice; field -> degrade locally; absent optional = valid + silent). Colour mapping is pure functions (continuous ramp, stable categorical generator, one shared neutral grey).

**Scope (trimmed, user-approved 2026-07-05):** the master plan's phase-4 list predates the phase-3 named-consumer lesson. Only pieces with the phase 5 renderer as a nameable consumer are built now. **Deferred with named future consumers:** day/divider bucketing + `day` compute + contract field (phase 6 track tree); waypoint folder bucketing (phase 6 waypoint widget); tri-state group visibility (phase 6 track tree); zoom-limit model (phase 5 zoom clamping — build with the renderer); time-of-day palette (needs the deferred tz compute; phase 6); dataset-wide attribute availability (phase 6 attribute dropdown — the colour path already greys unavailable items per-item, so no phase-5 consumer exists). Record in the design log.

## Global constraints (from design log + CLAUDE.md)

- `ui/src/core` never imports map libs (lint-enforced) and must not import the widget framework — only the framework-agnostic signal primitive.
- The library never throws to the host; decode returns results, never raises.
- **Absent optional attribute = VALID, silent** — no notice, no log. Malformed = error path.
- **One standard neutral grey** for other/missing/none, shared across ALL attribute renderings.
- Missing data accepted as-is — never derived/fabricated.
- Coverage gate: 80% per-file BRANCH floor. Never mock a library to hit a number.
- TDD: enumerate the state space first; all tests first; success AND failure cases.
- Fictional fixtures only (contract fixture builders exist: `buildTripData` etc.); non-overlapping attribute ranges.
- Registries: one source of truth; derive types from the registry object. ASCII hyphens only.
- Dependency placement: the signal primitive has one consumer (ui) -> `packages/ui/package.json`.
- Commands via npm scripts only (`npm run test:unit -- packages/ui`, `npm run check`).

## Contract facts the core consumes (as shipped, phase 3)

- Item = `{ name?, description?, transportMode?, folder?, geometries[] }`; no id/panel/order/day (rejected/deferred).
- Geometries: `line` (parallel `lon`/`lat` >= 2 pts; optional `time`, `ele`, `speed` arrays, entries nullable), `point` (lon/lat, `sym?`), `polygon` (single closed ring >= 4).
- Per-point attribute registry: `PER_POINT_ATTRIBUTES` = `ele`, `speed` (exported as `PER_POINT_ATTRIBUTE_NAMES`).
- `time` inside a line is NOT ordered (multi-device merges); it is a per-point value, never an ordering key.
- UI-side identity = array index (id was rejected as cheaply derivable).

## Tasks

### Task 1: Widget-framework spike + decision — IN FLIGHT

30-minute spike (master plan mandate: "confirm vs Preact+signals at phase 4 start"): Lit + `@lit-labs/signals`/signal-polyfill vs Preact + `@preact/signals-core`. The crux is which reactive primitive the DOM-less store exposes while staying framework-import-free. Deliverable: recommendation + measured bundle sizes + risks; user confirms; decision + rationale recorded in the design log.

- [x] Spike run (scratchpad only, nothing installed in the repo).
- [x] User confirms framework + primitive; design log entry appended.
- [x] Chosen primitive package added to `packages/ui/package.json`; store tasks below use it.

**Decision (user-confirmed 2026-07-05): Preact + `@preact/signals-core`.** `src/core` depends ONLY on `@preact/signals-core` (stable 1.x, ~1.7 kB gzip, `signal`/`computed`/`effect`/`batch` built in); `src/widgets` add `preact` + `@preact/signals` at phase 6. Measured: Preact widget+store 8.0 kB gzip vs Lit 10.8 kB; the Lit path rests on two experimental deps (`signal-polyfill` — "do not use in production" — and `@lit-labs/signals`) and ships no effect scheduler. Shadow DOM with Preact = `host.attachShadow` + render into the shadow root (verified in the spike).

### Task 2: Contract exports the per-item schema

**Files:** modify `packages/contract/src/schema.ts`, `packages/contract/src/index.ts`; test in `packages/contract/test/index.test.ts`.

Tiered decode needs to validate ITEM BY ITEM (one bad item must not fail the file tier), so the contract must export the item schema — named consumer: `decodeTripData` (Task 3). Export the existing internal `itemSchema` as `tripItemSchema` (no shape change).

**Interfaces — Produces:** `tripItemSchema` (Zod schema for one item) exported from `@nomadpath/contract`.

- [ ] Test first: `tripItemSchema.safeParse` accepts a fixture item, rejects a non-object.
- [ ] Export; `npm run test:unit -- packages/contract` green.
- [ ] Commit `feat(contract): export the per-item schema for tiered ui decode`.

### Task 3: Tiered decode

**Files:** create `packages/ui/src/core/decode.ts`, `packages/ui/test/decode.test.ts`.

`decodeTripData(raw: unknown): DecodeResult` — pure, never throws. Tiers:

- **File tier** (shallow, deliberately not `tripDataSchema.safeParse` — a deep parse would wrongly escalate one bad item to a file failure): `raw` is a plain object, `version === CONTRACT_VERSION` (mismatch = file error naming both versions), `items` is an array. Failure -> `{ ok: false, reason }`.
- **Item tier:** each element through `tripItemSchema.safeParse`; failure -> skip item + notice `{ kind: 'item-skipped', itemIndex, reason }` (index = position in the ORIGINAL array; reason = first Zod issue path+message, technical detail for the debug layer per the friendly-wording decision).
- **Field tier:** for each kept item's line geometries, any optional per-point array (`time` + `PER_POINT_ATTRIBUTE_NAMES`) whose length !== `lon.length` -> drop THAT array from THAT geometry + notice `{ kind: 'attribute-dropped', itemIndex, attribute, reason }`. (`lon`/`lat` length mismatch = item tier: geometry unusable -> skip item + notice.)
- **Absent optional attribute: valid, silent, NO notice.**

**Interfaces — Produces:**

```ts
export interface DecodeNotice {
  kind: 'item-skipped' | 'attribute-dropped';
  itemIndex: number;
  attribute?: string;
  reason: string;
}
export type DecodeResult =
  { ok: true; name?: string; items: TripItem[]; notices: DecodeNotice[] } | { ok: false; reason: string };
```

- [ ] State space enumerated (valid file / not-object / wrong version / items-not-array / bad item among good / lon-lat mismatch / attr-length mismatch / absent optional / null entries / empty items). ALL tests first, using contract fixture builders + hand-broken variants.
- [ ] Implement; `npm run test:unit -- packages/ui` green.
- [ ] Commit `feat(ui): add tiered trip-data decode`.

### Task 4: Reactive store

**Files:** create `packages/ui/src/core/store.ts`, `packages/ui/test/store.test.ts`; extend the eslint boundary config so `ui/src/core` cannot import `lit`/`preact` (same mechanism as the existing map-lib rule).

`createTripStore(): TripStore` built on the Task 1 primitive. State signals + actions only — no widget/render logic:

**Interfaces — Produces:**

```ts
export interface TripStore {
  // signals (read/subscribe via the chosen primitive's API)
  data; // DecodeResult | undefined (undefined = not loaded)
  visibility; // boolean[] parallel to decoded items; initial: all true (defaultVisible deferred to phase 6)
  selectedAttribute; // ColourAttribute; initial 'transportMode' (provisional default until `day` exists, phase 6)
  activeBasemap; // string id, opaque to core; initial ''; phase 5 defines the registry
  hoveredItem; // number | null (index into decoded items)
  // actions
  load(raw: unknown): void; // runs decodeTripData, resets visibility/hover
  setItemVisible(index: number, visible: boolean): void;
  setSelectedAttribute(attr: ColourAttribute): void;
  setActiveBasemap(id: string): void;
  setHovered(index: number | null): void;
}
```

`ColourAttribute` registry (single source of truth, derived from the contract's): `COLOUR_ATTRIBUTES = [...PER_POINT_ATTRIBUTE_NAMES, 'transportMode'] as const`.

- [ ] State space + all tests first (load valid / load failure resets state / visibility toggle / out-of-range index is a safe no-op / attribute switch / hover set+clear / reactivity: a computed over a signal updates on action).
- [ ] Implement; lint boundary rule proven by a failing-then-removed probe import.
- [ ] Commit `feat(ui): add core reactive store` (+ separate `chore(lint): forbid widget-framework imports in ui core` if config is a distinct concern).

### Task 5: Colour mapping

**Files:** create `packages/ui/src/core/colour.ts`, `packages/ui/test/colour.test.ts`; extend `packages/ui/src/core/store.ts` with the colour computeds.

Named consumer: the phase 5 renderer feeds deck.gl per-point RGBA via the binary-attribute path (`data.attributes.getColor` + `startIndices`) — a deck.gl colour ACCESSOR was considered and rejected: PathLayer accessors are per-path (no per-point granularity), deck.gl tabulates accessor results into typed arrays on update triggers anyway (same CPU cost), and an accessor would move attribute->colour logic across the MapRenderer boundary into the adapter. Colours are computed ONCE per relevant state change in a computed (never per frame): a linear RGBA fill over all points (~400 KB for 100k points, single-digit ms).

**Adaptive domain (user-confirmed 2026-07-05):** the continuous domain spans VISIBLE items only — hiding a track rescales the ramp (e.g. hiding a flight drops max elevation). `domain` is its own computed over `(data, visibility, selectedAttribute)` with a VALUE-equality guard, so visibility toggles that do not move min/max trigger no recolour; the phase-6 legend reads the same signal. Per-item availability ("does this item have data for attr") is an INTERNAL helper of the colour path (missing -> all NO_DATA_COLOUR), tested through colour behaviour — the standalone availability module was cut (no phase-5 consumer; dataset aggregate deferred to the phase-6 dropdown).

Pure functions; the per-(basemap x attribute) palette REGISTRY is deferred to phase 5 (palettes are design-tuned against visible basemaps) — phase 4 ships the mechanisms + one default palette each:

**Interfaces — Produces:**

```ts
export const NO_DATA_COLOUR: readonly [number, number, number, number]; // THE standard neutral grey, sole source
export function continuousDomain(items: TripItem[], attr: PerPointAttribute): [min: number, max: number] | undefined;
// over the VISIBLE items passed in, ignoring nulls; undefined when no data
export function rampColours(values: readonly (number | null)[], domain: [number, number]): Uint8ClampedArray; // RGBA stride 4; null (and degenerate domain) -> NO_DATA_COLOUR
export function categoricalColour(category: string, categories: readonly string[]): [number, number, number, number];
// stable: sorted unique categories -> evenly spaced hues; same input set = same colour regardless of item order
export function itemLineColours(item: TripItem, attr: ColourAttribute, ctx: ColourContext): Uint8ClampedArray[];
// one RGBA array per line geometry; attr missing on item -> all NO_DATA_COLOUR; transportMode floods the
// item's category colour per point; ctx = { domain?, categories }. Deliberate asymmetry: domain = VISIBLE
// items (adaptive ramp), categories = ALL items (a category's colour identity must not shuffle on toggle)
```

- [ ] State space + tests first (null entries / all-null / missing attribute / single-value degenerate domain / category stability under reordering / distinctness for 12 categories / point-only item -> empty result / exact NO_DATA_COLOUR bytes asserted / domain over visible-only: hiding the max-elevation item shrinks the domain, toggling a non-extreme item leaves the domain value-equal and fires no recolour; no circular assertions).
- [ ] Implement (colour.ts pure functions + store computeds `visibleDomain`, `itemColours`); `npm run check` green (coverage floor included).
- [ ] Commit `feat(ui): add colour ramps, categorical generator, and no-data grey`.

### Task 6: Docs + phase gate

**Files:** create `docs/architecture/ui-core.md` (+ `mkdocs.yml` nav); update `docs/architecture/overview.md` UI paragraph if stale; design log entries; this file's checkboxes; memory.

- [ ] `ui-core.md`: tiered decode table (tier / trigger / result), store surface, availability + colour mapping, the framework decision, what is deferred where (behaviour-described, no analysis indices).
- [ ] Design log: scope trim + deferral rationale; framework/primitive decision; provisional default attribute.
- [ ] `npm run check` + `npm run build:docs` + `npm run test:e2e` green; checkboxes ticked.
- [ ] Merge `epic/ui-core` -> master `--no-ff`.
