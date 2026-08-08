# Gated key + cached session — implementation plan

> Derived from `DEPLOYMENT-DESIGN.md` (design agreed 2026-08-07). Plan written
> 2026-08-08, against a deployment that now exists. Read the design doc first;
> this document does not restate its reasoning, only its consequences.

**Goal:** deliver a Google Maps API key to a public browser without exposing an
uncapped bill, by making the only billable request happen inside a Worker that
caches it and counts it.

**Tech:** Cloudflare Pages (the existing static site), a new Cloudflare Worker
with one SQLite-backed Durable Object, two Google Maps API keys, deck.gl /
loaders.gl on the client. Everything is built by Cloudflare on push; nothing in
this plan is built or uploaded from a local machine.

---

## The five invariants

Every task below is in service of these. When a step feels arbitrary, check it
against this list — if it isn't protecting one of these, it probably shouldn't
be in the plan.

| | Invariant | What violates it |
|---|---|---|
| **I1** | At most one billable `root.json` fetch per TTL window, no matter how many people visit. | A cache miss on every request; a cache keyed per-visitor; a lost increment. |
| **I2** | In the deployed path, no key is in git, in the bundle, or in a build artifact. | Putting a key in a build variable; committing the sentinel; logging a key. |
| **I3** | The local direct-key path (`.env.local` + `npm run build`) behaves exactly as it does today. | Replacing `VITE_GOOGLE_MAPS_API_KEY` instead of adding alongside it. |
| **I4** | Tile bytes never flow through the Worker. It is a gate and a cache, not a proxy. | "Just relay the child tiles too" — that is the explicitly out-of-scope design. |
| **I5** | Any failure — gate down, `429`, upstream error — degrades to the existing no-tiles rendering, never to a broken page. | Treating `tilesEnabled` as the answer to "did the gate work". |

**The cost bound comes from time, not from throttling.** That sentence is the
whole design. The counters are not there to limit users; they are there to
detect that the cache broke.

---

## Decisions this plan makes

The design doc predates the deployment, so a handful of things it leaves open are
settled here rather than discovered mid-task. These are **decided, not pending** —
each is written into the task that acts on it. They are listed together only so
that a later reader can see the reasoning without reconstructing it.

| | Question the design leaves open | Decision | Acted on in |
|---|---|---|---|
| **D1** | Does Cloudflare Access break the browser → gate call? | **No, and don't let it.** Per `DEPLOY.md` step 3, Access is configured on the *Pages application* only. The gate Worker is a new, separate deployable and is not behind Access unless someone adds it. A page behind Access calling a Worker that isn't is an ordinary cross-origin `GET`. **Do not put Access in front of the Worker** — a service token means custom request headers, which means a preflight, which kills the design's "plain `GET`" property, all to protect a key browsers receive anyway. | Task 3 |
| **D2** | How do you verify the cache before counters exist? | Return `cached` / `fetchedAt` from the gate. Design step 3 says "confirm a second page load does not increment upstream requests", but the counters arrive in step 4 and Cloud Console metrics lag hours. One extra field turns a next-day check into a five-second one, and it stays in permanently as cache-regression signal. | Task 5 |
| **D3** | One key can't be both IP-locked and Websites-locked. So how many keys? | **Three.** The existing IP-locked key stays exactly as it is and remains local-dev only, matching `DEPLOY.md`'s "`VITE_GOOGLE_MAPS_API_KEY`: never on Pages". Strong and client keys are both new. This is one more key than the design's table, and it is the option that touches nothing currently working. *This is the one item you may want to override — the alternative is folding local dev into the client key by adding `http://localhost:5173/*` to its Websites list, which is not a real weakening (referrer locks are forgeable by design) but couples a client-key rotation to your local setup breaking.* | Task 2 |
| **D4** | Two Cloudflare builds from one repo. | Scope the Workers build to the Worker's config path so it does not run the site's `npm run build`. Also: Pages here needs **build system v3** (`DEPLOY.md` troubleshooting) — Vite 7 won't build on v2's Node 18. Expect to set the same on the Worker build. | Task 3 |
| **D5** | How is the Worker tested? | Unit-test the Pacific boundary math; verify everything else by loading the page. That is not laziness — the boundary math is the only part with behaviour you cannot see from a page load, and it is also the part most likely to be quietly wrong. | Task 6 |
| **D6** | `resetsAt` across DST. | `America/Los_Angeles` via `Intl`, never a fixed −8. A tripwire that is an hour wrong twice a year gets ignored. | Task 6 |
| **D7** | The tripwire's Cloud Console side. | Stays manual — there is no API wired up. It becomes a documented habit in `DEPLOY.md`, or it does not happen. | Task 9 |

