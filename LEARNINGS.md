# Spike learnings: bridging the trip map and the PhotoSwipe gallery

**Verdict: the bridge is entirely feasible in a same-document embed, with no
changes to PhotoSwipe itself and a small, well-defined API surface on the map
library.** Both target features work end-to-end (verified with Playwright on
desktop + mobile emulation, all 16 checks green, no console errors):

1. **Photo markers on the map** — clustered camera icons on the tracks;
   clicking one opens PhotoSwipe at that exact slide (including the video).
2. **Minimap in the gallery overlay** — a live MapLibre minimap inside the
   PhotoSwipe UI showing the current slide's location with track context,
   panning along as you navigate or run the slideshow, surviving fullscreen,
   with a clean "no location" state.

---

## What nomad-path's API must expose to support this

The whole bridge consumed exactly this surface (see `js/map.js` for the
stand-in implementation, `js/bridge.js` + `js/pswp-minimap-plugin.js` for the
consumers):

| Need | Spike shape | Notes |
| --- | --- | --- |
| Time → position lookup | `positionAtTime(tsMs) -> {lngLat, gapMs, day, trackName} \| null` | The single most important addition. Linear interpolation between fixes; snap to a track end within a threshold (15 min here) with `gapMs` reported; `null` beyond that (valid case — indoor photos). |
| Photo marker layer | `addPhotoLayer(pointFeatures)` / `setPhotoVisibility(bool)` | MapLibre's built-in geojson clustering (radius 36, clusterMaxZoom 15) handled the 5-photo burst perfectly; cluster click = `getClusterExpansionZoom` + easeTo, never opens an arbitrary photo. Legend needs a "Photos" toggle row. |
| Marker click event | `on('photoClick', cb)` with the feature properties (incl. the gallery index) | The library must round-trip arbitrary consumer properties on the features. |
| Access to loaded data + ready signal | `tripMap.data`, `init()` promise | The minimap reuses the already-fetched trip data (no second download). A ready promise matters: if the user opens the gallery before the map loads, locations aren't resolved yet — the spike re-resolves via an event once ready. |
| A "mini" construction mode | `new TripMap(el, {data, mini: true})` | Non-interactive, no legend/controls, thinner lines, compact attribution **kept collapsed** (see gotchas). |
| Story hand-back | `focus(lngLat)`, `pulseAt(lngLat)` | On gallery close, the main map pulses (and pans to, if off-screen) the last-viewed photo's location. Cheap and very effective for the "one story" feel. |

## PhotoSwipe integration facts (hard-won)

- **`loadAndOpen(idx)` alone is broken for selector-based galleries** — you
  MUST pass the dataSource: `lightbox.loadAndOpen(idx, { gallery: galleryEl })`.
  Without it `getNumItems()` is 0, PhotoSwipe silently sanitises the index to
  0, `currSlide` is never set, and the init-time `change` event then crashes
  the dynamic-caption plugin (`undefined.dynamicCaption`), leaving a wedged
  half-open overlay. Thumbnail clicks pass it internally, which is why the
  production albums never see this.
- **Bind plugin handlers on the lightbox, not the pswp instance**:
  `lightbox.on('change'|'close'|'destroy', …)` survives the per-open
  recreation of the pswp core and catches the initial `change` that fires
  *during* `pswp.init()`. Only `ui.registerElement` needs the `uiRegister`
  hook. (This matches how the caption/video plugins are built.)
- **PhotoSwipe destroys its entire DOM on close.** The minimap therefore
  lives in a persistent holder on `<body>` and is *reparented* into the pswp
  root each open (`registerElement({appendTo: 'root', onInit})`), then rescued
  on `destroy`. **Moving the canvas within the DOM does not lose the WebGL
  context** — verified `isContextLost() === false` after close/reopen; one
  map instance serves the whole page lifetime. Only `map.resize()` is needed
  after reparenting.
- **Fullscreen works for free** with this placement: the fullscreen plugin
  fullscreens the `.pswp` root element, and the minimap is inside it.
