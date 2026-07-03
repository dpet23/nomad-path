# Getting started (development)

## Prerequisites

- Node.js >= 23.6 (the repo runs TypeScript directly via Node's native type stripping — no build step in development)
- npm >= 10

## Setup

```bash
git clone <repo-url> nomad-path
cd nomad-path
npm install
```

`npm install` links the workspace packages and installs the git pre-commit hook (via husky).

## npm scripts

All development commands are npm scripts — never invoke the underlying tools directly.

Scripts compose from single-purpose leaves; aggregates call the leaves via `npm run` so a command string is never duplicated.

| Script                  | What it does                                                                    |
| ----------------------- | ------------------------------------------------------------------------------- |
| `npm run typecheck`     | Strict TypeScript check across every package                                    |
| `npm run lint:code`     | ESLint (strict type-checked rules + package import boundaries)                  |
| `npm run lint:docs`     | markdownlint on docs, README, CLAUDE.md (render-sanity)                         |
| `npm run lint:links`    | linkinator: broken relative links in the docs                                   |
| `npm run lint`          | All three linters above                                                         |
| `npm run format`        | Prettier, writing changes                                                       |
| `npm run format:check`  | Prettier, check only                                                            |
| `npm run test:unit`     | Vitest unit tests across all packages                                           |
| `npm run test:coverage` | Unit tests with the 75% coverage gate                                           |
| `npm run test:e2e`      | Playwright end-to-end tests (desktop + mobile emulation projects)               |
| `npm run check`         | Everything the pre-commit hook runs: format check + lint + typecheck + coverage |

Focused unit tests: `npm run test:unit -- <path-or-pattern>`.

## Pre-commit hook

Every commit runs lint-staged (Prettier auto-formats staged files), then `npm run check`: Prettier check, all linters (code, docs, links), typecheck, and unit tests with the coverage gate. If any step fails, the commit is blocked. Linting lives in `check` (single tree-wide invocations) rather than per-file in lint-staged, which keeps the hook fast and avoids running the type-aware linter once per file.

## Repository layout

```text
packages/contract/   shared data contract (types + schema + validation)
packages/pipeline/   deploy-time pipeline (raw GPX/KML -> trip data file)
packages/ui/         browser UI library
packages/demo/       dev demo page + server
packages/e2e/        full-system Playwright tests
docs/                this documentation
plans/               design decision log + per-phase implementation plans
```
