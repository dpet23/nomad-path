# Architecture overview

Nomad Path is two programs joined by a data contract:

```
raw GPS folder + config          one compact data file           host HTML page
       |                                 |                             |
       v                                 v                             v
  [ pipeline ] --emit + validate--> trip-data.json --fetch--> [ UI library ] --> map + widgets
   (deploy-time, strict)                                    (browser, never crashes)
```

## Two audiences, two failure philosophies

- The **pipeline**'s user is the trip author at a terminal. It collects **all** errors across the input folder, then fails once with a complete report. Nothing publishes until the build is clean.
- The **UI**'s users are non-technical viewers on desktop and mobile. It never throws to the host page. Errors degrade at the smallest scope that contains them: a malformed file produces a friendly full-map error state; a malformed item is skipped with a notice badge; a malformed field disables just that attribute for that item. A legitimately absent optional attribute (a source that never recorded speed) is a _valid_ state, not an error.

## The contract in the middle

`@nomadpath/contract` holds the TypeScript types and runtime schema for the emitted file, plus semantic validation (coordinate ranges, monotonic timestamps, parallel-array length parity). The pipeline validates its output against it before writing; the UI trusts the data and only guards cheaply. Because both sides import the same package, drift between producer and consumer surfaces as a compile error.

The data model is a **flat list of items**. Each item carries one or more geometries (a track's segments; a line plus points treated as one unit), parallel-array coordinates in raw WGS84 lon/lat, optional per-point attributes (speed, elevation, sun angle, transport mode...), and fields the pipeline resolved at build time: group label, local day, divider flag, default visibility, ordering. The UI does trivial bucketing over those stamped fields — no hard logic, no recomputation.

## Inside the UI library

The UI is split into a **map-agnostic core** and **renderer adapters**:

- The core owns data decoding, the central reactive store, derived state (track tree grouping, legends, per-basemap colour palettes, visibility, hover), and error handling. It never imports a map library.
- A `MapRenderer` adapter (first: MapLibre GL + deck.gl) turns core intent (`renderTracks`, `setBasemap`, `fitBounds`...) into map-library calls, and advertises optional capabilities via `supports()` flags.

Widgets are thin views over derived store state.

## Import boundaries (lint-enforced)

- `contract` imports no other workspace package.
- `pipeline` never imports the UI or any map/render library.
- `ui/src/core` never imports map libraries; only renderer adapters do.

## Deciding log

Every architectural decision, with rationale and supersessions, lives in the repo's design log: `plans/looking-to-plan-the-piped-nova.md`.
