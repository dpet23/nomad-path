# Configuration (`nomadpath.yaml`)

A trip folder is preprocessed by `nomadpath-preprocess` (see [the pipeline](../architecture/pipeline.md)). Placing a `nomadpath.yaml` at the input root customises the build; without one, every file is scanned with default settings.

The config is **exceptions-only**: you list only the paths and folders whose behaviour differs from the default. Anything unlisted takes the defaults below.

The schema is **strict** — an unknown key (a typo like `hiden`) is a hard error, not a silently-ignored no-op. The config is hand-edited by the trip author, so a mistake should stop the build loudly rather than quietly change nothing.

## Top-level keys

```yaml
name: Fictional Archipelago 2030 # optional trip name -> the emitted file's `name`
ignore: # path globs skipped entirely by the scan (and watch)
  - .git/
  - '**/*.swp'
tracks: # per-path overrides, keyed by a glob anchored at the input root
  flights/: { hidden: true, divider: true }
  cyclones/: { excludeFromBounds: true }
waypoints: # per-folder overrides, keyed by the in-file <folder> value
  Accommodation: { hidden: true }
```

| Key         | Type                      | Default | Meaning                                                           |
| ----------- | ------------------------- | ------- | ----------------------------------------------------------------- |
| `name`      | string                    | absent  | Trip name written to the output file.                             |
| `ignore`    | list of path globs        | `[]`    | Files/folders excluded from the scan entirely.                    |
| `tracks`    | map of glob -> settings   | `{}`    | Overrides for track/geometry files, keyed by path.                |
| `waypoints` | map of folder -> settings | `{}`    | Overrides for waypoints, keyed by their in-file `<folder>` value. |

Every key is optional. An empty (or absent) config means: scan everything, all defaults.

## `ignore`

