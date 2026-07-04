# Defer Compute; Trim Contract; Assemble + Emit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Defer all Phase 3 compute stages, trim the contract to exactly what the pipeline produces today, and build a minimal `assemble` + `emit` that turns scanned features into a validated `trip-data.json`, wired end-to-end into the CLI.

**Architecture:** The pipeline is a linear chain of pure stages joined at the CLI seam: `parse -> scan -> assemble -> emit`. This plan removes speculative derived fields (`day`, `sunAngle`, `bounds`, `divider`, `defaultVisible`) from the contract, then adds two pure functions: `assemble(features, config, name?) -> TripData` (stamping only non-guessed fields) and `emit(data, outPath)` (validate, fail loud, atomic write).

**Tech Stack:** TypeScript (Node >= 23.6 native type-stripping, no build step), Zod (contract schema), Vitest (tests), commander (CLI). No new dependencies.

## Global Constraints

- **Node >= 23.6**, no build step. TS parameter-properties, enums, and namespaces are FORBIDDEN (type-stripping crashes at runtime though typecheck passes). Use explicit field + assignment.
- **npm scripts only** — never invoke vitest/tsc/eslint directly. Focused tests: `npm run test:unit -- <path>`. Full gate: `npm run check`.
- **Master branch is `master`**; all work stays on `epic/pipeline` (already checked out). Never commit to master.
- **Commits**: one concern each; conventional-commit subjects. End every commit message with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Fixtures**: fictional only (south-Atlantic archipelago); non-overlapping ranges (speeds 1-2 m/s, ele 100-200 m, times within 2030-01-15 UTC). Never copy from `~/Documents/holidays` (read-only reference). Compute epoch constants (`Date.parse(...)/1000`), never eyeball.
- **No circular assertions** (`expect(after).toBe(before)`); assert concrete expected values.
- **Pre-commit hook** runs lint-staged -> typecheck -> test:coverage (75% gate). A commit step failing the hook means the code is wrong, not the hook.

---

## File Structure

- `packages/contract/src/schema.ts` — MODIFY: remove `day`/`divider`/`defaultVisible`/`bounds` from `itemSchema`, `bounds` from `tripDataSchema`, `sunAngle` from `PER_POINT_ATTRIBUTES`, and the `boundsSchema` + `Bounds` type.
- `packages/contract/src/validate.ts` — MODIFY: delete `checkBounds`, `checkDay`, `checkDivider` and their call sites; keep `checkUniqueness`, `checkGeometry`, `checkLine`, `checkTimeMonotonic`, `checkPolygonRing`.
- `packages/contract/src/fixtures.ts` — MODIFY: trim builders; remove `buildDividerItem`; drop `sunAngle` from line builder.
- `packages/contract/src/index.ts` — MODIFY: drop `buildDividerItem` and `Bounds` exports.
- `packages/contract/test/schema.test.ts`, `test/validate.test.ts` — MODIFY: remove tests for trimmed fields.
- `packages/preprocess/src/assemble.ts` — CREATE: `assemble(features, config, name?) -> TripData`.
- `packages/preprocess/src/emit.ts` — CREATE: `emit(data, outPath) -> void`.
- `packages/preprocess/src/cli.ts` — MODIFY: wire assemble + emit at the TODO marker.
- `packages/preprocess/test/assemble.test.ts`, `test/emit.test.ts` — CREATE.
- `plans/looking-to-plan-the-piped-nova.md`, `plans/phase3-pipeline.md` — MODIFY: design-log + phase-plan records.

---

## Task 1: Trim the contract to today's output

Remove speculative derived fields so the contract describes exactly what assemble will produce. This is one concern (contract narrowing) even though it spans schema + validate + fixtures + tests, because a reviewer accepts or rejects the trim as a whole and the pieces don't independently typecheck.

**Files:**

- Modify: `packages/contract/src/schema.ts`
- Modify: `packages/contract/src/validate.ts`
- Modify: `packages/contract/src/fixtures.ts`
- Modify: `packages/contract/src/index.ts`
- Modify: `packages/contract/test/schema.test.ts`
- Modify: `packages/contract/test/validate.test.ts`

