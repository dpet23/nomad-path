# Nomad Path — Preprocessing

Converts GPX/KML track files into a single `trip-data.geojson` file for use with the Nomad Path map library.

## Quick start

```bash
# 1. Put your GPS files into a directory (can have subdirectories)
#    e.g. trips/japan-2025/tracks/

# 2. (Optional) Generate a config template — only needed if you have
#    subfolders with special visibility requirements (e.g. transport flights)
npm run build:data -- -i ./trips/japan-2025/tracks --init

# 3. Edit nomadpath.yaml if generated (see below), then build
npm run build:data -- -i ./trips/japan-2025/tracks

# 4. Output: trips/japan-2025/tracks/trip-data.geojson
#    Use this file with the Nomad Path map library.
```

## Options

| Flag | Description |
|------|-------------|
| `-i, --input <dir>` | Directory to scan for GPS files (recursive) **[required]** |
| `-o, --output <file>` | Output path (default: `<input>/trip-data.geojson`) |
| `-n, --name <name>` | Trip name in metadata (default: parent folder name, title-cased) |
| `--init` | Write a `nomadpath.yaml` template to `<input>/` and exit |

## Supported file formats

- **GPX** (`.gpx`) — OsmAnd tracks, Garmin exports
- **KML** (`.kml`) — FlightAware downloads, Google Earth exports

All other file types are silently skipped.

## Organising your files

Files can be placed at the root of the input directory or in subdirectories.
Subdirectories form **groups** that can be configured in `nomadpath.yaml`.

```
tracks/
  2025-01-10-morning-walk.gpx     ← root-level, always visible
  oahu/
    2025-01-11-hike.gpx
    2025-01-11-drive.gpx
  big-island/
    2025-01-14-drive.gpx
  flights-2025/                   ← configured as hidden by default
    FlightAware_QFA468_...kml
    terminal-bus.gpx              ← sidecar: part of the flight leg, also hidden
```

> **Tip:** Only immediate subdirectories form groups. Deeper nesting is fine for
> organisation but the group is always determined by the first subfolder component.

## nomadpath.yaml

Run `--init` to generate a pre-filled template, then edit as needed.

```yaml
# nomadpath.yaml — Nomad Path preprocessing configuration

groups:
  # Transport flight legs — hidden by default so the day-by-day view
  # isn't dominated by flight arcs. Toggle on in the map legend to see them.
  flights-2025:
    defaultVisible: false

  # Disaster/event overlays from external sources (optional)
  # disasters:
  #   defaultVisible: false
```

### Group options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `defaultVisible` | boolean | `true` | Whether tracks in this group are visible when the map first loads |

## Transport mode detection

The parser infers transport mode from (in priority order):

1. **`flights/`-prefixed subfolder in path** — forces `flight`
2. **GPX `<metadata><extensions>` activity tag** — e.g. `driving`, `hiking`, `boating`
3. **KML `<Document><name>`** — FlightAware KML files are detected automatically even if renamed
4. **Filename keywords** — `flight`, `walk`, `hike`, `boat`, `cycle`, etc.
5. **Fallback** — `drive`

OsmAnd activity strings are mapped to canonical modes:
`car / passenger / public transport → drive` · `walking / hiking / running → walk` ·
`cycling / biking → cycling` · `boating / sailing → boat` · `flying → flight`

## Output format

The output is a GeoJSON `FeatureCollection` with an additional `metadata` object:

```json
{
  "type": "FeatureCollection",
  "metadata": {
    "tripName": "Japan 2025",
    "attributeRanges": {
      "elevation": { "min": 0, "max": 1847, "unit": "m" },
      "speed":     { "min": 0, "max": 112,  "unit": "km/h" }
    },
    "stats": {
      "trackCount": 42,
      "waypointCount": 18,
      "dayCount": 14,
      "transportModes": { "drive": 28, "walk": 12, "flight": 2 },
      "dateRange": { "start": "2025-01-10", "end": "2025-01-24" }
    }
  },
  "features": [ ... ]
}
```

Track features carry these properties:

| Property | Description |
|----------|-------------|
| `name` | Track name from file metadata, or filename stem |
| `day` | Local calendar date (`YYYY-MM-DD`), or `flight-YYYY-MM-DD-<slug>` for flights |
| `type` | `"track"` |
| `defaultVisible` | Whether to show this track at map load |
| `group` | Subfolder name this file belongs to, or `null` for root-level files |
| `transportMode` | `walk` / `drive` / `flight` / `boat` / `cycling` / `skiing` / … |
| `times` | _(optional)_ Unix timestamps (ms) per point |
| `elevations` | _(optional)_ Elevation (m) per point |
| `speeds` | _(optional)_ Speed (km/h) per point, `null` where unavailable |
| `sunAngles` | _(optional)_ Solar day angle 0–360° per point (90=sunrise, 180=noon, 270=sunset) |
