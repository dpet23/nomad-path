# Tileset Worker

Hands a browser a Google 3D Tiles root document plus a key for the mesh tiles it
points at. Deployed by Cloudflare from this directory on push; see `DEPLOY.md` at
the repo root for the setup steps.

```sh
npm test    # the cap logic; no network, no deploy
```

| File | Responsibility |
|---|---|
| `src/index.js` | HTTP surface: routing, CORS, the reply shape |
| `src/cache.js` | The shared document, as a Durable Object |
| `src/google.js` | The one upstream call |
| `src/quota.js` | The caps, and the only part with tests |

## Why it exists

A tileset is a root document plus the mesh tiles hanging off it. **Only the root
request is billed.** The session token inside the root document works from any
client, so one fetch of it serves every visitor until it expires.

That is what this Worker sells: it fetches the root document, caches it, and
hands out the document plus a key. Browsers then fetch mesh tiles straight from
Google, for free. Tile bytes never pass through here — relaying them would turn a
fixed cost into a per-visitor one.

Cost is bounded by **how often the document is refreshed**, not by how many
people visit. At a 2.5 hour TTL that is at most ~10 billable requests a day
regardless of traffic, against a free tier of 1,000 a month.

## Two keys

| | `ROOT_TILES_KEY` | `MESH_TILES_KEY` |
|---|---|---|
| Fetches | `root.json` | mesh tiles |
| Billed | yes | no |
| Held by | this Worker only | delivered to browsers at runtime |
| Restriction | Websites -> `ROOT_TILES_REFERER` | Websites -> the site's origin |

Both are restricted to the Map Tiles API. Google's restriction types are mutually
exclusive, so a key is unrestricted *or* Websites *or* IP — never two.

`ROOT_TILES_REFERER` is a random subdomain of `.invalid`, a namespace RFC 2606
reserves so it can never be registered. Requests carry it as a `Referer`, and the
key is locked to it, so a key lifted from a log line or a screenshot is useless on
its own. It is not a second factor: whoever can read the key in the Google console
can read its allowed referrer on the same screen.

## `GET /api/tileset`

1. Check every required secret and variable is set.
2. Check the request carries `Origin: ALLOWED_ORIGIN`, or refuse with `403`.
3. Resolve the one cache object and ask it for the document.
4. Cached and younger than the TTL -> return it, no upstream call, no cost.
5. Otherwise check the counters, fetch `root.json`, count it, store it, return it.

Step 2 is friction, not a boundary. Browsers attach `Origin` to every cross-origin
fetch, so the site pays nothing for it, while a script has to set the header on
purpose. That turns the endpoint from something anyone can paste into a terminal
into something someone has to mean. `curl` needs `-H "Origin: <the site>"`, which
is why every check below sends one.

| Field | Meaning |
|---|---|
| `meshKey` | the key for mesh tiles |
| `tileset` | the root document, exactly as Google served it |
| `cached` | whether this reply cost anything |
| `fetchedAt` | when the cached document was fetched |

`cached` and `fetchedAt` exist because the document is identical either way. Two
requests both returning `cached: false` means the cache is broken, and without
these fields that would only surface in billing a day later.

Errors are `{error, ...}`: `502` upstream, `500` for a missing secret, `403` for a
request that did not come from the site, `429` when a cap is spent. The keys never
appear in a response body or a log line.

## Counters and caps

| Cap | Value | Why |
|---|---|---|
| Monthly | 900 | Google's free tier is 1,000 root requests a month |
| Daily | 40 | Stops one bad day eating the month |

**These are not throttling.** With the cache working, honest traffic cannot come
near them however many people visit — at a 2.5 hour TTL the ceiling is ~10 a day.
So a `429` does not mean the site got popular, it means the caching path broke.
That is also why there is no bring-your-own-key box on `429`: it would let
visitors route around the one failure worth noticing.

Both caps are dashboard variables, so one can be retuned — or dropped to 1 to
prove the `429` path — without a commit and a deploy. `keep_vars` in
`wrangler.jsonc` is what stops a deploy wiping them.

Periods are keyed on UTC. Google bills on US/Pacific, so a Google day can overlap
two of ours and allow up to twice the daily cap. Nothing compares these counts to
a bill, so that drift does not matter, and 80 in a day is still far inside the
monthly allowance.

## What the counters do not cover

A visitor who takes `MESH_TILES_KEY` out of devtools can call Google directly.
That traffic never reaches this Worker, so the counters never see it and the caps
never stop it. Referrer restrictions are forgeable by design; only IP restrictions
are not, and Workers has no stable egress IP to pin one to. The `Origin` check on
the endpoint does not help here either — by then the key is already out.

