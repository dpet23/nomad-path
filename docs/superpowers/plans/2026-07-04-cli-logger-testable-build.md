# CLI Logger + Testable build() + Coverage Gate Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the preprocess CLI's logic (`build()`) in-process-testable via an injected streaming `Logger`, fix the `--out <directory>` crash, and switch the coverage gate to branch coverage with a per-file floor so uncovered CLI branches fail CI instead of hiding.

**Architecture:** Introduce a severity `Logger` interface (its own file) so all `nomadpath-*` output is consistent and streams live (needed for the git-hook phone console). Extract `build(inputDir, options, logger): number` — pure of `process.*`, returns an exit code, logs as events happen. A thin `main()` wires a `ConsoleLogger` and calls `process.exit`. Because `build()` runs in-process, coverage instrumentation finally sees the CLI.

**Tech Stack:** TypeScript (Node >= 23.6 native type-stripping, no build step), Vitest + v8 coverage, commander (CLI). No new dependencies.

## Global Constraints

- **Governing principle:** every field/function needs a specific NAMED consumer, not an inferred one. Nothing is set in stone. See `CLAUDE.md`.
- **Honest coverage over tautology:** the gate must measure REAL behaviour. NEVER mock out `process.*` or real collaborators to hit a number — inject the `Logger` (a real collaborator) and use temp dirs. If a file genuinely cannot reach the floor without contrived tests, LOWER that file's threshold with a written reason; do not fabricate coverage. Prefer a lower honest gate to a tautological test.
- **Streaming, not buffering:** `build()` must log via the injected `Logger` AS events happen (the git-hook use case streams to a phone console live). Do NOT buffer all output and return it as a string.
- **Node >= 23.6**, no build step. No TS enums/param-properties/namespaces. Strict lint: no `!` (no-non-null-assertion), `exactOptionalPropertyTypes`. Explicit `.ts` import extensions.
- **npm scripts only** — never invoke vitest/tsc/eslint directly. Focused: `npm run test:unit -- <path>`. Full gate: `npm run check`.
- **Master branch is `master`**; work stays on `epic/pipeline`. Commit subjects conventional; end every commit message with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **CLI output policy (2026-07-04 design log):** stdout = successful-run info (the status line); stderr = warnings + fail-loud error report. Exit codes: 0 = emitted, 1 = hard errors (nothing written), 2 = bad invocation. The `Logger` centralizes this severity->stream mapping.
- **Fixtures**: fictional only. Pre-commit hook runs lint-staged -> typecheck -> test:coverage; `.superpowers/` is excluded from prettier.

---

## File Structure

- `packages/preprocess/src/logger.ts` — CREATE: `Logger` interface + `ConsoleLogger` (prod, streams by severity) + `CapturingLogger` (tests, records entries). The single home of the severity->stream mapping.
- `packages/preprocess/src/cli.ts` — MODIFY: extract `build(inputDir, options, logger): number` (no `process.*`); thin `main()` wires `ConsoleLogger` + `process.exit`. Fix the `--out <dir>` bug inside `build`. Fix the stale docstring.
- `packages/preprocess/test/logger.test.ts` — CREATE: `ConsoleLogger` routing + `CapturingLogger` behaviour.
- `packages/preprocess/test/build.test.ts` — CREATE: in-process `build()` tests (the real coverage: --out dir/file/missing, exit codes, emit-failure, happy path). Includes the `-o .` regression case.
- `packages/preprocess/test/cli.test.ts` — MODIFY: keep as thin subprocess wiring smoke tests (they assert the real bin runs); trim any now-redundant cases that `build.test.ts` covers better in-process.
- `packages/e2e/` — ADD: pipeline e2e test (raw fixture folder -> file -> re-validate). See Task 5 for exact location.
- `vitest.config.ts` — MODIFY: branch coverage, per-file floor 80% + overall backstop.

---

## Task 1: The `Logger` helper

A severity logger that streams in production and captures in tests. Centralizes the stdout/stderr-by-severity policy.

**Files:**

- Create: `packages/preprocess/src/logger.ts`
- Test: `packages/preprocess/test/logger.test.ts`

**Interfaces:**

