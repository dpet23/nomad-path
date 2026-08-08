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
- **Deployment is git-connected.** Cloudflare builds on push. Nothing is built or
  uploaded from a local machine, and no step of this design runs locally. The git
  layout is Dan's and is already arranged; don't reason about it.
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
| 8 | Does loaders.gl accept a `Response` the client constructed? | **Only if it carries a `url`.** A bare `new Response(json)` has `url === ''`, which breaks tileset detection *and* child-URI resolution. Fixable in one line — see *Client changes*. |

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

**The sentinel: `https://<random-hex>.invalid/*`.** Websites restrictions must
carry a scheme, and wildcards work only as a leading subdomain or a trailing path,
never mid-URL. Google documents no check that the domain resolves. `.invalid` is
reserved by RFC 2606 and can never be registered, so unlike a plausible-looking
`.com` nobody can take it out from under you, and it reads as deliberate rather
than as a typo.

**It lives in the Worker's secret store, not the committed Wrangler config.** The
repo is on GitHub and builds are git-connected; a committed sentinel is a public
sentinel, and a public sentinel beside a leaked key is just an unrestricted key.

**What it does and does not buy.** It is not a second factor: the sentinel is
stored in the Google console *as the key's restriction*, so anyone who can read the
key there can read its allowed referrer too. What it defeats is a strong key
obtained on its own — from a log line, an error body, a screenshot, a stray paste —
which is the realistic leak. Worth having; not worth trusting.

Note this is a deliberate deviation: Google recommends IP restrictions for
server-side keys and does not endorse referrer restrictions there. The reason to
deviate is the one already stated — no stable egress IP on Workers.

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

Both this and `VITE_MAX_SCREEN_SPACE_ERROR` stay build *variables* rather than
source constants, and since Cloudflare runs the build they live in the Pages
project's build configuration. Neither is secret, so the reason isn't secrecy —
it's that these are values external change can force. The gate's hostname moving,
or a tile-quality retune, should be a dashboard edit and a rebuild, not a commit
in the repo's history.

