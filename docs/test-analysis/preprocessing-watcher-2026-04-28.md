# Preprocessing & watcher test analysis

**Produced:** 2026-04-28
**Still current as of commit:** `2de6029`
**Informs:** Epic 10 (preprocessing & watcher test remediation) — primary; Epic 11 (preprocessing improvements) — secondary.

This doc is the analysis-only output of Epic 10 Phase 1. It is intended to be read cold by future contextless sessions executing Epic 10 Phase 1.5 (contract decision) and Phase 2 (cleanup + new tests).

## Phase 1.5 decision (2026-04-28)

**Contract enforcement: tests-only.** No runtime schema in the library. No shared TypeScript types refactor. No additional test-design discipline rules beyond what Epic 10's existing framework already requires.

**Rationale.** The framework's load-bearing rule — *"the only non-drifting way to verify 'library accepts this output' is to actually load it into the library; hand-written validators are forbidden"* — makes a runtime schema the same artifact shape as Theatre, just on the consumer side. The 44 missing-coverage gaps below already cluster on the three under-tested composition surfaces (pipeline integration, library input variation, watcher); closing them under the existing rules is the proportional response. Shared types would catch field renames at compile time but not value or semantic drift, at the cost of converting preprocessing from JS to TS — disproportionate to the success criterion (*correct under documented conditions, graceful under errors, recoverable in normal cases*, with a competent-user assumption).

**Phase 2 instruction.** Every new test added to close a contract gap (and every test added to close a documented-behaviour, Epic 9, or yaml-config gap) must invoke the real library on pipeline-produced or fixture-shape-varied input and assert observable behaviour. No new Theatre. No hand-written validators outside the library. Tests that only assert internal state without a user-visible counterpart should also assert the user-visible side (per the existing CLAUDE.md "test BOTH label and ranges" rule).

**Evidence log.** A separate file at `docs/test-analysis/escaped-bugs.md` records every manually-caught bug going forward, tagged with the test layer that should have caught it. After 6–10 entries this becomes evidence-based input for any future restructure decision.

## Phase 2 Session A status (2026-04-29)

Closed:
- **15 deletes** in `test/e2e/seam.spec.ts` (Theatre tests).
- **All 15 output⟷input contract gaps (§3 area 1).** Tests at `test/integration/contract.spec.ts`. Three small library fixes shipped with their tests: gap 5 (`antimeridianSplit` preserves altitude), gap 7 (`mergeRanges` throws on unit mismatch), gap 14 (`DataLoader` warns on unknown `type`). Two regression-only tests pin current behaviour for design-deferred defects: gap 8 (`deriveTrackId` collision → Epic 11) and gap 12 (POI empty `category` → Epic 11). Gap 2 (initial-load `metadata.attributeRanges` consumption) was deferred to Epic 13 because the natural test surfaces an `AttributeLegend` recompute-vs-metadata precedence question that's better handled as an L-Unit test of `LayerManager.addLayers`.

Sessions B and C still owe: 12 documented-behaviour gaps, 8 Epic 9 invariant gaps (incl. watcher infrastructure), 9 yaml-config gaps, watcher scenario coverage, naming refactor, epic close.

## How to read this doc

Three sections:

1. **Inventory** — every existing `it`/`test` block under `preprocessing/lib/*.test.js`, `test/integration/`, and `test/e2e/`, with file, line, name, what it asserts, success-or-failure case, and framework category. Out of scope: `src/core/*.test.ts` (those are Epic 13).
2. **Verdicts** — per-test grade (keep / rewrite / delete) with reason. The category column here is the *corrected* category after a fresh read of the test code; it may differ from the inventory column if the inventory pass mis-classified.
3. **Missing coverage** — behaviours/contracts no test in the inventory exercises, organised by area (output⟷input contract, documented behaviour, Epic 9 invariants, yaml config). Each gap cites concrete file:line evidence.

## Framework categories used

- **P-Unit** — pipeline module in isolation
- **P-Integration** — `build-trip-data.js` spawned against temp filesystem
- **L-Unit** — library module in isolation, mocks for collaborators
- **L-Integration** — library in real browser given known-good static fixture
- **Seam** — library in real browser given pipeline-actually-produced output
- **Watcher** — `watch.js` end-to-end as a process
- **Theatre** — hand-mirrors library expectations against JSON without invoking the library
- **Tautology** — asserts what the test setup made true
- **Regression-only** — asserts a known value derived from a known fixture

The single load-bearing rule from the framework: **the only non-drifting way to verify "library accepts this output" is to actually load it into the library.** Hand-written validators are forbidden.

## Headline numbers

- **234 tests** in scope.
- Verdicts: **219 keep**, **0 rewrite**, **15 delete**.
- Categories (corrected): 117 P-Unit, 93 L-Integration, 15 Theatre, 9 Seam.
- **44 missing-coverage gaps** identified: 15 output-input-contract, 12 documented-behaviour, 8 epic9-invariant, 9 yaml-config.

---

## 1. Inventory

Sorted by file then line. The `Cat.` column is Subagent A's first-pass category; if Subagent B corrected it during the verdicts pass, the corrected value is in the Verdicts table below.

### `preprocessing/lib/enrichment.test.js` (17 tests)

| Line | Cat. | Case | Name | Asserts |
|------|------|------|------|---------|
| 21 | P-Unit | success | returns a value in daytime range (90-270) for midday UTC+9 | computeSunAngle returns 90-270 for Tokyo midday |
| 28 | P-Unit | success | returns a value in pre-dawn range (0-90) for early morning UTC+9 | computeSunAngle returns 0-90 for pre-dawn Tokyo |
| 35 | P-Unit | success | returns a value in post-dusk range (270-360) for evening UTC+9 | computeSunAngle returns 270-360 for post-dusk Tokyo |
| 42 | P-Unit | success | returns an integer (rounded to nearest degree) | computeSunAngle result is an integer |
| 47 | P-Unit | success | pre-dawn angle is less than post-dusk angle (distinguishable) | pre-dawn and post-dusk sun angles are distinct and ordered |
| 62 | P-Unit | success | preserves GPX extension speed on point 0 (<osmand:speed>) | enrichTrack carries osmand:speed through as km/h on point 0 |
| 67 | P-Unit | success | preserves GPX extension speed on point 1 (<speed_2d>) | enrichTrack carries speed_2d through as km/h on point 1 |
| 71 | P-Unit | success | computes Haversine fallback speed for point 2 (no extension) | enrichTrack computes positive Haversine speed when no extension present |
| 76 | P-Unit | success | does not assign speed to the first point when no extension present | first point with no extension and no prior point gets no speed; second point gets Haversine speed |
| 94 | P-Unit | success | adds sunAngle to every point | enrichTrack sets sunAngle property on all points |
| 100 | P-Unit | success | sunAngle is an integer in daytime range for timestamped daytime points | enrichTrack sets integer sunAngle in 90-270 for daytime GPS points |
| 109 | P-Unit | success | sunAngle is null for points without a timestamp | enrichTrack assigns null sunAngle when points have no time field |
| 125 | P-Unit | success | KML flight track (no timestamps) gets null sunAngle for all points | enrichTrack assigns null sunAngle to all points of a timestamp-free KML track |
| 133 | P-Unit | success | returns null sunAngle for polar location during polar day (Svalbard, June 21) | enrichTrack assigns null sunAngle for polar-day location where suncalc returns undefined sunrise/sunset |
| 156 | P-Unit | failure | returns no Haversine speed when consecutive points share the same timestamp | enrichTrack omits speedKmh when dt=0 to avoid divide-by-zero |
| 175 | P-Unit | failure | returns no Haversine speed when timestamp goes backward | enrichTrack omits speedKmh when dt<0 (reversed timestamps) |
| 190 | P-Unit | success | preserves an extension speed of exactly 0 km/h | enrichTrack keeps speedKmh=0 rather than treating it as falsy/missing |

### `preprocessing/lib/grouping.test.js` (14 tests)

| Line | Cat. | Case | Name | Asserts |
|------|------|------|------|---------|
| 33 | P-Unit | success | assigns YYYY-MM-DD based on local date of first timed point | groupTracks day key uses local-timezone date of first point |
| 47 | P-Unit | success | assigns the local date, not the UTC date, when they differ | groupTracks day key is local date even when UTC date differs |
| 62 | P-Unit | success | groups two tracks on the same local date with the same day key | groupTracks assigns identical day key to tracks with same local date |
| 83 | P-Unit | success | assigns different day keys to tracks on different local dates | groupTracks assigns distinct day keys to tracks on different local dates |
| 106 | P-Unit | success | falls back to filename stem when no timestamps are present | groupTracks uses filename stem as day key when track has no timestamps |
| 125 | P-Unit | success | assigns a unique key that starts with "flight-" | groupTracks produces a flight- prefixed day key for flight tracks |
| 138 | P-Unit | success | uses UTC departure date in the key | groupTracks embeds UTC departure date in flight day key |
| 151 | P-Unit | success | gives two flights on different days distinct keys | groupTracks assigns distinct keys to flights on different UTC departure dates |
| 172 | P-Unit | success | is never equal to a ground track day key on the same UTC date | groupTracks flight key never collides with ground-track day key on the same date |
| 193 | P-Unit | success | falls back gracefully when no timestamps are present | groupTracks still produces a flight- key for a flight with no timestamps |
| 212 | P-Unit | success | returns empty array for empty input | groupTracks returns [] for empty input |
| 216 | P-Unit | success | two flights on the same UTC date with the same name get distinct day keys | groupTracks disambiguates same-name same-date connecting flights with distinct keys |
| 238 | P-Unit | failure | does not crash when coordinates are out of valid range | groupTracks does not throw for invalid lat/lon values |
| 257 | P-Unit | success | preserves all existing track properties | groupTracks passes through name, transportMode, and points unchanged |

### `preprocessing/lib/output.test.js` (39 tests)

