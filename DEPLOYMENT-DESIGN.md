# Deployment design: gated key + cached session

**Status:** design agreed 2026-08-07, not yet built.
**Goal:** put the 3D view on a public URL for a handful of known people, without
exposing an API key that could run up an uncapped bill.

## Before you start (read this first)

State a new session will not infer from the code:

- **Do not read `.env.local`, and do not make API calls with Dan's key.** He
  deliberately munges the key when not testing, so what is in the file may be
  invalid. The verification scripts take `KEY` from the environment — hand him the
  command and let him run it.
- **Every successful `root.json` request costs money.** There is no spend cap on
  this account (see below). Denied requests are free, so probes that confirm a
  restriction is working cost nothing.
- **The key's restriction is currently IP-locked to Dan's home IP** from the
  2026-08-07 verification session. That works locally and will break the moment a
  function calls it from anywhere else. Part of implementing this is moving to the
  two-key setup described under *Architecture*.
- **"Websites" in the Google console is the HTTP-referrer restriction.** Same
  control, friendlier label. Restriction types are mutually exclusive: a key is
  none *or* Websites *or* IP *or* Android *or* iOS — never two.
- **There is no git remote.** The repo is local-only, so a git-connected
  Cloudflare build would need one created first.
- **`dist/` is gitignored** and the build is plain static files.
- `scripts/verify-tiles.sh` and `scripts/verify-key-restrictions.sh` re-run the
  2026-08-07 checks. They report raw HTTP codes without interpreting them, on
  purpose — the correct reading depends on the current restriction type.

## The constraint that shapes everything

Google will not give this account a spend cap. Quota editing is locked (likely the
90-day trial), and Billing → Budgets & alerts → spend caps only covers Cloud Run,
Cloud Run functions, Gemini and Vertex — **not Map Tiles**. The only Google-side
hard stop is a budget → Pub/Sub → Cloud Function that detaches billing entirely,
which is blunt and lags by hours.

So the cost bound has to be built, not configured.

## What was verified (2026-08-07)

| # | Question | Result |
|---|---|---|
| 1 | Does interaction refetch `root.json`? | **No.** `updateState` guards on `props.data !== oldProps.data`; `TILESET_URL` is a module constant. Exactly one per page load. Source-verified in `tile-3d-layer.ts:119-122`. |
| 2 | Is the session token portable to other clients? | **Yes.** A child tile fetched from an unrelated process with the same session returned 200. |
| 3 | Do child tiles work without a key? | **No** — 403. The browser must receive a key. |
| 4 | Does `X-GOOG-API-KEY` bypass application restrictions? | **No.** An IP restriction denied both header and `?key=` forms. The README's header rationale stands. |
| 5 | Are IP restrictions enforced? | **Yes** — denied at `1.1.1.1`, allowed at the real IP, with `Referer` irrelevant. |
| 6 | Are referrer restrictions enforced? | **Untested, and it does not matter** — referrer locks are forgeable either way. |
| 7 | Does the custom `fetch` see both root and child requests? | **Yes.** `loadOptions` flows into both `load()` and `new Tileset3D(...)`. |

Result 2 is the load-bearing one: it converts cost-per-visitor into cost-per-time.

## Architecture

Three pieces, one of which is new.

```
browser (static app)  ──1──>  gate function  ──2──>  tile.googleapis.com/root.json
        │                          │   (strong key, cached ~2.5h, counted)
        │                          └── counter store (atomic)
        └──3────────────────────────────────>  tile.googleapis.com/<child tiles>
                                                (client key, free, direct)
```

1. On its first tile request, the app calls the gate function.
2. On a cache miss, the function fetches `root.json` itself — **the only billable
   event in the system** — increments the counter, and caches the document.
3. The app fetches mesh tiles straight from Google. These are free and never
   touch the function.

The function is a gatekeeper and a cache, **not a proxy**. Tile bytes never flow
through it. That is only possible because of verification result 2.

### Two keys

