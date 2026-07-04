# Defer Compute; Shrink Contract; Emit Validated Raw Trip File — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Defer all Phase 3 compute stages, shrink the contract to the raw trip shape the UI actually needs, and emit that shape as a validated `trip-data.json`, wired end-to-end into the CLI.

**Architecture:** The pipeline is a linear chain of pure stages joined at the CLI seam: `parse -> scan -> emit`. `emit` does a thin field projection (`RawFeature -> emitted item`, dropping provenance, no fabricated fields), validates against the contract (fail-loud, collect-all), and atomically writes compact JSON. NO `assemble` module and NO fabricated `id`/`panel`/`order` — those were rejected as having no named consumer.

**Tech Stack:** TypeScript (Node >= 23.6 native type-stripping, no build step), Zod (contract schema), Vitest (tests), commander (CLI). No new dependencies.

## Global Constraints

- **Governing principle (overrides all):** every field/function needs a specific NAMED consumer, not an inferred one. "The contract/plan says so" is never a justification. Nothing is set in stone. See `CLAUDE.md` and the design log's "Governing principles".
- **Node >= 23.6**, no build step. TS parameter-properties, enums, and namespaces are FORBIDDEN (type-stripping crashes at runtime though typecheck passes). Use explicit field + assignment.
- **This repo's lint is strict:** `no-non-null-assertion` (no `!`), `exactOptionalPropertyTypes` (an optional property is absent OR present-with-value, never explicitly `undefined` — so `x.foo === undefined` after an `'foo' in x` narrowing is dead code). Conform code to these; do not fight them.
- **npm scripts only** — never invoke vitest/tsc/eslint directly. Focused tests: `npm run test:unit -- <path>`. Full gate: `npm run check`.
- **Master branch is `master`**; all work stays on `epic/pipeline` (already checked out). Never commit to master.
- **Commits**: one concern each; conventional-commit subjects. End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Fixtures**: fictional only (south-Atlantic archipelago); non-overlapping ranges (speeds 1-2 m/s, ele 100-200 m, times within 2030-01-15 UTC). Never copy from `~/Documents/holidays` (read-only reference). Compute epoch constants (`Date.parse(...)/1000`), never eyeball.
- **No circular assertions**; assert concrete expected values. Remaining tests must stay meaningful, not emptied shells.
- **Pre-commit hook** runs lint-staged -> typecheck -> test:coverage (75% gate). A commit failing the hook means the code is wrong — fix the code, never modify tracked source outside your task to satisfy the hook.

---

## File Structure

- `packages/contract/src/schema.ts` — MODIFY: remove `id`/`panel`/`order` from `itemSchema`; remove `PANELS`/`Panel`/`PANEL_NAMES`; add `folder?`; keep `transportMode?`, `name?` (now optional), `description?`, `geometries`. `TripData` unchanged (`version`, `name?`, `items`).
- `packages/contract/src/validate.ts` — MODIFY: remove `checkUniqueness` (checked `id`/`order`, both gone) and its call. Keep `checkGeometry`/`checkLine`/`checkTimeMonotonic`/`checkPolygonRing`.
- `packages/contract/src/fixtures.ts` — MODIFY: builders emit the shrunk shape (no `id`/`panel`/`order`; `folder?` on waypoint).
- `packages/contract/src/index.ts` — MODIFY: drop `Panel`/`PANEL_NAMES`/`PANELS` exports.
- `packages/contract/test/schema.test.ts`, `test/validate.test.ts` — MODIFY: remove tests for removed fields/checks; keep geometry + semantic tests.
- `packages/preprocess/src/emit.ts` — CREATE: `emit(features, name, outPath)`.
- `packages/preprocess/src/cli.ts` — MODIFY: call `emit` at the TODO marker.
- `packages/preprocess/test/emit.test.ts`, `test/cli.test.ts` — CREATE / EXTEND.
- `docs/architecture/data-contract.md` — MODIFY: document the shrunk shape.
- `plans/looking-to-plan-the-piped-nova.md`, `plans/phase3-pipeline.md` — MODIFY: records.

---

## Task 1: Trim deferred compute fields from the contract — COMPLETE