The caps guard against **one** thing: this Worker's own cache failing and it
starting to fetch on every request. That is worth guarding, and it is the whole
of what they do.

Nor do they cover the plan's own ceiling. Workers Free allows
[100,000 requests a day](https://developers.cloudflare.com/workers/platform/limits/);
past that Cloudflare stops running this Worker, the site's fetch fails, and it
falls back to no-tiles mode with a banner. Honest traffic will not approach that
number — one request per visitor who opens a file — but nothing here rate-limits,
so a single machine in a loop can spend the day's allowance.

That is accepted rather than solved. The failure costs no money and no data: the
site keeps working without a basemap until UTC midnight. The lever, if it ever
becomes worth pulling, is Cloudflare's rate limiting binding — a `ratelimits`
block in `wrangler.jsonc` keyed on `cf-connecting-ip`. Worth knowing before
reaching for it: the limit is per Cloudflare location rather than global, and the
documentation calls the API "permissive, eventually consistent, and intentionally
designed to not be used as an accurate accounting system". It would stop one
machine in a loop and nothing more organised than that.

## Platform mechanics

The parts that are not visible in the code itself.

| Thing | How it actually works |
|---|---|
| `export default {fetch}` | Cloudflare's entry point. Exporting it *is* the registration; nothing in the code calls it. |
| `env` | Injected per request. Holds three lookalike kinds of thing: dashboard secrets, `wrangler.jsonc` variables, and resource bindings. |
| `env.TILESET_CACHE` | A binding, resolved by name from `wrangler.jsonc`. Rename it in one place and it is `undefined` in the other, with no error until runtime. |
| `idFromName('root')` | Hashes a string to an object ID, deterministically. Every request everywhere resolves `'root'` to the same single instance — that is how the cache is shared. |
| `.get(id)` | Returns a *stub*, not the object. The object may not exist yet; it is created on first use. |
| `await cache.tileset()` | Looks local, is remote. An RPC to wherever the object lives, with the return value serialised back. Works only because the class extends `DurableObject`. |
| `export class TilesetCache` | Nothing constructs it. Cloudflare instantiates it by matching `class_name` in `wrangler.jsonc` against the **entry point's** exports — which is why `index.js` re-exports it from `cache.js`. |
| `this.ctx` / `this.env` | Supplied by the `DurableObject` base class, never assigned here. |
| `ctx.storage` | Per-object and durable. Holds structured values rather than text, and survives the instance being evicted. |
| Input gates | Only *storage* operations hold incoming events off. Awaiting a network fetch lets other requests interleave — which is why an in-flight refresh is shared through one promise rather than relying on the object being single-threaded. |

## Where everything is defined

| Value | Kind | Defined in | Read by |
|---|---|---|---|
| `ROOT_TILES_KEY` | secret | Cloudflare dashboard | `fetchRoot` |
| `MESH_TILES_KEY` | secret | Cloudflare dashboard | the reply body |
| `ROOT_TILES_REFERER` | secret | Cloudflare dashboard | `fetchRoot` |
| `DAILY_CAP`, `MONTHLY_CAP` | variables | Cloudflare dashboard, defaults in `src/quota.js` | `TilesetCache` |
| `ALLOWED_ORIGIN` | variable | `wrangler.jsonc` | `json()`, as the CORS header |
| `TILESET_CACHE` | binding | `wrangler.jsonc` | `handleTileset` |
| `name` | Worker name | `wrangler.jsonc` | must equal the dashboard's, or the build fails |
| `TILESET_URL` | constant | `src/google.js` | `fetchRoot` |
| `TTL_MS` | constant | `src/cache.js` | `TilesetCache` |
| `/api/tileset` | route | `src/index.js` | must match the path in `VITE_TILES_ENDPOINT` |
| `VITE_TILES_ENDPOINT` | build variable | Pages build config | `src/main.js`, in the site |

Two of these are duplicated rather than shared, because the site and the Worker
are separate deployables built from different roots:

* `TILESET_URL` is defined here **and** in `src/main.js`, which needs it to
  recognise the root request and to stamp the synthetic response.
* `/api/tileset` is a literal here and the tail of `VITE_TILES_ENDPOINT` there.

**Secrets are never put in `wrangler.jsonc`** — it is committed. Secrets survive
deploys untouched. Plain variables do not: a deploy deletes any not listed in that
file, which is why `keep_vars` is set, and why the caps are absent from it. A
variable listed there is overwritten from the file on every deploy, so anything
meant to be dashboard-editable must not appear in it.