A list of path globs. Any scanned path matching an `ignore` glob is skipped before parsing — it never becomes a feature and never triggers an error. Matching uses the same glob semantics as `tracks` selectors (see [Glob semantics](#glob-semantics)), including dotfiles, so `.git/` and `**/*.swp` match as written.

## `tracks` — per-path overrides

Keys are **path globs anchored at the input root**; values set one or more properties. An entry names only the properties it changes; unset properties inherit from less-specific matches (or fall back to the default).

| Property            | Type         | Default | Effect                                                            |
| ------------------- | ------------ | ------- | ----------------------------------------------------------------- |
| `hidden`            | bool         | `false` | `true` -> the item is hidden by default (`defaultVisible=false`). |
| `divider`           | bool         | `false` | `true` -> render a day/section divider before this item.          |
| `excludeFromBounds` | bool         | `false` | `true` -> keep this item out of the auto-computed map bounds.     |
| `day`               | `YYYY-MM-DD` | absent  | Override the day this item is grouped under.                      |

`day` must be a real ISO calendar date (`2030-01-23`); a malformed or impossible date is a hard error.

> **Note on deferred consumers.** `divider`, `excludeFromBounds`, and `day` are resolved by the config layer today, but the pipeline stages that _consume_ them (bounds computation, day grouping) are deferred until the UI names the exact shape it needs — see the design log, 2026-07-04. Setting them now is accepted and validated; they take effect when those stages land.

### A folder key ends with `/`

A selector ending in `/` (e.g. `flights/`) is a **folder prefix**: it matches every path beneath that folder. A selector without a trailing slash is matched as an ordinary glob against the full path.

## `waypoints` — per-folder overrides

Keys are **not paths** — they are the literal `<folder>` value carried inside a waypoint's source data (e.g. an OsmAnd favourites folder named `Accommodation`). The only property is:

| Property | Type | Default | Effect                                                    |
| -------- | ---- | ------- | --------------------------------------------------------- |
| `hidden` | bool | `false` | `true` -> waypoints in this folder are hidden by default. |

A waypoint with no `<folder>`, or a `<folder>` not listed here, is visible by default.

## Resolution: additive merge + specificity

A single track file can match several selectors at once (a folder prefix, a wildcard, an exact path). Resolution is **additive, per property**:

1. Collect every selector whose glob matches the path.
2. For each property independently, the **most-specific** selector that sets it wins.
3. Properties no selector sets fall back to their defaults.

So two selectors that set _different_ properties both apply — they are merged, not "last wins".

### Specificity

Specificity is scored on the selector as written, in two tiers:

1. **Path depth** — more `/`-separated segments is more specific.
2. **Literalness** (tiebreak at equal depth) — more literal (non-wildcard) segments is more specific.

An exact file path is therefore the most specific selector that can match it. A folder prefix like `flights/` (depth 1) is deliberately **less** specific than a same-area file glob like `flights/scenic-*.kml` (depth 2), which is in turn less specific than the exact file `flights/scenic-042.kml`.

### Worked example: additive merge

```yaml
tracks:
  flights/: { hidden: true, divider: true } # (A) whole folder
  flights/scenic-042.kml: { hidden: false } # (B) one exact file
```

Resolving `flights/scenic-042.kml`:

- Both (A) and (B) match.
- `hidden`: both set it. (B) is more specific (exact file, depth 2 > depth 1), so **`hidden=false`** wins -> the item is visible.
- `divider`: only (A) sets it -> **`divider=true`** carries through.
- `excludeFromBounds`, `day`: no selector sets them -> defaults (`false`, absent).

Result: `flights/scenic-042.kml` is **visible, with a divider, in bounds, no day override** — the scenic flight is un-hidden but keeps the folder's divider.

### Worked example: inheritance across three levels

```yaml
tracks:
  cyclones/: { excludeFromBounds: true } # (A)
  cyclones/alfred-25/: { divider: true } # (B)
  cyclones/alfred-25/path.kml: { hidden: true } # (C)
```

Resolving `cyclones/alfred-25/path.kml` (all three match):

| Property            | Set by   | Winner | Value  |
| ------------------- | -------- | ------ | ------ |
| `excludeFromBounds` | (A) only | (A)    | `true` |
| `divider`           | (B) only | (B)    | `true` |
| `hidden`            | (C) only | (C)    | `true` |

All three merge additively: the item is **hidden, has a divider, and is out of bounds** — each property inherited from the level that set it.

## Equal-specificity conflicts are a hard error

If two selectors of **equal specificity** set the **same property** to **different values**, there is no heuristic tiebreak — the build fails loud, naming both selectors and the property:

```yaml
tracks:
  flights/*.kml: { hidden: true } # (A) depth 2, 1 literal segment
  flights/scenic-*: { hidden: false } # (B) depth 2, 1 literal segment
```

Resolving `flights/scenic-042.kml`: both (A) and (B) match, both are depth 2 with one literal segment (equal specificity), and they disagree on `hidden`. The build stops with:

```text
config conflict for "flights/scenic-042.kml": selectors "flights/*.kml" and
"flights/scenic-*" set "hidden" to conflicting values at equal specificity
```

Fix it by making one selector more specific (deepen the path or add a literal segment) or by removing the disagreement. Note this is only an error when the values _differ_ — two equal-specificity selectors that set the same property to the _same_ value are fine.

## Unmatched selectors warn (non-fatal)

A `tracks:` or `waypoints:` key that matched **zero** scanned files or folders is almost always a stale path or a typo. The build prints a warning to stderr but does not fail:

```text
warning: config selector "flights/old-route.kml" matched no files
```

## Glob semantics

- Globs are matched against **POSIX paths relative to the input root** (forward slashes on every platform).
- Folder selectors end in `/` and match everything beneath (`flights/` behaves as `flights/**`).
- Dotfiles match (`.git/`, `**/*.swp` work as written).
- Standard glob wildcards apply: `*` (one segment), `**` (any depth), `?`, `[...]`, `{...}`.

## Full reference example

```yaml
name: Fictional Archipelago 2030

ignore:
  - .git/
  - '**/*.swp'
  - '**/*.geojson' # unsupported format, skip quietly

tracks:
  # Hide every flight and divide the section; un-hide the one scenic flight.
  flights/: { hidden: true, divider: true }
  flights/scenic-042.kml: { hidden: false }

  # Keep cyclone geometry out of the map's auto bounds.
  cyclones/: { excludeFromBounds: true }

  # A late-night taxi ride belongs to the previous day.
  tracks/day9/late-taxi.gpx: { day: 2030-01-23 }

waypoints:
  # Accommodation pins are off by default; the viewer toggles them on.
  Accommodation: { hidden: true }
```
