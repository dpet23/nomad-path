// Hands a browser a Google 3D Tiles root document plus a key for the mesh tiles
// that hang off it. Only the root request is billed, and only this Worker holds
// a key permitted to make it, so total cost is bounded by how often this runs
// rather than by how many people visit.
//
// A gate, not a proxy: the session token inside the root document works from any
// client, so browsers fetch mesh tiles straight from Google. Tile bytes must
// never be relayed through here.

const TILESET_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json';

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
  // An unset secret and a rejected key look identical from the browser, so name
  // the missing one rather than surfacing it as an upstream failure.
  for (const name of ['GOOGLE_TILES_KEY', 'CLIENT_KEY', 'ALLOWED_ORIGIN']) {
    if (!env[name]) return json({error: 'misconfigured', missing: name}, 500, env);
  }

  let upstream;
  try {
    upstream = await fetch(TILESET_URL, {
      headers: {
        'X-GOOG-API-KEY': env.GOOGLE_TILES_KEY,
        // This key is restricted to a referrer nobody can hold: a random
        // subdomain of .invalid, which RFC 2606 reserves so it can never be
        // registered. A key lifted from a log line or a screenshot is useless
        // without it. Not a second factor — whoever can read the key in the
        // Google console can read its allowed referrer on the same screen.
        ...(env.REFERER_SENTINEL && {Referer: env.REFERER_SENTINEL})
      }
    });
  } catch (e) {
    console.log(`root.json fetch threw: ${e.message}`);
    return json({error: 'upstream_unreachable'}, 502, env);
  }

  if (!upstream.ok) {
    // Status only. A rejected request can quote back what was sent, and this
    // key must never reach a log line or a response body.
    console.log(`root.json upstream ${upstream.status}`);
    return json({error: 'upstream_failed', status: upstream.status}, 502, env);
  }

  let tileset;
  try {
    tileset = await upstream.json();
  } catch {
    return json({error: 'upstream_not_json'}, 502, env);
  }

  return json({key: env.CLIENT_KEY, tileset}, 200, env);
}
