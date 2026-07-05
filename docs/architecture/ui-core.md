# UI core

`packages/ui/src/core` is the map-agnostic, DOM-less heart of the UI library: tiered data decoding, a central reactive store, and per-point colour mapping - exactly the surface a `MapRenderer` adapter consumes to draw coloured, toggleable tracks. It imports only `@preact/signals-core` and `@nomadpath/contract`; the lint boundary forbids map libraries **and** widget frameworks (`lit`, `preact`) here, so the core stays testable in plain Vitest with no DOM.

## Framework decision

The reactive primitive is `@preact/signals-core` (`signal` / `computed` / `effect` / `batch`; stable 1.x, ~1.7 kB gzip). Widgets add `preact` + `@preact/signals` in their own layer later; the core never depends on them. The alternative (Lit + `@lit-labs/signals`) was spiked and rejected: a larger measured bundle (10.8 kB vs 8.0 kB gzip for an equivalent widget + store) resting on two experimental packages. Rationale and measurements live in the design log.

## Tiered decode

`decodeTripData(raw: unknown): DecodeResult` is the boundary between the pipeline's strict, fail-loud output and the UI's never-crash guarantee. It never throws. Errors degrade at the smallest scope that contains them:

| Tier  | Trigger                                                                                                | Result                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| File  | payload is not a plain object; `version` differs from the contract's; `items` is not an array          | `{ ok: false, reason }` - the host shows a friendly full-map error state                    |
| Item  | an item fails the contract's per-item schema; a line geometry's `lon`/`lat` lengths differ             | that item is skipped; notice `{ kind: 'item-skipped', itemIndex, reason }` (original index) |
| Field | an optional per-point array (`time`, `ele`, `speed`) has a length that does not match its line's `lon` | that array is dropped from that geometry only; notice `{ kind: 'attribute-dropped', ... }`  |

An **absent optional attribute is a valid state, not an error**: a source that never recorded speed decodes silently, with no notice. Notice `reason` strings are deliberately technical (Zod path + message) - they feed a future debug layer, while friendly wording is the widgets' concern.

## Reactive store

`createTripStore()` returns the store: a small set of state signals, derived computeds, and actions. Actions never throw; an out-of-range index is a safe no-op.

- **State signals:** `data` (last `DecodeResult`), `visibility` (per-item booleans, parallel to `items`), `selectedAttribute` (the colour-coding attribute), `activeBasemap` (opaque id; the basemap registry arrives with the renderer), `hoveredItem` (index or `null`).
- **Actions:** `load(raw)` decodes and stores the result, resets `visibility` to all-true and clears the hover - but never touches `selectedAttribute` or `activeBasemap`, which are user preferences rather than loaded data. `setItemVisible`, `setSelectedAttribute`, `setActiveBasemap`, `setHovered` update one signal each.
- **Computeds:** `visibleDomain` and `itemColours` (below). Because hover and visibility are separate signals, hover churn never recomputes colours.

`selectedAttribute` defaults to `transportMode` - a provisional choice recorded in the design log, revisited when the attribute dropdown exists.

## Colour mapping

Colour logic is pure functions in `colour.ts`, wired to reactivity only inside the store. The `COLOUR_ATTRIBUTE_REGISTRY` is the single source of truth for what a line can be coloured by: every entry carries a `kind` (`continuous` for the contract's per-point numeric attributes, `categorical` for the UI-derived `transportMode`, whose entry carries its category-extraction function), and every dispatch site branches on the kind, never on an attribute's name. The `ColourAttribute` type derives from the registry's keys.

- `NO_DATA_COLOUR` is **the** standard neutral grey - the sole source for every "no data" rendering: a missing attribute array, a null point value, a missing category, a degenerate domain.
- `continuousDomain(items, attr)` computes `[min, max]` over whatever items the caller passes, ignoring nulls; `undefined` means no data at all.
- `rampColours(values, domain)` maps nullable values to an RGBA byte array (stride 4) along a sequential ramp; nulls and degenerate domains map to the grey, out-of-domain values clamp.
- `categoricalColour(category, categories)` spaces hues evenly over the sorted unique category set, so a category's colour depends only on the set - never on item order.
- `itemLineColours(item, attr, ctx)` produces one RGBA array per line geometry: categorical attributes flood each line with the item's category colour; continuous attributes ramp each line's own values; anything without data floods grey. Points and polygons receive no line colours.

The store derives two computeds from these:

- **`visibleDomain`** - the continuous domain over the **visible items only**. The ramp is adaptive: hiding the track that carries the maximum rescales colour to what is on screen. A value-equality guard returns the identical reference when a toggle does not move min/max, so no downstream recolour fires. Categorical attributes (and empty data) yield `undefined`.
- **`itemColours`** - one RGBA array per line per item, recomputed only when data, visibility, or the selected attribute change. The deliberate asymmetry: the ramp `domain` spans visible items, but `categories` span **all** items, so a transport mode's colour identity never shuffles when its item is hidden and re-shown.

Per-item availability is behavioural, not a module: an item without the selected attribute simply renders grey. The typed-array output shape exists for the renderer's binary-attribute path (per-point colour buffers fed to the GPU layer directly), computed once per state change - never per frame.

## Deferred, and to where

Each deferred piece waits for the phase that names its consumer:

- **Palette registry** (which ramp/hues per basemap x attribute): the renderer phase, tuned against actual visible basemaps. The seam is threading palette data through `rampColours` / `categoricalColour`; `activeBasemap` already exists as a signal, so basemap-driven recolour will fall out of the signal graph.
- **Zoom-limit model**: the renderer phase, built with the zoom behaviour it clamps.
- **Day/divider grouping, waypoint folder bucketing, tri-state group visibility**: the widget phase's track tree and waypoint widgets.
- **Time-of-day palette**: the widget phase (needs the deferred timezone compute).
- **Dataset-wide attribute availability**: the widget phase's attribute dropdown (the colour path already greys unavailable items per-item, so nothing at the renderer level needs it).
