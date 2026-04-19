<!-- Claude: Keep npm script descriptions in sync with package.json. Update test counts in "Testing Strategy" when new tests are added. Update the pre-commit hook description if .husky/pre-commit changes. Update release steps if scripts/release.js is added. When adding new build output directories, update BOTH .gitignore AND the clean script in package.json — they must stay in sync. -->

# Developer Guide

Development workflow for the Nomad Path library: how to build, test, and release.

For library internals, see [architecture.md](architecture.md).
For the preprocessing pipeline, see [preprocessing.md](preprocessing.md).

---

## Prerequisites

- **Node.js 18+**
- Install dependencies: `npm install`
- **Playwright browsers** — one-time install for browser-level tests:

  ```bash
  npm run test:integration:install   # installs Chromium (and optionally Firefox/WebKit)
  ```

  Browsers are installed globally at `~/.cache/ms-playwright/`, not in `node_modules`.
  The `clean` script does not affect Playwright binaries.

---

## npm Scripts

<!-- Claude: This table is the source of truth for script descriptions. Update when package.json scripts change. Scripts prefixed with _ are private composition helpers — not for direct use. -->

Scripts prefixed with `_` are internal composition helpers — they exist only to be called by other scripts.

| Script | What it does |
|--------|-------------|
| `build:lib` | Rollup bundle → `dist/nomad-path.js` + CSS |
| `build:data` | Run preprocessing CLI: `npm run build:data -- -i <dir> [-o <file>] [-n <name>]` |
| `build:demo` | `build:lib` + copy to `demo/dist/` (prepares demo without serving) |
| `demo` | `build:demo` + `npx serve ./demo` (requires `demo/trip-data.geojson`) |
| `watch` | `build:demo` + file watcher for incremental GPS builds |
| `lint` | ESLint |
| `lint:fix` | ESLint with auto-fix |
| `format` | Prettier |
| `typecheck` | TypeScript type-check without emitting |
| `test:unit` | Vitest run (fast, no coverage report) |
| `test:coverage` | Unit tests + coverage gate (used in pre-commit) |
| `test:unit:watch` | Vitest in watch mode |
| `test:integration` | Build + Playwright integration tests (Chromium only) |
| `test:e2e` | Build + Playwright e2e tests — validates pipeline→library seam (Chromium only) |
| `test:watch` | Playwright watch mode tests — file lifecycle, rebuild, concurrency (Chromium only) |
| `test:all` | Unit + integration + e2e + watch (all levels, Chromium) |
| `test:all:browsers` | All levels on Chromium + Firefox + WebKit |
| `test:integration:debug` | Integration tests in Playwright UI mode |
| `test:e2e:debug` | E2E tests in Playwright UI mode |
| `test:watch:debug` | Watch tests in Playwright UI mode |
| `test:integration:install` | Install Playwright browsers (one-time) |
| `clean` | Remove all generated dirs: `dist/`, `demo/dist/`, `test/integration/dist/`, `coverage/`, `playwright-report/`, `test-results/` |

Run a subset of tests by name:

```bash
npm run test:integration -- --grep "pattern"
```

---

## Testing Strategy

<!-- Claude: Update test counts when new tests are added. Four levels: unit (vitest), integration (playwright), e2e (playwright), watch (playwright). -->

Four test levels, each catching failures the level below cannot. See `CLAUDE.md` → Testing Architecture for the full breakdown.

**Level 1 — Unit** (`npm run test:unit`): Vitest. Pure logic in isolation — preprocessing, rendering, UI components. Run constantly during development.

**Level 2 — Integration** (`npm run test:integration`): Playwright + Chromium. JS library in a browser with a pipeline-generated fixture. Tests visibility, filters, paint properties, basemap restore, attribute ranges, DOM sync, stress/stability.

**Level 3 — E2E** (`npm run test:e2e`): Playwright + Chromium. Raw input files → `build:data` → browser. Validates the seam between pipeline output and library input. A failure here but passing Level 2 = seam bug.

**Level 4 — Watch** (`npm run test:watch`): Playwright + Chromium. File mutations → rebuild → reload → assertions. Tests concurrent rebuilds, mid-build changes, interaction state reset on reload.

**All levels**: `npm run test:all` (Chromium) or `npm run test:all:browsers` (all browsers).

**Debug scripts**: `test:integration:debug`, `test:e2e:debug`, `test:watch:debug` — open Playwright UI mode for step-through debugging with time-travel and DOM snapshots.

### Pre-commit hook

Every commit runs automatically:

1. `lint-staged` — ESLint + Prettier on staged files
2. `typecheck` — full TypeScript type-check
3. `test:coverage` — all unit tests with coverage thresholds (fails if coverage drops below 75%)

Browser-level tests (Levels 2–4) are not part of the pre-commit hook — they run on-demand and before merges.

### When to run each level

| Trigger | What to run |
|---------|-------------|
| During development | `test:unit` or `test:integration` |
| Before merge / end of epic | `test:all` |
| Before major milestones | `test:all:browsers` |

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
