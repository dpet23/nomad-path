#!/usr/bin/env bash
# Probes the Map Tiles API to confirm the assumptions DEPLOYMENT-DESIGN.md rests on.
#
# Reports raw HTTP codes and does NOT interpret them, because the correct reading
# depends on which application restriction the key currently has (none / Websites /
# IP). An earlier version of this script hardcoded referrer-specific conclusions
# and produced two rounds of wrong answers. Read the codes yourself.
#
# COST: at most 3 billable requests (each successful root.json fetch is one).
# Denied requests are free, so the "restriction is working" outcomes cost nothing.
#
# Usage:
#   KEY=AIza... ORIGIN=https://your-site.example ./scripts/verify-tiles.sh
#
# Dan runs this. Do not read .env.local to obtain the key.

set -uo pipefail
: "${KEY:?set KEY to a live API key}"
: "${ORIGIN:=http://localhost:5173}"

ROOT="https://tile.googleapis.com/v1/3dtiles/root.json"
BASE="https://tile.googleapis.com"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

hr()   { printf '\n\033[1m%s\033[0m\n' "$*"; }
code() { printf '  %-50s -> HTTP %s\n' "$1" "$2"; }

hr "Baseline: root.json, header auth, Referer $ORIGIN   [billable if 200]"
S=$(curl -sS -o "$TMP/root.json" -w '%{http_code}' \
      -H "Referer: $ORIGIN/" -H "X-GOOG-API-KEY: $KEY" "$ROOT")
code "root.json" "$S"
if [ "$S" != "200" ]; then
  echo "  cannot continue. body:"; head -c 400 "$TMP/root.json"; echo; exit 1
fi

read -r CHILD SESSION < <(python3 - "$TMP/root.json" <<'PY'
import json,sys,urllib.parse
d=json.load(open(sys.argv[1]))
def walk(n):
    c=n.get('content',{}).get('uri')
    if c: yield c
    for k in n.get('children',[]) or []: yield from walk(k)
uri=next(walk(d['root']),None)
if not uri: print(''); raise SystemExit
q=urllib.parse.parse_qs(urllib.parse.urlparse(uri).query)
print(uri, q.get('session',[''])[0])
PY
)
[ -n "${CHILD:-}" ] || { echo "  no child URI in tileset"; exit 1; }
echo "  session: ${SESSION:0:12}…"
CHILD_URL="$BASE$CHILD"

hr "Child tiles (free -- never billable)"
code "session only, no key" \
  "$(curl -sS -o /dev/null -w '%{http_code}' -H "Referer: $ORIGIN/" "$CHILD_URL")"
code "key + session, fresh client" \
  "$(curl -sS -o /dev/null -w '%{http_code}' -H "Referer: $ORIGIN/" -H "X-GOOG-API-KEY: $KEY" "$CHILD_URL")"
code "key + session, foreign referer" \
  "$(curl -sS -o /dev/null -w '%{http_code}' -H "Referer: https://evil.example.com/" -H "X-GOOG-API-KEY: $KEY" "$CHILD_URL")"

hr "root.json under other referers   [each 200 is billable]"
code "no Referer (server-to-server)" \
  "$(curl -sS -o /dev/null -w '%{http_code}' -H "X-GOOG-API-KEY: $KEY" "$ROOT")"
code "foreign Referer" \
  "$(curl -sS -o /dev/null -w '%{http_code}' -H "Referer: https://evil.example.com/" -H "X-GOOG-API-KEY: $KEY" "$ROOT")"

cat <<'EOF'

Reading the results -- check the key's application restriction first:

  Restriction = None
      Everything returns 200. Says nothing about enforcement. Set a restriction
      before drawing any conclusion.

  Restriction = Websites (the console's name for HTTP referrer)
      Baseline should pass and the two foreign/absent-Referer root.json probes
      should be denied. If they are not, the restriction has not saved -- it has
      silently lapsed on this project once before.

  Restriction = IP
      Referer is irrelevant; everything passes from an allowed IP and nothing
      passes from elsewhere.

Established regardless of restriction (see DEPLOYMENT-DESIGN.md):
  - child tile with session but no key -> 403, so browsers need a key
  - child tile with key + session from a fresh client -> 200, so the session is
    portable, which is what makes the cached-tileset design work
EOF
