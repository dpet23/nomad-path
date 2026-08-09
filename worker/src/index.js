// A Cloudflare Worker, deployed from this directory by Cloudflare's Git
// integration, which hands a browser a Google 3D Tiles root document along with
// a key for the mesh tiles hanging off it.
//
// A tileset is a root document plus the mesh tiles it points at, and each has
// its own key. ROOT_TILES_KEY fetches the root document — the single billable
// request in the system — and never leaves this Worker. MESH_TILES_KEY goes to
// the browser, which fetches mesh tiles with it directly from Google; those are
// free. This is not a proxy: tile bytes must never be relayed through here.
//
// Cost is therefore bounded by how often the root document is refreshed rather
// than by how many people visit.
//
// See README.md in this directory for where each value is configured.

import {DurableObject} from 'cloudflare:workers';

import {capsFor, exhausted, rollPeriods} from './quota.js';

const TILESET_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json';

// Google guarantees the session token inside the document for at least three
// hours. The margin absorbs clock skew and requests already in flight when one
// expires.
const TTL_MS = 2.5 * 60 * 60 * 1000;

// Cloudflare's entry point. Exporting a default object with a fetch method is
// what registers it — nothing here calls it. `env` is injected per request and
// carries three things that look alike: dashboard secrets, wrangler.jsonc
// variables, and bindings to other resources.
export default {
  async fetch(request, env) {
    const {pathname} = new URL(request.url);

    if (pathname !== '/api/tileset') {
      return new Response('Not found\n', {status: 404});
    }
    // Plain GET, no custom request headers — anything more would make the
    // browser issue a CORS preflight against this cross-origin call.
    if (request.method !== 'GET') {
      return new Response('Method not allowed\n', {status: 405, headers: {allow: 'GET'}});
    }

    return handleTileset(env);
  }
};

// `env` is threaded through for a single header: the page is served from a
// different origin to this Worker, so every reply has to name that origin.
function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': env.ALLOWED_ORIGIN,
      // The browser must not keep a copy: a cached key outlives the restriction
      // that makes it safe to hand out.
      'cache-control': 'no-store'
    }
  });
}

async function handleTileset(env) {
  // Secrets live in the dashboard, so a freshly deployed Worker can be running
  // with none of them set. A missing secret and a key Google rejected look
  // identical from the browser, so name the missing one instead.
  for (const name of ['ROOT_TILES_KEY', 'MESH_TILES_KEY', 'ALLOWED_ORIGIN']) {
    if (!env[name]) return json({error: 'misconfigured', missing: name}, 500, env);
  }

  // TILESET_CACHE is the binding named in wrangler.jsonc. idFromName hashes a
  // string to an object ID deterministically, so every request, from anywhere,
  // resolves 'root' to that same one instance — and a single shared instance is
  // what collapses a burst of arrivals into one upstream fetch. What .get()
  // returns is a stub, not the object: calling a method on it is a remote call
  // to wherever the object lives, with the return value serialised back.
  const cache = env.TILESET_CACHE.get(env.TILESET_CACHE.idFromName('root'));
  const result = await cache.tileset();

  // Hitting a cap does not mean the site got popular — the caps sit far above
  // what cached traffic can reach — so it means the cache stopped working.
  if (result.error === 'quota_exhausted') {
    return json({error: result.error, scope: result.scope, resetsAt: result.resetsAt}, 429, env);
  }
  if (!result.ok) return json({error: result.error, status: result.status}, 502, env);

  return json(
    {
      meshKey: env.MESH_TILES_KEY,
      tileset: result.tileset,
      // Whether this reply cost anything. The document is identical either way,
      // so without this there is no way to tell a working cache from a broken
      // one short of reading billing a day later.
      cached: result.cached,
      fetchedAt: new Date(result.fetchedAt).toISOString()
    },
    200,
    env
  );
}

