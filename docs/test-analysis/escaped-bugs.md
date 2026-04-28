# Escaped bugs log

**Started:** 2026-04-28 (Epic 10 Phase 1.5).

This file logs bugs that were found by manual testing or in production rather than by the automated test suite. Each entry tags the test layer that *should* have caught the bug.

The purpose is to accumulate evidence over time about which test layer is failing to catch real bugs. After 6–10 entries this becomes evidence-based input for a future "restructure or not" decision on the test suite, without forcing one now and without relying on retrospective recall.

This is **not** a bug tracker. Bugs go in the regular issue/commit flow. This file is specifically about *tests-that-should-have-caught*. Bugs that are out of test scope (e.g. real-mobile-Safari-only rendering issues, third-party tile noise) are still logged here with the layer marked `none — out of test scope`, so the count is honest.

## Format

One bullet per bug. Add new entries to the top (reverse chronological).

```
- YYYY-MM-DD — symptom: <one-line description>. Found via: <how>.
  Layer that should have caught it: <P-Unit | P-Integration | L-Unit | L-Integration | Seam | Watcher | none — out of test scope>. Notes: <optional>.
```

Test layer reference (from Epic 10 framework, see `~/.claude/projects/-home-dan-code-nomad-path/memory/project_epic10_testing_remediation.md`):

- **P-Unit** — pipeline module in isolation
- **P-Integration** — `build-trip-data.js` spawned against a temp filesystem
- **L-Unit** — library module in isolation, mocks for collaborators
- **L-Integration** — library in real browser given known-good static fixture
- **Seam** — library in real browser given pipeline-actually-produced output
- **Watcher** — `watch.js` end-to-end as a process

## Entries

<!-- Add new entries below this line, most recent first. -->