| Line | Cat. | Case | Name | Asserts |
|------|------|------|------|---------|
| 55 | P-Unit | success | produces a valid GeoJSON FeatureCollection | buildGeoJSON returns object with type FeatureCollection and features array |
| 60 | P-Unit | success | embeds metadata with tripName and attributeRanges | buildGeoJSON result.metadata has tripName and attributeRanges |
| 65 | P-Unit | success | has no feature ids (deferred to Epic 3) | buildGeoJSON features have no id field |
| 80 | P-Unit | success | produces a LineString feature for the track | buildGeoJSON emits a LineString feature for the GPX track |
| 85 | P-Unit | success | sets required track properties | buildGeoJSON track feature has name, type, transportMode, day, defaultVisible |
| 93 | P-Unit | success | coordinates are [lon, lat] pairs | buildGeoJSON coordinates are in [lon, lat] order |
| 99 | P-Unit | success | includes times parallel array | buildGeoJSON track properties.times is array of same length as coordinates |
| 104 | P-Unit | success | includes elevations parallel array | buildGeoJSON track properties.elevations has correct first value |
| 109 | P-Unit | success | includes speeds parallel array (with null where missing) | buildGeoJSON speeds array has extension speed on pt0 and Haversine speed on pt2 |
| 117 | P-Unit | success | includes sunAngles parallel array | buildGeoJSON sunAngles array has non-null daytime values for timestamped points |
| 127 | P-Unit | success | parallel arrays all have the same length as coordinates | buildGeoJSON all parallel arrays match coordinate count |
| 144 | P-Unit | success | produces a flight track with day key starting with "flight-" | buildGeoJSON KML flight track has flight- prefixed day property |
| 148 | P-Unit | success | omits times array when no timestamps present | buildGeoJSON omits properties.times when track has no timestamps |
| 152 | P-Unit | success | omits sunAngles array when all values would be null | buildGeoJSON omits properties.sunAngles when all values are null |
| 156 | P-Unit | success | omits speeds array when no speeds could be computed | buildGeoJSON omits properties.speeds when no speed data exists |
| 171 | P-Unit | success | produces Point features for waypoints | buildGeoJSON emits two Point features for waypoints |
| 175 | P-Unit | success | sets poi properties | buildGeoJSON POI feature has name and category from waypoint |
| 180 | P-Unit | success | defaultVisible is true when no poi_categories config is provided | buildGeoJSON POI defaults to defaultVisible true with no category config |
| 184 | P-Unit | success | defaultVisible is false when category is configured as hidden | buildGeoJSON POI honours defaultVisible:false from category config |
| 192 | P-Unit | success | defaultVisible is true for categories not in poi_categories config | buildGeoJSON POI category absent from config defaults to visible |
| 210 | P-Unit | success | passes group and defaultVisible from augmented track to feature properties | buildGeoJSON propagates group and defaultVisible from augmented track |
| 224 | P-Unit | success | defaults group to null and defaultVisible to true when not set | buildGeoJSON sets group null and defaultVisible true when not provided |
| 241 | P-Unit | success | embeds stats in metadata | buildGeoJSON metadata.stats is defined |
| 245 | P-Unit | success | counts tracks and waypoints | buildGeoJSON stats has correct trackCount and waypointCount |
| 249 | P-Unit | success | counts unique ground days | buildGeoJSON stats.dayCount equals number of unique ground day keys |
| 253 | P-Unit | success | counts transport modes | buildGeoJSON stats.transportModes has correct counts per mode |
| 258 | P-Unit | success | includes dateRange for ground tracks | buildGeoJSON stats.dateRange has start and end in YYYY-MM-DD format |
| 264 | P-Unit | success | excludes flight day keys from dayCount and dateRange | buildGeoJSON stats excludes flight-prefixed days from dayCount and dateRange |
| 296 | P-Unit | success | emits track features in chronological order regardless of input order | buildGeoJSON sorts track features by day key ascending |
| 309 | P-Unit | success | sorts flight-day keys by embedded date | buildGeoJSON sorts flight tracks by the date embedded in their flight- key |
| 329 | P-Unit | success | produces a valid FeatureCollection with no features | buildGeoJSON returns empty FeatureCollection for empty input |
| 334 | P-Unit | success | stats have zero counts and no dateRange | buildGeoJSON stats are all zero with no dateRange for empty input |
| 340 | P-Unit | success | attributeRanges is empty | buildGeoJSON metadata.attributeRanges is empty object for empty input |
| 353 | P-Unit | success | treats a null config entry as defaultVisible: true | buildGeoJSON treats null category config as defaultVisible true |
| 384 | P-Unit | success | propagates excludeFromAutoBounds: true to feature properties | buildGeoJSON sets excludeFromAutoBounds:true on feature when track has it |
| 394 | P-Unit | success | omits excludeFromAutoBounds from feature properties when false | buildGeoJSON omits excludeFromAutoBounds from feature when value is false |
| 413 | P-Unit | success | computes elevation range across all track points | buildGeoJSON attributeRanges.elevation has correct min, max, and unit |
| 420 | P-Unit | success | computes speed range across all track points | buildGeoJSON attributeRanges.speed has positive min and correct unit |
| 426 | P-Unit | success | omits elevation range when no track has elevation data | buildGeoJSON omits attributeRanges.elevation when no elevation data exists |

### `preprocessing/lib/parsers.test.js` (47 tests)

| Line | Cat. | Case | Name | Asserts |
|------|------|------|------|---------|
| 15 | P-Unit | success | detects flight from filename | detectTransportMode returns flight for flight-/fly- filename patterns |
| 20 | P-Unit | success | detects flight from FlightAware-prefixed filename | detectTransportMode returns flight for FlightAware_ filename prefix |
| 25 | P-Unit | success | detects walk from filename | detectTransportMode returns walk for walk/hike filename patterns |
| 29 | P-Unit | success | detects boat from filename | detectTransportMode returns boat for ferry filename pattern |
| 33 | P-Unit | success | defaults to drive | detectTransportMode returns drive when no pattern matches |
| 46 | P-Unit | success | returns one track | parseGPX returns exactly one track from the fixture |
| 50 | P-Unit | success | reads track name from <trk><name> | parseGPX extracts track name from <trk><name> element |
| 54 | P-Unit | success | reads transport mode from <osmand:activity> metadata | parseGPX infers transportMode from OsmAnd activity metadata |
| 59 | P-Unit | success | returns three points | parseGPX returns the expected number of track points |
| 63 | P-Unit | success | reads lon/lat correctly | parseGPX extracts correct lon/lat values from trkpt attributes |
| 68 | P-Unit | success | reads elevation in metres | parseGPX extracts elevation from <ele> element in metres |
| 73 | P-Unit | success | reads timestamps as Unix milliseconds | parseGPX converts <time> ISO strings to Unix milliseconds |
| 78 | P-Unit | success | reads speed from <osmand:speed> extension (m/s → km/h) | parseGPX converts osmand:speed from m/s to km/h |
| 83 | P-Unit | success | reads speed from <speed_2d><value> extension (m/s → km/h) | parseGPX converts speed_2d/value from m/s to km/h |
| 88 | P-Unit | success | omits speedKmh when no speed extension is present | parseGPX leaves speedKmh undefined when no speed extension exists |
| 92 | P-Unit | success | returns no waypoints | parseGPX returns empty waypoints array for track-only GPX |
| 104 | P-Unit | success | reads transport mode from <osmand:activity> inside <trk><extensions> | parseGPX reads activity from trk-level extensions element |
| 108 | P-Unit | success | reads track name | parseGPX extracts track name from trk-activity fixture |
| 120 | P-Unit | success | reads transport mode from metadata (walking → walk) | parseGPX maps OsmAnd walking activity to walk transportMode |
| 124 | P-Unit | success | omits elevation when the <ele> element is absent | parseGPX leaves elevation undefined when <ele> is absent |
| 128 | P-Unit | success | still reads timestamps | parseGPX reads timestamps even when no elevation data exists |
| 139 | P-Unit | success | returns no tracks | parseGPX returns empty tracks array for waypoints-only GPX |
| 143 | P-Unit | success | returns two waypoints | parseGPX returns two waypoints from the fixture |
| 147 | P-Unit | success | reads waypoint name and coordinates | parseGPX extracts name, lon, lat from <wpt> element |
| 153 | P-Unit | success | reads category from GPX <type> element | parseGPX maps <type> to category for each waypoint |
| 165 | P-Unit | success | returns one track | parseKML returns exactly one track from KML fixture |
| 169 | P-Unit | success | reads track name | parseKML extracts track name from KML Placemark |
| 173 | P-Unit | success | reads three coordinate points (KML order: lon,lat,alt) | parseKML extracts correct point count and lon/lat in KML coordinate order |
| 181 | P-Unit | success | detects flight from filename (KML has no activity metadata) | parseKML falls back to filename detection for transportMode |
| 185 | P-Unit | success | has no timestamps for plain KML LineString | parseKML leaves time undefined for plain KML LineString points |
| 189 | P-Unit | success | returns no waypoints | parseKML returns empty waypoints array for track-only KML |
| 200 | P-Unit | success | returns one track | parseKML returns one track from FlightAware gx:Track fixture |
| 205 | P-Unit | success | detects flight transport mode from filename | parseKML detects flight from FlightAware_ filename prefix |
| 209 | P-Unit | success | reads track name from Placemark | parseKML extracts track name from KML Placemark element |
| 213 | P-Unit | success | reads timestamps from gx:Track | parseKML parses gx:when timestamps to Unix milliseconds |
| 217 | P-Unit | success | reads three coordinate points | parseKML extracts correct point count from gx:Track fixture |
| 225 | P-Unit | success | detects flight transport mode from KML document name | parseKML detects flight mode from FlightAware document name even when filename is generic |
| 235 | P-Unit | success | dispatches .gpx to parseGPX | parseFile routes .gpx extension to parseGPX |
| 240 | P-Unit | success | dispatches .kml to parseKML | parseFile routes .kml extension to parseKML |
| 245 | P-Unit | failure | throws a descriptive error for unsupported extensions | parseFile throws with 'Unsupported file format' for unknown extension |
| 257 | P-Unit | success | returns no tracks for a GPX with no <trk> elements | parseGPX returns empty tracks array for empty GPX document |
| 261 | P-Unit | success | returns no waypoints for a GPX with no <wpt> elements | parseGPX returns empty waypoints array for empty GPX document |
| 273 | P-Unit | success | uses the lowercased activity string as transportMode when not in ACTIVITY_MAP | parseGPX lowercases unknown OsmAnd activity strings instead of defaulting to drive |
| 287 | P-Unit | success | detects flight mode from path component regardless of activity metadata | parseGPX overrides activity metadata with flight when file is in a flights/ subfolder |
| 299 | P-Unit | success | returns the track | parseGPX returns one track with correct name from mixed track+waypoints fixture |
| 303 | P-Unit | success | returns the waypoint | parseGPX returns one waypoint with name and category from mixed fixture |
| 318 | P-Unit | success | prefers <osmand:speed> (10 m/s → 36 km/h) over <speed_2d> (5 m/s) when both present | parseGPX prefers osmand:speed over speed_2d when both extensions are on same trkpt |

### `test/e2e/seam.spec.ts` (24 tests)

| Line | Cat. | Case | Name | Asserts |
|------|------|------|------|---------|
| 33 | Seam | success | fixture loads without error | nomadMapReady is true after loading pipeline-generated fixture |
| 38 | Theatre | success | trip metadata is accessible and has correct structure | trips[0].metadata has tripName, attributeRanges, and stats from pipeline output |
| 50 | Theatre | success | attributeRanges has elevation and speed with correct units | metadata attributeRanges has elevation and speed with correct units and finite values |
| 69 | Theatre | success | stats reflect the fixture input files | metadata stats has correct trackCount, waypointCount, dayCount, transportModes, and dateRange |
| 91 | Theatre | success | all tracks have required properties | every track feature has name, day, transportMode, defaultVisible, LineString geometry with 2+ coords |
| 111 | Theatre | success | track transport modes match expected values | named tracks have expected transportMode values from pipeline |
| 128 | Theatre | success | flight track has a flight-prefixed day key | flight feature's day property starts with 'flight-2025-06-09-' |
| 140 | Theatre | success | ground tracks sharing a date share the same day key | tracks on 2025-06-10 both have day '2025-06-10' and there are exactly 2 of them |
| 153 | Theatre | success | parallel arrays have correct length (one per coordinate) | elevations, speeds, sunAngles, times arrays match coordinate count for every track |
| 180 | Theatre | success | metadata elevation range actually bounds all per-point values | attributeRanges.elevation.min <= all point elevations and max >= all point elevations |
| 205 | Theatre | success | metadata speed range actually bounds all per-point values | attributeRanges.speed.min <= all point speeds and max >= all point speeds |
| 236 | Theatre | success | flight track has group "flights" from subfolder | flight feature's group property is 'flights' |
| 248 | Theatre | success | flight track has excludeFromAutoBounds from yaml | flight feature's excludeFromAutoBounds property is true |
| 260 | Theatre | success | root-level tracks have group null | all non-flight track features have group property equal to null |
| 273 | Theatre | success | landmark POI has defaultVisible false from yaml | landmark POI feature's defaultVisible is false per yaml config |
| 285 | Theatre | success | accommodation POI has defaultVisible true (default) | accommodation POI feature's defaultVisible is true (default) |
| 303 | Seam | success | track layer exists after loading pipeline fixture | _map.getLayer('np-tracks-layer') is truthy after loading pipeline output |
| 311 | Seam | success | track source has features from pipeline output | serialized track source has >= 4 features from pipeline-produced segments |
| 323 | Seam | success | POI source has features from pipeline output | serialized POI source has exactly 2 features from pipeline output |
| 334 | Seam | success | track legend shows correct day groups | track legend day headers have >= 2 items and at least one mentions flight |
| 344 | Seam | success | attribute legend shows pipeline ranges | speed range label text contains 'km/h' after selecting speed attribute |
| 354 | Seam | success | POI legend shows categories from pipeline | POI legend category headers include 'accommodation' and 'landmark' |
| 362 | Seam | success | landmark POI category is hidden at load (defaultVisible: false) | isPOICategoryVisible('landmark') is false on load from pipeline fixture |
| 370 | Seam | success | accommodation POI category is visible at load | isPOICategoryVisible('accommodation') is true on load from pipeline fixture |

