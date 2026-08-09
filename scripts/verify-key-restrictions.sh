#!/usr/bin/env bash
# Confirms that a key's application restriction is actually being enforced, and
# that it binds both auth forms (?key= and the X-GOOG-API-KEY header).
#
# Run with the key set to a restriction that should DENY you -- e.g. Websites
# pointing at an origin that is not yours, or IP set to 1.1.1.1. Every probe
# should be denied. Any 200 means that restriction is not binding.
#
# Key edits take a few minutes to propagate. A 200 immediately after saving may
# just be staleness; wait ~5 minutes and re-run before believing it.
#
# COST: denied probes are free. You are only billed if a probe succeeds, which
# is the outcome that means something is wrong anyway. Worst case 2.
#
# Usage:
#   KEY=AIza... ./scripts/verify-key-restrictions.sh
#
# Dan runs this. Do not read .env.local to obtain the key.

set -uo pipefail
: "${KEY:?set KEY to a live API key}"
ROOT="https://tile.googleapis.com/v1/3dtiles/root.json"

probe() {
  local label="$1"; shift
  local body status
  body=$(curl -sS -w '\n%{http_code}' "$@")
  status=$(printf '%s' "$body" | tail -n1)
  printf '  %-34s -> HTTP %s\n' "$label" "$status"
  [ "$status" = "200" ] && return
  printf '     %s\n' "$(printf '%s' "$body" | sed '$d' \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["error"]["message"])' 2>/dev/null \
    || echo '(unparseable body)')"
}

printf '\n\033[1mroot.json against a key expected to DENY\033[0m\n'
probe "query param (?key=)"          "$ROOT?key=$KEY"
probe "header (X-GOOG-API-KEY)"      -H "X-GOOG-API-KEY: $KEY" "$ROOT"

cat <<'EOF'

  both denied   -> restriction binds both auth forms. Verified 2026-08-07 with an
                   IP restriction; the header does NOT bypass restrictions, so
                   main.js can keep using it.

  header 200    -> the header bypasses this restriction type. main.js would need
                   to switch to ?key= for the lock to bind.

  both 200      -> the restriction is not in force. Re-check the console; it has
                   silently reset on this project before.
EOF