| | Strong key | Client key |
|---|---|---|
| Held by | Function secret store | Delivered to browsers at runtime |
| Used for | `root.json` only | Child tiles only |
| Restriction | Websites → a private sentinel value the function forges | Websites → exact production origin |
| API restriction | Map Tiles only | Map Tiles only |
| Rotation | Edit one secret | Edit one secret, no rebuild |

Neither key is in the bundle, in git, or in a build artifact. The client key still
reaches browsers — unavoidable, per result 3 — but rotating it is a one-variable
edit precisely because it is delivered at runtime rather than baked at build time.

## Function behaviour

Single endpoint, `GET /api/tileset`.

**On request:**
1. If a cached tileset document exists and is younger than the TTL, return
   `{key, tileset}` **without incrementing** — no billable event occurred.
2. Otherwise, atomically check the counters. If either cap is exhausted, return
   `429`.
3. Otherwise fetch `root.json` from Google with the strong key and the forged
   `Referer`, increment both counters, cache the document, return `{key, tileset}`.

**Atomicity.** Steps 2–3 must be one critical section, or concurrent arrivals will
double-fetch and lose increments. A Durable Object is single-threaded per object
and gives this for free; its serialisation also collapses a thundering herd at TTL
expiry into one upstream fetch. Cloudflare KV is eventually consistent and is the
wrong primitive here.

**TTL: 2.5 hours.** Google guarantees "at least 3 hours"; the margin absorbs clock
skew and in-flight requests.

**Error contract.** `429` with
`{error: "quota_exhausted", scope: "daily"|"monthly", resetsAt: <ISO8601>}`.

**Counters: daily and monthly.** Monthly is the real budget (free tier is
1,000/month); daily stops one bad day eating the month.

Note what the counters are actually *for*. With caching, honest traffic cannot
exceed ~10/day regardless of visitor numbers, so the caps are not throttling users
— they are a backstop against a **bug in the caching path**, and a source for the
tripwire below.

## Client changes

**Keep `tilesEnabled` synchronous.** Replace the build-time key with a build-time
*endpoint*: `tilesEnabled = Boolean(VITE_TILES_ENDPOINT)`. Control visibility and
no-key mode keep working untouched. Leaving the variable unset gives the existing
free black-background dev mode.

**Branch inside the existing custom `fetch`** (`main.js:100`) rather than changing
`data`. Passing a parsed object as `data` does not work — `_loadTileset` calls
`load(url, ...)`, which wants a URL.

`isRootTileset(url)` is matching against `TILESET_URL`, which is
`https://tile.googleapis.com/v1/3dtiles/root.json`. Everything else that reaches
this `fetch` is a child tile.

```js
let clientKey = null;

fetch: async (url, options) => {
  if (isRootTileset(url)) {
    const r = await fetch(TILES_ENDPOINT);
    if (r.status === 429) { showQuotaBanner(await r.json()); return r; }
    const {key, tileset} = await r.json();
    clientKey = key;
    return new Response(JSON.stringify(tileset),
                        {headers: {'content-type': 'application/json'}});
  }
  return fetch(url, {...options,
    headers: {...options?.headers, 'X-GOOG-API-KEY': clientKey}});
}
```

Intercepting the fetch — rather than swapping `data` — also keeps child-URI
resolution correct for free. The tileset's child URIs are absolute paths
(`/v1/3dtiles/...`); deck.gl resolves them against `props.data`, which is still the
Google URL, so they continue to point at `tile.googleapis.com` with no rebasing.

**To verify during build:** that loaders.gl accepts a synthetic `Response` from a
custom `fetch`. Everything else here is confirmed.

**Quota-exhausted UI.** Reuse the existing `showBanner` path. Optional extension:
a bring-your-own-key box shown on `429`, feeding the same `clientKey` variable.

## Cost model

At a 2.5h TTL there are at most ~10 cache misses per day — **~300 billable
requests per month at absolute saturation, against a 1,000/month free tier,
regardless of how many people visit.** Realistic traffic from a handful of people
is a small fraction of that.

The bound comes from time, not from throttling. That is the property the account
cannot be configured to provide.

## Threat model

**Handled:** unbounded cost from ordinary traffic; anonymous extraction of a key
from a static bundle; a caching bug (caught by the counters); silent lapse of key
restrictions (caught by the tripwire).