### `test/integration/legends.spec.ts` (54 tests)

| Line | Cat. | Case | Name | Asserts |
|------|------|------|------|---------|
| 47 | L-Integration | success | TrackLegend: panel is visible on page load | .np-track-legend element is visible in the browser |
| 52 | L-Integration | success | TrackLegend: renders a row per track | track legend has exactly 3 .np-track-row elements |
| 58 | L-Integration | success | TrackLegend: unchecking a track hides it | unchecking a track checkbox sets isTrackVisible to false |
| 71 | L-Integration | success | TrackLegend: zoom button fits map to track | clicking zoom button moves map center to Tokyo track coordinates |
| 86 | L-Integration | success | TrackLegend: day groups start collapsed and header click toggles | day group has np-day-group--collapsed class initially; header click removes it |
| 98 | L-Integration | success | AttributeLegend: panel is visible on page load | .np-attr-legend element is visible in the browser |
| 103 | L-Integration | success | AttributeLegend: dropdown has one option per colour attribute | .np-attr-select has exactly 5 option elements |
| 109 | L-Integration | success | AttributeLegend: speed label shows range of visible tracks only | speed range label text matches visible-only track speed range |
| 115 | L-Integration | success | AttributeLegend: speed layer ranges exclude hidden tracks on initial load | LayerManager._ranges.speed.min is 30 (not 3 from hidden Sydney Walk) |
| 124 | L-Integration | success | AttributeLegend: elevation label shows range of visible tracks only | elevation range label text matches visible-only track elevation range |
| 130 | L-Integration | success | AttributeLegend: elevation layer ranges exclude hidden tracks on initial load | LayerManager._ranges.elevation.min is 10 (not 1 from hidden Sydney Walk) |
| 137 | L-Integration | success | AttributeLegend: hiding a track via checkbox narrows the range label | unchecking Helsinki Flight updates speed range label to Tokyo-only range |
| 146 | L-Integration | success | AttributeLegend: hiding a track via checkbox narrows the layer ranges | unchecking Helsinki Flight sets _ranges.speed.max to Tokyo max (60) |
| 155 | L-Integration | success | AttributeLegend: hiding a track via checkbox narrows the elevation range label | unchecking Helsinki Flight updates elevation range label to Tokyo-only range |
| 163 | L-Integration | success | AttributeLegend: showing a hidden track via checkbox widens the range label | checking Sydney Walk updates speed range label to include Sydney's range |
| 172 | L-Integration | success | AttributeLegend: showing a hidden track via checkbox widens the layer ranges | checking Sydney Walk sets _ranges.speed.min to 3 (Sydney Walk min) |
| 181 | L-Integration | success | AttributeLegend: selecting transportMode shows mode list | selecting transportMode from dropdown makes .np-mode-list visible |
| 191 | L-Integration | success | POILegend: panel is visible on page load | .np-poi-legend element is visible in the browser |
| 196 | L-Integration | success | POILegend: renders the fixture POI after expanding category | expanding category header shows POI name 'Test Hotel' |
| 205 | L-Integration | success | POILegend: category with defaultVisible false starts hidden | isPOICategoryVisible('viewpoint') is false on load |
| 213 | L-Integration | success | POILegend: category with defaultVisible true starts visible | isPOICategoryVisible('accommodation') is true on load |
| 222 | L-Integration | success | POILegend: category checkbox unchecked for hidden category | viewpoint category header checkbox is unchecked on load |
| 239 | L-Integration | success | POILegend: zoom button fits map to POI | clicking POI zoom button moves map center to hotel coordinates |
| 256 | L-Integration | success | MobileMenu: hamburger button is hidden on desktop | .np-mobile-btn is hidden at desktop viewport width |
| 263 | L-Integration | success | MobileMenu: hamburger visible and drawer opens on mobile viewport | .np-mobile-btn visible and drawer opens on 375px viewport |
| 299 | L-Integration | success | setBasemap: defaultVisible true track stays visible (no user interaction) | isTrackVisible returns true for defaultVisible track after basemap switch |
| 305 | L-Integration | success | setBasemap: defaultVisible false track stays hidden (no user interaction) | isTrackVisible returns false for hidden track after basemap switch |
| 311 | L-Integration | success | setBasemap: user-hidden track stays hidden after basemap switch | isTrackVisible returns false for user-hidden track after basemap switch |
| 320 | L-Integration | success | setBasemap: user-shown track stays visible after basemap switch | isTrackVisible returns true for user-shown track after basemap switch |
| 331 | L-Integration | success | setBasemap: defaultVisible true POI category stays visible (no user interaction) | isPOICategoryVisible('accommodation') is true after basemap switch |
| 337 | L-Integration | success | setBasemap: defaultVisible false POI category stays hidden (no user interaction) | isPOICategoryVisible('viewpoint') is false after basemap switch |
| 343 | L-Integration | success | setBasemap: user-hidden POI category stays hidden after basemap switch | isPOICategoryVisible('accommodation') is false after unchecking then switching basemap |
| 351 | L-Integration | success | setBasemap: user-shown POI category stays visible after basemap switch | isPOICategoryVisible('viewpoint') is true after checking then switching basemap |
| 361 | L-Integration | success | setBasemap: speed range preserved for default visible tracks | speed range label unchanged after basemap switch |
| 368 | L-Integration | success | setBasemap: speed layer ranges preserved for default visible tracks | _ranges.speed.min is still 30 (Sydney Walk excluded) after basemap switch |
| 376 | L-Integration | success | setBasemap: elevation range preserved for default visible tracks | elevation range label unchanged after basemap switch |
| 383 | L-Integration | success | setBasemap: user-hidden track remains excluded from range after basemap switch | speed range label stays at Tokyo-only after hiding Helsinki and switching basemap |
| 394 | L-Integration | success | setBasemap: user-hidden track excluded from layer ranges after basemap switch | _ranges.speed.max stays at 60 after hiding Helsinki and switching basemap |
| 404 | L-Integration | success | setBasemap: user-shown track remains included in range after basemap switch | speed range label stays at all-tracks range after showing Sydney and switching basemap |
| 415 | L-Integration | success | setBasemap: user-shown track included in layer ranges after basemap switch | _ranges.speed.min stays at 3 after showing Sydney Walk and switching basemap |
| 431 | L-Integration | success | setBasemap: defaultVisible false track checkbox remains unchecked after basemap switch | Sydney Walk row checkbox is unchecked after basemap switch |
| 439 | L-Integration | success | setBasemap: defaultVisible true track checkbox remains checked after basemap switch | Tokyo Drive row checkbox is checked after basemap switch |
| 447 | L-Integration | success | setBasemap: user-hidden track checkbox stays unchecked after basemap switch | Helsinki Flight row checkbox stays unchecked after hiding and switching basemap |
| 458 | L-Integration | success | setBasemap: user-shown track checkbox stays checked after basemap switch | Sydney Walk row checkbox stays checked after showing and switching basemap |
| 474 | L-Integration | success | TrackLegend: group header checkbox hides all tracks in that day group | unchecking group header checkbox sets isTrackVisible to false for all tracks in group |
| 482 | L-Integration | success | TrackLegend: group header checkbox shows all tracks in that day group | checking group header checkbox sets isTrackVisible to true for all tracks in group |
| 490 | L-Integration | success | TrackLegend: group checkbox uncheck also unchecks individual track row checkboxes | unchecking group header also unchecks individual track row checkbox DOM state |
| 500 | L-Integration | success | TrackLegend: group checkbox check also checks individual track row checkboxes | checking group header also checks individual track row checkbox DOM state |
| 510 | L-Integration | success | TrackLegend: hiding a group via group checkbox narrows the attribute range | unchecking Helsinki group header updates speed range label to Tokyo-only |
| 523 | L-Integration | success | AttributeLegend: hiding all visible tracks shows "no data" for speed | speed range label shows 'Speed: no data' when all visible tracks are hidden |
| 532 | L-Integration | success | AttributeLegend: hiding all visible tracks empties layer ranges | _ranges.speed is undefined when all visible tracks are hidden |
| 543 | L-Integration | success | AttributeLegend: re-showing a track after hiding all restores speed range | speed range label restores to Tokyo-only after hiding all then re-showing Tokyo |
| 556 | L-Integration | success | setBasemap: colour attribute dropdown preserves selected value | selected attribute dropdown value is still 'speed' after basemap switch |
| 564 | L-Integration | success | setBasemap: colour attribute paint expression uses correct attribute after switch | line-color paint property is a 'case' expression array after basemap switch with speed selected |

### `test/integration/map.spec.ts` (39 tests)

