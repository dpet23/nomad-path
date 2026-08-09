// Everything this Worker asks of Google. One request, and it is the only thing
// in the system that costs money: the mesh tiles the browser goes on to fetch
// from the returned document are free.

const TILESET_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json';

// Failures come back as values rather than thrown, so the reason survives the
// Durable Object RPC boundary this is called from behind.
export async function fetchRoot(env) {
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