// Holds the one document everything else is derived from. Serving it from here
// is what converts cost-per-visitor into cost-per-TTL: the session token inside
// it works from any client, so a single fetch serves everyone until it expires.
//
// Nothing imports this class. Cloudflare instantiates it by matching the
// class_name in wrangler.jsonc, which is also where its storage backend is
// declared. The base class supplies this.env and this.ctx, whose .storage is
// per-object and durable: it holds structured values rather than text, and
// survives the instance being evicted between requests.
export class TilesetCache extends DurableObject {
  // The refresh currently in flight, if any. Being single-threaded is not
  // enough on its own: only storage operations hold incoming events off, so
  // awaiting a network fetch lets other requests interleave. Without sharing
  // one promise, a burst arriving at expiry would each start its own fetch.
  #refreshing = null;

  // Failures come back as values rather than thrown, so the reason survives the
  // trip across the RPC boundary above.
  async tileset() {
    const entry = await this.ctx.storage.get('tileset');
    if (entry && Date.now() - entry.fetchedAt < TTL_MS) {
      return {ok: true, tileset: entry.tileset, fetchedAt: entry.fetchedAt, cached: true};
    }

    // Reading and assigning in one synchronous step is what makes this safe:
    // nothing can be delivered between the two halves.
    const isRefresher = this.#refreshing === null;
    this.#refreshing ??= this.#refresh();
    const result = await this.#refreshing;

    // Everyone waiting shared one upstream request, so only the caller that
    // started it reports having caused one. That keeps this field meaning the
    // same thing a count of billable requests would.
    return isRefresher || !result.ok ? result : {...result, cached: true};
  }

  // Counts and stored document move together, and only one refresh runs at a
  // time, so a count can never be lost to a concurrent one.
  async #refresh() {
    try {
      const now = new Date();
      const counts = rollPeriods(await this.ctx.storage.get('counters'), now);

      const spent = exhausted(counts, now, capsFor(this.env));
      if (spent) return {ok: false, error: 'quota_exhausted', ...spent};

      const fetched = await fetchRoot(this.env);
      if (!fetched.ok) return fetched;

      // Only a request Google actually served is counted: a rejected one is
      // not billed, and counting it would overstate how close the cap is.
      const fetchedAt = Date.now();
      await this.ctx.storage.put({
        tileset: {tileset: fetched.tileset, fetchedAt},
        counters: {...counts, dayCount: counts.dayCount + 1, monthCount: counts.monthCount + 1}
      });
      return {ok: true, tileset: fetched.tileset, fetchedAt, cached: false};
    } finally {
      // Cleared even on failure, or one failed fetch would wedge every later
      // caller onto the same rejected promise.
      this.#refreshing = null;
    }
  }
}

// The one billable request in the system.
async function fetchRoot(env) {
  let upstream;
  try {
    upstream = await fetch(TILESET_URL, {
      headers: {
        // Header rather than ?key=, which keeps the key out of URLs and so out
        // of logs. It does not bypass the key's restrictions — those bind both
        // forms equally.
        'X-GOOG-API-KEY': env.ROOT_TILES_KEY,
        // ROOT_TILES_KEY is restricted to a referrer nobody can hold: a random
        // subdomain of .invalid, which RFC 2606 reserves so it can never be
        // registered. A key lifted from a log line or a screenshot is useless
        // without it. Not a second factor — whoever can read the key in the
        // Google console can read its allowed referrer on the same screen.
        ...(env.ROOT_TILES_REFERER && {Referer: env.ROOT_TILES_REFERER})
      }
    });
  } catch (e) {
    console.log(`root.json fetch threw: ${e.message}`);
    return {ok: false, error: 'upstream_unreachable'};
  }

  if (!upstream.ok) {
    // Status only. A rejected request can quote back what was sent, and this
    // key must never reach a log line or a response body.
    console.log(`root.json upstream ${upstream.status}`);
    return {ok: false, error: 'upstream_failed', status: upstream.status};
  }

  try {
    return {ok: true, tileset: await upstream.json()};
  } catch {
    return {ok: false, error: 'upstream_not_json'};
  }
}