| Line | Cat. | Case | Name | Asserts |
|------|------|------|------|---------|
| 59 | L-Integration | success | map loads without error | page navigates and nomadMapReady is set without console errors |
| 63 | L-Integration | success | track source exists | _map.getSource('np-tracks') returns a truthy value |
| 69 | L-Integration | success | track layer exists | _map.getLayer('np-tracks-layer') returns a truthy value |
| 75 | L-Integration | success | track source contains segment features | serialized track source has at least one feature |
| 93 | L-Integration | success | POI source exists | _map.getSource('np-pois') returns a truthy value |
| 99 | L-Integration | success | POI circle layer exists | _map.getLayer('np-pois-layer') returns a truthy value |
| 105 | L-Integration | success | POI label layer exists | _map.getLayer('np-pois-labels') returns a truthy value |
| 111 | L-Integration | success | POI source contains the fixture POI | serialized POI source has at least one feature |
| 120 | L-Integration | success | POI circle layer is visible (not hidden) | np-pois-layer visibility layout property is undefined or 'visible' |
| 129 | L-Integration | success | POI circle actually renders in the viewport at POI coordinates | queryRenderedFeatures finds np-pois-layer feature after jumping to POI location |
| 152 | L-Integration | success | Tokyo Drive (defaultVisible: true) is visible on load | isTrackVisible returns true for Tokyo Drive on initial load |
| 160 | L-Integration | success | Sydney Walk (defaultVisible: false) is hidden on load | isTrackVisible returns false for Sydney Walk on initial load |
| 168 | L-Integration | success | setTrackVisible(true) makes a hidden track visible | isTrackVisible returns true after calling setTrackVisible(id, true) |
| 177 | L-Integration | success | setTrackVisible(false) hides a visible track | isTrackVisible returns false after calling setTrackVisible(id, false) |
| 196 | L-Integration | success | initial auto-fit only includes visible tracks (Tokyo, not Sydney) | initial map south bound is above TOKYO_MIN_LAT (Sydney excluded) |
| 205 | L-Integration | success | fitToTracks() only fits visible tracks | fitToTracks() sets south bound above TOKYO_MIN_LAT when Sydney is hidden |
| 213 | L-Integration | success | excludeFromAutoBounds track is visible but excluded from initial auto-fit | Helsinki Flight is visible but its 60°N coords do not affect initial north bound |
| 229 | L-Integration | success | fitToTracks() expands bounds when hidden track is made visible | fitToTracks() includes Sydney's latitude after making Sydney Walk visible |
| 239 | L-Integration | failure | fitToTracks() with all tracks hidden is a no-op (no crash) | fitToTracks() does not throw and track layer still exists when no tracks visible |
| 291 | L-Integration | success | track layer survives a basemap switch to blueMarble | np-tracks-layer exists after setBasemap('blueMarble') |
| 297 | L-Integration | success | track source survives a basemap switch to blueMarble | np-tracks source exists after setBasemap('blueMarble') |
| 303 | L-Integration | success | POI layer survives a basemap switch to blueMarble | np-pois-layer exists after setBasemap('blueMarble') |
| 312 | L-Integration | success | track visibility state is preserved after basemap switch | isTrackVisible returns false for Sydney Walk after basemap switch |
| 323 | L-Integration | success | switching back to osm restores track layer | np-tracks-layer exists after switching blueMarble then back to osm |
| 331 | L-Integration | failure | rapid basemap switching does not crash | track layer survives 3 rapid basemap switches without waiting for each |
| 348 | L-Integration | failure | track visibility survives rapid basemap switching | isTrackVisible remains false for hidden track after rapid basemap switches |
| 370 | L-Integration | success | zoom is clamped when switching to a basemap with lower maxZoom | map zoom is <= 8 after switching to blueMarble from zoom 12 |
| 387 | L-Integration | success | default colour attribute is "day" | nomadMap.colourAttribute is 'day' on initial load |
| 393 | L-Integration | success | setColourAttribute updates the getter | colourAttribute getter returns 'speed' after setColourAttribute('speed') |
| 399 | L-Integration | success | setColourAttribute does not remove the track layer | track layer still exists after cycling through all colour attributes |
| 417 | L-Integration | success | track layer filter excludes hidden tracks on load | track layer filter literal excludes Sydney Walk and includes Tokyo Drive and Helsinki Flight |
| 428 | L-Integration | success | track layer filter drops a track when it is hidden | track layer filter literal no longer contains Tokyo Drive after hiding it |
| 436 | L-Integration | success | track layer filter adds a track when it is shown | track layer filter literal contains Sydney Walk after showing it |
| 444 | L-Integration | success | line-color is an expression (array) on load | getPaintProperty returns an array for line-color on initial load |
| 452 | L-Integration | success | line-color expression changes when colour attribute switches from day to speed | line-color paint property JSON changes after setColourAttribute('speed') |
| 470 | L-Integration | success | removes all UI panels from the DOM | .np-panel count is 0 after destroy() |
| 479 | L-Integration | success | removes map controls from the DOM | .np-map-controls count is 0 after destroy() |
| 487 | L-Integration | success | removes mobile menu elements from the DOM | mobile btn, backdrop, and drawer are all removed after destroy() |
| 496 | L-Integration | success | removes the map canvas | .maplibregl-canvas count is 0 after destroy() |

---

## 2. Verdicts

Grouped by verdict (delete first, then rewrite, then keep). Within each group, sorted by file then line.

The `Cat.` column here is Subagent B's *corrected* category (may differ from the inventory if Subagent A's classification was revised).

### Verdict: delete (15)

| File | Line | Cat. | Name | Reason |
|------|------|------|------|--------|
| `test/e2e/seam.spec.ts` | 38 | Theatre | trip metadata is accessible and has correct structure | Reads pipeline JSON output (trips[0].features / metadata) directly without invoking the library; duplicates P-Unit/P-Integration coverage at higher cost. |
| `test/e2e/seam.spec.ts` | 50 | Theatre | attributeRanges has elevation and speed with correct units | Reads pipeline JSON output (trips[0].features / metadata) directly without invoking the library; duplicates P-Unit/P-Integration coverage at higher cost. |
| `test/e2e/seam.spec.ts` | 69 | Theatre | stats reflect the fixture input files | Reads pipeline JSON output (trips[0].features / metadata) directly without invoking the library; duplicates P-Unit/P-Integration coverage at higher cost. |
| `test/e2e/seam.spec.ts` | 91 | Theatre | all tracks have required properties | Reads pipeline JSON output (trips[0].features / metadata) directly without invoking the library; duplicates P-Unit/P-Integration coverage at higher cost. |
| `test/e2e/seam.spec.ts` | 111 | Theatre | track transport modes match expected values | Reads pipeline JSON output (trips[0].features / metadata) directly without invoking the library; duplicates P-Unit/P-Integration coverage at higher cost. |
| `test/e2e/seam.spec.ts` | 128 | Theatre | flight track has a flight-prefixed day key | Reads pipeline JSON output (trips[0].features / metadata) directly without invoking the library; duplicates P-Unit/P-Integration coverage at higher cost. |
| `test/e2e/seam.spec.ts` | 140 | Theatre | ground tracks sharing a date share the same day key | Reads pipeline JSON output (trips[0].features / metadata) directly without invoking the library; duplicates P-Unit/P-Integration coverage at higher cost. |
| `test/e2e/seam.spec.ts` | 153 | Theatre | parallel arrays have correct length (one per coordinate) | Reads pipeline JSON output (trips[0].features / metadata) directly without invoking the library; duplicates P-Unit/P-Integration coverage at higher cost. |
| `test/e2e/seam.spec.ts` | 180 | Theatre | metadata elevation range actually bounds all per-point values | Reads pipeline JSON output (trips[0].features / metadata) directly without invoking the library; duplicates P-Unit/P-Integration coverage at higher cost. |
| `test/e2e/seam.spec.ts` | 205 | Theatre | metadata speed range actually bounds all per-point values | Reads pipeline JSON output (trips[0].features / metadata) directly without invoking the library; duplicates P-Unit/P-Integration coverage at higher cost. |
| `test/e2e/seam.spec.ts` | 236 | Theatre | flight track has group "flights" from subfolder | Reads pipeline JSON output (trips[0].features / metadata) directly without invoking the library; duplicates P-Unit/P-Integration coverage at higher cost. |
| `test/e2e/seam.spec.ts` | 248 | Theatre | flight track has excludeFromAutoBounds from yaml | Reads pipeline JSON output (trips[0].features / metadata) directly without invoking the library; duplicates P-Unit/P-Integration coverage at higher cost. |
| `test/e2e/seam.spec.ts` | 260 | Theatre | root-level tracks have group null | Reads pipeline JSON output (trips[0].features / metadata) directly without invoking the library; duplicates P-Unit/P-Integration coverage at higher cost. |
| `test/e2e/seam.spec.ts` | 273 | Theatre | landmark POI has defaultVisible false from yaml | Reads pipeline JSON output (trips[0].features / metadata) directly without invoking the library; duplicates P-Unit/P-Integration coverage at higher cost. |
| `test/e2e/seam.spec.ts` | 285 | Theatre | accommodation POI has defaultVisible true (default) | Reads pipeline JSON output (trips[0].features / metadata) directly without invoking the library; duplicates P-Unit/P-Integration coverage at higher cost. |

### Verdict: rewrite (0)

_None._

### Verdict: keep (219)

