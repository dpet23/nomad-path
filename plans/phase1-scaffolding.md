# Phase 1: Scaffolding + Dev Tooling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Master plan: `~/.claude/plans/let-s-work-on-the-tingly-pretzel.md`. Design doc: `plans/looking-to-plan-the-piped-nova.md`.

**Goal:** A working npm-workspaces monorepo with strict TS, lint/format/pre-commit gates, unit-test + coverage wiring, Playwright skeleton, docs skeleton, and CLAUDE.md — so every later phase lands on rails.

**Architecture:** Four workspace packages (`contract`, `pipeline`, `ui`, `demo`) exporting TS source directly (no per-package build step in dev; Node ≥23.6 strips types natively, Vite/Vitest are TS-aware). One root toolchain: single ESLint flat config with import-boundary rules, one Vitest config with per-package projects, one tsc --noEmit typecheck.

**Tech Stack:** Node 24 / npm 11, TypeScript ~5.x strict, ESLint 9 flat + typescript-eslint, Prettier, Vitest 3 + @vitest/coverage-v8 (75% gate), Playwright, husky + lint-staged.

## Global Constraints

- ESM everywhere (`"type": "module"`).
- All dev commands are npm scripts — tools never invoked directly (memory rule).
- Import boundaries: `ui` core never imports maplibre/deck (enforced when those deps arrive, phase 5); `pipeline` never imports `ui`; both may import `contract`; `contract` imports neither.
- ASCII hyphens in all strings; single-registry enums.
- One concern per commit; every task ends green.
- No real trip data anywhere in the repo.

---

### Task 1: Root workspace + git hygiene

**Files:** Create `package.json`, `.gitignore`, `README.md`, branch `epic/scaffolding`.

- [x] Step 1: `git checkout -b epic/scaffolding`
- [x] Step 2: Root `package.json`: `{ "name": "nomad-path", "private": true, "type": "module", "engines": { "node": ">=23.6" }, "workspaces": ["packages/*"] }` — scripts added by later tasks.
- [x] Step 3: `.gitignore`: `node_modules/`, `dist/`, `coverage/`, `playwright-report/`, `test-results/`, `*.tsbuildinfo`, `.DS_Store`.
- [x] Step 4: `README.md`: one-paragraph project description + pointer to `docs/` and `plans/`.
- [x] Step 5: Verify `npm install` succeeds (creates lockfile). Commit `chore: init npm workspaces root`.

### Task 2: Package skeletons

**Files:** Create per package p in {contract, pipeline, ui, demo}: `packages/<p>/package.json`, `packages/<p>/src/index.ts`, plus root `tsconfig.base.json`, `tsconfig.json`, per-package `tsconfig.json`.

**Interfaces produced:** package names `@nomadpath/contract|pipeline|ui|demo`; each `package.json` has `"exports": { ".": "./src/index.ts" }`; contract exposes `export const CONTRACT_VERSION = 1` (placeholder proving cross-package imports); pipeline/ui import and re-expose it (`export function contractVersion(): number`).

