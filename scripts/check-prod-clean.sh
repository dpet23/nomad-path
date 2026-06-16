#!/usr/bin/env bash
# Prod-cleanliness gate for the profiling epic.
#
# The epic's load-bearing constraint: profiling LOGIC and STRINGS must be ABSENT
# from the prod bundle (dist/nomad-path.js), terser-DCE'd away. This greps the
# prod bundle for strings unique to OUR profiling code.
#
# IMPORTANT — two classes of "profiling code":
#   1. Profiling LOGIC + STRINGS (measure names, the segment-counting loop, the
#      render-wiring helper). These MUST be fully absent — a hit is a real leak.
#   2. Inert minified IDENTIFIERS. terser cannot drop TypeScript class field/
#      method *declarations*, so a gated, profiling-only getter collapses to a
#      bare `get visibleSegmentCount(){return 0}` and the field to `_segmentsByTrack;`.
#      These carry NO logic and NO profiling strings — they are the irreducible
#      floor and are acceptable (the plan sanctions "the getter may remain").
#
# Do NOT grep generic strings like `performance.measure`/`once("render"` —
# those appear in the vendored MapLibre blob and are false positives.
#
# Usage: npm run build:lib && bash scripts/check-prod-clean.sh
set -euo pipefail

BUNDLE="dist/nomad-path.js"
[ -f "$BUNDLE" ] || { echo "ERROR: $BUNDLE not found — run 'npm run build:lib' first."; exit 1; }

fail=0

# --- Class 1: profiling logic + strings. Any hit is a real leak. ---
# Strings unique to our profiling code that must NEVER appear in prod.
LEAK_STRINGS=(
  "nomadpath."             # every one of our performance.measure names
  "firstFrame"             # the to-first-frame measure suffix
  "measureToFirstFrame"    # the MapEngine render-wiring helper
  "profileWithDetail"      # the detail-carrying primitive
)
# The segment-counting LOOP body (the actual work, not the inert getter). If the
# count population survives, `.set(` is called on the counts map.
LEAK_LOGIC=(
  "segmentsByTrack.set"        # the per-track accumulation loop
  "_segmentsByTrack.get"       # the getter's live summation (folds to `return 0` when gated)
)

for s in "${LEAK_STRINGS[@]}" "${LEAK_LOGIC[@]}"; do
  n=$(grep -c -F "$s" "$BUNDLE" || true)
  if [ "$n" = "0" ]; then
    printf "  %-24s ABSENT ✓\n" "$s"
  else
    printf "  %-24s PRESENT(%s) ✗ LEAK\n" "$s" "$n"
    fail=1
  fi
done

# --- Class 2: confirm the getter is the folded constant, not real logic. ---
# A surviving `visibleSegmentCount` identifier is fine ONLY if its body folded to
# the no-op constant. If it contains a loop/summation, the gate failed to DCE.
if grep -qF "visibleSegmentCount" "$BUNDLE"; then
  if grep -qE 'visibleSegmentCount\(\)\{return 0\}' "$BUNDLE"; then
    printf "  %-24s inert (return 0) ✓\n" "visibleSegmentCount"
  else
    printf "  %-24s PRESENT with logic ✗ LEAK\n" "visibleSegmentCount"
    fail=1
  fi
fi

if [ "$fail" = "1" ]; then
  echo "PROD-CLEAN GATE FAILED: profiling logic/strings leaked into $BUNDLE"
  exit 1
fi
echo "PROD-CLEAN GATE PASSED: $BUNDLE is free of profiling logic and strings"