| File | Line | Cat. | Name | Reason |
|------|------|------|------|--------|
| `preprocessing/lib/enrichment.test.js` | 21 | P-Unit | returns a value in daytime range (90-270) for midday UTC+9 | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/enrichment.test.js` | 28 | P-Unit | returns a value in pre-dawn range (0-90) for early morning UTC+9 | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/enrichment.test.js` | 35 | P-Unit | returns a value in post-dusk range (270-360) for evening UTC+9 | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/enrichment.test.js` | 42 | P-Unit | returns an integer (rounded to nearest degree) | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/enrichment.test.js` | 47 | P-Unit | pre-dawn angle is less than post-dusk angle (distinguishable) | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/enrichment.test.js` | 62 | P-Unit | preserves GPX extension speed on point 0 (<osmand:speed>) | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/enrichment.test.js` | 67 | P-Unit | preserves GPX extension speed on point 1 (<speed_2d>) | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/enrichment.test.js` | 71 | P-Unit | computes Haversine fallback speed for point 2 (no extension) | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/enrichment.test.js` | 76 | P-Unit | does not assign speed to the first point when no extension present | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/enrichment.test.js` | 94 | P-Unit | adds sunAngle to every point | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/enrichment.test.js` | 100 | P-Unit | sunAngle is an integer in daytime range for timestamped daytime points | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/enrichment.test.js` | 109 | P-Unit | sunAngle is null for points without a timestamp | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/enrichment.test.js` | 125 | P-Unit | KML flight track (no timestamps) gets null sunAngle for all points | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/enrichment.test.js` | 133 | P-Unit | returns null sunAngle for polar location during polar day (Svalbard, June 21) | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/enrichment.test.js` | 156 | P-Unit | returns no Haversine speed when consecutive points share the same timestamp | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/enrichment.test.js` | 175 | P-Unit | returns no Haversine speed when timestamp goes backward | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/enrichment.test.js` | 190 | P-Unit | preserves an extension speed of exactly 0 km/h | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/grouping.test.js` | 33 | P-Unit | assigns YYYY-MM-DD based on local date of first timed point | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/grouping.test.js` | 47 | P-Unit | assigns the local date, not the UTC date, when they differ | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/grouping.test.js` | 62 | P-Unit | groups two tracks on the same local date with the same day key | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/grouping.test.js` | 83 | P-Unit | assigns different day keys to tracks on different local dates | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/grouping.test.js` | 106 | P-Unit | falls back to filename stem when no timestamps are present | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/grouping.test.js` | 125 | P-Unit | assigns a unique key that starts with "flight-" | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/grouping.test.js` | 138 | P-Unit | uses UTC departure date in the key | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/grouping.test.js` | 151 | P-Unit | gives two flights on different days distinct keys | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/grouping.test.js` | 172 | P-Unit | is never equal to a ground track day key on the same UTC date | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/grouping.test.js` | 193 | P-Unit | falls back gracefully when no timestamps are present | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/grouping.test.js` | 212 | P-Unit | returns empty array for empty input | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/grouping.test.js` | 216 | P-Unit | two flights on the same UTC date with the same name get distinct day keys | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/grouping.test.js` | 238 | P-Unit | does not crash when coordinates are out of valid range | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/grouping.test.js` | 257 | P-Unit | preserves all existing track properties | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 55 | P-Unit | produces a valid GeoJSON FeatureCollection | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 60 | P-Unit | embeds metadata with tripName and attributeRanges | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 65 | P-Unit | has no feature ids (deferred to Epic 3) | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 80 | P-Unit | produces a LineString feature for the track | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 85 | P-Unit | sets required track properties | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 93 | P-Unit | coordinates are [lon, lat] pairs | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 99 | P-Unit | includes times parallel array | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 104 | P-Unit | includes elevations parallel array | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 109 | P-Unit | includes speeds parallel array (with null where missing) | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 117 | P-Unit | includes sunAngles parallel array | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 127 | P-Unit | parallel arrays all have the same length as coordinates | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 144 | P-Unit | produces a flight track with day key starting with "flight-" | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 148 | P-Unit | omits times array when no timestamps present | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 152 | P-Unit | omits sunAngles array when all values would be null | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 156 | P-Unit | omits speeds array when no speeds could be computed | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 171 | P-Unit | produces Point features for waypoints | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 175 | P-Unit | sets poi properties | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 180 | P-Unit | defaultVisible is true when no poi_categories config is provided | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 184 | P-Unit | defaultVisible is false when category is configured as hidden | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 192 | P-Unit | defaultVisible is true for categories not in poi_categories config | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 210 | P-Unit | passes group and defaultVisible from augmented track to feature properties | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 224 | P-Unit | defaults group to null and defaultVisible to true when not set | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 241 | P-Unit | embeds stats in metadata | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 245 | P-Unit | counts tracks and waypoints | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 249 | P-Unit | counts unique ground days | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 253 | P-Unit | counts transport modes | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 258 | P-Unit | includes dateRange for ground tracks | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 264 | P-Unit | excludes flight day keys from dayCount and dateRange | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 296 | P-Unit | emits track features in chronological order regardless of input order | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 309 | P-Unit | sorts flight-day keys by embedded date | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 329 | P-Unit | produces a valid FeatureCollection with no features | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 334 | P-Unit | stats have zero counts and no dateRange | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 340 | P-Unit | attributeRanges is empty | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 353 | P-Unit | treats a null config entry as defaultVisible: true | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 384 | P-Unit | propagates excludeFromAutoBounds: true to feature properties | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 394 | P-Unit | omits excludeFromAutoBounds from feature properties when false | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 413 | P-Unit | computes elevation range across all track points | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 420 | P-Unit | computes speed range across all track points | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/output.test.js` | 426 | P-Unit | omits elevation range when no track has elevation data | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 15 | P-Unit | detects flight from filename | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 20 | P-Unit | detects flight from FlightAware-prefixed filename | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 25 | P-Unit | detects walk from filename | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 29 | P-Unit | detects boat from filename | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 33 | P-Unit | defaults to drive | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 46 | P-Unit | returns one track | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 50 | P-Unit | reads track name from <trk><name> | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 54 | P-Unit | reads transport mode from <osmand:activity> metadata | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 59 | P-Unit | returns three points | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 63 | P-Unit | reads lon/lat correctly | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 68 | P-Unit | reads elevation in metres | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 73 | P-Unit | reads timestamps as Unix milliseconds | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 78 | P-Unit | reads speed from <osmand:speed> extension (m/s → km/h) | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 83 | P-Unit | reads speed from <speed_2d><value> extension (m/s → km/h) | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 88 | P-Unit | omits speedKmh when no speed extension is present | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 92 | P-Unit | returns no waypoints | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 104 | P-Unit | reads transport mode from <osmand:activity> inside <trk><extensions> | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 108 | P-Unit | reads track name | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 120 | P-Unit | reads transport mode from metadata (walking → walk) | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 124 | P-Unit | omits elevation when the <ele> element is absent | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 128 | P-Unit | still reads timestamps | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 139 | P-Unit | returns no tracks | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 143 | P-Unit | returns two waypoints | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 147 | P-Unit | reads waypoint name and coordinates | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 153 | P-Unit | reads category from GPX <type> element | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 165 | P-Unit | returns one track | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 169 | P-Unit | reads track name | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 173 | P-Unit | reads three coordinate points (KML order: lon,lat,alt) | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 181 | P-Unit | detects flight from filename (KML has no activity metadata) | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 185 | P-Unit | has no timestamps for plain KML LineString | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 189 | P-Unit | returns no waypoints | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 200 | P-Unit | returns one track | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 205 | P-Unit | detects flight transport mode from filename | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 209 | P-Unit | reads track name from Placemark | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 213 | P-Unit | reads timestamps from gx:Track | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 217 | P-Unit | reads three coordinate points | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 225 | P-Unit | detects flight transport mode from KML document name | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 235 | P-Unit | dispatches .gpx to parseGPX | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 240 | P-Unit | dispatches .kml to parseKML | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 245 | P-Unit | throws a descriptive error for unsupported extensions | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 257 | P-Unit | returns no tracks for a GPX with no <trk> elements | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 261 | P-Unit | returns no waypoints for a GPX with no <wpt> elements | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 273 | P-Unit | uses the lowercased activity string as transportMode when not in ACTIVITY_MAP | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 287 | P-Unit | detects flight mode from path component regardless of activity metadata | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 299 | P-Unit | returns the track | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 303 | P-Unit | returns the waypoint | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `preprocessing/lib/parsers.test.js` | 318 | P-Unit | prefers <osmand:speed> (10 m/s → 36 km/h) over <speed_2d> (5 m/s) when both present | Pure pipeline-module unit test asserting documented function behaviour; correct contract. |
| `test/e2e/seam.spec.ts` | 33 | Seam | fixture loads without error | Observes library state (map layers/sources, legend DOM, library API) after loading pipeline-produced fixture. |
| `test/e2e/seam.spec.ts` | 303 | Seam | track layer exists after loading pipeline fixture | Observes library state (map layers/sources, legend DOM, library API) after loading pipeline-produced fixture. |
| `test/e2e/seam.spec.ts` | 311 | Seam | track source has features from pipeline output | Observes library state (map layers/sources, legend DOM, library API) after loading pipeline-produced fixture. |
| `test/e2e/seam.spec.ts` | 323 | Seam | POI source has features from pipeline output | Observes library state (map layers/sources, legend DOM, library API) after loading pipeline-produced fixture. |
| `test/e2e/seam.spec.ts` | 334 | Seam | track legend shows correct day groups | Observes library state (map layers/sources, legend DOM, library API) after loading pipeline-produced fixture. |
| `test/e2e/seam.spec.ts` | 344 | Seam | attribute legend shows pipeline ranges | Observes library state (map layers/sources, legend DOM, library API) after loading pipeline-produced fixture. |
| `test/e2e/seam.spec.ts` | 354 | Seam | POI legend shows categories from pipeline | Observes library state (map layers/sources, legend DOM, library API) after loading pipeline-produced fixture. |
| `test/e2e/seam.spec.ts` | 362 | Seam | landmark POI category is hidden at load (defaultVisible: false) | Observes library state (map layers/sources, legend DOM, library API) after loading pipeline-produced fixture. |
| `test/e2e/seam.spec.ts` | 370 | Seam | accommodation POI category is visible at load | Observes library state (map layers/sources, legend DOM, library API) after loading pipeline-produced fixture. |
| `test/integration/legends.spec.ts` | 47 | L-Integration | TrackLegend: panel is visible on page load | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 52 | L-Integration | TrackLegend: renders a row per track | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 58 | L-Integration | TrackLegend: unchecking a track hides it | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 71 | L-Integration | TrackLegend: zoom button fits map to track | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 86 | L-Integration | TrackLegend: day groups start collapsed and header click toggles | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 98 | L-Integration | AttributeLegend: panel is visible on page load | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 103 | L-Integration | AttributeLegend: dropdown has one option per colour attribute | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 109 | L-Integration | AttributeLegend: speed label shows range of visible tracks only | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 115 | L-Integration | AttributeLegend: speed layer ranges exclude hidden tracks on initial load | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 124 | L-Integration | AttributeLegend: elevation label shows range of visible tracks only | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 130 | L-Integration | AttributeLegend: elevation layer ranges exclude hidden tracks on initial load | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 137 | L-Integration | AttributeLegend: hiding a track via checkbox narrows the range label | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 146 | L-Integration | AttributeLegend: hiding a track via checkbox narrows the layer ranges | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 155 | L-Integration | AttributeLegend: hiding a track via checkbox narrows the elevation range label | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 163 | L-Integration | AttributeLegend: showing a hidden track via checkbox widens the range label | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 172 | L-Integration | AttributeLegend: showing a hidden track via checkbox widens the layer ranges | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 181 | L-Integration | AttributeLegend: selecting transportMode shows mode list | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 191 | L-Integration | POILegend: panel is visible on page load | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 196 | L-Integration | POILegend: renders the fixture POI after expanding category | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 205 | L-Integration | POILegend: category with defaultVisible false starts hidden | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 213 | L-Integration | POILegend: category with defaultVisible true starts visible | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 222 | L-Integration | POILegend: category checkbox unchecked for hidden category | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 239 | L-Integration | POILegend: zoom button fits map to POI | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 256 | L-Integration | MobileMenu: hamburger button is hidden on desktop | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 263 | L-Integration | MobileMenu: hamburger visible and drawer opens on mobile viewport | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 299 | L-Integration | setBasemap: defaultVisible true track stays visible (no user interaction) | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 305 | L-Integration | setBasemap: defaultVisible false track stays hidden (no user interaction) | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 311 | L-Integration | setBasemap: user-hidden track stays hidden after basemap switch | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 320 | L-Integration | setBasemap: user-shown track stays visible after basemap switch | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 331 | L-Integration | setBasemap: defaultVisible true POI category stays visible (no user interaction) | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 337 | L-Integration | setBasemap: defaultVisible false POI category stays hidden (no user interaction) | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 343 | L-Integration | setBasemap: user-hidden POI category stays hidden after basemap switch | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 351 | L-Integration | setBasemap: user-shown POI category stays visible after basemap switch | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 361 | L-Integration | setBasemap: speed range preserved for default visible tracks | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 368 | L-Integration | setBasemap: speed layer ranges preserved for default visible tracks | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 376 | L-Integration | setBasemap: elevation range preserved for default visible tracks | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 383 | L-Integration | setBasemap: user-hidden track remains excluded from range after basemap switch | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 394 | L-Integration | setBasemap: user-hidden track excluded from layer ranges after basemap switch | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 404 | L-Integration | setBasemap: user-shown track remains included in range after basemap switch | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 415 | L-Integration | setBasemap: user-shown track included in layer ranges after basemap switch | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 431 | L-Integration | setBasemap: defaultVisible false track checkbox remains unchecked after basemap switch | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 439 | L-Integration | setBasemap: defaultVisible true track checkbox remains checked after basemap switch | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 447 | L-Integration | setBasemap: user-hidden track checkbox stays unchecked after basemap switch | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 458 | L-Integration | setBasemap: user-shown track checkbox stays checked after basemap switch | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 474 | L-Integration | TrackLegend: group header checkbox hides all tracks in that day group | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 482 | L-Integration | TrackLegend: group header checkbox shows all tracks in that day group | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 490 | L-Integration | TrackLegend: group checkbox uncheck also unchecks individual track row checkboxes | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 500 | L-Integration | TrackLegend: group checkbox check also checks individual track row checkboxes | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 510 | L-Integration | TrackLegend: hiding a group via group checkbox narrows the attribute range | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 523 | L-Integration | AttributeLegend: hiding all visible tracks shows "no data" for speed | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 532 | L-Integration | AttributeLegend: hiding all visible tracks empties layer ranges | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 543 | L-Integration | AttributeLegend: re-showing a track after hiding all restores speed range | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 556 | L-Integration | setBasemap: colour attribute dropdown preserves selected value | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/legends.spec.ts` | 564 | L-Integration | setBasemap: colour attribute paint expression uses correct attribute after switch | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 59 | L-Integration | map loads without error | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 63 | L-Integration | track source exists | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 69 | L-Integration | track layer exists | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 75 | L-Integration | track source contains segment features | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 93 | L-Integration | POI source exists | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 99 | L-Integration | POI circle layer exists | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 105 | L-Integration | POI label layer exists | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 111 | L-Integration | POI source contains the fixture POI | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 120 | L-Integration | POI circle layer is visible (not hidden) | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 129 | L-Integration | POI circle actually renders in the viewport at POI coordinates | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 152 | L-Integration | Tokyo Drive (defaultVisible: true) is visible on load | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 160 | L-Integration | Sydney Walk (defaultVisible: false) is hidden on load | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 168 | L-Integration | setTrackVisible(true) makes a hidden track visible | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 177 | L-Integration | setTrackVisible(false) hides a visible track | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 196 | L-Integration | initial auto-fit only includes visible tracks (Tokyo, not Sydney) | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 205 | L-Integration | fitToTracks() only fits visible tracks | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 213 | L-Integration | excludeFromAutoBounds track is visible but excluded from initial auto-fit | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 229 | L-Integration | fitToTracks() expands bounds when hidden track is made visible | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 239 | L-Integration | fitToTracks() with all tracks hidden is a no-op (no crash) | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 291 | L-Integration | track layer survives a basemap switch to blueMarble | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 297 | L-Integration | track source survives a basemap switch to blueMarble | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 303 | L-Integration | POI layer survives a basemap switch to blueMarble | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 312 | L-Integration | track visibility state is preserved after basemap switch | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 323 | L-Integration | switching back to osm restores track layer | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 331 | L-Integration | rapid basemap switching does not crash | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 348 | L-Integration | track visibility survives rapid basemap switching | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 370 | L-Integration | zoom is clamped when switching to a basemap with lower maxZoom | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 387 | L-Integration | default colour attribute is "day" | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 393 | L-Integration | setColourAttribute updates the getter | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 399 | L-Integration | setColourAttribute does not remove the track layer | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 417 | L-Integration | track layer filter excludes hidden tracks on load | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 428 | L-Integration | track layer filter drops a track when it is hidden | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 436 | L-Integration | track layer filter adds a track when it is shown | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 444 | L-Integration | line-color is an expression (array) on load | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 452 | L-Integration | line-color expression changes when colour attribute switches from day to speed | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 470 | L-Integration | removes all UI panels from the DOM | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 479 | L-Integration | removes map controls from the DOM | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 487 | L-Integration | removes mobile menu elements from the DOM | Library running in real browser against known-good fixture; observable UI/map behaviour. |
| `test/integration/map.spec.ts` | 496 | L-Integration | removes the map canvas | Library running in real browser against known-good fixture; observable UI/map behaviour. |