- Produces: `interface Logger { info(msg: string): void; warn(msg: string): void; error(msg: string): void; }`. `class ConsoleLogger implements Logger` — `info` -> `process.stdout.write(msg + '\n')`, `warn`/`error` -> `process.stderr.write(msg + '\n')`, written immediately. `class CapturingLogger implements Logger` — records `entries: { level: 'info'|'warn'|'error'; msg: string }[]`. (Classes are allowed — only param-properties/enums/namespaces are forbidden by type-stripping; a plain class with a field + methods is fine.)

- [ ] **Step 1: Write the failing tests**

Create `packages/preprocess/test/logger.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';

import { CapturingLogger, ConsoleLogger } from '../src/logger.ts';

describe('CapturingLogger', () => {
  it('records each call with its level and message in order', () => {
    const log = new CapturingLogger();
    log.info('scanned 3 files');
    log.warn('selector matched nothing');
    log.error('boom');
    expect(log.entries).toEqual([
      { level: 'info', msg: 'scanned 3 files' },
      { level: 'warn', msg: 'selector matched nothing' },
      { level: 'error', msg: 'boom' },
    ]);
  });
});

describe('ConsoleLogger', () => {
  it('routes info to stdout and warn/error to stderr, each newline-terminated', () => {
    const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      const log = new ConsoleLogger();
      log.info('ok');
      log.warn('careful');
      log.error('bad');
      expect(out).toHaveBeenCalledWith('ok\n');
      expect(err).toHaveBeenCalledWith('careful\n');
      expect(err).toHaveBeenCalledWith('bad\n');
      expect(out).toHaveBeenCalledTimes(1);
      expect(err).toHaveBeenCalledTimes(2);
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
  });
});
```

Note: spying on `process.stdout.write` here is testing the ONE genuine seam where the logger touches the real streams — it is not mocking away business logic. This is the honest place for a spy.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- packages/preprocess/test/logger.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `logger.ts`**

Create `packages/preprocess/src/logger.ts`:

```typescript
/**
 * Consistent, streaming logging for the nomadpath-* bins. The severity ->
 * stream mapping lives here once: info is normal successful-run output (stdout);
 * warn and error are the abnormal (stderr). ConsoleLogger writes immediately so
 * the watch-mode git hook streams progress to the pusher's console live rather
 * than buffering to the end. CapturingLogger lets build() be tested in-process
 * without touching real streams.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/** Streams to stdout/stderr by severity, one line per call, immediately. */
export class ConsoleLogger implements Logger {
  info(msg: string): void {
    process.stdout.write(`${msg}\n`);
  }
  warn(msg: string): void {
    process.stderr.write(`${msg}\n`);
  }
  error(msg: string): void {
    process.stderr.write(`${msg}\n`);
  }
}

/** Records every call for in-process assertions in tests. */
export class CapturingLogger implements Logger {
  readonly entries: { level: LogLevel; msg: string }[] = [];
  info(msg: string): void {
    this.entries.push({ level: 'info', msg });
  }
  warn(msg: string): void {
    this.entries.push({ level: 'warn', msg });
  }
  error(msg: string): void {
    this.entries.push({ level: 'error', msg });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- packages/preprocess/test/logger.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/preprocess/src/logger.ts packages/preprocess/test/logger.test.ts
git commit -m "$(cat <<'EOF'
feat(preprocess): add a streaming severity Logger

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extract `build()`, fix `--out <dir>`, thin `main()`

Refactor `cli.ts` so all logic lives in an in-process-testable `build(inputDir, options, logger): number` that never calls `process.*`. Fix the directory-output crash inside it. `main()` becomes a thin wire-up.

**Files:**

- Modify: `packages/preprocess/src/cli.ts`
- Test: `packages/preprocess/test/build.test.ts` (Task 3 writes these — this task makes them possible)

**Interfaces:**

- Consumes: `Logger`/`ConsoleLogger` (from `./logger.ts`), existing `scanFolder`/`unmatchedSelectors`/`loadConfig`/`emit`/`BuildStats`.
- Produces: `export function build(inputDir: string, options: Options, logger: Logger): number` — returns the exit code (0/1/2), logs via `logger`, calls NO `process.exit`/`process.stdout`/`process.stderr`. `Options = { config?: string; out?: string }`. Output-path resolution: `resolveOutPath(inputDir, options.out)` — if `out` is undefined -> `<inputDir>/trip-data.json`; if `out` names an existing directory -> `<out>/trip-data.json`; else `out` verbatim.

- [ ] **Step 1: Rewrite `cli.ts`**

Replace the body of `packages/preprocess/src/cli.ts` with the following (keep the shebang and the commander wiring; the key change is `run` -> `build(...): number` + `resolveOutPath` + a thin `main`):

```typescript
#!/usr/bin/env node

