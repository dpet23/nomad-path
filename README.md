# GPS tracks over Google Photorealistic 3D Tiles

A spike exploring whether personal GPS recordings can be rendered in true 3D over
[Google Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/3d-tiles-overview)
using [deck.gl](https://deck.gl), based on the
[deck.gl google-3d-tiles example](https://deck.gl/examples/google-3d-tiles).

Drop in a GPX, KML, GeoJSON, KMZ or a zip of them. Tracks are drawn as 3D lines at
their recorded GPS elevation — flights arc up to cruising altitude, drives hug the
coast roads — coloured by how fast they were travelled, over Google's photorealistic
3D globe.

**Your files never leave the browser.** They are read and parsed on the page; nothing
is uploaded anywhere. The only requests the app makes are for Google's map tiles.

## Quick start

Requires Node 20.19+.

```sh
npm install
cp .env.example .env.local        # then put your API key in .env.local
npm run dev
```

Open the printed URL (default `http://localhost:5173`) and **drag & drop a track file
onto the page** (or use the *Open a track…* button). The camera flies to fit the data.

No API key? The app still works — tracks render in 3D over a black background, with a
banner explaining what's missing. Useful for checking your data before spending tile
requests.

## Running without Node (static demo)

The build is plain static files — no Node needed to *serve* it, only to build it. Vite
inlines the API key at build time, so build once on a machine with Node and copy the
folder anywhere:

```sh
# on a machine with Node, with your key in .env.local:
npm run build                       # writes dist/ with the key baked into the bundle

# copy dist/ to the demo device, then there (Node not required):
cd dist && python3 -m http.server 5173
```

Open `http://localhost:5173`. Two things to know:

- **Serve on a port your key allows.** The key is restricted to referrer origins you
  set (the setup below suggests `http://localhost:5173/*`), so serving on 5173 reuses
  that entry. Python's default is port 8000 — either pass `5173` as above, or add the
  port you use to the key's allowed referrers, or tiles will 403. If you open the demo
  from *another* device by IP (e.g. `http://192.168.1.50:5173`), add that origin too.
- **The key is embedded in the bundle in plaintext.** Fine for a trusted local demo,
  but keep the referrer restriction and quota cap (below) so an extracted key is
  useless elsewhere, and don't put `dist/` on the public internet.

## Getting a Google Maps API key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a
   project (or pick an existing one).
2. Enable billing on the project: **Billing → link a billing account**. A valid credit
   card is required even if you stay inside the free tier (see next section for how to
   guarantee that). New Google Cloud accounts also get a general $300/90-day trial
   credit, but don't rely on it.
3. Enable the API at
   [`console.cloud.google.com/apis/library/tile.googleapis.com`](https://console.cloud.google.com/apis/library/tile.googleapis.com).
   The exact product name is **Map Tiles API** — it covers Photorealistic 3D Tiles;
   there is no separate "3D Tiles API".
4. Create a key at **APIs & Services → Credentials → Create credentials → API key**.
5. Restrict the key (click the key in the Credentials list):
   - **Application restrictions → HTTP referrers**, add `http://localhost:5173/*`
     (match the port Vite prints).
   - **API restrictions → Restrict key → Map Tiles API** only.
6. Put the key in `.env.local` as `VITE_GOOGLE_MAPS_API_KEY=...` and restart the dev
   server. The app sends it via the `X-GOOG-API-KEY` header, so it never appears in
   request URLs.

**Attribution:** Google's [policy](https://developers.google.com/maps/documentation/tile/policies)
requires two things wherever tiles are shown, and the app renders both in one bar along
the bottom, which appears with the first mesh tile and not before.

- The **logo**, bottom-left: `public/GoogleMaps_Logo_WithDarkOutline.svg`, Google's
  published asset byte for byte. The outlined variant is the one the policy specifies
  for a busy background like imagery. It is sized by height alone (never both
  dimensions) so the aspect ratio cannot drift, and the bar holds the 10dp left/right/top
  and 5dp bottom of clear space the policy asks for. Replacing it means re-downloading
  from the policy page, not editing this file.
- The **data credits**, bottom-right: the per-tile `asset.copyright` strings, aggregated
  from the tiles on screen and ordered by how many of them each covers, most first,
  which is the order the policy asks for.

## Staying within the free tier

How 3D tiles are billed (verified July 2026):

- The **only billable event is the root tileset request** —
  `GET https://tile.googleapis.com/v1/3dtiles/root.json`. One such request buys ≥3 hours
  of unlimited follow-up tile fetches; the thousands of mesh tiles streamed while you
  pan around are **free**.
- Free allowance: **1,000 root tileset requests per calendar month** (SKU
  "Map Tiles API: Photorealistic 3D Tiles"). Beyond that it's $6.00 per 1,000.
- Practically: **loading a GeoJSON costs one root tileset request.** Nothing is fetched
  before that — the app has no basemap to show until there is data to show it over — so
  page loads and reloads are free, and so is a day of code iteration as long as you
  don't open a file. Opening a second file in the same session is free too.

To guarantee $0:

1. **Set a hard quota cap** — this is the only real stop; budget alerts are
   notification-only and do *not* cap spending (Google's own docs are explicit about
   this). In Cloud Console: **Google Maps Platform → Quotas → Map Tiles API**, find the
   Photorealistic 3D Tiles *root tileset queries per day* quota (default 10,000/day —
   far above the free tier, don't leave it there), **Edit → 30 → Submit**.
   30/day × 31 days = 930/month, safely under the 1,000 free allowance.
2. **Add a budget alert as a tripwire**: **Billing → Budgets & alerts → Create budget**,
   e.g. $1 threshold. Alerts only email you; step 1 is what actually stops requests.
3. Keep the key referrer- and API-restricted (previous section) so it can't be used
   elsewhere.

Cost/quality knob: `VITE_MAX_SCREEN_SPACE_ERROR` in `.env.local` (default 16, the
deck.gl example uses 16–20). Higher values load fewer/blurrier tiles per session —
irrelevant to billing (tile fetches are free) but easier on bandwidth and GPU.

## What it reads

| Format | Notes |
|---|---|
| **GPX** | Tracks and waypoints. `<ele>` gives elevation, `<time>` gives speed, `<type>` becomes the transport mode in the tooltip, a waypoint's `<sym>` its category. |
| **KML** | Placemark LineStrings and Points. Usually carries elevation but no timestamps, so no speed. |
| **GeoJSON** | A `FeatureCollection`; the richest shape, described below. |
| **KMZ / zip** | Unpacked in the browser. Every track file inside merges into one scene — a folder of GPX days loads as one trip. |

Nothing is chosen by file extension. The bytes are sniffed: a zip by its magic number,
then markup or JSON by the first character, then GPX or KML by the root element. A file
with the wrong extension, or none, still loads.

Inside an archive the same sniff picks the entries, so photos, readmes and the
AppleDouble twins Finder hides in `__MACOSX` are skipped without a rule of their own.
An entry that looks like a track and then fails to parse is counted in the stats line
rather than failing the load.

The GeoJSON shape (as produced by my track-building pipeline):

- **LineString** features = tracks. Coordinates may be 2D `[lon, lat]`; per-point
  elevation is read from `properties.elevations` (array aligned 1:1 with coordinates,
  meters). Falls back to a coordinate's own third element, then 0. Tracks with neither
  render at ground level and are counted in the stats line.
- `properties.times` (aligned 1:1 with coordinates, ISO strings or epoch numbers) gives
  speed. `properties.transportMode`, `name`, `day`, `group` feed the hover tooltip.
- **Point** features = POIs (accommodation etc.), drawn as white dots draped onto the
  3D surface, with `name`/`category` tooltips.
- MultiLineStrings render (without the elevation- or time-array treatment); other
  geometry types are skipped and counted.

### Colour

Tracks are coloured by speed, on a single-hue ramp of five bands. The bands are
**quantiles of the loaded file**, not a fixed scale: one transpacific flight among a
hundred walks would otherwise put every walk in the slowest band. The legend prints the
speeds each band covers, so the split is on screen rather than implied.

Two absences, two answers. A track with no timing among tracks that have it is grey — it
has dropped out of a scale the rest of the screen is using. A file with no timing
anywhere is drawn in red, because grey everywhere reads as a fault rather than a fact.

Each track is drawn over a near-black casing. The basemap is photography, not a chart
surface, so no colour is reliably visible against it; the outline separates every band
from whatever happens to be behind it.

## Controls

- **Elevation offset slider** (−100…+200 m): shifts all tracks vertically.
- **Elevation exaggeration slider** (×1…×5): multiplies track altitudes (applied
  before the offset). Note it only scales *your tracks* — the Google tiles mesh can't
  be scaled, so at ×2 a mountain drive floats above the photorealistic summit. Most
  effective for flights and in no-key mode.
- **Clamp tracks to 3D surface**: drapes tracks onto the photorealistic mesh, ignoring
  GPS elevation (appears once the basemap is switched on, which is when a file loads;
  tracks stay hidden until terrain tiles finish loading).
- **X-ray**: disables depth testing so tracks show through terrain/buildings.
- **Hover** any track or POI for details.

For lessons aimed at the follow-up MapLibre + deck.gl multi-basemap app, see
[LEARNINGS.md](LEARNINGS.md).

## Licence

All rights reserved — see [LICENSE](LICENSE). Published to be read, not reused.
Google's logo asset and the rendered map data are Google's, not covered by that
notice.

## Findings & limits (the point of the spike)

- **It works.** deck.gl's `Tile3DLayer` + `PathLayer` handles 305 tracks / ~100k points
  (6.5 MB GeoJSON, parsed in-browser) at interactive framerates, including transpacific
  flight arcs at 12,200 m cruise altitude.
- **Elevation reference mismatch is real.** GPS elevations are (roughly) meters above
  sea level, while the 3D tiles' surface sits at ellipsoid-referenced heights; the two
  disagree by roughly the local geoid undulation (typically ±10–30 m) plus ordinary GPS
  vertical error. That's why the offset slider exists — tune until tracks sit on the
  terrain. There's no single globally-correct offset short of applying a geoid model
  per-point.
- **Ground tracks can sink below the mesh** (GPS noise, tunnels, dense tree canopy in
  the mesh). Fixes: raise the offset, use *clamp* (drapes perfectly but flattens
  flights to the ground — draping and true-3D are mutually exclusive per layer), or
  *X-ray* to see everything through terrain.
- **Antimeridian handled**: three pieces. The camera fit computes the bbox in both raw
  and 0–360° framings (narrower wins). Each track's longitudes are *unwrapped* so
  consecutive points never differ by >180° — crossing paths stay continuous instead of
  rendering as world-spanning horizontal lines. And because deck's `MapView` doesn't
  repeat world copies, all geometry is duplicated at ±360° (copies are excluded from
  counts and the camera fit), so a continuous copy is visible from either side of the
  seam. Remaining limit: the tile basemap itself still ends at ±180°, so a crossing
  flight continues over black void until you pan across. `MapView({repeat: true})`
  should repeat the basemap too and make the mirrors unnecessary — untested on real
  hardware; it initially looked like a hang, but that turned out to be the headless
  test environment's software GL rendering world views at ~1 fps.
- **No-key mode** renders tracks on a black background — good for free dev iteration.
  Invalid-key failures surface in a banner (the tile request errors are also in the
  console).
- **Not done / next ideas**: time animation along the per-point `times` arrays
  (`TripsLayer` is the natural fit), per-group visibility toggles, geoid-corrected
  elevations.
- **Speed as line thickness, transport mode back as colour.** Considered and
  deferred, not rejected: it carries both encodings at once with no toggle, which
  is more than colour-by-speed manages. The reason it lost for now is that
  thickness is read far less precisely than colour, especially against busy
  imagery, and `PathLayer` takes a per-vertex width array (`getWidth` accepts
  `number | number[]`, same as `getColor`) so the work is the same shape as what
  the speed ramp already does. Worth trying if speed-by-colour turns out to be
  the wrong trade.