**Failure is separate from configuration.** `tilesEnabled` answers "is a gate
configured"; it cannot answer "did the gate work". The `429` path and any upstream
failure need their own runtime state that drops the app back to the
render-without-tiles mode. That path already exists — only its trigger is new.

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
    const synthetic = new Response(JSON.stringify(tileset),
                                   {headers: {'content-type': 'application/json'}});
    // Required — see below. A constructed Response has url === ''.
    Object.defineProperty(synthetic, 'url', {value: TILESET_URL});
    return synthetic;
  }
  return fetch(url, {...options,
    headers: {...options?.headers, 'X-GOOG-API-KEY': clientKey}});
}
```

**The synthetic `Response` must carry a `url`.** This was the design's one
unverified assumption, and the naive form of it is wrong: child URIs do *not*
resolve against `props.data`. They resolve against the URL loaders.gl reads off
the response object, and a constructed `Response` has `url === ''`. The chain:

- `parse()` sets `context.url = getResourceUrl(data)`, which for a `Response`
  returns `resource.url`.
- `Tiles3DLoader.parse` decides tileset-vs-tile with
  `context?.url && context.url.indexOf('.json') !== -1`. An empty string is
  falsy, so it routes to `parseTile()` and tries to read the tileset JSON as a
  binary tile.
- Past that, `parseTileset` takes `context?.url || ''` and derives `basePath`
  from it, and header normalisation does ``new URL(uri, `${basePath}/`)`` —
  resolving `/v1/3dtiles/...` against `"/"`, which throws.

Setting `url` on the response fixes all three at once: detection, `basePath`, and
child resolution all behave exactly as if Google had served the document.
`isResponse` is duck-typed (`instanceof Response` **or** an object exposing
`arrayBuffer`/`text`/`json`), so a response-shaped plain object carrying the real
URL works equally well if shadowing the getter proves awkward.

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

Reading the count: a `/api/stats` route on the same Worker returns the counters,
guarded by a token held as a secret. The counters are a demand signal and a leak
indicator, so they don't belong on a public route; a token needs no new
infrastructure and no login.

Response to divergence: rotate the client key (one secret edit, no rebuild).

## Deployment mechanics

**Two deployables, both built by Cloudflare on push. Nothing is built or uploaded
locally.**

**The site: Cloudflare Pages.** Cloudflare runs `npm run build` and serves `dist/`.
Historically git-connected builds were unattractive because they meant handing
Cloudflare the API key as a build variable — **this design removes that objection
entirely.** No key enters a build artifact; the key is delivered at runtime from a
secret store. What remains are non-secret tuning values, so CI builds are safe as a
direct consequence.

**The gate: a separate Worker** holding `/api/tileset`, the strong key, and the
Durable Object. Also deployed from git — Cloudflare's Workers builds require a
committed Wrangler config file whose `name` matches the Worker in the dashboard, or
the build fails. That config file is a manifest, not the CLI; no local `wrangler`
is involved. Secrets are set in the dashboard, never in the repo, which is what the
strong key needs anyway.

The cost of two deployables is that the page calls the gate cross-origin, so
`/api/tileset` must return `Access-Control-Allow-Origin` naming the Pages origin.
It stays a plain `GET` with no custom request headers, so no preflight arises.

The client key's Websites restriction must name **the exact Pages origin** — the
page is what browsers send as `Referer` on child-tile requests, so the Worker's own
hostname is irrelevant here.
Never use `*.pages.dev` — that pattern authorises every Cloudflare Pages site on
the internet. Preview deployments get their own hostnames and so will not match;
they will render in no-key mode, which is the desired behaviour anyway.

## Implementation order

Roughly dependency-ordered; each step is independently verifiable.

No step is a throwaway: there is no fake-key round, because the assumption it
existed to test has since been settled by reading loaders.gl directly.

0. **Confirm the Workers runtime lets an outbound `fetch` set `Referer`.** Browsers
   forbid it as a protected header; Workers are not browsers, but Cloudflare's docs
   don't say either way. A Worker that calls any header-echo endpoint and returns
   what arrived settles it — no Google key, no cost. Do this *before* creating
   keys: if `Referer` is stripped, the sentinel scheme cannot work and the strong
   key falls back to unrestricted-but-secret, which changes what you create.
1. Stand the function up with the real strong key as a secret and the forged
   `Referer`, no cache and no counter. Confirm a live `root.json` fetch succeeds
   server-side and that the client renders from it.
2. Add the cache with its TTL. Confirm a second page load does *not* increment
   upstream requests.
3. Add the counters and the `429` path. Test by setting the cap to 1.
4. Set both restrictions and re-run `scripts/verify-tiles.sh` against the deployed
   origin as a config check.
5. Wire the tripwire: compare the function's session count against Cloud Console
   billable requests.

**Both keys are created before step 1**, not split out later. The function has to
return *some* key from its first working deploy, and if only the strong key exists
at that point then the strong key is what lands in browser devtools — the precise
outcome the split exists to prevent.

## Decisions

1. **Where the function lives.** Cloudflare Worker + Durable Object. Durable
   Objects are available on the Workers free plan provided the class is
   SQLite-backed, which this state (one document, two integers) is comfortably
   within. Cloud Run + Firestore was the alternative; its 1–3s cold start sits
   directly in front of first paint, which the Worker's does not.
2. **Cap thresholds.** Monthly 900, daily 40.
3. **Pages vs Worker-with-static-assets.** Pages serves the site; the gate is its
   own Worker. Two deployables, and the cross-origin call that follows, in
   exchange for keeping the site's hosting and the gate independent.

4. **The sentinel.** A random subdomain of `.invalid`, held as a Worker secret.
   Reasoning under *Two keys*.
5. **The bring-your-own-key box** on `429` — **out**, with the seam left in place.
   UI is not part of this deployment, and `clientKey` is already a mutable variable
   so the box stays purely additive. The stronger reason is that at these caps a
   `429` does not mean demand, it means the caching path is broken — a key box
   would let visitors route around the one failure worth noticing.

Nothing is open. The only unsettled *fact* is whether Workers can forge `Referer`,
which is step 0 of the implementation order.

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