**Interfaces:**

- Produces: `TripItem` = `{ id: string; name: string; description?: string; panel: Panel; groupLabel?: string; transportMode?: string; order: number; geometries: Geometry[] }`. `TripData` = `{ version: 1; name?: string; items: TripItem[] }`. `validateTripData(doc: unknown) => ContractIssue[]` unchanged in signature. `Bounds` type and `buildDividerItem` NO LONGER exported. `PER_POINT_ATTRIBUTES` = `{ ele, speed }` (no `sunAngle`).

- [ ] **Step 1: Update schema tests first (they encode the trimmed shape)**

In `packages/contract/test/schema.test.ts`:

- Delete the `it('rejects missing bounds', ...)` test (lines ~47-49).
- Delete the entire `describe('tripDataSchema: bounds', ...)` block (lines ~68-85).
- Delete the `it('rejects a malformed day string', ...)` test (lines ~105-107).
- In the required-fields `it.each([...])` (line ~117), change the array from
  `['id', 'name', 'panel', 'divider', 'defaultVisible', 'order', 'bounds']` to
  `['id', 'name', 'panel', 'order']`.
- Remove the `delete line.sunAngle;` line (~144) and its surrounding test if it asserts sunAngle-specific behavior; if the test also covers `ele`/`speed`, retarget it to `delete line.ele;`.
- Remove the `sunAngle: [10]` property from any inline geometry (~160).

- [ ] **Step 2: Update validate tests**

In `packages/contract/test/validate.test.ts`:

- Remove `buildDividerItem` from the import (line ~2).
- Delete these tests: `accepts antimeridian-crossing bounds without complaint` (~24-26), `reports inverted latitude bounds (south > north)` (~101-104), `reports a divider item on the waypoints panel` (~106-110), `reports a divider item without a day` (~112-117).
- In the uniqueness test (~122), change `buildTrackItem({ id: 'dup', order: 7, day: '2030-02-30' })` to `buildTrackItem({ id: 'dup', order: 7 })`.
- In any test using `buildDividerItem(...)` for geometry (e.g. ~131), replace with `buildTrackItem({ id: 'flight', order: 5, geometries: [line] })`.
- Delete any test asserting on `checkDay` behavior (the `2030-02-30` day case, ~97).

- [ ] **Step 3: Run the contract tests to confirm they now fail against the un-trimmed source**

Run: `npm run test:unit -- packages/contract`
Expected: FAIL — tests reference removed helpers/fields, or source still exports trimmed fields. (This confirms the tests are driving the trim.)

- [ ] **Step 4: Trim `schema.ts`**

In `packages/contract/src/schema.ts`:

- Delete the `boundsSchema` declaration (lines ~14-19) and the `longitude`/`latitude` locals ONLY if now unused (they are still used by geometry schemas — keep them).
- Remove the `sunAngle` entry from `PER_POINT_ATTRIBUTES` (lines ~35-36).
- In `itemSchema`, delete the `groupLabel`... keep it (it stays). Delete `day` (~95-99), `divider` (~100-106), `defaultVisible` (~107), `bounds` (~112-113). Keep `id`, `name`, `description`, `panel`, `groupLabel`, `order`, `transportMode`, `geometries`.
- In `tripDataSchema`, delete the `bounds` field (~120).
- Delete the `export type Bounds = z.infer<typeof boundsSchema>;` line (~131).

- [ ] **Step 5: Trim `validate.ts`**

In `packages/contract/src/validate.ts`:

- Remove `Bounds` from the type import (line 1).
- In `semanticIssues`, delete `checkBounds(data.bounds, 'bounds', issues);` (~30), and inside the items loop delete `checkBounds(item.bounds, ...)` (~35), `checkDay(item, ...)` (~36), `checkDivider(item, ...)` (~37).
- Delete the `checkBounds` function (~46-56), `checkDay` (~83-95), and `checkDivider` (~97-111) entirely.
- Keep `checkUniqueness`, `checkGeometry`, `checkLine`, `checkTimeMonotonic`, `checkPolygonRing` unchanged.

