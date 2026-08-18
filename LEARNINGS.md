# Learnings: from this spike to a MapLibre + deck.gl multi-basemap app

Context: this spike renders GPS holiday tracks (GeoJSON with per-point
`properties.elevations`) over Google Photorealistic 3D Tiles with deck.gl. The next
app reads the same GeoJSON in a MapLibre + deck.gl stack with switchable basemaps —
OSM and NASA Blue Marble, MapLibre's standard 2D view by default, its globe
projection for long-haul flights, possibly MapLibre terrain, and the Google 3D tiles
view as a separate view. These are the lessons that transfer, and the ones that
don't.

## Architecture: split data processing from rendering

Nearly everything in this spike divides into **basemap-independent data processing**
and **basemap-specific rendering**. The new app should make that split explicit:

- **Shared data module** (ports verbatim from `src/main.js`): GeoJSON → track model.
  Zipping `properties.elevations` into coordinate z (with the length-mismatch
  guard), longitude unwrapping, dynamic transport-mode palette assignment, per-mode
  counts. None of it knows what a basemap is.
- **Per-view layer builders**: pure functions of (track model, UI state, view
  capabilities) → deck layers. The spike's `buildLayers()` + `setProps({layers})`
  pattern transfers directly; `MapboxOverlay` exposes the identical `setProps` API.
- **Views**: MapLibre 2D and MapLibre globe are the *same view* with a projection
  toggle (deck's `MapboxOverlay` fully supports MapLibre's globe projection);
  MapLibre terrain is a third mode of that view. The Google 3D tiles view stays a
  standalone `Deck` owning its own camera, exactly like this spike.

## Antimeridian: unwrap in the data layer, mirror per view

The hardest-won lessons in the spike, generalized:

- **Longitude unwrapping** (consecutive point deltas kept < 180° so a crossing track
  runs 179.8 → 180.2, not 179.8 → −179.8) is the portable core fix. Always do it, in
  the data layer. Without it, crossing flights render as world-spanning horizontal
  lines.
- **±360° mirror copies belong in the per-view layer builders, not the data model.**
  This spike bakes them into app state, which is fine for one view but wrong for
  many: flat/mercator views need them (deck overlay layers don't repeat with
  MapLibre's world copies), while the globe has no seam — lon 203° *is* −157° — so
  mirrors there would double-draw. Emit mirrors only for flat projections, and
  always exclude copies from legend counts, stats, and camera fitting (each of those
  broke once here before being filtered).
- **Camera fitting** needs the dual-framing bbox trick (compute the bounds in raw
  [−180,180] and shifted [0,360) framings, use whichever is narrower) in any view,
  and must run on *unmirrored* geometry. MapLibre's `fitBounds` copes with
  antimeridian-crossing bounds better than raw math, but the framing question
  doesn't disappear.
- Upgrade to look forward to: under MapLibre the basemap repeats across the seam
  (`renderWorldCopies`), so mirrored tracks get real map beneath them. In the Google
  3D tiles view the basemap ends at ±180° and crossing tracks fly over black void —
  a limit this spike documents but doesn't solve. (deck's `MapView({repeat: true})`
  might solve it there and make mirrors unnecessary; untested on real hardware — see
  "Verification" below for why the first test was misleading.)

## Elevation: a per-basemap negotiation, not a data property

- GPS altitude is roughly MSL. Google's photorealistic mesh sits at
  ellipsoid-referenced heights, so tracks disagree with it by the local geoid offset
  (~10–30 m) plus GPS error — hence this spike's **elevation offset slider**.
  MapLibre terrain DEMs are MSL-referenced, so the same tracks should sit close to
  right at offset 0 there. Make the offset a per-view tunable default rather than a
  global constant.
