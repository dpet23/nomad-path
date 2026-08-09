# Tileset Worker

Hands a browser a Google 3D Tiles root document plus a key for the mesh tiles it
points at. Deployed by Cloudflare from this directory on push; see `DEPLOY.md` at
the repo root for the setup steps.

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

## Request flow

`GET /api/tileset` is the only route.

1. Check every required secret and variable is set.
2. Resolve the one cache object and ask it for the document.
3. Cached and younger than the TTL -> return it, no upstream call, no cost.
4. Otherwise fetch `root.json` from Google, store it, return it.

Replies:

| Field | Meaning |
|---|---|
| `meshKey` | the key for mesh tiles |
| `tileset` | the root document, exactly as Google served it |
| `cached` | whether this reply cost anything |
| `fetchedAt` | when the cached document was fetched |

`cached` and `fetchedAt` exist because the document is identical either way. Two
requests returning `cached: false` twice means the cache is broken, and without
these fields that would only show up in billing a day later.

Errors are `{error, ...}` with a `502` for upstream problems and a `500` for a
missing secret. The key never appears in a response body or a log line.

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
| `export class TilesetCache` | Nothing imports it. Cloudflare instantiates it by matching `class_name` in `wrangler.jsonc`. |
| `this.ctx` / `this.env` | Supplied by the `DurableObject` base class, never assigned here. |
| `ctx.storage` | Per-object and durable. Holds structured values rather than text, and survives the instance being evicted. |
| Input gates | Only *storage* operations hold incoming events off. Awaiting a network fetch lets other requests interleave — which is why an in-flight refresh is shared through one promise rather than relying on the object being single-threaded. |

## Where everything is defined

| Value | Kind | Defined in | Read by |
|---|---|---|---|
| `ROOT_TILES_KEY` | secret | Cloudflare dashboard | `fetchRoot` |
| `MESH_TILES_KEY` | secret | Cloudflare dashboard | the reply body |
| `ROOT_TILES_REFERER` | secret | Cloudflare dashboard | `fetchRoot` |
| `ALLOWED_ORIGIN` | variable | `wrangler.jsonc` | `json()`, as the CORS header |
| `TILESET_CACHE` | binding | `wrangler.jsonc` | `handleTileset` |
| `name` | Worker name | `wrangler.jsonc` | must equal the dashboard's, or the build fails |
| `TILESET_URL` | constant | `src/index.js` | `fetchRoot` |
| `TTL_MS` | constant | `src/index.js` | `TilesetCache` |
| `/api/tileset` | route | `src/index.js` | must match the path in `VITE_TILES_ENDPOINT` |
| `VITE_TILES_ENDPOINT` | build variable | Pages build config | `src/main.js`, in the site |

Two of these are duplicated rather than shared, because the site and the Worker
are separate deployables built from different roots:

* `TILESET_URL` is defined here **and** in `src/main.js`, which needs it to
  recognise the root request and to stamp the synthetic response.
* `/api/tileset` is a literal here and the tail of `VITE_TILES_ENDPOINT` there.

**Secrets are never edited in `wrangler.jsonc`.** Plain variables are, and a
deploy deletes every variable not present in that file — so a dashboard edit to
one would silently revert on the next push. Secrets survive deploys, which is why
the keys are secrets and `ALLOWED_ORIGIN` is not.