- [ ] **Step 6: Trim `fixtures.ts` and `index.ts`**

In `packages/contract/src/fixtures.ts`:

- Remove `sunAngle: [10, 15, 20],` from `buildLineGeometry` (~24).
- In `buildTrackItem`, remove `day`, `divider`, `defaultVisible`, `bounds` properties; keep `id`, `name`, `panel`, `order`, `transportMode`, `geometries`.
- Delete `buildDividerItem` entirely (~63-78).
- In `buildWaypointItem`, remove `divider`, `defaultVisible`, `bounds`; keep `id`, `name`, `description`, `panel`, `groupLabel`, `order`, `geometries`.
- In `buildTripData`, remove `bounds`; change `items` to `[buildTrackItem(), buildWaypointItem()]` (drop the divider item). Give the two items distinct `order` (0 and 1) via the builders' defaults.

In `packages/contract/src/index.ts`:

- Remove `buildDividerItem,` from the fixtures export (line 2).
- Remove `Bounds,` from the type export (line 11).

- [ ] **Step 7: Run contract tests to confirm they pass**

Run: `npm run test:unit -- packages/contract`
Expected: PASS. If a test still references a removed symbol, fix that test (it belongs to the trim).

- [ ] **Step 8: Full check**

Run: `npm run check`
Expected: PASS (format, lint, typecheck, coverage). Preprocess still compiles — it does not yet import the removed fields. If typecheck flags an unused `longitude`/`latitude`, they ARE used by geometry schemas; re-inspect the actual error rather than deleting them.

- [ ] **Step 9: Commit**

```bash
git add packages/contract
git commit -m "$(cat <<'EOF'
refactor(contract): trim to fields the pipeline produces today

Remove day/divider/defaultVisible/bounds/sunAngle - all deferred until a
UI consumer names the need. Contract now describes exactly today's output.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `assemble` — RawFeature[] -> TripData

Pure function turning scanned features into contract items, stamping only fields that need no UI-shaped guessing.

**Files:**

- Create: `packages/preprocess/src/assemble.ts`
- Test: `packages/preprocess/test/assemble.test.ts`

**Interfaces:**

- Consumes: `RawFeature` (from `./model.ts`), `Config` (from `./config/schema.ts`), contract `TripData`/`TripItem`/`Panel` (from `@nomadpath/contract`), fixture builders `buildRawFeature`/`buildRawLine`/`buildRawPoint` (from `./fixtures.ts`).
- Produces: `assemble(features: RawFeature[], config: Config, name?: string): TripData`. Item `id` = `` `${sourceFile}#${sourceIndex}` ``. `panel` = `'waypoints'` if the feature has any point geometry OR a `folder`, else `'tracks'`. `order` = unique 0..n-1 integer, timed features first (ascending by earliest point time), untimed after, each group keeping input order.

- [ ] **Step 1: Write the failing tests**