**The one input I cannot derive:** the literal production hostname.
`DEPLOY.md` anonymises it as `<name>.pages.dev` throughout, and it is not
otherwise in the repo. It is needed character-for-character in two places that
must match — the client key's Websites restriction and the Worker's
`Access-Control-Allow-Origin`. Paste it once and it is unblocked:

`PROD_ORIGIN = ` _______________________

Still out of scope, unchanged from the design, and the reason the site stays
gated: tiles load before any data does, no bundled sample data, and the Google
logo attribution.

---

## Task order at a glance

```
Task 0  record PROD_ORIGIN                        (one string from you)
Task 1  client rewrite, additive, endpoint unset  (deploys, behaviour unchanged)
Task 2  create both keys in Google console        (you)
──────── design steps 1 and 2 — one sitting ────────
Task 3  gate Worker v1: fetch + return, no cache  (strong key unrestricted)
Task 4  sentinel restriction + forged Referer     (closes the exposure window)
────────────────────────────────────────────────────
Task 5  cache + TTL + cache-status
Task 6  counters, Pacific clock, 429, /api/stats
Task 7  exercise the client 429 path built in Task 1
Task 8  re-run verify scripts against prod        (you)
Task 9  tripwire + DEPLOY.md
```

Tasks 3 and 4 are one sitting. Between them the strong key exists with **no
application restriction** and **no spend cap behind it**. That gap buys an
unambiguous reading of Task 4 and nothing else. Do not stop for lunch in it.

---

## Task 0: Record `PROD_ORIGIN`

**Produces:** one string, written into this file. No code, no dashboards to
reason about — `DEPLOY.md` already settled the rest (see *Decisions*, D1–D7).

- [ ] **Step 1: Paste the literal production origin,** scheme included:
`https://<name>.pages.dev`. Not the pattern — the exact string, because the
client key's Websites restriction and the Worker's `Access-Control-Allow-Origin`
must match it character-for-character. An exact `*.pages.dev` *hostname* is fine;
the `*.pages.dev` *wildcard* is not, since it authorises every Pages site on the
internet.

- [ ] **Step 2: Fill it into the *Decisions* section above and commit.**

```bash
git add DEPLOYMENT-PLAN.md
git commit -m "Record the production origin the gate and client key must name"
```

**The key inventory (D3) is decided — three keys, existing IP-locked key
untouched.** Override it here if you'd rather fold local dev into the client key;
otherwise nothing else in this task needs your input.

---

## Task 1: Client rewrite (additive, dormant)

**Produces:** a deployed site that behaves *exactly* as it does today, containing
a root-request branch that is inert because `VITE_TILES_ENDPOINT` is unset. This
is the "before step 1" work in the design.

**Files:** `src/main.js` (the custom `fetch` is around line 100), plus wherever
`tilesEnabled`, `TILESET_URL`, `showBanner` and the `TerrainExtension` guards
live. `.env.example`.

**Read before editing.** This plan was written from the design doc alone, so the
exact shape of the edits depends on code I have not read. Before writing any of
it: read the custom `fetch`, the `tilesEnabled` definition and every one of its
readers, the `TerrainExtension` guards, and the startup banner. The design's code
block below is the *target shape*, not a patch to paste.

**Big picture at this point:** nothing about cost or keys changes in this task.
You are opening a seam. The test of success is that **nothing observable
changes** — that is invariant I3, and it is the reason this is additive rather
than a replacement.

- [ ] **Step 1: Add `TILES_ENDPOINT` next to the existing key constant.**

`TILES_ENDPOINT` from `VITE_TILES_ENDPOINT`. `tilesEnabled` becomes true if
*either* it or `VITE_GOOGLE_MAPS_API_KEY` is set. Both unset still gives the free
black-background mode.

- [ ] **Step 2: Add module state.**

```js
let clientKey = GOOGLE_MAPS_API_KEY ?? null;   // build key, or null
const isRootTileset = (url) => url === TILESET_URL;
```

