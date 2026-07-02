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

| Script                  | What it does                                                      |
| ----------------------- | ----------------------------------------------------------------- |
| `npm run typecheck`     | Strict TypeScript check across every package                      |
| `npm run lint`          | ESLint (strict type-checked rules + package import boundaries)    |
| `npm run format`        | Prettier, writing changes                                         |
| `npm run format:check`  | Prettier, check only                                              |
| `npm run test:unit`     | Vitest unit tests across all packages                             |
| `npm run test:coverage` | Unit tests with the 75% coverage gate                             |
| `npm run test:e2e`      | Playwright end-to-end tests (desktop + mobile emulation projects) |

Focused unit tests: `npm run test:unit -- <path-or-pattern>`.

## Pre-commit hook

Every commit runs: lint-staged (Prettier + ESLint on staged files) → typecheck → unit tests with coverage gate. If any step fails, the commit is blocked.

## Repository layout

```
packages/contract/   shared data contract (types + schema + validation)
packages/pipeline/   deploy-time pipeline (raw GPX/KML -> trip data file)
packages/ui/         browser UI library
packages/demo/       dev demo page + server
docs/                this documentation
plans/               design decision log + per-phase implementation plans
e2e/                 full-system Playwright tests
```