- **`slide.data.element` is the `.pswp-card` `<figure>`** (whatever the
  `children` selector matches), not the `<a>` — query into it for the data
  attributes.
- **Video slides need nothing special** — same `change` event, same element
  dataset; play/pause controls unaffected by the minimap.
- The minimap is **non-interactive** (`interactive: false`) so it can't fight
  swipe/zoom gestures; a click toggles a larger size instead (stopPropagation
  so PhotoSwipe doesn't treat it as an image tap). Keep pointer-events ON,
  otherwise clicks fall through to the image underneath and toggle zoom.

## Data model

- **Bake coordinates at generate time** (`data-lat`/`data-lon` on the card's
  `<a>`, from EXIF in the real pipeline) plus `data-ts` on every item. Cost:
  ~50 bytes/photo — page-weight impact is nil. Client-side EXIF parsing was
  rightly rejected (it would download full-size images just for headers).
- **Three-tier resolution works cleanly**: baked → `positionAtTime(ts)` →
  no marker + "No location recorded" minimap state. Synthetic set: 17 EXIF /
  8 interpolated / 3 none, all resolved as designed, including a photo
  interpolated onto the sparse in-flight track.
- Interpolated vs EXIF markers got different icon colours (white vs gold) and
  a minimap badge (`EXIF GPS` vs `≈ from track`) — invaluable for debugging;
  keep the badge, probably drop the icon colour split in production.
- The bridge resolves everything client-side in ~0 time (28 items, 10 tracks,
  ~1200 track points). Precomputing marker positions at build time is equally
  possible but buys nothing and duplicates the interpolation logic.

## Clutter (Dan's open question)

At trip-overview zoom everything collapses into a handful of clusters —
tracks stay legible. At day zoom, camera icons sit beside the line and read
well. What actually matters:

- clustering is non-negotiable for bursts (5 photos in 3 minutes at one
  lookout = one "5" bubble until you zoom right in);
- the legend "Photos" toggle is the pressure valve for busy days;
- the **legend itself** is the clutter problem on phones (7 rows over a
  50vh map) — nomad-path wants a collapsible legend on small screens.

## Other gotchas / limits

- MapLibre's compact `AttributionControl` **re-opens itself on every resize**
  while the map is ≤640px wide — on a 150px minimap it covered everything.
  Workaround: collapse it (remove `open` attr) after each `resize` event.
  Attribution stays reachable behind the ⓘ toggle.
- Desktop minimap (bottom-left) can overlap the left edge of wide captions in
  `type: 'below'` mode; on mobile it must sit *above* the caption overlay
  (bottom offset). Real fix is a layout negotiation between the caption
  plugin and the minimap (e.g. read the caption element's height); spike uses
  a fixed 96px offset.
- **This all assumes same-document embedding.** An iframe map (the current
  gpsvisualizer-era architecture) would force every call above through
  postMessage and kill the shared-data/minimap reuse — the overhaul to
  nomad-path's embedded model is what makes the bridge cheap.
- Weight: MapLibre GL is the big rock (~1.1 MB raw JS, ~250 KB gzipped) but
  it's already on the page for the main map; the minimap adds **zero extra
  downloads** except a handful of tiles (shared browser cache with the main
  map for overlapping tiles). Trip geojson here: 84 KB raw.

## Packaging recommendation

Dan's instinct was one all-in PhotoSwipe plugin. The spike ended up with a
natural split, and it held up:

- `bridge.js` (~60 lines) — DOM → locations → map markers → `loadAndOpen`.
  It has **no PhotoSwipe lifecycle to hook** (it only *calls* the lightbox),
  so forcing it into plugin shape adds nothing.
- `pswp-minimap-plugin.js` — a genuine PhotoSwipe plugin (constructor takes
  the lightbox, hooks `uiRegister`/`change`/`close`/`destroy`).

Ship them as one small "nomad-path-gallery" package with two exports. The
map-side needs (`positionAtTime`, `addPhotoLayer`, `photoClick`, `pulseAt`,
mini mode) belong in nomad-path itself.