- **Draping is a view capability, not a universal control.** deck's
  `_TerrainExtension` drapes onto `Tile3DLayer` (with `operation: 'terrain+draw'`)
  but does *not* drape onto MapLibre terrain — deck layers with z=0 render at sea
  level there, misaligned with raised terrain (per deck's own docs). So "clamp to
  surface" exists only in the Google view. Gate every control by view capability,
  the way the spike hides the clamp checkbox in no-key mode.
- **Vertical exaggeration** scales tracks only — no basemap's surface can be scaled
  (per-tile matrix tricks would crack the Google mesh apart). Exaggerated ground
  tracks float above photorealistic terrain; the feature reads best on flights, with
  X-ray, or over basemaps with no 3D surface.

## Basemaps: cost, policy, attribution

- **Google 3D tiles billing**: only the root tileset request
  (`GET …/3dtiles/root.json`) is billable (1,000 free/month; one buys ≥3h of free
  tile streaming). Every fresh `Tile3DLayer` instance refetches it — so in a
  view-switching app, keep the Google view's Deck instance alive and hidden rather
  than recreating it per switch, or each toggle costs a request. Hard-cap spend with
  a quota override (budget alerts don't cap anything); see README.
- **OSM**: tile.openstreetmap.org's usage policy is not meant for apps — plan on a
  provider (e.g. OpenFreeMap, Protomaps) for the OSM look.
- **Blue Marble** (NASA GIBS): low-resolution imagery — ideal for the globe/flight
  view, useless zoomed in. Consider coupling basemap availability to zoom or view.
- **Attribution is data, not chrome**: Google requires aggregated per-tile copyright
  strings (collected via `onTraversalComplete` here) plus the official Google logo;
  OSM requires "© OpenStreetMap contributors"; GIBS wants a NASA courtesy line.
  Make attribution part of each basemap's definition, rendered by shared UI.

## Deployment considerations (when it stops being "run it on my own phone")

The risks split into ones you can't engineer away and ones a real deployment must
engineer around. Don't confuse them.

- **Performance is per-client and adaptive, not fixable once.** DPR,
  `maximumScreenSpaceError`, and tile memory all drive power, and the right value is
  device-dependent — on a dev phone you can drop OS resolution and refresh rate, but
  you can't ask users to. So detect the device (mobile, `navigator.deviceMemory`,
  `prefers-reduced-motion`, the Battery Status API) and set a DPR cap
  (`useDevicePixels: false` renders at CSS resolution — the biggest lever, ~DPR² fewer
  pixels), an SSE value, and whether to offer 3D at all. Ship an in-app quality toggle
  like Google Maps' own. Expect thermal throttling on sustained 3D; degrade, don't
  fight it.
  Two corrections from building the DPR half of that in deck 9.3.6. The prop is
  `useDevicePixels`, not `useDevicePixelRatio`; it takes `boolean | number`, and the
  number is an *absolute* ratio rather than a ceiling, so a cap has to be written
  `Math.min(devicePixelRatio, n)` by hand. And **refresh rate has no in-app
  equivalent** — deck's loop is rAF-driven with no frame-rate cap to set, so the only
  way to reach it is to make each frame cheap enough that the device stops throttling
  itself. Listing it beside the settable levers reads as if all four were knobs.
- **Cost scales with users, and the key can't hide for 3D tiles.** The 1,000 free
  root-tileset requests/month is per *project*, not per user, and each entry into the
  3D view is ≈ one billable root request. The key must ride on the client because
  every tile request carries it and proxying the whole tile firehose is impractical.
  So make 3D **opt-in** (don't instantiate `Tile3DLayer` until the user asks for it —
  not even hidden), referrer-restrict the key, and default to a cheap basemap.
  **Do not count on a Google-side quota cap**: this project could not set one — quota
  editing was locked on the account and spend caps don't cover Map Tiles — so the
  bound had to be built rather than configured. Check whether you have that lever
  before designing around it.
- **A key-gate is worth building, and it does more than predicted — because the
  session token is portable.** This was built (Cloudflare Worker + one Durable
  Object). The load-bearing discovery: a session token from `root.json` works from
  *any* client, so the function does not have to hand out a key and hope. It fetches
  `root.json` **itself**, caches the document for 2.5h against Google's ≥3h guarantee,
  and serves copies. **Two keys, not one**: a root key that never leaves the server
  and is the only thing permitted to fetch `root.json`, and a mesh key handed to
  browsers for the (free) tile fetches.
  That inverts the economics the bullet above assumes: **cost stops scaling with
  users and starts scaling with time** — ~10 billable requests a day at saturation,
  whatever the traffic — and the count becomes exact rather than approximate, because
  the function is now the only caller. Tile bytes never pass through it, so it stays a
  gatekeeper rather than a proxy.
  What it still is **not**: a security boundary. The mesh key is visible in the
  network tab and usable directly against Google, bypassing every counter — so caps
  guard only against *your own cache breaking*, not against abuse. Two things that
  cost real time: a server-held key **can** be referrer-restricted to a sentinel
  domain, because the Workers runtime does let an outbound `fetch` set `Referer`
  (browsers forbid it, and the docs don't say); and being single-threaded is not
  enough for atomicity, since only storage operations hold events off — awaiting a
  network call lets requests interleave, so share the in-flight promise.
- **ToS and attribution stop being optional in public.** Google logo + aggregated
  per-tile copyright, no caching tiles beyond the session, plus the 3D Tiles usage
  restrictions. "Use at your own risk" does not cover a terms breach.
- **The GPS data is sensitive; local-only is a feature.** These tracks contain home
  location ("Home → MEL airport") and travel patterns. The spike's drag-drop-local
  model — the file never leaves the device — is privacy-preserving. Keep it a
  deliberate design stance, not something that quietly drifts into "upload your tracks
  to our server," which makes you custodian of people's movement history.
- **Net: Google-3D is the premium, opt-in, metered exception; the cheap basemaps are
  the default.** Every point above argues for the multi-basemap architecture already
  planned — it's what makes the app deployable at all, because it lets the expensive,
  key-exposing, metered view be the exception rather than the front door.

## Things that turned out not to matter

- **Scale**: 6.5 MB / ~100k points parses in-browser instantly, re-uploads on every
  slider drag, and survives 3× mirror duplication without any visible cost. Streaming
  parsers, workers, and binary formats are not needed at this data size.
- **Dynamic mode → color** (modes read from each file, assigned to a fixed, CVD-safe
  palette slot order, overflow folding to gray — never generated hues) lives in the
  shared module and costs nothing. Tooltips and picking work identically through
  `MapboxOverlay`.

## Verification

- Screenshot-based headless testing works well for map apps: drive the real UI
  (file input, sliders) with Playwright, screenshot at fixed cameras, compare.
- But know your renderer: headless Chrome may only get SwiftShader (software GL).
  World-scale deck scenes then render at ~1 fps, screenshots exceed default
  timeouts, and it looks exactly like a page hang. This spike wrongly reverted
  `MapView({repeat: true})` on that evidence before probing the main thread with a
  rAF counter and finding it alive. Diagnose "hangs" by asking the page, not by
  timeout; treat headless performance results as invalid for real hardware.
