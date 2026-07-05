# Data contract

`@nomadpath/contract` defines the file the pipeline emits and the UI consumes. The Zod schema in `packages/contract/src/schema.ts` is the single source of truth: all TypeScript types derive from it, so a change on either side of the system surfaces as a compile error on the other.

> The schema is versioned (`version: 1`, `CONTRACT_VERSION`); breaking format changes bump it. It is **provisional** — the shape is driven by what the UI actually needs, discovered as the UI is built, so amendments are expected and cheap. See the governing principles in `plans/looking-to-plan-the-piped-nova.md`.

## Top-level shape

```jsonc
{
  "version": 1,
  "name": "Fictional Archipelago 2030", // optional trip name
  "items": [/* flat list of items */],
}
```

## Items

An item is one entry the UI can draw and (later) toggle — a track with several segments is one item with several geometries; the same mechanism serves any "line plus points treated as a unit".

The item carries only the raw facts the UI needs, each with a named consumer. It deliberately does **not** precompute UI-shaped or derived values (item ids, panel routing, chronological order, day grouping, bounds, sun angle). Those are cheaply derivable UI-side or belong to features not yet built; they return, additively, when a consumer names them.

| Field           | Type              | Notes                                                                                |
| --------------- | ----------------- | ------------------------------------------------------------------------------------ |
| `name`          | string?           | Display name (absent if the source had none)                                         |
| `description`   | string?           | Popup text on hover/tap                                                              |
| `transportMode` | string?           | Verbatim from `osmand:activity`; a core UI colour/filter attribute; absent = no data |
| `folder`        | string?           | Raw in-file folder value (waypoint grouping input); absent = ungrouped               |
| `geometries`    | Geometry[], min 1 | See below                                                                            |

## Geometries

Discriminated union on `type`:

- **`line`** — parallel arrays `lon[]`/`lat[]` (>= 2 points), optional `time[]` (epoch seconds UTC), plus optional per-point attribute arrays from the `PER_POINT_ATTRIBUTES` registry: `ele` (m), `speed` (m/s).
- **`point`** — single `lon`/`lat`, optional `sym` marker-image URL.
- **`polygon`** — one outer ring as parallel arrays, >= 4 positions, closed (first == last).

Parallel arrays exist because the renderer (deck.gl PathLayer) consumes flat per-vertex arrays; this shape decodes with a near-zero adapter.

`time[]` is **not required to be ordered.** Legitimate multi-device merges (e.g. a phone and a GoPro recording the same journey with unsynced clocks) interleave timestamps, and the UI draws points in array order and reads time as a per-point colour attribute, not as an ordering key. (An earlier monotonic-time check was removed after corpus verification found it rejected this real data — see the design log, 2026-07-04.)

## Missing data: absent vs null

- An **absent attribute array** means the item legitimately lacks that attribute (an AllTrails hike has no speed). This is a **valid state**, not an error — no warnings.
- A **null entry** inside a present array means no data at that specific point.
- Both render in the standard neutral "no data" grey shared across every attribute visualisation. The pipeline never derives or fabricates missing values.

## Validation split

`validateTripData(doc)` runs Zod (structural) then semantic cross-field checks: parallel-array length parity (per-point arrays must match the point count), and polygon-ring closure. It **collects every issue** (`ContractIssue { path, message }`) and never throws; the pipeline turns the list into its single fail-loud report and refuses to publish anything until it is empty. Coordinate ranges are enforced structurally by the Zod schema (lon in [-180, 180], lat in [-90, 90]).

The UI never runs this validator. It trusts the contract and applies only tiered graceful degradation (file / item / field scope) at decode time.

## Fixtures

`packages/contract/src/fixtures.ts` exports deterministic builders (`buildTripData`, `buildTrackItem`, `buildWaypointItem`, geometry builders) used by tests in every package. All locations are fictional; attribute ranges are non-overlapping (speeds 1-2 m/s, elevations 100-200 m) so assertions are unambiguous. A meta-invariant test guarantees every default builder output passes validation with zero issues.