Create `packages/preprocess/test/assemble.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { assemble } from '../src/assemble.ts';
import { buildRawFeature, buildRawLine, buildRawPoint, FIXTURE_BASE_TIME } from '../src/fixtures.ts';
import { configSchema } from '../src/config/schema.ts';

const emptyConfig = configSchema.parse({});

describe('assemble', () => {
  it('turns a track feature into a tracks-panel item', () => {
    const data = assemble([buildRawFeature()], emptyConfig);
    expect(data.version).toBe(1);
    expect(data.items).toHaveLength(1);
    const item = data.items[0]!;
    expect(item.panel).toBe('tracks');
    expect(item.name).toBe('Morning walk');
    expect(item.transportMode).toBe('Walking');
    expect(item.geometries).toEqual([buildRawLine()]);
  });

  it('derives a stable id from sourceFile and sourceIndex', () => {
    const data = assemble([buildRawFeature({ sourceFile: 'tracks/a.gpx', sourceIndex: 2 })], emptyConfig);
    expect(data.items[0]!.id).toBe('tracks/a.gpx#2');
  });

  it('keeps ids unique across files that share an internal index', () => {
    const data = assemble(
      [
        buildRawFeature({ sourceFile: 'a.gpx', sourceIndex: 0 }),
        buildRawFeature({ sourceFile: 'b.gpx', sourceIndex: 0 }),
      ],
      emptyConfig,
    );
    const ids = data.items.map(i => i.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('routes a folder-tagged point feature to the waypoints panel', () => {
    const feature = buildRawFeature({
      folder: 'Accommodation',
      geometries: [buildRawPoint()],
    });
    const item = assemble([feature], emptyConfig).items[0]!;
    expect(item.panel).toBe('waypoints');
    expect(item.groupLabel).toBe('Accommodation');
  });

  it('falls back to a non-empty name when the feature has none', () => {
    const feature = buildRawFeature({ name: undefined, sourceFile: 'x.gpx', sourceIndex: 0 });
    const item = assemble([feature], emptyConfig).items[0]!;
    expect(item.name.length).toBeGreaterThan(0);
    expect(item.name).toBe('x.gpx#0');
  });

  it('omits transportMode when the feature has no activity', () => {
    const feature = buildRawFeature({ activity: undefined });
    expect(assemble([feature], emptyConfig).items[0]!.transportMode).toBeUndefined();
  });

  it('orders timed features chronologically with unique integers', () => {
    const late = buildRawFeature({
      sourceFile: 'late.gpx',
      geometries: [buildRawLine({ time: [FIXTURE_BASE_TIME + 100, FIXTURE_BASE_TIME + 110] })],
    });
    const early = buildRawFeature({
      sourceFile: 'early.gpx',
      geometries: [buildRawLine({ time: [FIXTURE_BASE_TIME, FIXTURE_BASE_TIME + 10] })],
    });
    const items = assemble([late, early], emptyConfig).items;
    const byFile = Object.fromEntries(items.map(i => [i.id.split('#')[0], i.order]));
    expect(byFile['early.gpx']).toBeLessThan(byFile['late.gpx']!);
    expect(new Set(items.map(i => i.order)).size).toBe(2);
  });

  it('orders untimed features after timed ones, keeping input order', () => {
    const timed = buildRawFeature({ sourceFile: 'timed.gpx' });
    const untimed = buildRawFeature({
      sourceFile: 'untimed.gpx',
      geometries: [buildRawLine({ time: undefined })],
    });
    const items = assemble([untimed, timed], emptyConfig).items;
    const timedOrder = items.find(i => i.id.startsWith('timed'))!.order;
    const untimedOrder = items.find(i => i.id.startsWith('untimed'))!.order;
    expect(timedOrder).toBeLessThan(untimedOrder);
  });

  it('passes the config name through to TripData', () => {
    const data = assemble([buildRawFeature()], emptyConfig, 'My Trip');
    expect(data.name).toBe('My Trip');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- packages/preprocess/test/assemble.test.ts`
Expected: FAIL — `assemble` is not defined / module not found.

- [ ] **Step 3: Write `assemble.ts`**

Create `packages/preprocess/src/assemble.ts`:

```typescript
/**
 * Assemble: turn scanned RawFeatures into contract TripItems, stamping only
 * fields that need no UI-shaped guessing (id, name, panel, groupLabel,
 * transportMode, order, geometries). Derived fields that depend on an
 * as-yet-unbuilt UI (day, sunAngle, bounds) are intentionally NOT produced;
 * each returns as an isolated future compute stage (see the design log).
 *
 * order is a global chronological integer: timed features first, ascending by
 * their earliest point time; untimed features after, in input order. Ties keep
 * input order (input is already deterministically sorted by scan).
 */

import type { Panel, TripData, TripItem } from '@nomadpath/contract';
import { CONTRACT_VERSION } from '@nomadpath/contract';

import type { Config } from './config/schema.ts';
import type { RawFeature, RawGeometry } from './model.ts';

/** Earliest non-null timestamp across a feature's geometries, or null if none. */
function earliestTime(feature: RawFeature): number | null {
  let earliest: number | null = null;
  for (const geometry of feature.geometries) {
    if (!('time' in geometry) || geometry.time === undefined) continue;
    for (const t of geometry.time) {
      if (t !== null && (earliest === null || t < earliest)) earliest = t;
    }
  }
  return earliest;
}

/** A feature is a waypoint if it carries a folder or has any point geometry. */
function panelFor(feature: RawFeature): Panel {
  const hasPoint = feature.geometries.some((g: RawGeometry) => g.type === 'point');
  return feature.folder !== undefined || hasPoint ? 'waypoints' : 'tracks';
}

function toItem(feature: RawFeature, order: number): TripItem {
  const id = `${feature.sourceFile}#${String(feature.sourceIndex)}`;
  const item: TripItem = {
    id,
    name: feature.name ?? id,
    panel: panelFor(feature),
    order,
    geometries: feature.geometries as TripItem['geometries'],
  };
  if (feature.description !== undefined) item.description = feature.description;
  if (feature.folder !== undefined) item.groupLabel = feature.folder;
  if (feature.activity !== undefined) item.transportMode = feature.activity;
  return item;
}

export function assemble(features: RawFeature[], _config: Config, name?: string): TripData {
  // Stable sort: attach original index, sort timed-before-untimed then by time,
  // breaking ties by original index so input order is preserved.
  const decorated = features.map((feature, index) => ({ feature, index, time: earliestTime(feature) }));
  decorated.sort((a, b) => {
    if (a.time === null && b.time === null) return a.index - b.index;
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time - b.time || a.index - b.index;
  });
  const items = decorated.map((d, order) => toItem(d.feature, order));

  const data: TripData = { version: CONTRACT_VERSION, items };
  if (name !== undefined) data.name = name;
  return data;
}
```

Note: `_config` is accepted now (config-driven fields deferred with their targets) so the CLI wiring and future field resolution have the seam ready. The leading underscore satisfies the no-unused-vars lint.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- packages/preprocess/test/assemble.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/preprocess/src/assemble.ts packages/preprocess/test/assemble.test.ts
git commit -m "$(cat <<'EOF'
feat(preprocess): assemble raw features into contract trip items

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `emit` — validate then atomic-write

Validate a TripData with the contract and, only if clean, atomically write compact JSON. Fail loud with the full issue list otherwise, writing nothing.

**Files:**

- Create: `packages/preprocess/src/emit.ts`
- Test: `packages/preprocess/test/emit.test.ts`

**Interfaces:**

- Consumes: `validateTripData`/`ContractIssue`/`TripData` (from `@nomadpath/contract`), `assemble` + fixture builders for constructing test input.
- Produces: `emit(data: TripData, outPath: string): void`. On validation failure throws `Error` whose message begins `invalid trip data` and lists every issue; writes nothing (no file, no temp file). On success writes compact (`JSON.stringify(data)`, no indent) atomically via temp-sibling + rename.

- [ ] **Step 1: Write the failing tests**

Create `packages/preprocess/test/emit.test.ts`:

```typescript
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validateTripData } from '@nomadpath/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { assemble } from '../src/assemble.ts';
import { emit } from '../src/emit.ts';
import { buildRawFeature } from '../src/fixtures.ts';
import { configSchema } from '../src/config/schema.ts';