/**
 * nomadpath-preprocess: turn a folder of raw GPX/KML + nomadpath.yaml into one
 * validated trip-data.json.
 *
 *   nomadpath-preprocess <input-dir> [--config <path>] [--out <path>]
 *
 * config defaults to <input-dir>/nomadpath.yaml, output to
 * <input-dir>/trip-data.json (or, if --out names a directory, <out>/trip-data.json).
 *
 * Output by severity (via Logger): info = successful-run status -> stdout;
 * warn/error = non-fatal warnings + fail-loud report -> stderr. Exit codes:
 * 0 = emitted, 1 = hard errors (nothing written), 2 = bad invocation.
 * See design log 2026-07-04.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { Command } from 'commander';

import type { Config } from './config/schema.ts';
import { loadConfig } from './config/schema.ts';
import { emit } from './emit.ts';
import type { Logger } from './logger.ts';
import { ConsoleLogger } from './logger.ts';
import { BuildStats } from './model.ts';
import { scanFolder, unmatchedSelectors } from './scan.ts';

export interface Options {
  config?: string;
  out?: string;
}

const DEFAULT_OUTPUT_FILENAME = 'trip-data.json';

/** Resolve the output file path. A directory (e.g. `-o .`) means "write the default file into it". */
function resolveOutPath(inputDir: string, out: string | undefined): string {
  if (out === undefined) return join(inputDir, DEFAULT_OUTPUT_FILENAME);
  if (existsSync(out) && statSync(out).isDirectory()) return join(out, DEFAULT_OUTPUT_FILENAME);
  return out;
}

/** Load config from --config, or the default <dir>/nomadpath.yaml if present, else empty. Returns undefined on a missing explicit --config (caller exits 2). */
function resolveConfig(inputDir: string, options: Options, logger: Logger): Config | undefined {
  const explicit = options.config;
  const path = explicit ?? join(inputDir, 'nomadpath.yaml');
  if (!existsSync(path)) {
    if (explicit !== undefined) {
      logger.error(`error: config file not found: ${path}`);
      return undefined;
    }
    return loadConfig('', 'nomadpath.yaml');
  }
  return loadConfig(readFileSync(path, 'utf8'), path);
}

/**
 * The whole build as a pure-of-process-effects function: scan -> emit, logging
 * via the injected logger, returning an exit code. No process.exit / stream
 * writes here, so it runs (and is coverage-instrumented) in-process.
 */
