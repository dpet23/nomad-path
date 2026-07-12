# GPS tracks over Google Photorealistic 3D Tiles

A spike exploring whether personal GPS holiday recordings (GeoJSON) can be rendered in
true 3D over [Google Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/3d-tiles-overview)
using [deck.gl](https://deck.gl), based on the
[deck.gl google-3d-tiles example](https://deck.gl/examples/google-3d-tiles).

Tracks are drawn as 3D lines at their recorded GPS elevation — flights arc up to cruising
altitude, drives hug the coast roads — colored by transport mode, over Google's
photorealistic 3D globe.

## Quick start

Requires Node 20.19+.

```sh
npm install
cp .env.example .env.local        # then put your API key in .env.local
npm run dev
```

Open the printed URL (default `http://localhost:5173`) and **drag & drop a
`trip-data.geojson` onto the page** (or use the *Open GeoJSON…* button). The camera
flies to fit the data.

No API key? The app still works — tracks render in 3D over a black background, with a
banner explaining what's missing. Useful for checking your data before spending tile
requests.

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

**Attribution:** the app aggregates the per-tile copyright strings Google requires and
shows them bottom-right. Google's [policy](https://developers.google.com/maps/documentation/tile/policies)
additionally requires the official Google logo (16–19dp, unmodified) wherever tiles are
shown — this spike only renders the text attribution, so add the logo before showing
this to anyone but yourself.

## Staying within the free tier

How 3D tiles are billed (verified July 2026):

- The **only billable event is the root tileset request** —
  `GET https://tile.googleapis.com/v1/3dtiles/root.json`. One such request buys ≥3 hours
  of unlimited follow-up tile fetches; the thousands of mesh tiles streamed while you
  pan around are **free**.
- Free allowance: **1,000 root tileset requests per calendar month** (SKU
  "Map Tiles API: Photorealistic 3D Tiles"). Beyond that it's $6.00 per 1,000.
- Practically: **every full page load/reload of this app costs one root tileset
  request.** Vite hot-reload of CSS won't, but editing `src/main.js` triggers a full
  reload, which will. 1,000/month is plenty for casual use, but a day of heavy dev
  iteration against live tiles can eat into it — do code iteration in no-key mode.

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

## Data format

The app accepts any GeoJSON `FeatureCollection` and understands this shape (as produced
by my track-building pipeline):

- **LineString** features = tracks. Coordinates may be 2D `[lon, lat]`; per-point
  elevation is read from `properties.elevations` (array aligned 1:1 with coordinates,
  meters). Falls back to a coordinate's own third element, then 0. Tracks whose
  `elevations` array is missing or misaligned render at ground level and are counted in
  the stats line.
- `properties.transportMode` drives the color. The mode set is read dynamically from
  the loaded file and assigned palette slots in a fixed, CVD-safe order; files with
  more than 8 modes get gray for the overflow. `name`, `day`, `group` feed the hover
  tooltip.
- **Point** features = POIs (accommodation etc.), drawn as white dots draped onto the
  3D surface, with `name`/`category` tooltips.
- MultiLineStrings render (without the elevation-array treatment); other geometry
  types are skipped and counted.

## Controls

- **Elevation offset slider** (−100…+200 m): shifts all tracks vertically.
- **Elevation exaggeration slider** (×1…×5): multiplies track altitudes (applied
  before the offset). Note it only scales *your tracks* — the Google tiles mesh can't
  be scaled, so at ×2 a mountain drive floats above the photorealistic summit. Most
  effective for flights and in no-key mode.
- **Clamp tracks to 3D surface**: drapes tracks onto the photorealistic mesh, ignoring
  GPS elevation (only shown when tiles are enabled; tracks stay hidden until terrain
  tiles finish loading).
- **X-ray**: disables depth testing so tracks show through terrain/buildings.
- **Hover** any track or POI for details.

For lessons aimed at the follow-up MapLibre + deck.gl multi-basemap app, see
[LEARNINGS.md](LEARNINGS.md).

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
  elevations, the required Google logo for anything public-facing.