const emptyConfig = configSchema.parse({});
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nomadpath-emit-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('emit', () => {
  it('writes valid trip data that round-trips through validateTripData', () => {
    const data = assemble([buildRawFeature()], emptyConfig, 'Trip');
    const out = join(dir, 'trip-data.json');
    emit(data, out);
    expect(existsSync(out)).toBe(true);
    const reloaded: unknown = JSON.parse(readFileSync(out, 'utf8'));
    expect(validateTripData(reloaded)).toEqual([]);
  });

  it('writes compact JSON (no pretty-print whitespace)', () => {
    const data = assemble([buildRawFeature()], emptyConfig);
    const out = join(dir, 'trip-data.json');
    emit(data, out);
    expect(readFileSync(out, 'utf8')).not.toContain('\n  ');
  });

  it('throws and writes nothing when the data is invalid', () => {
    const bad = { version: 1, items: [{ id: '', name: '', panel: 'tracks', order: 0, geometries: [] }] } as never;
    const out = join(dir, 'trip-data.json');
    expect(() => emit(bad, out)).toThrow(/invalid trip data/);
    expect(existsSync(out)).toBe(false);
  });

  it('leaves no temp file behind after a successful write', () => {
    const data = assemble([buildRawFeature()], emptyConfig);
    emit(data, join(dir, 'trip-data.json'));
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
 * Emit: the final pipeline stage. Validate the assembled TripData with the
 * contract (collect-all), fail loud with the full issue list if anything is
 * wrong (writing nothing), else write compact JSON atomically so a crash never
 * leaves a half-written or partially-valid file in place.
 */

import { renameSync, unlinkSync, writeFileSync } from 'node:fs';

import type { TripData } from '@nomadpath/contract';
import { validateTripData } from '@nomadpath/contract';

export function emit(data: TripData, outPath: string): void {
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
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/preprocess/src/emit.ts packages/preprocess/test/emit.test.ts
git commit -m "$(cat <<'EOF'
feat(preprocess): validate and atomically emit trip data

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire assemble + emit into the CLI

Replace the TODO marker so a clean scan produces a real `trip-data.json`. A validation failure at emit is a hard error (exit 1, report to stderr, nothing written).

**Files:**

- Modify: `packages/preprocess/src/cli.ts`
- Test: `packages/preprocess/test/cli.test.ts` (extend the existing real-subprocess suite)

**Interfaces:**

- Consumes: `assemble` (from `./assemble.ts`), `emit` (from `./emit.ts`), existing `scanFolder`/`resolveConfig`.
- Produces: on success, `<input-dir>/trip-data.json` (or `--out`), exit 0. On emit validation failure, exit 1, full report to stderr, no file.

The existing `cli.test.ts` provides these helpers (verified): `run(args: string[]): { status, stdout, stderr }` spawns the bin as a real subprocess; a per-test temp dir is `root` (fresh each test via `beforeEach`); `write(relative, contents)` writes a file under `root`; `gpxTrack(name)` returns a valid 2-point GPX string. The new tests reuse them directly.

- [ ] **Step 1: Add imports the new tests need**

At the top of `packages/preprocess/test/cli.test.ts`, extend the `node:fs` import to include `existsSync` and `readFileSync`, and add a contract import:

```typescript
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
```

```typescript
import { validateTripData } from '@nomadpath/contract';
```

- [ ] **Step 2: Write the failing tests**

Append to `packages/preprocess/test/cli.test.ts` (uses the file's existing `run`, `write`, `gpxTrack`, `root` helpers):

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
Expected: FAIL — no `trip-data.json` is written (the CLI still stops at the TODO marker).

- [ ] **Step 4: Wire the CLI**

In `packages/preprocess/src/cli.ts`:

- Add imports near the others: `import { assemble } from './assemble.ts';` and `import { emit } from './emit.ts';` and `import { join } from 'node:path';` (already imported — keep one).
- Replace the TODO-marker line
  `// Task 7 adds compute -> assemble -> validate -> emit trip-data.json here (respecting --out).`
  with:

```typescript
const outPath = options.out ?? join(inputDir, 'trip-data.json');
try {
  emit(assemble(scan.features, config, config.name), outPath);
} catch (err) {
  process.stderr.write(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
```

Place this AFTER the stdout status line (the status line describes what was scanned; the file write follows). Keep exit codes consistent: emit failure -> 1, matching the scan-error path.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:unit -- packages/preprocess/test/cli.test.ts`
Expected: PASS.

- [ ] **Step 6: Full check**

Run: `npm run check`
Expected: PASS. `cli.ts` may still show low coverage (exercised via subprocess, as noted in Task 5's record) — that is expected and does not fail the 75% gate.

- [ ] **Step 7: Commit**

```bash
git add packages/preprocess/src/cli.ts packages/preprocess/test/cli.test.ts
git commit -m "$(cat <<'EOF'
feat(preprocess): wire assemble and emit into the cli

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Corpus verification (read-only)

Confirm the end-to-end pipeline produces a valid file over all real trips. Not a committed test — a manual gate.

**Files:** none (verification only).

- [ ] **Step 1: Relink the bin if needed and run against each trip**

Run (once, if the bin isn't linked): `npm install --force`
Then for each trip dir under `~/Documents/holidays`:
Run: `npm run preprocess -- "~/Documents/holidays/<trip>"`
Expected: exit 0, a status line on stdout, `trip-data.json` written into each trip dir.

- [ ] **Step 2: Validate each emitted file loads clean**

For one emitted file, confirm it parses and re-validates (quick node one-liner is fine, or reuse a scratch script in the scratchpad dir). Expected: `validateTripData` returns `[]`.

- [ ] **Step 3: Clean up emitted artifacts from the read-only corpus**

Remove the `trip-data.json` files written into `~/Documents/holidays` (it is a reference corpus, not an output dir). Confirm the corpus is unmodified otherwise.

Expected: no leftover pipeline output in the reference corpus.

---

## Task 6: Update records (design log, phase plan)

Capture the deferral decisions and the corpus finding so nothing is silently dropped.

**Files:**

- Modify: `plans/looking-to-plan-the-piped-nova.md`
- Modify: `plans/phase3-pipeline.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: Append dated design-log entries**

In `plans/looking-to-plan-the-piped-nova.md`, add rows dated `2026-07-04`:

- Defer `day`/`sunAngle`/`bounds` compute until a UI consumer names the need; preprocessing computes exactly what the UI needs, and no UI exists yet.
- Contract trimmed to today's output (deferred fields REMOVED, not made optional) so the contract equals what the pipeline produces; re-adding a field is a one-line schema change plus one `compute/<x>.ts` plus one stamp in `assemble.ts` (no dominoes).
- Corpus finding: timeless _tracks_ do not exist — the only no-`<time>` files are waypoint files (group by folder, not day) — so the earlier "day for a timeless track" question is moot.
- Note (do not delete the 2026-06-20 rows): "Day = plain local calendar date" and "Timezone is a REQUIRED core compute" are DEFERRED in timing, not reversed in intent; they return when the tree UI exists.

- [ ] **Step 2: Update the phase plan**

In `plans/phase3-pipeline.md`:

- Mark Task 6 as DEFERRED with a pointer to `docs/superpowers/specs/2026-07-04-defer-compute-assemble-emit-design.md`.
- Check off the assemble/emit/CLI-wiring work under Task 7 (it is now done by this plan), and add an "Anticipated later (non-committal)" note listing likely-future fields: `day`, `sunAngle`, `bounds`, `divider`, `defaultVisible` — each returns with its compute stage when a UI need is named.

- [ ] **Step 3: Commit**

```bash
git add plans/looking-to-plan-the-piped-nova.md plans/phase3-pipeline.md
git commit -m "$(cat <<'EOF'
docs: record compute deferral and contract trim decisions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review notes

- **Spec coverage:** contract trim (Task 1), assemble (Task 2), emit (Task 3), CLI wiring (Task 4), corpus verification (Task 5), records (Task 6) — every spec section maps to a task.
- **Type consistency:** `assemble(features, config, name?)` and `emit(data, outPath)` signatures match between the tasks that produce and consume them; `TripItem` field set after Task 1 matches what `toItem` stamps in Task 2 (no `day`/`bounds`/`divider`); `emit`'s error message prefix `invalid trip data` matches the Task 3 test regex.
- **Deferred config fields:** `assemble` takes `_config` unused by design (config-driven fields deferred with their targets); the seam exists so future resolution is additive.