Initialising `clientKey` from the build key is what makes the child-tile branch
identical in both modes (I3). Only the root branch differs.

- [ ] **Step 3: Add the root branch to the custom `fetch`, gated on the endpoint.**

From the design, verbatim in shape:

```js
fetch: async (url, options) => {
  if (TILES_ENDPOINT && isRootTileset(url)) {
    const r = await fetch(TILES_ENDPOINT);
    if (r.status === 429) { showQuotaBanner(await r.json()); return r; }
    const {key, tileset} = await r.json();
    clientKey = key;
    const synthetic = new Response(JSON.stringify(tileset),
                                   {headers: {'content-type': 'application/json'}});
    // Required — a constructed Response has url === '', which breaks
    // tileset-vs-tile detection, basePath, and child URI resolution.
    Object.defineProperty(synthetic, 'url', {value: TILESET_URL});
    return synthetic;
  }
  return fetch(url, {...options,
    headers: {...options?.headers, 'X-GOOG-API-KEY': clientKey}});
}
```

The `Object.defineProperty` line is not optional and not cosmetic — see the
design's *Client changes* for the three separate things it fixes. If shadowing
the getter proves awkward, `isResponse` is duck-typed, so a plain object exposing
`arrayBuffer`/`text`/`json` plus the real `url` works equally well.

- [ ] **Step 4: Add runtime no-tiles state, separate from `tilesEnabled` (I5).**

`tilesEnabled` answers "is a gate configured". It cannot answer "did the gate
work". Add separate runtime state that a gate failure or `429` sets, which
rebuilds the layers into the render-without-tiles mode. It must also feed the
`TerrainExtension` guards that currently read `tilesEnabled` — those are the ones
that will throw if tiles are absent but the guard says otherwise.

- [ ] **Step 5: Update the startup banner.** It currently assumes a missing key
is the only reason tiles are off. There are now three: no key and no endpoint,
gate failure, and `429`.

- [ ] **Step 6: Add `VITE_TILES_ENDPOINT` to `.env.example`** with a comment that
leaving it unset is the local direct-key path.

- [ ] **Step 7: Verify the direct path locally (I3).** Build and run with your
existing `.env.local` key and no endpoint set. Tiles must render exactly as
before. **This is the only test in the plan you can run without spending money on
a new session** — the key is IP-locked to you and the request is one you already
make today.

- [ ] **Step 8: Commit and push.** Pages builds. With `VITE_TILES_ENDPOINT` unset
in the Pages build configuration, the deployed site renders in the existing
no-tiles mode. Load it and confirm it is unchanged — that is the whole test.

```bash
git add src/ .env.example
git commit -m "Add dormant gate path to the tile fetch, keeping the direct-key path intact"
```

**Stop and rethink if:** the deployed site changes behaviour at all. Additive
means additive; anything visible here means `tilesEnabled` or the child branch
was touched when it shouldn't have been.

---

## Task 2: Create both keys (manual — you)

**Produces:** two new API keys in the Google console. **Do this in the console;
I will not touch keys, and per the design's standing instruction I will not read
`.env.local` or make API calls with your key.**

- [ ] **Step 1: Create the strong key.** API restriction: **Map Tiles only**.
Application restriction: **none, deliberately, for now.** It gets its sentinel in
Task 4, and the gap between is what makes Task 4's result readable.

- [ ] **Step 2: Create the client key.** API restriction: **Map Tiles only**.
Application restriction: **Websites → exactly `PROD_ORIGIN` from Task 0.**

Restrict it now, not later. This key is what browsers receive from the gate's
first working response in Task 3; there is no point at which restricting it
afterwards is the correct order.

- [ ] **Step 3: Leave the existing IP-locked key alone** (D3). It stays your
local-dev key, IP-locked, in `.env.local`, never on Pages. Both keys above are
new.

- [ ] **Step 4: Hold both new keys ready for Task 3's secret store.** They go into
the Cloudflare dashboard, never into the repo, never into a message to me (I2).

---

## Task 3: Gate Worker v1 — `/api/tileset`

**Produces:** a deployed Worker that fetches `root.json` with the strong key and
returns `{key, tileset}`, plus a Pages site pointed at it that renders tiles.
This is design step 1.

