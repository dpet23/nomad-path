<!-- Claude: Keep npm script descriptions in sync with package.json. Update test counts in "Testing Strategy" when new tests are added. Update the pre-commit hook description if .husky/pre-commit changes. Update release steps if scripts/release.js is added. -->

# Developer Guide

Development workflow for the Nomad Path library: how to build, test, and release.

For library internals, see [architecture.md](architecture.md).
For the preprocessing pipeline, see [preprocessing.md](preprocessing.md).

---

## Prerequisites

- **Node.js 18+**
- Install dependencies: `npm install`
- **Playwright browsers** — one-time install for e2e tests:

  ```bash
  npm run test:e2e:install   # installs Chromium (and optionally Firefox/WebKit)
  ```

  Browsers are installed globally at `~/.cache/ms-playwright/`, not in `node_modules`.
  The `clean` script only removes `dist/` and does not affect Playwright binaries.

---

## npm Scripts

<!-- Claude: This table is the source of truth for script descriptions. Update when package.json scripts change. -->

| Script | What it does |
|--------|-------------|
| `build:lib` | Rollup bundle → `dist/nomad-path.js` |
| `build:data` | Run preprocessing CLI: `npm run build:data -- -i <dir> [-o <file>] [-n <name>]` |
| `dev` | Rollup in watch mode (rebuilds on source change) |
| `demo` | `build:lib` + copy to demo + `npx serve ./demo` (requires `demo/trip-data.geojson`) |
| `watch` | `build:lib` + copy to demo + file watcher for incremental builds |
| `typecheck` | TypeScript type-check without emitting |
| `lint` | ESLint |
| `lint:fix` | ESLint with auto-fix |
| `format` | Prettier |
| `test:unit` | Vitest run (fast, no coverage report) |
| `test:coverage` | Unit tests + coverage gate (used in pre-commit) |
| `test:watch` | Vitest in watch mode |
| `test:e2e` | `build:lib` + copy to e2e + Playwright (Chromium only) |
| `test:e2e:all` | Same but Chromium + Firefox + WebKit |
| `test:e2e:install` | Install Playwright browsers (one-time) |
| `clean` | Remove `dist/` |

Run a subset of e2e tests by name:

```bash
npm run test:e2e -- --grep "pattern"
```

---

## Testing Strategy

<!-- Claude: Update test counts when new tests are added. Split is unit (vitest) vs e2e (playwright). -->

**Unit tests** (`npm run test:unit`): Vitest, currently 240 tests. Run these constantly during
development — they complete in a few seconds and cover preprocessing, rendering logic, and UI
components.

**End-to-end tests** (`npm run test:e2e`): Playwright + Chromium, currently 66 tests. These build
the library, spin up a local server, and drive a real browser. Run them at the end of each epic,
not on every change.

### Pre-commit hook

Every commit runs automatically:

1. `lint-staged` — ESLint + Prettier on staged files
2. `typecheck` — full TypeScript type-check
3. `test:coverage` — all unit tests with coverage thresholds (fails if coverage drops below 75%)

E2e tests are not part of the pre-commit hook.

---

## Release Process

<!-- Claude: Update if scripts/release.js is added to automate these steps. -->

Version is tracked in `package.json` only (single source of truth). Tag-then-bump order: the tag
marks what was released, the bump prepares for the next cycle.

```bash
# 1. Tag the current version as released
git tag v$(node -p "require('./package.json').version")

# 2. Bump package.json for next development cycle
npm version minor --no-git-tag-version
git add package.json package-lock.json
git commit -m "Bump version to $(node -p "require('./package.json').version")"
```

---

## Commit Style

- One concern per commit
- No `Co-Authored-By` trailers
- No `--no-verify` unless pre-existing failures block the commit (document why in the message)