---

## 3. Missing coverage

Behaviours and contracts the existing test suite does not exercise. Each gap cites concrete file:line evidence; gaps without substantiation are not included.

### Output ⟷ input contract (preprocessing writes vs. library reads) (15)

#### 1. Library reads `poi.properties.label` (POIFeature optional field) but no preprocessing code writes it.

**Gap.** Library reads `poi.properties.label` (POIFeature optional field) but no preprocessing code writes it. The pipeline's waypointToFeature() emits only name, type, category, defaultVisible. If a user customised the field, no test would catch the disagreement; conversely, no test asserts the library safely tolerates label being absent.

**Evidence.** src/ui/POILegend.ts:133 destructures `const { name, label } = poi.properties;` and src/ui/POILegend.ts:143 reads it. Type defined at src/data/types.ts:134 as optional. preprocessing/lib/output.js:101-109 waypointToFeature never sets label. No test in /tmp/inventory.json mentions a `label` POI property assertion.

#### 2. Library reads `metadata.attributeRanges` from each TripData (LayerManager.addLayers calls mergeRanges(trips.map(t => t.metadata.attributeRanges))).

**Gap.** Library reads `metadata.attributeRanges` from each TripData (LayerManager.addLayers calls mergeRanges(trips.map(t => t.metadata.attributeRanges))). No test in the inventory verifies that the library actually consumes `metadata.attributeRanges` and propagates it to LayerManager._ranges/colour expression on initial load — only that the legend label is correct after the AttributeLegend constructor recomputes ranges from per-point arrays. If preprocessing emitted a different unit (e.g. 'mi' instead of 'km/h') or wrong min/max, behaviour at the seam is undefined.

**Evidence.** src/core/LayerManager.ts:244 reads `t.metadata.attributeRanges`; preprocessing/lib/output.js:147-153 writes it. Inventory shows preprocessing tests at output.test.js:413/420 verify correct values produced, and library at AttributeLegend.test.ts checks recompute, but no test asserts library reads/uses metadata.attributeRanges (the merge path) on initial load before AttributeLegend recomputes.

#### 3. TrackProperties.transportMode is typed as `'walk' \| 'drive' \| 'flight' \| 'boat' \| string` (open enum).