**No cache. No counters.** A page that renders proves four things at once: the
Worker deploys, the upstream fetch works, the client interception fires, and the
synthetic `Response` survives loaders.gl. That is the entire point of building it
in this order.

**Big picture at this point:** you are at maximum exposure. The strong key is
unrestricted, every page load is a billable request, and there is no cap. Task 4
follows immediately.

**Files:** create `worker/` (or equivalent) with the Worker source and a
committed Wrangler config whose `name` matches the Worker you create in the
dashboard. Cloudflare's Workers builds require that file or the build fails; it
is a manifest, not the CLI.

- [ ] **Step 1: Write the Worker.**

`GET /api/tileset`:
- fetch `https://tile.googleapis.com/v1/3dtiles/root.json` with the strong key
- return `{key: <client key>, tileset: <document>}` as JSON
- `Access-Control-Allow-Origin: <PROD_ORIGIN>` — exact, not `*`
- on upstream failure return a non-200 the client's I5 path can act on
- **never log either key, and never include the strong key in an error body**

Secrets read from the environment: the strong key and the client key. Both set in
the dashboard.

- [ ] **Step 2: Write the Wrangler config.** `name` must match the dashboard
Worker exactly. No secrets in it. Nothing here needs a Durable Object yet —
that arrives in Task 6 — but if you are declaring the migration now, the class
must be **SQLite-backed** (`new_sqlite_classes`), which is what makes Durable
Objects available on the free plan.

- [ ] **Step 3: Commit and push.**

```bash
git add worker/
git commit -m "Add gate Worker returning the tileset document and client key"
```

- [ ] **Step 4 (you): Create the Worker in the Cloudflare dashboard and connect
it to this repo.** Per D4: scope the Workers build to the Worker's config path so
it does not run the site's `npm run build`, and set build system **v3** if it
offers a choice — v2's Node 18 is what breaks Vite 7 on the Pages side. **Do not
add Access to this Worker** (D1). Confirm the Pages build still succeeds on the
same push; if the two builds fight, every later step's signal is contaminated.

- [ ] **Step 5 (you): Set the two secrets in the dashboard.**

- [ ] **Step 6 (you): Set `VITE_TILES_ENDPOINT` in the Pages build
configuration** to the Worker's `/api/tileset` URL, and trigger a rebuild. This
is a non-secret tuning value; it lives in the build config rather than in source
precisely because the gate's hostname is a thing external change can force.

- [ ] **Step 7: Load the deployed page.** Tiles should render.

**Reading the result:** tiles render → all four mechanisms work. Nothing renders
→ check in this order: does `/api/tileset` return JSON in a browser tab (Worker +
upstream), does the page's request to it succeed (CORS, or G1 — Access), does the
client branch fire at all (endpoint variable reached the build). A 403 from
Google here means the strong key's API restriction, not its application
restriction, because it has none yet.

---

## Task 4: Sentinel restriction and forged `Referer`

**Produces:** a strong key that is useless to anyone who steals it in isolation,
and an answer to the design's one genuinely open fact — whether the Workers
runtime lets an outbound `fetch` set `Referer`. Browsers forbid it; Cloudflare's
docs don't say either way. This is design step 2.

**Same sitting as Task 3.** This is what closes the exposure window.

- [ ] **Step 1 (you): Add the sentinel as a Worker secret.**
`https://<random-hex>.invalid/*`. Generate fresh random hex. It is a secret, not
config — the repo is public-ish and a committed sentinel is a public sentinel,
which beside a leaked key is just an unrestricted key.

- [ ] **Step 2: Have the Worker send it as `Referer`** on the upstream fetch,
read from that secret. Commit and push.

- [ ] **Step 3 (you): Add the Websites restriction to the strong key** in the
Google console, naming the same sentinel value.

- [ ] **Step 4: Load the deployed page again.**

**Reading the result — and nothing else changed between the two loads, which is
what makes this unambiguous:**

- **Still working** → Workers can set `Referer`, *and* the restriction binds.
  Both facts, one observation.
- **Denied (403)** → forging doesn't work in this runtime. Remove the Websites
  restriction from the strong key; it falls back to unrestricted-but-secret,
  which is where Task 3 left it. Not a failure of the design — the threat model
  already says the sentinel is worth having, not worth trusting. Record the
  result and move to Task 5.