- [x] Step 1: `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `module: nodenext`, `target: es2023`, `skipLibCheck`, `noEmit`, `allowImportingTsExtensions: false`.
- [x] Step 2: Root `tsconfig.json` referencing includes `packages/*/src`; per-package tsconfig extends base (demo/ui add `"lib": ["es2023", "dom"]`).
- [x] Step 3: Package manifests: private, type module, exports to src; pipeline/ui/demo depend on `"@nomadpath/contract": "*"` (npm workspaces links them).
- [x] Step 4: Stub sources: contract exports `CONTRACT_VERSION`; pipeline and ui export `contractVersion()` returning it; demo `src/index.ts` empty export.
- [x] Step 5: Add root script `"typecheck": "tsc --noEmit"`. Run `npm run typecheck` → passes. Prove runtime: `node packages/pipeline/src/index.ts` type-strips fine (temporary console assert, removed). Commit `chore: add workspace package skeletons with strict typescript`.

### Task 3: Prettier + ESLint (flat) + boundaries

**Files:** Create `prettier.config.js`, `.prettierignore`, `eslint.config.js`.

- [x] Step 1: Install dev deps at root: `prettier`, `eslint`, `typescript-eslint`, `@eslint/js`, `eslint-config-prettier`.
- [x] Step 2: `prettier.config.js`: `singleQuote: true`, `printWidth: 100`. `.prettierignore`: `coverage`, `dist`, `package-lock.json`, `playwright-report`, `test-results`.
- [x] Step 3: `eslint.config.js`: typescript-eslint `strictTypeChecked` + `stylisticTypeChecked` with `projectService`; prettier-config last. Boundary rules via `no-restricted-imports` scoped per package dir: in `packages/pipeline/**` forbid `@nomadpath/ui` + `maplibre-gl` + `@deck.gl/*`; in `packages/contract/**` forbid `@nomadpath/*` others; in `packages/ui/src/core/**` forbid `maplibre-gl`, `@deck.gl/*` (rule present now, bites at phase 5).
- [x] Step 4: Scripts: `"lint": "eslint ."`, `"format": "prettier --write ."`, `"format:check": "prettier --check ."`. Run both → green (fix stubs as needed). Commit `chore: add prettier and strict eslint with package boundary rules`.

### Task 4: Vitest + coverage gate

**Files:** Create `vitest.config.ts`, one trivial real test per non-demo package (`packages/<p>/test/index.test.ts`).

- [x] Step 1: Install `vitest`, `@vitest/coverage-v8`.
- [x] Step 2: `vitest.config.ts`: projects for contract/pipeline/ui (node env), coverage provider v8, `thresholds: { lines: 75, functions: 75, branches: 75, statements: 75 }`, include `packages/*/src/**`.
- [x] Step 3: Write tests first, watch them fail wrongly? (stubs exist, so they pass — acceptable here: scaffolding tests prove wiring, not behaviour). Tests: contract exports `CONTRACT_VERSION === 1`; pipeline/ui `contractVersion()` returns it (cross-package import proof = the first cross-side net).
- [x] Step 4: Scripts: `"test:unit": "vitest run"`, `"test:coverage": "vitest run --coverage"`. Run → pass incl. thresholds. Commit `test: wire vitest with coverage gate across packages`.

### Task 5: Playwright skeleton

**Files:** Create `playwright.config.ts`, `e2e/smoke.spec.ts`.

- [x] Step 1: Install `@playwright/test` + chromium binary.
- [x] Step 2: Config: `testDir: "e2e"`, projects `desktop-chromium` + `mobile-chromium` (Pixel 7 emulation — phase 6+ mobile rule), `webServer` stanza commented until demo exists.
- [x] Step 3: `e2e/smoke.spec.ts`: placeholder asserting Playwright runs (`expect(true)`) tagged `@scaffold`, replaced in phase 6/7 by real UI-driven specs. Script `"test:e2e": "playwright test"`. Run → 2 passing. Commit `test: add playwright skeleton with desktop and mobile projects`.

### Task 6: Pre-commit hooks

**Files:** Create `.husky/pre-commit`, `lint-staged` config in root package.json.

- [x] Step 1: Install `husky`, `lint-staged`; `"prepare": "husky"`.
- [x] Step 2: lint-staged: `"*.{ts,js,json,md,yml,yaml,html,css}": "prettier --write"`, `"*.{ts,js}": "eslint --fix"`.
- [x] Step 3: `.husky/pre-commit`: `npx lint-staged && npm run typecheck && npm run test:coverage` (memory-rule chain).
- [x] Step 4: Verify: commit with a deliberately mis-formatted file → hook fixes/blocks as expected; then commit `chore: add husky pre-commit with lint-staged, typecheck, coverage`.

### Task 7: Docs skeleton + CLAUDE.md

**Files:** Create `docs/index.md`, `docs/usage/getting-started.md`, `docs/architecture/overview.md`, `docs/architecture/data-contract.md`, `mkdocs.yml`, `CLAUDE.md`.

- [x] Step 1: `mkdocs.yml` minimal Material-compatible (site_name, theme material, nav) — buildable later by zensical/mkdocs-material; not wired into npm.
- [x] Step 2: `docs/index.md` = what Nomad Path is; `usage/getting-started.md` = dev setup (npm install, script catalogue); `architecture/overview.md` = two-component system + monorepo map (condensed from design doc); `architecture/data-contract.md` = stub pointing at phase 2.
- [x] Step 3: `CLAUDE.md`: project map, npm-script catalogue, conventions (npm-scripts-only, TDD rules, fixture rules, boundaries, commit style, phase-plan pointers, never copy ~/Documents/holidays data).
- [x] Step 4: `npm run format && npm run lint`. Commit `docs: add documentation skeleton and CLAUDE.md`.

### Task 8: Phase gate

- [x] All scripts green: `typecheck`, `lint`, `format:check`, `test:unit`, `test:coverage`, `test:e2e`.
- [x] Update this file's checkboxes + master-plan status + memory. Merge `epic/scaffolding` → master `--no-ff`.