export function build(inputDir: string, options: Options, logger: Logger): number {
  if (!existsSync(inputDir) || !statSync(inputDir).isDirectory()) {
    logger.error(`error: input dir not found: ${inputDir}`);
    return 2;
  }

  const config = resolveConfig(inputDir, options, logger);
  if (config === undefined) return 2;

  const scan = scanFolder(inputDir, config);

  for (const selector of unmatchedSelectors(scan, config)) {
    logger.warn(`warning: config selector "${selector}" matched no files`);
  }

  if (scan.errors.length > 0) {
    logger.error(`\n${String(scan.errors.length)} error(s); nothing written:`);
    for (const e of scan.errors) {
      logger.error(`  ${e.sourceFile}: ${e.message}`);
    }
    return 1;
  }

  const outPath = resolveOutPath(inputDir, options.out);
  try {
    emit(scan.features, config.name, outPath);
  } catch (err) {
    logger.error(`\n${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const parts = [
    `scanned ${String(scan.paths.length)} file(s)`,
    `${String(scan.features.length)} feature(s)`,
    ...BuildStats.format(scan.stats),
  ];
  logger.info(`${parts.join(', ')}.`);
  return 0;
}

const program = new Command();
program
  .name('nomadpath-preprocess')
  .description('Build one validated trip-data.json from a folder of raw GPX/KML + nomadpath.yaml.')
  .argument('<input-dir>', 'folder of raw GPX/KML recordings to preprocess')
  .option('-c, --config <path>', 'config file (default: <input-dir>/nomadpath.yaml)')
  .option('-o, --out <path>', 'output file or directory (default: <input-dir>/trip-data.json)')
  .action((inputDir: string, options: Options) => {
    process.exit(build(inputDir, options, new ConsoleLogger()));
  });

// Explicit --help/--version -> stdout (pipeable); commander's error-triggered
// usage -> stderr. A usage error exits 2; explicit help/version exits 0.
program.exitOverride(err => {
  process.exit(err.exitCode === 0 ? 0 : 2);
});

try {
  program.parse();
} catch (err) {
  if (err instanceof Error && 'exitCode' in err) process.exit((err as { exitCode: number }).exitCode);
  throw err;
}
```

Key changes vs the old file: `run` -> `build(...): number` returning an exit code; all `process.stderr/stdout.write` -> `logger.info/warn/error`; the emit success status now logs AFTER a successful emit (so it never prints before a failure); `resolveOutPath` fixes the `-o .` crash; `Options`/`build` are exported for testing; docstring corrected.

- [ ] **Step 2: Typecheck + existing subprocess tests still pass**

Run: `npm run test:unit -- packages/preprocess/test/cli.test.ts`
Expected: PASS — the subprocess tests exercise the same behaviour through the real bin. The status-line-after-emit reordering does not change their assertions (a clean folder still exits 0 with the feature count on stdout). If a test asserted stdout ordering relative to an emit failure, update it to the new (correct) behaviour.

- [ ] **Step 3: Commit**

```bash
git add packages/preprocess/src/cli.ts
git commit -m "$(cat <<'EOF'
refactor(preprocess): extract testable build(); fix --out <dir> crash

build(inputDir, options, logger) returns an exit code and logs via an injected
Logger - no process.* calls, so it runs in-process and coverage sees it. --out
pointing at a directory (e.g. `-o .`) now writes <dir>/trip-data.json instead of
crashing with EBUSY on rename. Status line moved after a successful emit.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: In-process `build()` tests (real CLI coverage + the `-o .` regression)

The tests that actually give the CLI coverage and would have caught `-o .`. In-process, using `CapturingLogger` + temp dirs. No mocking of `process.*`.

**Files:**

- Test: `packages/preprocess/test/build.test.ts`

**Interfaces:**

- Consumes: `build`/`Options` (from `../src/cli.ts`), `CapturingLogger` (from `../src/logger.ts`), `validateTripData` (from `@nomadpath/contract`).

- [ ] **Step 1: Write the failing tests**

Create `packages/preprocess/test/build.test.ts`:

```typescript
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { validateTripData } from '@nomadpath/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { build } from '../src/cli.ts';
import { CapturingLogger } from '../src/logger.ts';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'nomadpath-build-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(relative: string, contents: string): void {
  const full = join(root, relative);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents);
}

const gpx = (name: string): string =>
  `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">` +
  `<trk><name>${name}</name><trkseg>` +
  `<trkpt lat="-54.501" lon="4.101"/><trkpt lat="-54.502" lon="4.102"/>` +
  `</trkseg></trk></gpx>`;

describe('build: output path', () => {
  it('writes <inputDir>/trip-data.json by default and exits 0', () => {
    write('walk.gpx', gpx('Walk'));
    const log = new CapturingLogger();
    const code = build(root, {}, log);
    expect(code).toBe(0);
    expect(existsSync(join(root, 'trip-data.json'))).toBe(true);
    expect(validateTripData(JSON.parse(readFileSync(join(root, 'trip-data.json'), 'utf8')))).toEqual([]);
  });

  it('writes trip-data.json INTO a directory passed as --out (the `-o .` case)', () => {
    write('walk.gpx', gpx('Walk'));
    const outDir = join(root, 'dist');
    mkdirSync(outDir);
    const code = build(root, { out: outDir }, new CapturingLogger());
    expect(code).toBe(0);
    expect(existsSync(join(outDir, 'trip-data.json'))).toBe(true);
    // The bug: it must NOT leave a stray '<dir>.tmp' or crash.
    expect(existsSync(`${outDir}.tmp`)).toBe(false);
  });

  it('writes to an exact file path when --out names a file', () => {
    write('walk.gpx', gpx('Walk'));
    const out = join(root, 'custom.json');
    const code = build(root, { out }, new CapturingLogger());
    expect(code).toBe(0);
    expect(existsSync(out)).toBe(true);
  });
});

describe('build: exit codes and logging', () => {
  it('returns 2 and logs an error when the input dir does not exist', () => {
    const log = new CapturingLogger();
    const code = build(join(root, 'nope'), {}, log);
    expect(code).toBe(2);
    expect(log.entries.some(e => e.level === 'error' && /input dir not found/.test(e.msg))).toBe(true);
  });

  it('returns 2 when an explicit --config is missing', () => {
    write('walk.gpx', gpx('Walk'));
    const log = new CapturingLogger();
    const code = build(root, { config: join(root, 'nope.yaml') }, log);
    expect(code).toBe(2);
    expect(log.entries.some(e => e.level === 'error' && /config file not found/.test(e.msg))).toBe(true);
  });

  it('returns 1 and writes nothing when a file has a hard parse error', () => {
    write('bad.gpx', '<gpx><trk></gpx>');
    const log = new CapturingLogger();
    const code = build(root, {}, log);
    expect(code).toBe(1);
    expect(existsSync(join(root, 'trip-data.json'))).toBe(false);
    expect(log.entries.some(e => e.level === 'error')).toBe(true);
  });

  it('logs the success status as info (stdout severity), not warn/error', () => {
    write('walk.gpx', gpx('Walk'));
    const log = new CapturingLogger();
    build(root, {}, log);
    const info = log.entries.filter(e => e.level === 'info');
    expect(info.some(e => /1 feature/.test(e.msg))).toBe(true);
  });

  it('warns (not fatal) about a config selector that matched nothing', () => {
    write('walk.gpx', gpx('Walk'));
    writeFileSync(join(root, 'nomadpath.yaml'), 'tracks:\n  ghost/: { hidden: true }\n');
    const log = new CapturingLogger();
    const code = build(root, {}, log);
    expect(code).toBe(0);
    expect(log.entries.some(e => e.level === 'warn' && /ghost\//.test(e.msg))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail (against the OLD cli.ts if Task 2 not yet applied), else pass**

Run: `npm run test:unit -- packages/preprocess/test/build.test.ts`
Expected: If Task 2 is applied, these PASS. If you are running strictly TDD-first, the `-o .` directory test is the one that would FAIL against a pre-fix `build`/`run` — confirm it fails for the right reason (EBUSY / stray `.tmp`) before Task 2's fix, then passes after. Since Task 2 already lands the fix, the whole file should pass here; if any fails, it is a real regression to fix.

- [ ] **Step 3: Commit**

```bash
git add packages/preprocess/test/build.test.ts
git commit -m "$(cat <<'EOF'
test(preprocess): in-process build() tests incl. --out directory regression

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Trim `cli.test.ts` to wiring smoke tests

The subprocess tests now overlap with `build.test.ts`. Keep the ones that prove the REAL bin wires up (arg parsing, `--help`, `process.exit` code, one happy-path file emit); the in-process `build.test.ts` owns the branch coverage.

**Files:**

- Modify: `packages/preprocess/test/cli.test.ts`

- [ ] **Step 1: Reduce to wiring smoke tests**

In `packages/preprocess/test/cli.test.ts`, KEEP these subprocess tests (they verify the real bin, which `build()` unit tests cannot): `exits 0 and reports the feature count on stdout for a clean folder`; `exits 2 ... when no input dir is given`; `prints auto-generated help to stdout on --help`; one emit happy-path (`writes trip-data.json for a clean fixture folder and exits 0`). DELETE the cases now better covered in-process by `build.test.ts` (the multi-file hard-error listing, the unmatched-selector warn cases, the `--config` case, the second `--out` case) to avoid duplicate maintenance — their behaviour is asserted in `build.test.ts`. Add a top-of-file comment: "Subprocess smoke tests for real-bin wiring; build() logic is unit-tested in build.test.ts."

- [ ] **Step 2: Run + confirm still green**

Run: `npm run test:unit -- packages/preprocess/test/cli.test.ts`
Expected: PASS (reduced set).

- [ ] **Step 3: Commit**

```bash
git add packages/preprocess/test/cli.test.ts
git commit -m "$(cat <<'EOF'
test(preprocess): reduce cli.test.ts to real-bin wiring smoke tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Pipeline e2e leg (raw files -> file -> re-validate)

The end-to-end you named: raw fixture folder through the real bin to a file on disk, re-validated. The UI leg is not built, but the pipeline leg is fully testable now.

**Files:**

- Create: `packages/e2e/tests/preprocess-pipeline.spec.ts` (or the package's established test path — check `packages/e2e` layout first and match it)

**Interfaces:**

- Drives the real `nomadpath-preprocess` bin (or `packages/preprocess/src/cli.ts` via `node`) over a temp fixture folder; asserts a valid `trip-data.json` results.

- [ ] **Step 1: Inspect the e2e package layout**

Run: `ls -R packages/e2e | head -40` and read its `package.json` + any config. Match the existing test runner (Playwright per the repo docs) and file location convention. If `packages/e2e` has NO node/CLI test harness yet (it is UI-oriented), the pipeline e2e MAY instead live as `packages/preprocess/test/pipeline.e2e.test.ts` driven by Vitest + a real subprocess — decide based on what the package actually supports, and note the choice in the commit. Do not force a Playwright browser context for a pure CLI-to-file test.

- [ ] **Step 2: Write the e2e test**

Create the test (Vitest + subprocess form shown; adapt to Playwright's `test()`/`expect()` if that is the package's harness):

```typescript
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateTripData } from '@nomadpath/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'preprocess', 'src', 'cli.ts');

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'nomadpath-e2e-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('pipeline e2e: raw folder -> validated file', () => {
  it('builds a multi-file trip folder into one valid trip-data.json', () => {
    const track = (name: string): string =>
      `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">` +
      `<trk><name>${name}</name><trkseg>` +
      `<trkpt lat="-54.5" lon="4.1"/><trkpt lat="-54.5" lon="4.2"/></trkseg></trk></gpx>`;
    for (const [rel, content] of [
      ['day1/morning.gpx', track('Morning')],
      ['day1/evening.gpx', track('Evening')],
      ['day2/hike.gpx', track('Hike')],
    ] as const) {
      const full = join(root, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }

    const result = spawnSync(process.execPath, [CLI, root], { encoding: 'utf8' });
    expect(result.status).toBe(0);

    const outPath = join(root, 'trip-data.json');
    expect(existsSync(outPath)).toBe(true);
    const data: unknown = JSON.parse(readFileSync(outPath, 'utf8'));
    expect(validateTripData(data)).toEqual([]);
    expect((data as { items: unknown[] }).items).toHaveLength(3);
  });
});
```

Add an npm script if the e2e package needs one to run this (per the "npm scripts only" rule); do not invoke the runner directly.

- [ ] **Step 3: Run the e2e test**

Run: the appropriate npm script (e.g. `npm run test:e2e`, or `npm run test:unit -- <path>` if it lives in preprocess).
Expected: PASS — file built, re-validates, 3 items.

- [ ] **Step 4: Commit**

```bash
git add packages/e2e packages/preprocess
git commit -m "$(cat <<'EOF'
test(e2e): pipeline leg - raw folder builds to a validated trip file

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Coverage gate — branch, per-file floor + overall backstop

Make an uncovered branch fail CI. Per-file 80% branch floor (catches the "0% file hides in the average"); overall backstop so per-file exceptions can't drag the whole project down.

**Files:**

- Modify: `vitest.config.ts`

- [ ] **Step 1: Update the thresholds**

**CORRECTION (verified during execution against `vitest@4.1.9` source + an isolated repro):** the per-glob override does NOT work as first written here. With `perFile: true`, the global numeric thresholds are checked against EVERY file unconditionally; a per-glob `'glob': { branches, ... }` key can only ADD a second check (RAISE a file's bar), never lower a file below the global floor. So "lower one file's bar via override" is impossible. The honest lever for a genuinely-untestable file is: split its untestable part into its own file and add THAT file to the coverage `exclude` list (documented). This is what was done — `build()` was split into `build.ts` (covered), and the thin `cli.ts` wiring was excluded.

Vitest threshold semantics: `perFile: true` makes the numeric thresholds (`branches`/`functions`/`lines`/`statements`) apply to EACH file individually — any file below the bar fails the run. "Per-file floor" IS the mechanism that also guards the whole project: because every file must independently clear its bar, there is no averaging hole to backstop.

In `vitest.config.ts`, replace the `thresholds` block with:

```typescript
            thresholds: {
                // Per-file floor: EACH file must independently clear these on
                // branches (and the rest). This is what stops a 0%-covered file
                // hiding inside a green average - the gap that let the CLI --out
                // bug through. Because it is per-file, there is no separate overall
                // backstop to add: every file clearing its bar guards the whole
                // project by construction.
                perFile: true,
                branches: 80,
                functions: 80,
                lines: 80,
                statements: 80,
                // Per-glob overrides go here ONLY for a file that genuinely cannot
                // reach the floor without a contrived/tautological test, each with a
                // written reason. Example (add only if Step 2 proves it necessary):
                //   'packages/preprocess/src/cli.ts': { branches: 60, functions: 60, lines: 60, statements: 60 },
                //   // reason: the commander .action + program.parse wiring and
                //   // process.exit can only be exercised via subprocess (invisible
                //   // to v8 coverage); build() itself is fully covered in build.test.ts.
            },
```

Do NOT add a per-glob override pre-emptively — add one only if Step 2 shows a file failing for a genuinely-untestable reason, and write the reason inline.

- [ ] **Step 2: Run the full coverage gate and read the real numbers**

**Expect this step to surface pre-existing coverage debt in files OTHER than cli.ts.** Raising to an 80% per-file floor is the honest signal turning on for the first time; files that hid in the old 75% average may now fail (e.g. `model.ts` was ~42% — but note it is largely type-only interfaces + the `BuildStats` companion object, so judge whether its real logic is tested; a mostly-declarations file may warrant a documented override, whereas an untested branch warrants a test). This is a feature, not a surprise. Triage each failing file by the same rule below. This step may be the largest in the plan.

Run: `npm run test:coverage`
Expected: PASS at 80% per-file branch. If a specific file fails:

- If it fails because a branch is genuinely UNtested and testable -> add a real in-process test for it (do NOT lower the bar).
- If it fails because the file is genuinely untestable without a contrived/tautological test -> add a documented per-file override lowering ONLY that file, with a comment stating the reason. Report which files needed this and why.
- `cli.ts` should now be well-covered via `build.test.ts`; only the thin `main()`/commander wiring (the `.action`/`program.parse` lines) is subprocess-only. If those few lines drag `cli.ts` below 80% branch, that is the legitimate untestable-in-process remainder — grant `cli.ts` a documented override rather than writing a fake test for `process.exit`.

- [ ] **Step 3: Full check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts
git commit -m "$(cat <<'EOF'
build: branch coverage with a per-file 80% floor

Switch the gate from a 75% line average to an 80% per-file branch floor so an
uncovered branch in one file fails CI instead of hiding in the aggregate (the
gap that let the CLI --out bug through). Per-file overrides are allowed only
with a documented reason - never a tautological test to hit the number.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Records

- [ ] **Step 1: Design-log entry**

In `plans/looking-to-plan-the-piped-nova.md`, add a `2026-07-04` row: manual testing found `-o .` crashed (EBUSY on `rename` to a directory) AND that the CLI had zero coverage signal (subprocess-tested code is invisible to v8 coverage, so `cli.ts` sat at 0% inside a green 87% average). Fix: a streaming severity `Logger` (its own file, consistent across `nomadpath-*` bins, streams live for the git-hook console) + `build(inputDir, options, logger): number` extracted to run in-process (coverage now sees it) + `--out <dir>` writes `<dir>/trip-data.json`. Gate switched to branch coverage, per-file 80% floor, with documented per-file overrides only (never tautological tests). Rationale: prefer a lower honest gate to a fake test; measure real behaviour.

- [ ] **Step 2: Commit**

```bash
git add plans/looking-to-plan-the-piped-nova.md
git commit -m "$(cat <<'EOF'
docs: record CLI logger/build refactor, --out fix, and coverage-gate change

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review notes

- **Spec coverage:** Logger (Task 1), build() extraction + `-o .` fix (Task 2), in-process CLI tests incl. regression (Task 3), subprocess-test trim (Task 4), pipeline e2e leg (Task 5), branch/per-file gate (Task 6), records (Task 7). Every decision from the discussion maps.
- **Type consistency:** `build(inputDir: string, options: Options, logger: Logger): number` and `Logger { info/warn/error }` are used identically across Tasks 1-3. `resolveOutPath` handles the directory case that Task 3's `-o .` test asserts. `CapturingLogger.entries` shape matches what the tests read.
- **Honest-coverage guard:** Task 6 explicitly forbids tautological tests and permits documented per-file lowering; the one legitimately-untestable remainder (commander wiring / `process.exit`) is called out as an override candidate, not something to fake-test.
- **Streaming preserved:** `build()` logs via the injected logger as events happen; `ConsoleLogger` writes immediately. No buffering-and-returning.