**Do not** change the sentinel and the Worker code in separate pushes with a page
load in between; that reintroduces the ambiguity this step is built to avoid.

---

## Task 5: Cache and TTL

**Produces:** invariant I1. Before this task the system costs money per visitor;
after it, per unit of time. This is the task the whole design exists for.

Design step 3, **plus the fix for G2.**

- [ ] **Step 1: Add the Durable Object.** One object, holding the cached document
and its fetch timestamp. SQLite-backed class, declared in the Wrangler config
migration. A Durable Object is single-threaded per object, which is what makes
the check-then-fetch a real critical section and collapses a thundering herd at
TTL expiry into one upstream fetch. **Cloudflare KV is eventually consistent and
is the wrong primitive here** — if you find yourself reaching for it because the
DO is fiddly, that is the moment to stop.

- [ ] **Step 2: TTL = 2.5 hours.** Google guarantees "at least 3 hours"; the
margin absorbs clock skew and in-flight requests. On a hit, return
`{key, tileset}` from cache with **no upstream fetch**.

- [ ] **Step 3: Add a cache-status field to the response (D2).**

Something like `cached: true|false` and `fetchedAt: <ISO8601>`. Without it, Task
5 has no verification: the counters that design step 3 assumes you can watch do
not exist until Task 6, and Cloud Console metrics lag by hours and aggregate
coarsely. This field costs one line and makes the next step a five-second check
instead of a next-day one. It is not debug scaffolding — leave it in; it is also
what makes a cache regression visible later.

- [ ] **Step 4: Push, then load the page twice.** First load: `cached: false`.
Second load: `cached: true`, `fetchedAt` unchanged. **That second load is the
proof of I1.** Then hard-reload in a fresh private window to confirm the cache is
global to the Worker and not per-browser.

**Stop and rethink if:** `cached` is false on the second load. Do not proceed to
counters — a broken cache with counters on top just means you hit the daily cap
and conclude the caps are wrong.

---

## Task 6: Counters, Pacific clock, `429`, `/api/stats`

**Produces:** the backstop and the tripwire's data source. Design step 4.

**Remember what these are for.** With the cache working, honest traffic cannot
exceed ~10/day regardless of visitor numbers. The caps are not throttling users —
they are a backstop against a bug in the caching path, and the source for the
tripwire. A `429` in production does not mean demand; it means Task 5 broke.

- [ ] **Step 1: Write unit tests for the Pacific boundary math first (D5, D6).**

This is the one part of the Worker that is genuinely unit-testable without
deploying, and the part most likely to be quietly wrong. Test at minimum: an
instant just before and just after a daily boundary; the same for a monthly
boundary; and an instant inside each DST transition. Use
`America/Los_Angeles` via `Intl`, never a fixed −8 offset.

- [ ] **Step 2: Implement daily and monthly counters in the Durable Object.**

Both roll on **Google's clock (US/Pacific), not UTC** — the tripwire compares our
count against what the Cloud Console says was billed, and a tripwire that is
permanently a little wrong around every boundary is a tripwire that gets ignored.

- [ ] **Step 3: Make check-and-increment one critical section with the fetch.**

Order, from the design:
1. Cache hit and younger than TTL → return **without incrementing**. No billable
   event occurred, so no increment is correct — not an optimisation.
2. Otherwise check the counters atomically; if either cap is exhausted → `429`.
3. Otherwise fetch, increment **both** counters, cache, return.

Steps 2–3 must not be separable, or concurrent arrivals double-fetch and lose
increments.

- [ ] **Step 4: Caps — monthly 900, daily 40.** Monthly is the real budget (free
tier is 1,000/month); daily stops one bad day eating the month.

- [ ] **Step 5: Error contract, exactly.**

```json
{"error": "quota_exhausted", "scope": "daily", "resetsAt": "<ISO8601>"}
```

`scope` is `"daily"` or `"monthly"`. `resetsAt` is the next Pacific boundary as
an **absolute instant**, so the client needs no timezone logic.

- [ ] **Step 6: Add `GET /api/stats`,** returning the counters, guarded by a
token held as a Worker secret. Not public: the counters are a demand signal and a
leak indicator. A token needs no new infrastructure and no login.

- [ ] **Step 7: Push and verify.** Run the unit tests, then confirm `/api/stats`
answers with the token and refuses without it.

