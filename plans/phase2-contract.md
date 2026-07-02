# Phase 2: Data Contract — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline), task-by-task.
> Master plan: `~/.claude/plans/let-s-work-on-the-tingly-pretzel.md`. Design doc: `plans/looking-to-plan-the-piped-nova.md`.
> Branch: `epic/contract` off master. The schema is **provisional until phases 4-6 confirm it**; amendments are normal (record them in the design log).

**Goal:** `@nomadpath/contract` = the single source of truth for the pipeline-to-UI file format: Zod schema (types derived via `z.infer`), semantic validation that collects ALL issues, and fictional fixture builders.

**Architecture:** Zod schema is the one registry; TS types derive from it. Semantic checks (cross-field logic Zod can't express declaratively) live beside it and run over a parsed document, returning an issue list — the pipeline turns that into its fail-once report; the UI never runs it.

## Schema design (concrete, from the locked design decisions)

```ts
// Top level
TripData {
  version: 1,
  name?: string,
  bounds: Bounds,               // initial viewport fit, pipeline-resolved (config exclusions applied)
  items: Item[],
}

// Bounds = [west, south, east, north] lon/lat. MAY cross the antimeridian (west > east is
// VALID — Fiji/Hawaii trips and transpacific flights are core data). Validation must not
// assume west <= east.
Bounds = [number, number, number, number]

Item {
  id: string,                   // unique; pipeline-derived from source provenance (file + element)
                                // so UI notices/debug logs trace back to the source file
  name: string,
  description?: string,        // hover/click popup text
  panel: 'tracks' | 'waypoints',// which widget buckets this item (pipeline-resolved routing);
                                // defined via a PANELS registry; UI treats an unknown value as
                                // item-level degrade (skip + notice), keeping additions non-breaking
  groupLabel?: string,          // waypoint folder value; ABSENT = top-level ungrouped item
  day?: string,                 // 'YYYY-MM-DD' local calendar date of first point (track items)
  divider: boolean,             // splits the track tree; renders as separator row (2026-07-02
                                // decision: kept over a pipeline groups-list, BUT the UI's
                                // walk-and-split must live in ONE pure core function whose output
                                // (ordered group list) is what widgets consume - swapping to
                                // pipeline-emitted groups later changes only that function)
  defaultVisible: boolean,
  order: number,                // global chronological ordering (integer, unique)
  transportMode?: string,       // from osmand:activity, verbatim; absent = "other"/no data
  bounds: Bounds,               // per-item zoom-to target (antimeridian rule applies; precomputed
                                // because config exclusions + antimeridian math are pipeline concerns)
  geometries: Geometry[],       // 1+
}

Geometry = LineGeometry | PointGeometry | PolygonGeometry  // discriminated on `type`

LineGeometry {
  type: 'line',
  lon: number[], lat: number[],           // parallel, same length >= 2
  time?: number[],                        // epoch seconds UTC, non-decreasing
  ele?: (number | null)[],                // metres; null = missing at that point (as-is rule)
  speed?: (number | null)[],              // m/s
  sunAngle?: (number | null)[],           // solar elevation degrees (time-of-day proxy)
}

PointGeometry {
  type: 'point',
  lon: number, lat: number,
  sym?: string,                            // marker image URL from <sym>
}

PolygonGeometry {
  type: 'polygon',
  lon: number[], lat: number[],            // single outer ring, parallel, >= 4, closed
}
```

Notes:

- Per-point attribute arrays: absent array = attribute legitimately missing for the item (valid state); null entry = missing at that point. Both render neutral grey.
- `transportMode` is per-item (comes from one `osmand:activity` per source track), not per-point.
- No category/kind. `panel` is the only routing field, and it is pipeline-resolved.
- Compactness beyond parallel arrays (precision quantisation) is a pipeline emit concern, not schema.
- Registry principle: colourable attributes and per-point array names each defined once, types derived.

## Semantic checks (each = success + failure unit tests)

1. lon/lat in range (lines, points, polygon rings; Zod-level where possible).
2. Parallel-array length parity: every present per-point array matches lon/lat length; lon.length === lat.length.
3. `time` non-decreasing within a geometry.
4. Item ids unique across the document.
5. `order` unique across items.
6. Polygon ring closed (first == last) and length >= 4.
7. `day` matches `YYYY-MM-DD` and is a real calendar date.
8. Bounds: 4 finite numbers, south <= north, lon/lat ranges — **no west <= east check** (antimeridian).
9. Divider items must have `panel: 'tracks'` and a `day`.
10. Line length >= 2.

`validateTripData(doc: unknown): ContractIssue[]` — runs Zod first (structural), then semantic checks on success; collects everything, never throws. `ContractIssue = { path: string; message: string }`.

## Tasks

### Task 1: Branch + schema module

**Files:** `packages/contract/src/schema.ts`, re-exports in `src/index.ts`.

- [ ] `git checkout -b epic/contract`
- [ ] Enumerate test cases for schema acceptance/rejection (state space: each field valid/invalid/absent where meaningful) in `packages/contract/test/schema.test.ts`; write ALL tests first against fixture builders (Task 3 stubs) — allowed to fail.
- [ ] Implement Zod schema + derived types (`TripData`, `Item`, `Geometry`, ... via `z.infer`); registries: `PER_POINT_ATTRIBUTES` + `COLOUR_ATTRIBUTES` const objects, types derived.
- [ ] Tests green. Commit `feat(contract): add trip data schema with derived types`.

### Task 2: Semantic validation

**Files:** `packages/contract/src/validate.ts`, tests in `test/validate.test.ts`.

- [ ] Write all tests first: one passing + at least one failing fixture per check above; multi-error collection test (a doc with 3 unrelated problems yields all 3 issues); malformed-input test (non-object -> single structural issue, no throw).
- [ ] Implement `validateTripData` + `ContractIssue`. Tests green.
- [ ] Commit `feat(contract): add semantic validation collecting all issues`.

### Task 3: Fixture builders

**Files:** `packages/contract/src/fixtures.ts` (exported for other packages' tests), tests riding along.

- [ ] Builders: `buildTripData(overrides?)`, `buildTrackItem(overrides?)`, `buildWaypointItem(overrides?)`, `buildLineGeometry(overrides?)` etc. Fictional mid-ocean/null-island-adjacent coords, non-overlapping attribute ranges (e.g. speeds 1-2, elevations 100-200, sun angles 10-20), deterministic.
- [ ] Meta-invariant test: default output of every builder passes `validateTripData` with zero issues (the fixture/validator handshake).
- [ ] Commit `feat(contract): add fictional fixture builders`.

### Task 4: Docs + phase gate

- [ ] Fill `docs/architecture/data-contract.md` from the shipped schema (shape, optionality semantics, antimeridian rule, null-vs-absent).
- [ ] All gates green (`typecheck`, `lint`, `format:check`, `test:coverage`, `test:e2e`).
- [ ] Tick checkboxes; record any design-log amendments; merge `epic/contract` -> master `--no-ff`; update memory.
