# Nomad Path

Visualises GPS trip recordings on interactive basemaps. Two components joined by a shared contract: a deploy-time pipeline (raw GPX/KML folder -> one compact data file, strict + fail-loud) and a fully client-side UI library (never crashes, friendly in-UI errors). See `docs/architecture/overview.md`.

## Source-of-truth documents

- **Design decision log**: `plans/looking-to-plan-the-piped-nova.md` — append-only; never silently reverse a decision, supersede it with a dated entry.
- **Phase plans**: `plans/phase<N>-<name>.md` — the current phase's task list with checkboxes.
- **Docs**: `docs/` (mkdocs-material-compatible). Update alongside code, per phase.

## Repository layout

```text
packages/contract/   @nomadpath/contract — shared types + schema + semantic validation (leaf package)
packages/preprocess/ @nomadpath/preprocess — parsers -> common model -> compute -> assemble -> validate -> emit
packages/ui/         @nomadpath/ui — src/core (map-agnostic) + src/render (MapRenderer adapters) + src/widgets
packages/demo/       @nomadpath/demo — dev demo page + server
packages/e2e/        @nomadpath/e2e — full-system Playwright tests (desktop + mobile-emulation projects)
```

Packages export TS source directly; Node >= 23.6 runs it natively (no dev build step). Import boundaries are lint-enforced: contract imports no sibling; preprocess never imports ui or map libs; ui/src/core never imports map libs.

**Dependency placement** (`import-x/no-extraneous-dependencies` enforces no phantom imports):

- A dependency imported by exactly one package lives in that package's own `package.json` (e.g. `zod` in contract, `@playwright/test` in e2e).
- A dependency imported by two or more packages is pinned once at the root for version sync; those packages declare it as `"*"` (e.g. `vitest`, `@vitest/coverage-v8`, `typescript`, `@types/node`).
- Repo tooling that no package imports — the repository itself runs it once from root against the whole tree via a shared config (eslint + plugins, prettier, husky, lint-staged, markdownlint, linkinator) — lives at the root. This is not a package dependency; it is not subject to the two rules above.

## Commands (npm scripts only — never invoke tools directly; add a script if one is missing)

- `npm run typecheck` / `npm run lint` / `npm run format` / `npm run format:check`
- `npm run test:unit` (focused: `npm run test:unit -- <path>`)
- `npm run test:coverage` — 75% gate
- `npm run test:e2e`

Pre-commit hook: lint-staged (prettier + eslint --fix) -> typecheck -> test:coverage.

## Conventions

- **Branching**: ALL work — phases, epics, and even small side improvements (tooling, lint, docs) — happens on an `epic/<name>` branch off `master`, merged back with `--no-ff`. Never commit directly to master. Main branch is `master`.
- **Commits**: one concern per commit; conventional-commit style subjects (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).
- **TDD**: enumerate the full state space before writing tests; write all tests first (allowed to fail); success AND failure cases. Tests must find bugs, not just prove correctness.
- **UI testing**: drive real UI interactions (clicks, dropdowns) — never internal APIs. Assert both widget state and renderer state.
- **Fixtures**: realistic but fictional — never real trip locations/details. Non-overlapping attribute ranges so assertions are unambiguous. Never copy from `~/Documents/holidays` (read-only reference corpus).
- **No circular assertions** (`expect(after).toBe(before)`) — assert actual expected values.
- **Registries**: single source of truth for enums/lists — one registry object, types derived from it.
- **Strings**: ASCII hyphens only, never en/em dashes.
- **End of phase**: manual `npm run demo` walkthrough (once the demo exists) + update design log, phase plan checkboxes, docs.