---

## Task 7: Exercise the client `429` path

**Produces:** confirmation that the runtime no-tiles state built in Task 1 Step 4
actually fires. **It has never been executed until now** — this is the
cross-task thread most likely to be dropped, because the code was written six
tasks ago in a different context.

- [ ] **Step 1 (you): Temporarily set the daily cap to 1.**

- [ ] **Step 2: Load the page twice.** Second load gets `429`.

- [ ] **Step 3: Confirm the page still works** — quota banner shown, map renders
without tiles, no console errors, `TerrainExtension` guards behaving. That is
invariant I5.

- [ ] **Step 4 (you): Restore the caps to 40 / 900.**

**Note:** no bring-your-own-key box on `429`. It is deliberately out (design
decision 5) — at these caps a `429` means the caching path is broken, and a key
box would let visitors route around the one failure worth noticing. The
`clientKey` variable stays mutable so the box remains purely additive later.

---

## Task 8: Re-run the verification scripts against production

**Produces:** a configuration check on restrictions set several tasks ago, when
you had other things on your mind. Design step 5.

- [ ] **Step 1 (you): Run `scripts/verify-key-restrictions.sh` and
`scripts/verify-tiles.sh`** with `KEY` in the environment.

I will hand you the commands; I will not run them, and I will not read
`.env.local`. The scripts report raw HTTP codes without interpreting them, on
purpose — the correct reading depends on which key you are testing and what
restriction type it currently has, so state which key each run is using before
reading the codes.

- [ ] **Step 2: Confirm each key denies what it should.** Denied requests are
free, so the negative probes cost nothing. The client key should refuse a request
carrying a `Referer` other than `PROD_ORIGIN`; the strong key should refuse
anything not carrying the sentinel (if Task 4 succeeded).

---

## Task 9: Tripwire and runbook

**Produces:** the only thing standing between a leaked key and an uncapped bill.

**Why it matters more than the locks:** the Worker knows exactly how many
sessions it created. The Cloud Console knows how many `root.json` requests were
billed. **They should match. Divergence means a leaked key — or a restriction
that has silently lapsed, which has already happened once on this project.** With
no spend cap available on this account, a check that takes ten seconds is worth
more than the locks it monitors.

- [ ] **Step 1: Document the check in `DEPLOY.md`** (D7): hit `/api/stats` with
the token, read billable Map Tiles requests in the Cloud Console for the same
Pacific period, compare. This side is manual — there is no API wired up, so it is
a habit, and writing it down is what makes it one.

- [ ] **Step 2: Document the response to divergence:** rotate the client key.
One secret edit in the dashboard, **no rebuild** — which is the entire reason the
key is delivered at runtime rather than baked at build time (I2).

- [ ] **Step 3: Update `DEPLOY.md`** with the second deployable, both build
configurations, the full secret inventory, and the rollback path for each.
Following the existing convention there: write what was actually done, arrow-path
style for procedures, tables for reference. Do not invent dashboard walkthroughs
for screens you did not see.

- [ ] **Step 4: Update `DEPLOYMENT-DESIGN.md`'s status line** and record the Task
4 outcome — whether Workers can forge `Referer` is a fact this project learned
and should not have to re-derive.

- [ ] **Step 5: Revisit Cloudflare Access.** It is scaffolding. Removing it is
gated on the out-of-scope list — the Google logo especially — not on this plan.
Note that explicitly so the next session doesn't assume the gate Worker made the
site publishable. It didn't; it made it affordable.

---

## What I need from you, collected

| When | What |
|---|---|
| Task 0 | The exact `PROD_ORIGIN` string. That's the only input; everything else is decided (D1–D7) |
| Task 2 | Create both keys in the Google console with the stated restrictions |
| Task 3 | Create the Worker in the dashboard, connect it to git, set two secrets, set `VITE_TILES_ENDPOINT` in the Pages build config, load the page |
| Task 4 | Generate and set the sentinel secret, add the Websites restriction, load the page |
| Task 5 | Load the page twice, once in a fresh private window |
| Task 6 | Nothing (I can push and test) |
| Task 7 | Set the daily cap to 1, load twice, restore |
| Task 8 | Run both verify scripts with `KEY` in the environment |

Everything else is code I write and Cloudflare builds on push.