**Gap.** TrackProperties.transportMode is typed as `'walk' | 'drive' | 'flight' | 'boat' | string` (open enum). preprocessing/lib/parsers.js produces additional values like 'cycling', 'skiing', and arbitrary lowercased OsmAnd activity strings (e.g. 'snorkel', 'horseback'). No test asserts the library tolerates an unknown transportMode value end-to-end (LayerManager.buildSegmentFeatures defaults to 'drive' fallback at line 152 — `transportMode ?? 'drive'` only applies when it's nullish, not unknown).

**Evidence.** src/data/types.ts:101 declares the open enum. src/core/LayerManager.ts:152 uses `transportMode ?? 'drive'` (only handles nullish). preprocessing/lib/parsers.js:273 test asserts unknown OsmAnd activity is lowercased and passed through. No inventory test loads a fixture with an unknown transportMode and verifies the library renders it (e.g. paint expression or DOM).

#### 4. TrackProperties.group is typed `string \| null` and pipeline always emits it (output.js: `group: track.group ?? null`).

**Gap.** TrackProperties.group is typed `string | null` and pipeline always emits it (output.js: `group: track.group ?? null`). LayerManager never reads `properties.group` — only TrackLegend uses day grouping. No test verifies whether the library tolerates a missing `group` key (older fixtures that omit it) vs a literal null. The Epic 11 plan introduces config keyed on group names, making this contract more load-bearing.

**Evidence.** preprocessing/lib/output.js:85 always emits group (defaults null). src/data/types.ts:103 declares it `string | null` optional. No grep hit for `properties.group` in src/ outside tests; only seam.spec.ts:236/260 asserts the value. No test asserts library behaviour when `group` is missing entirely (e.g. legacy GeoJSON).

#### 5. TrackFeature.geometry.coordinates is typed `[number, number] \| [number, number, number]` (2D or 3D), but preprocessing/lib/output.js:72 always emits 2D `[lon, lat]` pairs (elevation goes into the parallel array).

**Gap.** TrackFeature.geometry.coordinates is typed `[number, number] | [number, number, number]` (2D or 3D), but preprocessing/lib/output.js:72 always emits 2D `[lon, lat]` pairs (elevation goes into the parallel array). No test asserts the library accepts a 3-element coordinate (third = elevation), nor that LayerManager.buildSegmentFeatures handles 3D coordinates correctly when computing antimeridianSplit (which slices `coords[i]`/`coords[i+1]` as Coord but assumes [number, number] in the boundary returned).

**Evidence.** src/data/types.ts:88 allows 2D or 3D. preprocessing/lib/output.js:72 emits 2D only. src/core/LayerManager.ts:64 declares `type Coord = [number, number] | [number, number, number]`, but antimeridianSplit at line 75-92 returns `[[number, number], [number, number]]` losing altitude silently. No inventory test passes 3D coords to assert library tolerance or no-loss.

#### 6. Pipeline writes `properties.times` as Unix milliseconds (number[]), but the library never reads `properties.times` for any rendering or filter purpose.

**Gap.** Pipeline writes `properties.times` as Unix milliseconds (number[]), but the library never reads `properties.times` for any rendering or filter purpose. The field is present in schema and consumes file size, but no library code path or test uses it. This is a one-way contract gap: silently dropping or corrupting `times` would not break any current test.

**Evidence.** preprocessing/lib/output.js:74 calls extractArray(points, 'time'). src/core/ has no grep hit reading `.times`. parsers.test.js:73 only asserts pipeline read; output.test.js:99/127 asserts pipeline emit. Nothing in /tmp/inventory.json asserts library uses or even tolerates times.

#### 7. Pipeline emits `attributeRanges.elevation.unit: 'm'` and `attributeRanges.speed.unit: 'km/h'` (output.js:149,152).

**Gap.** Pipeline emits `attributeRanges.elevation.unit: 'm'` and `attributeRanges.speed.unit: 'km/h'` (output.js:149,152). The library merges ranges (LayerManager.ts:97-115 mergeRanges) but the merge code preserves only the first unit seen — a unit mismatch between two TripData files would be silently dropped. No test loads two trip data files with conflicting units to assert the library fails or warns.

**Evidence.** src/core/LayerManager.ts:107 `unit: existing.unit` keeps first only. preprocessing/lib/output.js:149,152 hardcodes units. No inventory test passes multiple trips with conflicting `unit` values. Library accepts `dataUrls: string[]` (src/data/types.ts:8) so multi-trip is a documented use case.

#### 8. Library's deriveTrackId composes `${day}::${name}` — two tracks with the same day and same name produce identical IDs and would collide.

**Gap.** Library's deriveTrackId composes `${day}::${name}` — two tracks with the same day and same name produce identical IDs and would collide. Pipeline does not enforce uniqueness on this composite (parsers extract the raw <trk><name> verbatim; same-name tracks on the same day are possible from real input). No test loads a fixture with duplicate (day, name) tuples and asserts the library either deduplicates or errors.

**Evidence.** src/core/DataLoader.ts:11-13 deriveTrackId. preprocessing/lib/parsers.js:50/108 extracts trk name verbatim. preprocessing/lib/grouping.js does not deduplicate. No inventory test asserts behaviour for duplicate trackId (e.g. two GPX files in same day with identical <trk><name>).

#### 9. Pipeline emits speeds with explicit nulls inside the parallel array (output.js:74-76 + extractArray returning array of `value ?? null`).

**Gap.** Pipeline emits speeds with explicit nulls inside the parallel array (output.js:74-76 + extractArray returning array of `value ?? null`). Library AttributeRanges.minMax (AttributeRanges.ts:5-19) handles nulls. But buildSegmentFeatures.avgNullable returns null if either neighbour is null. No test asserts what colour expression rendering does for a segment whose speedValue is null (e.g., the line should fall back to a neutral colour, not throw). The seam test asserts arrays bound the values but not the rendering outcome.

**Evidence.** preprocessing/lib/output.js: speeds may contain null. src/core/LayerManager.ts:154 avgNullable yields null → SegmentProperties.speedValue: null; consumed in src/styling/ColorRamps.ts (paint expression). No /tmp/inventory.json test renders a segment with null speedValue and asserts paint expression behaviour.

#### 10. Pipeline output sorts track features chronologically by day key (output.js:133-137) using the embedded date for flight keys.

**Gap.** Pipeline output sorts track features chronologically by day key (output.js:133-137) using the embedded date for flight keys. Library does not preserve this order: LayerManager.addLayers re-sorts days alphabetically (`days = [...new Set(...)].sort()` line 135) for dayIndex assignment, and TrackLegend re-groups by day. No test verifies the library tolerates an unsorted input (some legacy fixtures, or a future change to preprocessing) — only output.test.js:296 asserts pipeline output is sorted.

**Evidence.** preprocessing/lib/output.js:133 sorts. src/core/LayerManager.ts:135 re-sorts. No inventory test injects unsorted features and asserts library still produces correct dayIndex sequence.

#### 11. Pipeline emits `metadata.tripName` from CLI -n flag or auto-derived from parent dir name (build-trip-data.js:71-73).

**Gap.** Pipeline emits `metadata.tripName` from CLI -n flag or auto-derived from parent dir name (build-trip-data.js:71-73). No code in src/ reads `metadata.tripName` (grep shows it appears only in test fixtures and types.ts). The field is in the documented schema (docs/preprocessing.md:210, types.ts:48) and any user who relies on it would silently get wrong content. There is no test that the library's behaviour is unaffected by tripName value, and no test that the library exposes it.

**Evidence.** src/data/types.ts:48 declares tripName required. No grep hit for `metadata.tripName` in src/ outside types.ts and tests. preprocessing/lib/output.js:175 sets it. seam.spec.ts:38 asserts it exists on `trips[0].metadata` but no library-side use is asserted.

#### 12. POIFeature.properties.category is typed as required string.

**Gap.** POIFeature.properties.category is typed as required string. Pipeline (parsers.js:170-177 detectCategory) always produces a string fallback 'poi'. Library reads it in LayerManager.addLayers:249 and POILegend.ts:25. But no test asserts library behaviour when category is missing or empty string — i.e., a malformed/legacy POI feature with no category. defaultVisible filtering would group all uncategorised POIs together silently.

**Evidence.** src/data/types.ts:133 declares category required. preprocessing/lib/parsers.js:177 always returns 'poi' fallback. src/core/LayerManager.ts:249 reads p.properties.category. No inventory test exercises missing-category POI.

#### 13. Pipeline omits `properties.times`, `elevations`, `speeds`, `sunAngles` arrays entirely when all values are null (output.js:87-90 conditional spread).

**Gap.** Pipeline omits `properties.times`, `elevations`, `speeds`, `sunAngles` arrays entirely when all values are null (output.js:87-90 conditional spread). LayerManager.buildSegmentFeatures.avgNullable handles undefined arrays with optional chaining (`elevations?.[i]`), but no test asserts the library tolerates a track with NONE of those parallel arrays present (a plain KML LineString with no time/altitude data). Inventory shows pipeline tests for omission but no library-side assertion.

**Evidence.** preprocessing/lib/output.js:87-90 conditional spread. src/core/LayerManager.ts:153-155 uses optional chaining. output.test.js:148-156 asserts pipeline omits. No inventory test loads such a track into the library and asserts segment features still build (i.e. avgNullable returns null, no NaN propagation).

#### 14. TrackFeature.properties.type must equal literal 'track' (string) for DataLoader.extractTracks to include it.

**Gap.** TrackFeature.properties.type must equal literal 'track' (string) for DataLoader.extractTracks to include it. Pipeline always emits type:'track' for tracks and type:'poi' for waypoints (output.js:79, 105). No test asserts what happens when a feature has a different `type` value (typo, legacy 'TRACK' uppercase, missing) — the library silently filters it out, which would manifest as missing-data with no error.

**Evidence.** src/core/DataLoader.ts:60 filters on `f.properties.type === 'track'`. preprocessing/lib/output.js:79,105. No inventory test asserts library behaviour for malformed type field.

#### 15. The `defaultVisible: false` semantic is defined as 'starts hidden but listed in legend'.

**Gap.** The `defaultVisible: false` semantic is defined as 'starts hidden but listed in legend'. Library's LayerManager.addLayers:246 filters tracks where `defaultVisible !== false`. The strict `!== false` check means missing/undefined defaults to visible. But no library-side test asserts the difference between defaultVisible:undefined vs defaultVisible:true (preprocessing always emits it explicitly via `track.defaultVisible ?? true` at output.js:83). Forward compatibility for omitted property is unverified.

**Evidence.** src/core/LayerManager.ts:246 uses `!== false`. preprocessing/lib/output.js:83 always emits true/false. No inventory test asserts library tolerates a track feature missing defaultVisible entirely.

### Documented behaviour (CLAUDE.md, docs/developer.md) (12)

#### 1. CLAUDE.md:85 declares the load-bearing invariant 'preprocessing output is library-compatible or absent — never partial, never stale'.

**Gap.** CLAUDE.md:85 declares the load-bearing invariant 'preprocessing output is library-compatible or absent — never partial, never stale'. No test in /tmp/inventory.json verifies this end-to-end: no test crashes the build mid-write and asserts the output is absent (not partial), nor verifies that an incomplete write never reaches the library.

**Evidence.** CLAUDE.md:85 explicit 'load-bearing invariant'. preprocessing/build-trip-data.js:242-249 implements atomic temp+rename. No inventory test simulates a crash mid-write and asserts atomic semantics (partial trip-data.geojson never seen by library).

#### 2. CLAUDE.md:59 'CRITICAL: AttributeLegend constructor must call ctx.layers.updateRanges(this._ranges) immediately after computing ranges' — there is one unit test (AttributeLegend.test.ts:261) verifying the constructor cal

**Gap.** CLAUDE.md:59 'CRITICAL: AttributeLegend constructor must call ctx.layers.updateRanges(this._ranges) immediately after computing ranges' — there is one unit test (AttributeLegend.test.ts:261) verifying the constructor calls updateRanges, but inventory shows no integration test asserting that on first load the LayerManager._ranges actually reflects visible-only data (only the label). The documented bug class is 'silent paint vs label divergence' and tests at legends.spec.ts:115/130 cover it for speed/elevation but not for sunAngle, which is also a continuous attribute.

**Evidence.** CLAUDE.md:59. /tmp/inventory.json:115 covers speed; line 130 covers elevation; no inventory entry covers sunAngle's two-layer state (label vs _ranges). src/styling has sun colour expression.

#### 3. CLAUDE.md:62-64 'Always test BOTH: Label and Layer ranges'.

**Gap.** CLAUDE.md:62-64 'Always test BOTH: Label and Layer ranges'. While speed and elevation now have both, several covered behaviours only assert one side. For example legends.spec.ts:543 'AttributeLegend: re-showing a track after hiding all restores speed range' asserts only the label, not _ranges; legends.spec.ts:404 asserts label only.

**Evidence.** /tmp/inventory.json line 543 'restores to Tokyo-only' asserts label only; line 404 asserts label only. CLAUDE.md:62-64 explicit instruction. The matching _ranges assertion exists for some interactions (e.g. line 415) but not the 'restores from no-data' or 'after re-show' transitions.

#### 4. CLAUDE.md:106 'Fixtures must use NON-OVERLAPPING attribute ranges per track so any hidden-track leakage is detectable by exact value.' No test in inventory ASSERTS this invariant on the fixture itself.

**Gap.** CLAUDE.md:106 'Fixtures must use NON-OVERLAPPING attribute ranges per track so any hidden-track leakage is detectable by exact value.' No test in inventory ASSERTS this invariant on the fixture itself. A future fixture edit (e.g. increasing the Tokyo speed range to overlap Helsinki) would silently weaken every speed-range assertion without breaking any test.

**Evidence.** CLAUDE.md:106 explicit. Inventory has no test that pre-validates fixture has non-overlapping ranges before running the assertions that depend on it.

#### 5. CLAUDE.md:43 'Antimeridian: segments with \|dLon\| > 180 split at ±180° in buildSegmentFeatures'.

**Gap.** CLAUDE.md:43 'Antimeridian: segments with |dLon| > 180 split at ±180° in buildSegmentFeatures'. No test in /tmp/inventory.json passes a track that crosses the antimeridian and asserts the segment is split (LayerManager.ts:75-92 antimeridianSplit). The implementation has its own logic but is uncovered.

**Evidence.** src/core/LayerManager.ts:75-92 antimeridianSplit function, also referenced at MapEngine.ts:131-153. No /tmp/inventory.json entry mentions antimeridian, dLon, or longitude > 180 splitting.

#### 6. docs/preprocessing.md:144-156 specifies sun angle storage convention 0-360 with five anchor points (0/90/180/270/360 = midnight/sunrise/noon/sunset/midnight).

**Gap.** docs/preprocessing.md:144-156 specifies sun angle storage convention 0-360 with five anchor points (0/90/180/270/360 = midnight/sunrise/noon/sunset/midnight). Unit tests assert range buckets (90-270, 0-90, 270-360) but no test asserts the *anchor values* — e.g. that sunrise specifically maps near 90° or solar noon near 180°. A regression making the scale 0-180 (half-amplitude) would fail no test in the documented daytime range bucket.

**Evidence.** docs/preprocessing.md:206-216. /tmp/inventory.json lines 21-47 (enrichment.test.js) only check ranges 90-270, 0-90, 270-360 — not anchor values.

#### 7. CLAUDE.md:131 'FlightAware KML: gx:Track format, detected by <Document><name> starting with FlightAware'.

**Gap.** CLAUDE.md:131 'FlightAware KML: gx:Track format, detected by <Document><name> starting with FlightAware'. parsers.test.js:225 covers detection from document name when filename is generic, but inventory has no test asserting the precedence: filename-based detection (rule 1 in docs/preprocessing.md:99-106) wins over document-name-based detection. The priority order is documented but not asserted at the seam where both signals are present and conflict.

**Evidence.** docs/preprocessing.md:99-106 lists priority order. /tmp/inventory.json:225 covers document name only. No conflict test (file in flights/ subfolder vs document name says non-flight, etc.).

#### 8. docs/preprocessing.md:127 'Tracks without timestamps (e.g.

**Gap.** docs/preprocessing.md:127 'Tracks without timestamps (e.g. plain KML files) use the filename as the day key'. grouping.test.js:106 (inventory line 106) verifies stem-based fallback for one case, but the documented behaviour spans the entire fallback chain; no test asserts it for an extension-stripped path or a path containing dots, and no test asserts the day-key resulting from this fallback won't collide with a real ISO date (e.g. file named '2025-01-01.gpx' vs a real 2025-01-01 ground track).

**Evidence.** docs/preprocessing.md:127. grouping.test.js:106 in inventory single-case. preprocessing/lib/grouping.js fallback path.

#### 9. docs/preprocessing.md:33 'Hidden files and directories (starting with .) are skipped silently — this means .git directories are safe inside the input folder'.

**Gap.** docs/preprocessing.md:33 'Hidden files and directories (starting with .) are skipped silently — this means .git directories are safe inside the input folder'. build-trip-data.js:194 implements `if (entry.startsWith('.')) continue`. No test in /tmp/inventory.json verifies this skip behaviour: the recursion is uncovered.

**Evidence.** docs/preprocessing.md:33 explicit guarantee. preprocessing/build-trip-data.js:194. /tmp/inventory.json has no entries for build-trip-data.js / collectFiles / dot-file skip.

#### 10. docs/preprocessing.md:16 'All other file types are skipped with a warning.' build-trip-data.js:223-228 catches Unsupported file format errors and increments `skipped`.

**Gap.** docs/preprocessing.md:16 'All other file types are skipped with a warning.' build-trip-data.js:223-228 catches Unsupported file format errors and increments `skipped`. parsers.test.js:245 (inventory) asserts parseFile throws for unknown extension, but no test asserts build-trip-data.js's outer behaviour: skipping the file and continuing rather than aborting the build.

**Evidence.** docs/preprocessing.md:16. preprocessing/build-trip-data.js:222-228. /tmp/inventory.json line 245 covers parseFile throw, but no integration test for build-trip-data.js skip-and-continue.

#### 11. CLAUDE.md:67 'setBasemap restoration manually replays each surface'; src/index.ts:189-213 documents the per-surface manual replay.

**Gap.** CLAUDE.md:67 'setBasemap restoration manually replays each surface'; src/index.ts:189-213 documents the per-surface manual replay. Inventory covers track and POI category visibility restoration, plus colour attribute, but no test asserts the AttributeRanges (paint property) is correctly restored when basemap switches happen WHILE an attribute legend has narrowed the ranges via a hidden track — the integration tests at lines 368, 394, 415 cover this but only for the case where the attribute (speed) is selected explicitly via setColourAttribute. The setBasemap path's `_ui?.attrLegend.updateRanges(this._layers.visibleIds)` call (src/index.ts:213) is on the chain but not tested for sunAngle attribute selected before switch.

**Evidence.** src/index.ts:213 calls updateRanges. CLAUDE.md:67 documents per-surface replay. /tmp/inventory.json:556/564 covers colour attribute preservation only for 'speed', not other continuous attributes like 'sunAngle'.

#### 12. CLAUDE.md:109 'ESLint: v8.57, legacy .eslintrc.json format' and CLAUDE.md:114 'MapLibre 4.7.1: does NOT emit style.load after setStyle() ...

**Gap.** CLAUDE.md:109 'ESLint: v8.57, legacy .eslintrc.json format' and CLAUDE.md:114 'MapLibre 4.7.1: does NOT emit style.load after setStyle() ... Use styledata event'. The MapLibre setBasemap retry strategy (src/index.ts:172-188) is documented as load-bearing for headless tests; integration tests assert basemap switches succeed but no test specifically covers the retry path where addLayers throws because style JSON isn't applied yet — only the happy path.

**Evidence.** CLAUDE.md:114, src/index.ts:184-188 (try/catch retry). /tmp/inventory.json:331/348 'rapid basemap switching' but no entry asserts the addLayers-throws-retry behaviour explicitly.

### Epic 9 invariants (atomic write, unlink-on-failure, status sidecar, crash cleanup) (8)

#### 1. Atomic write of trip-data.geojson via temp+rename (build-trip-data.js:242-245) is untested.

**Gap.** Atomic write of trip-data.geojson via temp+rename (build-trip-data.js:242-245) is untested. No /tmp/inventory.json entry forces an interrupted write (kill -9 mid-rename, simulate ENOSPC during writeFile) and asserts that either the old file or the new file is observed but never a partial file.

**Evidence.** preprocessing/build-trip-data.js:242-249 implements atomic temp+rename. No inventory test invokes build-trip-data.js, mocks fs.writeFileSync to throw, or asserts the atomic guarantee.

#### 2. Unlink-on-failure: build-trip-data.js:58-69 (failExit + removeOutputIfExists) ensures stale output is removed on every non-success exit path.

**Gap.** Unlink-on-failure: build-trip-data.js:58-69 (failExit + removeOutputIfExists) ensures stale output is removed on every non-success exit path. No test verifies any of the failure paths: parseFile error (line 227), no tracks found (line 233), output write failure (line 248). The invariant 'output is library-compatible-or-absent' is asserted as a comment (line 55-57) but is uncovered.

**Evidence.** preprocessing/build-trip-data.js:55-57 comment, 58-69 implementation, 227/233/248 callers. No inventory test invokes build-trip-data.js with a failing input and asserts trip-data.geojson is unlinked.

#### 3. watch.js status sidecar (--status-file flag) is fully untested.

**Gap.** watch.js status sidecar (--status-file flag) is fully untested. No inventory test exercises the --status-file path: no assertion that the sidecar contains `{buildId, ok: true, error: null}` after a successful build, or `{buildId, ok: false, error: <string>}` after a failed build. buildId monotonicity within a single watcher run (watch.js:93/119 `buildId++`) is also uncovered.

**Evidence.** preprocessing/watch.js:36-50 documents the flag. preprocessing/watch.js:93,95-106,119,124,135 implement it. /tmp/inventory.json has zero entries for watch.js.

#### 4. Crash cleanup of orphaned `serve` children on uncaughtException / unhandledRejection (watch.js:161-168) is untested.

**Gap.** Crash cleanup of orphaned `serve` children on uncaughtException / unhandledRejection (watch.js:161-168) is untested. No test forces watch.js to throw an uncaught error (e.g. by triggering an internal failure path) and verifies the spawned `serve` child is killed and the port is released.

**Evidence.** preprocessing/watch.js:161-168. /tmp/inventory.json has no test for watch.js crash behaviour.

#### 5. watch.js status sidecar is itself written atomically (write to .tmp, rename) at watch.js:97-106, with the same partial-write invariant.

**Gap.** watch.js status sidecar is itself written atomically (write to .tmp, rename) at watch.js:97-106, with the same partial-write invariant. No test verifies that consumers of the status file never observe a partial JSON write.

**Evidence.** preprocessing/watch.js:96-106 atomic status write. /tmp/inventory.json has no entries for status file behaviour.

#### 6. watch.js belt-and-braces removeOutputIfExists() at line 130 (called after build failure) is untested.

**Gap.** watch.js belt-and-braces removeOutputIfExists() at line 130 (called after build failure) is untested. The comment at watch.js:126-129 explains it covers the case where build-trip-data.js was killed by a signal before its own cleanup could run. No test simulates SIGKILL of the build child mid-write and asserts watch.js still removes a stale OUTPUT.

**Evidence.** preprocessing/watch.js:108-116, 130. No inventory test simulates the abnormal-death scenario.

#### 7. watch.js error-on-server-exit (watch.js:147-152) — if the spawned `serve` process exits unexpectedly, watch.js itself exits non-zero.

**Gap.** watch.js error-on-server-exit (watch.js:147-152) — if the spawned `serve` process exits unexpectedly, watch.js itself exits non-zero. No test asserts the watcher follows its child rather than continuing to rebuild without a server.

**Evidence.** preprocessing/watch.js:147-152. /tmp/inventory.json has zero watch.js entries.

#### 8. watch.js SIGINT/SIGTERM handlers (watch.js:153-154) set `exiting=true` and kill the serve child.

**Gap.** watch.js SIGINT/SIGTERM handlers (watch.js:153-154) set `exiting=true` and kill the serve child. No test asserts that an interrupt stops both processes cleanly without the 'serve exited unexpectedly' branch firing, nor that the process exits with 0 on SIGINT.

**Evidence.** preprocessing/watch.js:153-154. /tmp/inventory.json has zero watch.js entries.

### nomadpath.yaml configuration paths (9)

#### 1. nomadpath.yaml `groups.<name>.defaultVisible: false` (build-trip-data.js:175) is documented in docs/preprocessing.md:88 and CLAUDE.md:50-52.

**Gap.** nomadpath.yaml `groups.<name>.defaultVisible: false` (build-trip-data.js:175) is documented in docs/preprocessing.md:88 and CLAUDE.md:50-52. e2e seam.spec.ts:248/273 assert the value reaches the feature, but no test verifies the failure path: a yaml file with malformed YAML, a yaml file with a typo'd key (`defaultvisible` lowercase, `default-visible`), or an unrecognised group name not present in the input dir. build-trip-data.js:140-143 only warns on read errors, never on schema mismatch.

**Evidence.** preprocessing/build-trip-data.js:135-144 silent-fallback parsing. docs/preprocessing.md:88 documents the option. /tmp/inventory.json has no test for malformed yaml or schema-typo behaviour.

#### 2. nomadpath.yaml `groups.<name>.excludeFromAutoBounds: true` (build-trip-data.js:176) is supported but only documented inline in --init template (build-trip-data.js:101-102).

**Gap.** nomadpath.yaml `groups.<name>.excludeFromAutoBounds: true` (build-trip-data.js:176) is supported but only documented inline in --init template (build-trip-data.js:101-102). No formal docs/preprocessing.md entry. The success path is tested at seam.spec.ts:248. The failure path — yaml with excludeFromAutoBounds set on a non-existent group, or set without defaultVisible — is untested.

**Evidence.** preprocessing/build-trip-data.js:101-102 (template comment), 176 (read). docs/preprocessing.md group options table at line 92-94 omits excludeFromAutoBounds. No inventory test for failure path.

#### 3. nomadpath.yaml `poi_categories.<name>.defaultVisible: false` (build-trip-data.js:139) is documented in CLAUDE.md only obliquely.

**Gap.** nomadpath.yaml `poi_categories.<name>.defaultVisible: false` (build-trip-data.js:139) is documented in CLAUDE.md only obliquely. e2e seam.spec.ts:273 asserts the value reaches the feature for one POI. No test verifies the failure path: a category specified in poi_categories that does not appear in any waypoint (silently ignored), or `null` config entry — output.test.js:353 unit-tests null, but no e2e test asserts this for the build-trip-data.js entry path.

**Evidence.** preprocessing/build-trip-data.js:139. preprocessing/lib/output.js:102. /tmp/inventory.json:353 unit covers null entry; no e2e or integration test asserts unknown-category-in-config behaviour.

#### 4. build-trip-data.js --init template generation (build-trip-data.js:79-117) is entirely untested.

**Gap.** build-trip-data.js --init template generation (build-trip-data.js:79-117) is entirely untested. No inventory test asserts: (a) the file is created at the right path, (b) the template enumerates immediate subdirs of the input, (c) re-running --init when nomadpath.yaml already exists (the code overwrites silently — possibly a bug), (d) --init exits 0.

**Evidence.** preprocessing/build-trip-data.js:79-117. /tmp/inventory.json has no entries for --init.

#### 5. build-trip-data.js silently treats a missing nomadpath.yaml as empty config (build-trip-data.js:140-144) and warns only for non-ENOENT errors.

**Gap.** build-trip-data.js silently treats a missing nomadpath.yaml as empty config (build-trip-data.js:140-144) and warns only for non-ENOENT errors. No test asserts the warn-and-continue behaviour for permission-denied or directory-instead-of-file errors, nor that ENOENT is silent (an inverted condition would fail no test).

**Evidence.** preprocessing/build-trip-data.js:140-144. /tmp/inventory.json no entry.

#### 6. nomadpath.yaml is loaded from inputDir/nomadpath.yaml only (build-trip-data.js:134).

**Gap.** nomadpath.yaml is loaded from inputDir/nomadpath.yaml only (build-trip-data.js:134). The path resolution is uncovered: if the user passes a relative `-i` flag, no test asserts the config is found at the resolved absolute path. seam.spec.ts uses fixtures with the yaml present but never asserts the config-discovery path.

**Evidence.** preprocessing/build-trip-data.js:134 join(inputDir, 'nomadpath.yaml'). /tmp/inventory.json has no test for path resolution.

#### 7. When parsed YAML has neither `groups` nor `poi_categories` keys, build-trip-data.js:138-139 falls back to empty objects.

**Gap.** When parsed YAML has neither `groups` nor `poi_categories` keys, build-trip-data.js:138-139 falls back to empty objects. A YAML file with only top-level scalars (e.g. `tripName: foo`) silently no-ops. No test asserts this; nor does any test assert what happens when YAML is a top-level array or scalar (parseYAML returns a non-object).

**Evidence.** preprocessing/build-trip-data.js:137-139. /tmp/inventory.json has no inputs for malformed top-level yaml.

#### 8. build-trip-data.js group augmentation depends on statSync of the first path component (build-trip-data.js:170-171).

**Gap.** build-trip-data.js group augmentation depends on statSync of the first path component (build-trip-data.js:170-171). If that subdirectory is later deleted between scan and augment, statSync would throw EONENT. The code's behaviour in that race condition is uncovered; the failure would cascade to the file's `try/catch` at line 217-228 only if augmentTrack throws — augmentTrack is in the augmentation chain inside the try, so a partial-build invariant violation could occur but no test verifies failExit is called.

**Evidence.** preprocessing/build-trip-data.js:170-171, 217-228. No inventory test simulates concurrent dir deletion.

#### 9. Auto-derived tripName: build-trip-data.js:71-73 generates a title-cased tripName from `basename(dirname(inputDir))` when `-n` is not provided.

**Gap.** Auto-derived tripName: build-trip-data.js:71-73 generates a title-cased tripName from `basename(dirname(inputDir))` when `-n` is not provided. No test asserts: behaviour when -n is omitted (tested only via -n='Test Trip' in fixtures), behaviour when inputDir is at filesystem root (basename of dirname is empty), or behaviour with non-ASCII directory names.

**Evidence.** preprocessing/build-trip-data.js:71-73. seam.spec.ts uses pipeline output but no assertion on auto-derived tripName. /tmp/inventory.json:38 only checks tripName 'is accessible' from fixture-explicit -n value.

---

## Phase 1.5 entry point

The next session opening this epic should:

1. Read `~/.claude/plans/epic10-preprocessing-watcher-tests.md` (epic plan)
2. Read this doc (analysis)
3. Read `~/.claude/projects/-home-dan-code-nomad-path/memory/project_epic10_testing_remediation.md` (framework + diagnoses)
4. Make the contract decision per Phase 1.5: tests-only / tests + runtime schema / shared types refactor. Compare against "lots of testing" as the alternative. Land the decision and reasoning at the top of *this doc* (no separate document).

Phase 2 then reads this doc cold and executes against the verdicts and gaps.
