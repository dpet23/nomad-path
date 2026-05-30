<!-- Claude: Keep in sync with preprocessing/lib/parsers.js, enrichment.js, grouping.js, output.js, and preprocessing/build-trip-data.js. Sections most prone to staleness: "Transport mode detection" (priority order and OsmAnd activity mapping in parsers.js), "Sun angle enrichment" (stored value range — confirmed 0-360 from enrichment.js lines 47-51), "Output format" (JSON schema — update if new properties are added to output.js). -->

# Preprocessing Pipeline

The preprocessor converts raw GPS files into a single `trip-data.geojson` that the browser loads
at runtime. It runs in Node.js and is never shipped to the browser.

---

## Running it

```bash
# Generate a config template (optional — only needed for custom group visibility)
npm run build:data -- -i ./trips/japan-2024/tracks --init

# Minimal — output goes to ./trips/japan-2024/tracks/trip-data.geojson
npm run build:data -- -i ./trips/japan-2024/tracks

# With explicit name and output path
npm run build:data -- -i ./trips/japan-2024/tracks -n "Japan 2024" -o ./public/japan.geojson

# Equivalent direct invocation
node preprocessing/build-trip-data.js -i ./trips/japan-2024/tracks
```

The input directory is scanned **recursively** for `.gpx` and `.kml` files. All other file types
are skipped with a warning. Files and folders listed under `ignore:` in `nomadpath.yaml`
(see [Ignored paths](#ignored-paths-nomadpathyaml) below) are skipped entirely — they're not
walked at all, so a `.git/` repo inside the input folder won't trip up the recursive scan or
flood watch mode with rebuild events.


---

## Folder conventions

There's no required folder structure, but this works well:

```
trips/
├── japan-2024/
│   ├── tracks/
│   │   ├── 2024-03-15-morning-drive.gpx
│   │   ├── 2024-03-15-beach-walk.gpx
│   │   ├── flight-SYD-NRT.kml
│   │   ├── accommodations.gpx
│   │   └── trip-data.geojson      ← generated, commit this
│   └── index.html
└── nz-2023/
    └── tracks/
        └── ...
```

The `trip-data.geojson` can be committed to the repo — it's the deployable artefact.
Re-run the preprocessor whenever GPS files are added or changed.


---

## Group visibility (nomadpath.yaml)

Named immediate subdirectories form **groups**. By default all groups are visible on load.
To change the default for a group, add a `nomadpath.yaml` file to the input directory.

Generate a pre-filled template with `--init`:

```bash
npm run build:data -- -i ./trips/japan-2024/tracks --init
# Writes nomadpath.yaml to the input directory and exits
```

The convention is **only list folders that need a non-default setting**. Folders
omitted from `nomadpath.yaml` inherit the defaults. Example:

```yaml
# nomadpath.yaml — Nomad Path preprocessing configuration

groups:
  # Transport flight legs — hidden so the day-by-day view isn't
  # dominated by flight arcs. Toggle on in the map legend to see them.
  flights-2025:
    hidden: true
```

### Group options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `hidden` | boolean | `false` | When `true`, tracks in this group are hidden at map load (still toggleable from the legend) |
| `excludeFromAutoBounds` | boolean | `false` | When `true`, this group is excluded from the initial viewport fit even if visible |

> **Tip:** Only immediate subdirectories form groups. Deeper nesting is fine for
> organisation but the group is always determined by the first subfolder component.

### POI category options

POI categories from waypoint `<type>` tags use the same shape under `poi_categories`:

```yaml
poi_categories:
  landmark:
    hidden: true
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `hidden` | boolean | `false` | When `true`, POIs in this category are hidden at map load |

---

## Ignored paths (nomadpath.yaml)

Use `ignore:` in `nomadpath.yaml` to list files and folders the preprocessor should skip
entirely — they're never opened, statted, or watched. The fresh `--init` template seeds a
default list covering common noise (`.git/`, OS metadata files, editor swap files); edit
or remove entries to suit your workflow.

```yaml
ignore:
  - .git/
  - .DS_Store
  - Thumbs.db
  - "**/*.swp"
  - drafts/
```

### Pattern semantics

- **Globs**, chokidar/picomatch compatible.
- **Anchored to the input root.** `drafts/` matches `<input>/drafts/` only; use `**/drafts/`
  to match at any depth. This is intentionally stricter than `.gitignore` — it makes patterns
  unambiguous when you read them in isolation.
- **Directory patterns implicitly cover descendants.** `.git/` (or `.git`) excludes the
  directory and everything under it; you don't need `.git/**`.

Removing an entry from `ignore:` means those paths *will* be scanned. The config is the
single source of truth — there is no hardcoded backup ignore list. If you delete the `.git/`
entry from your trip's config, `git status` operations will trigger watch rebuilds.

### Honoured by both build and watch

`ignore:` is read by `npm run build:data` (filtering the recursive file scan) and by
`npm run watch` (passed to chokidar's `ignored` option). Both use the same matcher, so a
file you've ignored will never appear in the output and never trigger a rebuild.

Config is read **once at watch startup** — editing `nomadpath.yaml` while watch is running
requires a restart for the new patterns to take effect.

### Malformed config fails loudly

A typo that turns `ignore:` into a non-list (e.g. `ignore: drafts/` instead of `ignore: [drafts/]`)
causes the build to exit non-zero with a clear error message. A silent failure mode would
let a stray colon re-enable `.git/` scanning without you noticing.

---

## Git-triggered rebuilds

If the input directory is also a git repo, you can rebuild on every `git push` instead of
running `npm run watch` with chokidar. Useful when you commit GPS files from one machine
(say, a phone) and push them to a dev box that serves the map — the build runs on the
dev box and its output streams back as `remote: ...` lines in the `git push` output, so
the pushing client sees `[BUILD] Starting` / `[OK]` / `[FAIL]` without having to log
into the dev box to read a log file.

### Setup

One-time, on the dev box that will serve the map:

```bash
npm run git:enable -- -i /path/to/trip-repo [-o ./demo/trip-data.geojson] [-n "Hawaii 2025"]
```

This:
1. Sets `receive.denyCurrentBranch updateInstead` on the repo, so pushes update its
   working tree (required — pushes to the currently-checked-out branch are otherwise
   rejected by default).
2. Writes a `post-receive` hook at `<repo>/.git/hooks/post-receive` that invokes
   `build-trip-data.js` with the resolved input/output/name baked in.

Run separately to serve the map (the watch / git workflows are independent):

```bash
npm run demo
```

### Daily use

From the other machine (phone, laptop, etc.) push as normal:

```bash
git push origin master
# remote: [BUILD] Starting
# remote: [OK] 12 tracks (drive: 8, walk: 4) | 3 POIs (landmark: 3) | 1.2s
```

Refresh the browser tab serving the map to see the new tracks.

### Updating the hook

The hook bakes in absolute paths to node, `build-trip-data.js`, and the input/output. If
you change `-o` or `-n`, or your node version moves (e.g. an OS upgrade or
`nvm uninstall`-ing the version you set up with), re-run `npm run git:enable` with the
desired args.

### Hook safety

`git:enable` refuses to overwrite an existing `post-receive` hook that wasn't written by
it (identified by a marker comment). Move or delete the existing hook to proceed.

### Undoing

There's no `--uninstall` flag. To revert manually:

```bash
rm <repo>/.git/hooks/post-receive
git -C <repo> config --unset receive.denyCurrentBranch
```

---

## GPX file conventions

### Transport mode detection

The parser infers transport mode from (in priority order):

1. **`flights/`-prefixed subfolder in path** — any file under a subfolder whose name starts with `flights` is forced to `flight` mode
2. **OsmAnd `<osmand:activity>` extension** — if you record with OsmAnd, the activity is stored in the GPX. Read from three locations (in priority order):
   - `<metadata><extensions><osmand:activity>` — OsmAnd default location
   - `<trk><osmand:activity>` — some OsmAnd versions
   - `<trk><extensions><osmand:activity>` — OsmAnd alternative
3. **KML `<Document><name>` starting with "FlightAware"** — FlightAware KML exports are detected automatically even if the file has been renamed
4. **Filename keywords** — word-boundary aware (`\b`), so `festival.gpx` doesn't match `sail`:

| Pattern in filename | Detected mode |
|--------------------|---------------|
| `flight`, `fly`, `plane`, `air` | `flight` |
| `walk`, `hike`, `trek`, `run`, `jog` | `walk` |
| `cycle`, `bike`, `cycling`, `biking` | `cycling` |
| `boat`, `sail`, `ferry`, `ship`, `kayak`, `canoe` | `boat` |
| (anything else) | `drive` |

5. **Fallback** — `drive`

OsmAnd activity strings are mapped to canonical modes:

| OsmAnd activity | Canonical mode |
|----------------|----------------|
| `car`, `passenger`, `public transport` | `drive` |
| `walking`, `hiking`, `running` | `walk` |
| `cycling`, `biking` | `cycling` |
| `boating`, `sailing` | `boat` |
| `skiing` | `skiing` |
| `flying` | `flight` |
| (unknown) | used as-is (lowercased) |

### Speed data

Speed is extracted from trkpt extensions (priority order):

1. `<osmand:speed>` — m/s, converted to km/h
2. `<speed_2d><value>` — m/s, converted to km/h (some OsmAnd variants)
3. **Haversine fallback** — computed from consecutive point coordinates + timestamps

Speed is `null` for points with no extension data and no timestamps.

### Day assignment

The **day key** for each track is the calendar date in the GPS device's **local timezone** at the
first point's timestamp. The local timezone is looked up from the coordinates using `@photostructure/tz-lookup`.

For flights, a special `flight-{dep_date}-{dep_time}` key is used based on the departure time,
because a flight may cross multiple calendar days.

Tracks without timestamps (e.g. plain KML files) use the filename as the day key.


---

## KML file conventions

KML has no standard activity metadata — transport mode is inferred from filename only.

KML `LineString` elements become tracks. KML `Point` elements (Placemarks with point geometry)
become POI waypoints.

Timestamps in KML are not currently extracted (plain KML LineStrings have no per-point times;
KML Tour/gx:Track support is not implemented).


---

## POI waypoints

Waypoints in `.gpx` files and point placemarks in `.kml` files become POI markers on the map.

The POI **category** is set by:
1. The `<type>` element in GPX `<wpt>`: `<type>accommodation</type>`
2. The filename (fallback): `accommodations.gpx` → `accommodation`, `landmarks.gpx` → `landmark`
3. Default: `poi`

```xml
<wpt lat="35.6938" lon="139.7006">
  <name>Hotel Gracery Shinjuku</name>
  <type>accommodation</type>
</wpt>
```


---

## Sun angle enrichment

For each track point with a timestamp and coordinates, a **solar day angle (0–360°)** is computed
using the `suncalc` library and stored in the `sunAngles` parallel array:

- **0** = solar midnight (start of day)
- **90** = sunrise
- **180** = solar noon
- **270** = sunset
- **360** = solar midnight (end of day)

Pre-dawn night (0–90) and post-dusk night (270–360) are distinguishable, which allows the
`sunAngle` colour mode to show golden-hour orange, mid-day yellow, and night blue.
Points without timestamps get `null` in the `sunAngles` array.


---

## Output format

The output is a GeoJSON `FeatureCollection` with embedded metadata:

```json
{
  "type": "FeatureCollection",
  "metadata": {
    "tripName": "Japan 2024",
    "attributeRanges": {
      "elevation": { "min": 0, "max": 1240, "unit": "m" },
      "speed":     { "min": 0, "max": 95,   "unit": "km/h" }
    },
    "stats": {
      "trackCount": 42,
      "waypointCount": 18,
      "dayCount": 14,
      "transportModes": { "drive": 28, "walk": 12, "flight": 2 },
      "dateRange": { "start": "2024-03-15", "end": "2024-03-28" }
    }
  },
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "LineString", "coordinates": [[139.69, 35.68], ...] },
      "properties": {
        "type": "track",
        "name": "Morning Drive",
        "day": "2024-03-15",
        "group": null,
        "transportMode": "drive",
        "times":      [1710489600000, 1710489900000, ...],
        "elevations": [40, 42, 45, ...],
        "speeds":     [29.99, 45.0, null, ...],
        "sunAngles":  [12.3, 12.5, 12.8, ...]
      }
    },
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [139.7006, 35.6938] },
      "properties": {
        "type": "poi",
        "name": "Hotel Gracery Shinjuku",
        "category": "accommodation"
      }
    }
  ]
}
```

**Parallel arrays** (`times`, `elevations`, `speeds`, `sunAngles`) align 1:1 with the LineString
coordinate array. Any array that is entirely `null`/`undefined` is omitted from the output to keep
file size down.

The `group` property is the name of the immediate subdirectory the file belongs to, or `null` for
root-level files.

The `attributeRanges` in `metadata` are the global min/max values across **all tracks** in the
file — used by the browser to set colour scale endpoints.


---

## Debugging the output

Inspect the generated file with any GeoJSON viewer:

```bash
# Pretty-print (requires jq)
jq . trip-data.geojson | head -100

# Count features by type
jq '[.features[].properties.type] | group_by(.) | map({(.[0]): length}) | add' trip-data.geojson

# List all tracks
jq '.features[] | select(.properties.type=="track") | .properties | {name, day, transportMode}' trip-data.geojson

# Check attribute ranges
jq '.metadata.attributeRanges' trip-data.geojson
```

You can also load the GeoJSON directly in [geojson.io](https://geojson.io) to visually verify
the track paths before embedding them in the map.
