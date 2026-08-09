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
// This file is the HTTP surface. The shared document lives in cache.js, the
// upstream call in google.js, and the limits in quota.js. See README.md for
// where each configured value is defined.

// Cloudflare resolves the class_name in wrangler.jsonc against this module's
// exports, so the Durable Object has to leave from here even though nothing in
// this file constructs one.
export {TilesetCache} from './cache.js';

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

    return handleTileset(request, env);
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

async function handleTileset(request, env) {
  // Secrets live in the dashboard, so a freshly deployed Worker can be running
  // with none of them set. A missing secret and a key Google rejected look
  // identical from the browser, so name the missing one instead. Checked before
  // the origin, or a Worker with no ALLOWED_ORIGIN would refuse every caller
  // and report it as their fault.
  for (const name of ['ROOT_TILES_KEY', 'MESH_TILES_KEY', 'ALLOWED_ORIGIN']) {
    if (!env[name]) return json({error: 'misconfigured', missing: name}, 500, env);
  }

  // The reply carries MESH_TILES_KEY, so anyone who can call this can take a
  // key. The CORS header already named one origin but only asked browsers to
  // enforce it; nothing stopped a script. Browsers attach Origin to every
  // cross-origin fetch, so requiring it costs the site nothing and makes the
  // endpoint something you have to deliberately forge rather than something you
  // can paste into a terminal.
  //
  // Not a security boundary — the header is trivially set by hand, and no
  // header could be one. It removes the drive-by, which is the whole claim.
  if (request.headers.get('Origin') !== env.ALLOWED_ORIGIN) {
    return json({error: 'forbidden'}, 403, env);
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