Already executed and reviewed clean (commits `b3fd70a..cb30aaa`). Removed `day`/`divider`/`defaultVisible`/`bounds`/`sunAngle`. Left `id`/`panel`/`order`/`PANELS` in place — Task 2 removes those. Do not re-run.

---

## Task 2: Shrink the contract to the raw trip shape

Remove the remaining UI-shaped item fields (`id`, `panel`, `order`) and the panel registry, add `folder`, make `name` optional. This is one concern (contract narrowing) spanning schema + validate + fixtures + index + tests; a reviewer accepts or rejects it as a whole and the pieces don't independently typecheck.

**Files:**

- Modify: `packages/contract/src/schema.ts`
- Modify: `packages/contract/src/validate.ts`
- Modify: `packages/contract/src/fixtures.ts`
- Modify: `packages/contract/src/index.ts`
- Modify: `packages/contract/test/schema.test.ts`
- Modify: `packages/contract/test/validate.test.ts`

**Interfaces:**

- Produces: `TripItem` = `{ name?: string; description?: string; transportMode?: string; folder?: string; geometries: Geometry[] }`. `TripData` = `{ version: 1; name?: string; items: TripItem[] }`. `validateTripData(doc: unknown) => ContractIssue[]` unchanged in signature (now runs only geometry/semantic checks). `Panel`/`PANEL_NAMES`/`PANELS` NO LONGER exported. `geometries` stays `.min(1)` (an item with no geometry is meaningless).

- [ ] **Step 1: Update contract tests first (encode the shrunk shape)**

In `packages/contract/test/schema.test.ts`:

- Delete `it('rejects an unknown panel value', ...)` (the `panel: 'disasters'` test).
- Delete `it('rejects a non-integer order', ...)` (the `order: 1.5` test).
- In the required-fields `it.each(['id', 'name', 'panel', 'order'] as const)` test: this asserted those four are REQUIRED. They are now removed or optional. Delete this test entirely (none of `id`/`panel`/`order` exist; `name` is now optional so "missing name rejects" is false).
- Keep all geometry tests (per-point attribute arrays, null entries, coord ranges, unknown geometry type, polygon rules) — they are unaffected.
- In the "accepts a full valid document" test and any builder use, ensure it still passes against builders that no longer set `id`/`panel`/`order` (Step 4 updates the builders).

In `packages/contract/test/validate.test.ts`:

- Delete `it('reports duplicate item ids', ...)` and `it('reports duplicate order values', ...)` (uniqueness is gone).
- In the structural-failures block, delete the `order: 1.5` test (`reports ... items.0.order`).
- In builder calls that pass `id`/`order` (e.g. `buildTrackItem({ id: 'a', order: 5 })`), remove those props — the builders no longer accept them meaningfully (they're not in `TripItem`). Where a test needed two distinct items, distinguish them by a real field (e.g. `name`) instead.
- Keep all geometry semantic tests (lon/lat length mismatch, non-monotonic time, attribute/point-count parity, polygon-ring closure).

- [ ] **Step 2: Run contract tests to confirm they fail against current source**

Run: `npm run test:unit -- packages/contract`
Expected: FAIL — tests reference removed props / source still has `id`/`panel`/`order`.

- [ ] **Step 3: Shrink `schema.ts`**

In `packages/contract/src/schema.ts`:

- Delete the `PANELS` const, `Panel` type, and `PANEL_NAMES` export (the whole panel registry block).
- In `itemSchema`: delete `id`, `panel`, `order`. Change `name` from `z.string().min(1)` to `z.string().min(1).optional()`. Add `folder: z.string().optional()` (raw waypoint-group fact). Keep `description?`, `transportMode?`, `geometries: z.array(geometrySchema).min(1)`. Remove the `groupLabel` field if present (superseded by `folder`).
- Update the `itemSchema` doc comment to describe the raw trip item (drop id/panel/order prose).
- Keep `tripDataSchema` as-is (`version`, `name?`, `items`).
- Remove the now-unused `Panel` from the type exports at the bottom.

- [ ] **Step 4: Shrink `validate.ts` and `fixtures.ts` and `index.ts`**

In `packages/contract/src/validate.ts`:

- Delete the `checkUniqueness` function and its call in `semanticIssues` (it checked `id`/`order`, both removed).
- Keep `checkGeometry`, `checkLine`, `checkTimeMonotonic`, `checkPolygonRing` and their calls unchanged.
- Remove any now-unused imports (e.g. `TripItem` if only `checkUniqueness` used it — verify before removing).

In `packages/contract/src/fixtures.ts`:

- `buildTrackItem`: remove `id`/`panel`/`order` (and `groupLabel` if present); keep `name`, `transportMode`, `geometries`. Optionally set `description`.
- `buildWaypointItem`: remove `id`/`panel`/`order`; keep `name`, `description`, `folder` (rename `groupLabel` -> `folder` if it was there), `geometries`.
- `buildTripData`: items become `[buildTrackItem(), buildWaypointItem()]` (already distinct by geometry/fields; no order needed).

In `packages/contract/src/index.ts`:

- Remove `Panel`, `PANEL_NAMES`, `PANELS` from exports.

- [ ] **Step 5: Run contract tests to confirm pass**

Run: `npm run test:unit -- packages/contract`
Expected: PASS. Fix any test still referencing a removed symbol (it belongs to this shrink).

- [ ] **Step 6: Full check**

Run: `npm run check`
Expected: PASS. Preprocess does not yet import these contract symbols, so it still compiles. If typecheck flags a preprocess import of `Panel`/`PANELS`, that's a real break — check whether anything imported them (nothing should).

- [ ] **Step 7: Commit**

```bash
git add packages/contract
git commit -m "$(cat <<'EOF'
refactor(contract): shrink to the raw trip shape

Remove id/panel/order and the PANELS registry - fabricated fields with no
named UI consumer. Item is now { name?, description?, transportMode?, folder?,
geometries }. Contract stays as the binding compatibility shape, validated hard.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `emit` — project, validate, atomic-write

A single pure function: project each `RawFeature` to the emitted item shape (dropping provenance, no fabricated fields), wrap in a container, validate with the contract, and atomically write compact JSON. No separate `assemble` module — the projection is a private helper in `emit.ts`.

**Files:**

- Create: `packages/preprocess/src/emit.ts`
- Test: `packages/preprocess/test/emit.test.ts`

**Interfaces:**

- Consumes: `RawFeature` (from `./model.ts`), `validateTripData`/`ContractIssue`/`TripData`/`TripItem` + `CONTRACT_VERSION` (from `@nomadpath/contract`), fixture builders `buildRawFeature`/`buildRawLine`/`buildRawPoint` (from `./fixtures.ts`).
- Produces: `emit(features: RawFeature[], name: string | undefined, outPath: string): void`. Projection: keep `name`/`description`/`geometries`; `folder` -> `folder`; `activity` -> `transportMode`; DROP `sourceFile`/`sourceIndex`; optional fields set only when present. On validation failure throws `Error` whose message begins `invalid trip data` and lists every issue; writes nothing (no file, no temp). On success writes compact JSON atomically (temp sibling + rename).

- [ ] **Step 1: Write the failing tests**

Create `packages/preprocess/test/emit.test.ts`:

```typescript
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validateTripData } from '@nomadpath/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { emit } from '../src/emit.ts';
import { buildRawFeature, buildRawLine, buildRawPoint } from '../src/fixtures.ts';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nomadpath-emit-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Read back the single emitted item for assertions. */
function emitOne(feature: ReturnType<typeof buildRawFeature>): Record<string, unknown> {
  const out = join(dir, 'trip-data.json');
  emit([feature], undefined, out);
  const data = JSON.parse(readFileSync(out, 'utf8')) as { items: Record<string, unknown>[] };
  return data.items[0] as Record<string, unknown>;
}

