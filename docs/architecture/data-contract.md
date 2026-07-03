# Data contract

`@nomadpath/contract` defines the file the pipeline emits and the UI consumes. The Zod schema in `packages/contract/src/schema.ts` is the single source of truth: all TypeScript types derive from it, so a change on either side of the system surfaces as a compile error on the other.

> The schema is versioned (`version: 1`, `CONTRACT_VERSION`); breaking format changes bump it.

## Top-level shape

```jsonc
{
  "version": 1,
  "name": "Fictional Archipelago 2030", // optional trip name
  "bounds": [4.1, -54.7, 4.3, -54.5], // initial viewport fit
  "items": [/* flat list of items */],
}
```

## Bounds and the antimeridian

All bounds are `[west, south, east, north]` in raw WGS84 lon/lat. **`west > east` is valid** — it means the box crosses the antimeridian, which Pacific trips and transpacific flights routinely do. No consumer or validator may assume `west <= east`. Latitude has no wraparound, so `south <= north` _is_ enforced.

Bounds are precomputed by the pipeline (never derived in the browser) for two reasons: the config's exclude-from-bounds rules are resolved at build time, and antimeridian-aware box math should be written and tested once, offline.

## Items

An item is one entry in a widget — one toggle, one zoom target. A track with several segments is one item with several geometries; the same mechanism serves any "line plus points treated as a unit".

| Field            | Type                      | Notes                                                                                        |
| ---------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| `id`             | string, unique            | Pipeline-derived from source provenance (file + element) so notices trace back to the source |
| `name`           | string                    | Display name                                                                                 |
| `description`    | string?                   | Popup text on hover/tap                                                                      |
| `panel`          | `'tracks' \| 'waypoints'` | Which widget buckets the item; defined by the `PANELS` registry                              |
| `groupLabel`     | string?                   | Waypoint folder value; **absent = top-level ungrouped item**                                 |
| `day`            | `YYYY-MM-DD`?             | Local calendar date of the item's first point (stamped via timezone-from-location)           |
| `divider`        | boolean                   | Splits the track tree; renders as a separator row                                            |
| `defaultVisible` | boolean                   | Resolved from config at build time; the UI never reads the config                            |
| `order`          | integer, unique           | Global chronological ordering                                                                |
| `transportMode`  | string?                   | Verbatim from `osmand:activity`; absent = no data                                            |
| `bounds`         | Bounds                    | Zoom-to target                                                                               |
| `geometries`     | Geometry[], min 1         | See below                                                                                    |

## Geometries

Discriminated union on `type`:

- **`line`** — parallel arrays `lon[]`/`lat[]` (>= 2 points), optional `time[]` (epoch seconds UTC, non-decreasing), plus optional per-point attribute arrays from the `PER_POINT_ATTRIBUTES` registry: `ele` (m), `speed` (m/s), `sunAngle` (solar elevation, degrees — the time-of-day proxy).
- **`point`** — single `lon`/`lat`, optional `sym` marker-image URL.
- **`polygon`** — one outer ring as parallel arrays, >= 4 positions, closed (first == last).

Parallel arrays exist because the renderer (deck.gl PathLayer) consumes flat per-vertex arrays; this shape decodes with a near-zero adapter.

## Missing data: absent vs null

- An **absent attribute array** means the item legitimately lacks that attribute (an AllTrails hike has no speed). This is a **valid state**, not an error — no warnings.
- A **null entry** inside a present array means no data at that specific point.
- Both render in the standard neutral "no data" grey shared across every attribute visualisation. The pipeline never derives or fabricates missing values.

## Validation split

`validateTripData(doc)` runs Zod (structural) then semantic cross-field checks — parallel-array length parity, non-decreasing timestamps, id/order uniqueness, ring closure, real calendar dates, divider coherence, bounds sanity. It **collects every issue** (`ContractIssue { path, message }`) and never throws; the pipeline turns the list into its single fail-loud report and refuses to publish anything until it is empty.

The UI never runs this validator. It trusts the contract and applies only tiered graceful degradation (file / item / field scope) at decode time.

## Fixtures

`packages/contract/src/fixtures.ts` exports deterministic builders (`buildTripData`, `buildTrackItem`, `buildDividerItem`, `buildWaypointItem`, geometry builders) used by tests in every package. All locations are fictional; attribute ranges are non-overlapping (speeds 1-2 m/s, elevations 100-200 m, sun angles 10-20 deg) so assertions are unambiguous. A meta-invariant test guarantees every default builder output passes validation with zero issues.
