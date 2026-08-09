import {DurableObject} from 'cloudflare:workers';

import {fetchRoot} from './google.js';
import {capsFor, exhausted, rollPeriods} from './quota.js';

// Google guarantees the session token inside the document for at least three
// hours. The margin absorbs clock skew and requests already in flight when one
// expires.
const TTL_MS = 2.5 * 60 * 60 * 1000;

// Holds the one document everything else is derived from. Serving it from here
// is what converts cost-per-visitor into cost-per-TTL: the session token inside
// it works from any client, so a single fetch serves everyone until it expires.
//
// Cloudflare instantiates this by matching the class_name in wrangler.jsonc
// against the entry point's exports, which is why index.js re-exports it without
// ever constructing one. The base class supplies this.env and this.ctx, whose
// .storage is per-object and durable: it holds structured values rather than
// text, and survives the instance being evicted between requests.
export class TilesetCache extends DurableObject {
  // The refresh currently in flight, if any. Being single-threaded is not
  // enough on its own: only storage operations hold incoming events off, so
  // awaiting a network fetch lets other requests interleave. Without sharing
  // one promise, a burst arriving at expiry would each start its own fetch.
  #refreshing = null;

  // Failures come back as values rather than thrown, so the reason survives the
  // trip back across the RPC boundary.
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
