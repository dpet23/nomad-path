# Preprocessing Pipeline

The preprocessor converts raw GPS files into a single `trip-data.geojson` that the browser loads
at runtime. It runs in Node.js and is never shipped to the browser.

---

## Running it

```bash
# Minimal
npm run build:data -- -i ./trips/japan-2024/tracks

# With explicit name and output path
npm run build:data -- -i ./trips/japan-2024/tracks -n "Japan 2024" -o ./public/japan.geojson

# Equivalent direct invocation
node preprocessing/build-trip-data.js -i ./trips/japan-2024/tracks
```

The input directory is scanned **recursively** for `.gpx` and `.kml` files. All other file types
are skipped with a warning. Hidden files and directories (starting with `.`) are skipped silently —
this means `.git` directories are safe inside the input folder.


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

## GPX file conventions

### File naming

The filename drives **transport mode detection** when OsmAnd metadata isn't present:

| Pattern in filename | Detected mode |
|--------------------|---------------|
| `flight`, `fly`, `plane`, `air` | `flight` |
| `walk`, `hike`, `trek`, `run`, `jog` | `walk` |
| `cycle`, `bike`, `cycling`, `biking` | `cycling` |
| `boat`, `sail`, `ferry`, `ship`, `kayak`, `canoe` | `boat` |
| (anything else) | `drive` |

Pattern matching is word-boundary aware (`\b`), so `festival.gpx` doesn't match `sail`.

### OsmAnd metadata (takes priority over filename)

If you record with OsmAnd, the activity is stored in the GPX as `<osmand:activity>`. This is read
from three locations (in priority order):

1. `<metadata><extensions><osmand:activity>` — OsmAnd default location
2. `<trk><osmand:activity>` — some OsmAnd versions
3. `<trk><extensions><osmand:activity>` — OsmAnd alternative

OsmAnd activity strings are mapped to canonical modes:

| OsmAnd activity | Canonical mode |
|----------------|----------------|
| `driving` | `drive` |
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

For each track point with a timestamp and coordinates, the solar altitude angle is computed using
the `suncalc` library. The angle is stored as degrees in the range −90 to +90:

- **−90** = solar midnight (sun directly below)
- **0** = on the horizon (sunrise / sunset)
- **+90** = solar noon (sun directly overhead)

This allows the `sunAngle` colour mode to show golden-hour orange, mid-day yellow, and night blue.
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
        "defaultVisible": true,
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
