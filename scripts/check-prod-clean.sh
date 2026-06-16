#!/usr/bin/env bash
# Prod-cleanliness gate for the profiling epic.
#
# The profiling-instrumentation epic's load-bearing constraint: profiling code
# must be ABSENT from the prod bundle (dist/nomad-path.js), terser-DCE'd away.
# This greps the prod bundle for strings unique to OUR profiling code.
#
# IMPORTANT: do NOT grep generic strings like `performance.measure`,
# `performance.mark`, or `once("render"` — those appear in the vendored MapLibre
# blob and are false positives. MapLibre never emits a `nomadpath.`-prefixed
# measure name, so our strings are reliable discriminators.
#
# Usage: npm run build:lib && bash scripts/check-prod-clean.sh
set -euo pipefail

BUNDLE="dist/nomad-path.js"
[ -f "$BUNDLE" ] || { echo "ERROR: $BUNDLE not found — run 'npm run build:lib' first."; exit 1; }

# Strings unique to our profiling code. Every one must be absent from prod.
STRINGS=(
  "nomadpath."             # every one of our performance.measure names
  "firstFrame"             # the to-first-frame measure suffix
  "measureToFirstFrame"    # the MapEngine render-wiring helper
  "profileWithDetail"      # the detail-carrying primitive
  "segmentsByTrack"        # segment-count map (DCE'd if profiling-only)
  "visibleSegmentCount"    # segment-count getter (DCE'd if profiling-only)
)

fail=0
for s in "${STRINGS[@]}"; do
  n=$(grep -c -F "$s" "$BUNDLE" || true)
  if [ "$n" = "0" ]; then
    printf "  %-24s ABSENT ✓\n" "$s"
  else
    printf "  %-24s PRESENT(%s) ✗ LEAK\n" "$s" "$n"
    fail=1
  fi
done

if [ "$fail" = "1" ]; then
  echo "PROD-CLEAN GATE FAILED: profiling code leaked into $BUNDLE"
  exit 1
fi
echo "PROD-CLEAN GATE PASSED: $BUNDLE is free of profiling code"