describe('emit', () => {
  it('projects activity to transportMode and preserves geometries', () => {
    const item = emitOne(buildRawFeature({ activity: 'Walking' }));
    expect(item.transportMode).toBe('Walking');
    expect(item.geometries).toEqual([buildRawLine()]);
  });

  it('carries folder through on a waypoint feature', () => {
    const item = emitOne(buildRawFeature({ folder: 'Accommodation', geometries: [buildRawPoint()] }));
    expect(item.folder).toBe('Accommodation');
  });

  it('does not emit provenance or any fabricated field', () => {
    const item = emitOne(buildRawFeature());
    for (const absent of ['id', 'panel', 'order', 'sourceFile', 'sourceIndex']) {
      expect(item).not.toHaveProperty(absent);
    }
  });

  it('omits transportMode when the feature has no activity', () => {
    const item = emitOne(buildRawFeature({ activity: undefined }));
    expect(item).not.toHaveProperty('transportMode');
  });

  it('omits name when the feature has none (no fabricated fallback)', () => {
    const item = emitOne(buildRawFeature({ name: undefined }));
    expect(item).not.toHaveProperty('name');
  });

  it('writes a file that round-trips through validateTripData', () => {
    const out = join(dir, 'trip-data.json');
    emit([buildRawFeature()], 'Trip', out);
    const reloaded: unknown = JSON.parse(readFileSync(out, 'utf8'));
    expect(validateTripData(reloaded)).toEqual([]);
  });

  it('writes compact JSON (no pretty-print whitespace)', () => {
    const out = join(dir, 'trip-data.json');
    emit([buildRawFeature()], undefined, out);
    expect(readFileSync(out, 'utf8')).not.toContain('\n  ');
  });

  it('throws and writes nothing when a geometry is invalid', () => {
    // A line whose lon/lat lengths differ fails semantic validation.
    const bad = buildRawFeature({ geometries: [buildRawLine({ lon: [4.1, 4.2, 4.3], lat: [-54.5, -54.6] })] });
    const out = join(dir, 'trip-data.json');
    expect(() => emit([bad], undefined, out)).toThrow(/invalid trip data/);
    expect(existsSync(out)).toBe(false);
  });

  it('leaves no temp file behind after a successful write', () => {
    emit([buildRawFeature()], undefined, join(dir, 'trip-data.json'));
    expect(readdirSync(dir)).toEqual(['trip-data.json']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- packages/preprocess/test/emit.test.ts`
Expected: FAIL — `emit` not defined.

- [ ] **Step 3: Write `emit.ts`**

Create `packages/preprocess/src/emit.ts`:

```typescript
/**
 * Emit: the final pipeline stage. Project each scanned RawFeature to the
 * contract's raw trip item (dropping build-internal provenance, adding no
 * fabricated fields), validate the whole trip with the contract (collect-all),
 * fail loud with the full issue list if anything is wrong (writing nothing),
 * else write compact JSON atomically so a crash never leaves a half-written or
 * invalid file (honours "preserve last-good on failure").
 *
 * The projection is a thin field rename, not a second model - RawFeature and the
 * emitted item are the same shape minus provenance, with activity -> transportMode.
 */

import { renameSync, unlinkSync, writeFileSync } from 'node:fs';

import type { TripData, TripItem } from '@nomadpath/contract';
import { CONTRACT_VERSION, validateTripData } from '@nomadpath/contract';

import type { RawFeature } from './model.ts';

function toItem(feature: RawFeature): TripItem {
  const item: TripItem = { geometries: feature.geometries as TripItem['geometries'] };
  if (feature.name !== undefined) item.name = feature.name;
  if (feature.description !== undefined) item.description = feature.description;
  if (feature.folder !== undefined) item.folder = feature.folder;
  if (feature.activity !== undefined) item.transportMode = feature.activity;
  return item;
}

export function emit(features: RawFeature[], name: string | undefined, outPath: string): void {
  const data: TripData = { version: CONTRACT_VERSION, items: features.map(toItem) };
  if (name !== undefined) data.name = name;

  const issues = validateTripData(data);
  if (issues.length > 0) {
    const report = issues.map(i => `  ${i.path || '(root)'}: ${i.message}`).join('\n');
    throw new Error(`invalid trip data (${String(issues.length)} issue(s)):\n${report}`);
  }

  const temp = `${outPath}.tmp`;
  writeFileSync(temp, JSON.stringify(data), 'utf8');
  try {
    renameSync(temp, outPath);
  } catch (err) {
    try {
      unlinkSync(temp);
    } catch {
      // temp already gone; nothing to clean up.
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- packages/preprocess/test/emit.test.ts`
Expected: PASS (9 tests). If the `geometries as TripItem['geometries']` cast fails typecheck, inspect the actual mismatch — `RawGeometry` (line/point/polygon with raw attribute arrays) should be assignable; a real mismatch is a signal the contract geometry schema and `RawGeometry` diverged, worth flagging.

- [ ] **Step 5: Commit**

```bash
git add packages/preprocess/src/emit.ts packages/preprocess/test/emit.test.ts
git commit -m "$(cat <<'EOF'
feat(preprocess): project, validate, and atomically emit the trip file

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire `emit` into the CLI

Replace the TODO marker so a clean scan produces a real `trip-data.json`. Validation failure at emit is a hard error (exit 1, report to stderr, nothing written).

**Files:**

- Modify: `packages/preprocess/src/cli.ts`
- Test: `packages/preprocess/test/cli.test.ts` (extend the existing real-subprocess suite)

**Interfaces:**

- Consumes: `emit` (from `./emit.ts`), existing `scanFolder`/`resolveConfig`, `config.name`.
- Produces: on success, `<input-dir>/trip-data.json` (or `--out`), exit 0. On emit validation failure, exit 1, full report to stderr, no file.

The existing `cli.test.ts` provides (verified): `run(args: string[]): { status, stdout, stderr }` spawns the bin as a real subprocess; `root` is a fresh per-test temp dir; `write(relative, contents)` writes under `root`; `gpxTrack(name)` returns a valid 2-point GPX string. Reuse them.

- [ ] **Step 1: Add imports the new tests need**

At the top of `packages/preprocess/test/cli.test.ts`, extend the `node:fs` import to include `existsSync` and `readFileSync`, and add:

```typescript
import { validateTripData } from '@nomadpath/contract';
```

- [ ] **Step 2: Write the failing tests**

Append to `packages/preprocess/test/cli.test.ts`:

```typescript
describe('cli: emit', () => {
  it('writes trip-data.json for a clean fixture folder and exits 0', () => {
    write('walk.gpx', gpxTrack('Walk'));
    const result = run([root]);
    expect(result.status).toBe(0);
    expect(existsSync(join(root, 'trip-data.json'))).toBe(true);
    const data: unknown = JSON.parse(readFileSync(join(root, 'trip-data.json'), 'utf8'));
    expect(validateTripData(data)).toEqual([]);
  });

  it('honours --out', () => {
    write('walk.gpx', gpxTrack('Walk'));
    const out = join(root, 'custom.json');
    const result = run([root, '--out', out]);
    expect(result.status).toBe(0);
    expect(existsSync(out)).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:unit -- packages/preprocess/test/cli.test.ts`
Expected: FAIL — no `trip-data.json` is written (CLI still stops at the TODO marker).

- [ ] **Step 4: Wire the CLI**

In `packages/preprocess/src/cli.ts`:

- Add import: `import { emit } from './emit.ts';` (`join` from `node:path` is already imported — do not duplicate).
- Replace the TODO-marker line
  `// Task 7 adds compute -> assemble -> validate -> emit trip-data.json here (respecting --out).`
  with:

```typescript
const outPath = options.out ?? join(inputDir, 'trip-data.json');
try {
  emit(scan.features, config.name, outPath);
} catch (err) {
  process.stderr.write(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
```

Place this AFTER the stdout status line (the status line describes what was scanned; the file write follows).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:unit -- packages/preprocess/test/cli.test.ts`
Expected: PASS.

- [ ] **Step 6: Full check**

Run: `npm run check`
Expected: PASS. `cli.ts` may still show low unit coverage (exercised via subprocess) — expected, does not fail the 75% gate.

- [ ] **Step 7: Commit**

```bash
git add packages/preprocess/src/cli.ts packages/preprocess/test/cli.test.ts
git commit -m "$(cat <<'EOF'
feat(preprocess): wire emit into the cli

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Corpus verification (read-only)

Confirm the end-to-end pipeline produces a valid file over all real trips. Not a committed test — a manual gate (controller runs this, not a subagent).

**Files:** none (verification only).

- [ ] **Step 1: Relink the bin if needed, run against each trip**

Run (once, if the bin isn't linked): `npm install --force`
For each trip dir under `~/Documents/holidays`:
Run: `npm run preprocess -- "<trip dir>"`
Expected: exit 0, a status line on stdout, `trip-data.json` written into each trip dir.

- [ ] **Step 2: Validate one emitted file loads clean**

Confirm one emitted file re-validates (`validateTripData` returns `[]`) via a scratch script in the scratchpad dir.

- [ ] **Step 3: Clean up emitted artifacts from the read-only corpus**

Remove the `trip-data.json` files written into `~/Documents/holidays` (reference corpus, not an output dir). Confirm the corpus is otherwise unmodified.

---

## Task 6: Update records (design log, phase plan, data-contract doc)

Capture the decisions so nothing is silently dropped.

**Files:**

- Modify: `plans/looking-to-plan-the-piped-nova.md`
- Modify: `plans/phase3-pipeline.md`
- Modify: `docs/architecture/data-contract.md`

- [ ] **Step 1: Append dated design-log entries**

In `plans/looking-to-plan-the-piped-nova.md`, add rows dated `2026-07-04` (the governing-principles block is already present at the top — do not duplicate it):

- Compute stages (`day`/`sunAngle`/`bounds`) deferred until a UI consumer names the shape.
- The pipeline emits the raw parsed features validated against the contract; `id`/`panel`/`order` REJECTED as fabricated (no named consumer), not merely deferred.
- Contract SHRUNK (not retired) to `{ name?, description?, transportMode?, folder?, geometries }`; it stays as the binding producer/consumer compatibility shape.
- Config keys `hidden`/`divider`/`excludeFromBounds`/`day` kept as a justified forward declaration — real planned consumers at phase 6 (tree widget) and phase 4+ (compute); documented so not re-litigated.
- Corpus finding: timeless _tracks_ do not exist (the no-time files are waypoint files).

- [ ] **Step 2: Update the phase plan**

In `plans/phase3-pipeline.md`:

- Mark Task 6 (Compute stages) DEFERRED with a pointer to `docs/superpowers/specs/2026-07-04-defer-compute-assemble-emit-design.md`.
- Rewrite Task 7 as "Emit the validated raw trip file" reflecting what was built (projection + validate + atomic write + CLI wiring); check off its parts.
- Add an "Anticipated later (non-committal)" note: compute fields (`day`, `sunAngle`, `bounds`) return with their UI consumers.

- [ ] **Step 3: Update the data-contract doc**

In `docs/architecture/data-contract.md`: update the documented item shape to `{ name?, description?, transportMode?, folder?, geometries }` and the container to `{ version, name?, items }`. Remove references to `id`/`panel`/`order`/`day`/`divider`/`defaultVisible`/`bounds`/`groupLabel`/`sunAngle`/panels. Keep the geometry + per-point-attribute description and the semantic-validation list.

- [ ] **Step 4: Commit**

```bash
git add plans/looking-to-plan-the-piped-nova.md plans/phase3-pipeline.md docs/architecture/data-contract.md
git commit -m "$(cat <<'EOF'
docs: record compute deferral, contract shrink, and emit shape

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review notes

- **Spec coverage:** contract shrink (Task 2), emit projection+validate+write (Task 3), CLI wiring (Task 4), corpus verify (Task 5), records incl. data-contract doc (Task 6). Config decision (keep, justified) is a records item, not code. Every spec section maps.
- **Type consistency:** `emit(features, name, outPath)` matches between Task 3 (produces) and Task 4 (consumes). Post-Task-2 `TripItem` field set `{ name?, description?, transportMode?, folder?, geometries }` matches what `toItem` in Task 3 stamps and what the emit tests assert (no id/panel/order/provenance). `emit`'s error prefix `invalid trip data` matches the Task 3 test regex.
- **No fabricated fields:** the plan builds no `id`/`panel`/`order`; Task 3's "does not emit provenance or any fabricated field" test enforces it.