**Not handled:** a visitor who extracts the client key from devtools can call
`root.json` themselves, forging a `Referer` to defeat the Websites lock, and the
counter never sees it. Referrer restrictions are forgeable by design; only IP
restrictions are not, and those need a stable egress IP that neither Workers nor
Cloud Run free tier provides.

**The tripwire.** The function knows exactly how many sessions it created. The
Cloud Console knows how many `root.json` requests were billed. **They should match.
Divergence means a leaked key — or a restriction that has silently lapsed**, which
has already happened once on this project. Given there is no spend cap, a check
that takes ten seconds is worth more than the locks it monitors.

Response to divergence: rotate the client key (one secret edit, no rebuild).

## Deployment mechanics

The build is plain static files; nothing here needs Node to *serve*, only to
build. Two ways to get them to Cloudflare:

**Direct upload** (`npx wrangler deploy` / `wrangler pages deploy dist`). Needs no
git remote, and the build happens on Dan's machine. Fastest path from here.

**Git-connected builds.** Needs a remote created first, then Cloudflare runs
`npm run build` itself. Historically this was unattractive because it meant giving
Cloudflare the API key as a build variable — **but this design removes that
objection entirely.** The only build-time value left is `VITE_TILES_ENDPOINT`,
which is not secret. The key is delivered at runtime from a secret store and never
enters a build artifact. CI builds become safe as a direct consequence.

**Recommended shape: a single Worker serving static assets, the `/api/tileset`
endpoint, and the Durable Object.** One deploy, one origin (so no CORS), one place
for secrets, and the DO binding is local rather than cross-project. A Pages
Function cannot define a Durable Object class, so the Pages route would mean two
deployables to keep in step.

Whichever origin you land on (`*.workers.dev`, `*.pages.dev`, or a custom domain),
the client key's Websites restriction must name **the exact production origin**.
Never use `*.pages.dev` — that pattern authorises every Cloudflare Pages site on
the internet. Preview deployments get their own hostnames and so will not match;
they will render in no-key mode, which is the desired behaviour anyway.

## Implementation order

Roughly dependency-ordered; each step is independently verifiable.

1. Stand the function up with a hardcoded fake key and no counter. Confirm the
   client can call it and that deck.gl accepts a synthetic `Response` — the one
   unverified assumption in this design.
2. Add the real strong key as a secret, plus the forged `Referer`. Confirm a live
   `root.json` fetch succeeds server-side.
3. Add the cache with its TTL. Confirm a second page load does *not* increment
   upstream requests.
4. Add the counters and the `429` path. Test by setting the cap to 1.
5. Split the keys, set both restrictions, and re-run `scripts/verify-tiles.sh`
   against the deployed origin as a config check.
6. Wire the tripwire: compare the function's session count against Cloud Console
   billable requests.

## Open decisions

1. **Where the function lives.** Cloudflare Worker + Durable Object (no card
   required, ~0ms cold start, but a second vendor) vs Cloud Run + Firestore
   (consolidates with Google billing, but 1–3s cold start sitting directly in
   front of first paint). Leaning Worker.
2. **Cap thresholds.** Suggest monthly 900, daily 40 — generous against a ~10/day
   ceiling, tight enough to catch a caching bug fast.
3. **Pages vs Worker-with-static-assets.** A Pages Function cannot define a
   Durable Object class, so it would be Pages plus a separate Worker, or a single
   Worker serving assets, API and DO. Confirm against current Cloudflare docs.

## Out of scope

Deliberately excluded, in rough priority order:

- **Tiles load before any data does** — every visitor spends a session even with
  no GeoJSON loaded. Real problem, acknowledged, deferred to the "full deploy".
- **No bundled sample data** — visitors must bring their own GeoJSON.
- **The Google logo**, which policy requires wherever tiles render. Still a
  blocker for anything genuinely public.
- **Short-lived client keys** minted per cache refresh via GCP's API Keys API.
  Genuinely stronger, but needs service-account credentials inside the function.
- **Full tile relay**, which would hide the client key entirely at the cost of
  relaying every mesh tile byte.
