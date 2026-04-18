<!-- Claude: Keep in sync with src/index.ts (NomadPath.create options, setColourAttribute, setTrackVisible, setBasemap, trips getter) and src/styling/ColorRamps.ts (TRANSPORT_MODE_COLOURS). Update the basemap table if BASEMAPS changes in src/core/MapEngine.ts. -->

# API Reference

`NomadPath` is the single public class. All interaction with the map goes through the instance
returned by `NomadPath.create()`.

---

## NomadPath.create(config)

```typescript
const map = await NomadPath.create({
  // Required
  container: 'map',                    // HTML element ID
  dataUrls: ['trip-data.geojson'],     // one or more GeoJSON URLs

  // Optional
  defaultBasemap: 'osm',              // 'osm' (default) | 'blueMarble'
  initialBounds: 'auto',              // 'auto' (default) | [[lat,lng],[lat,lng]]
});
```

### Available basemaps

| ID | Description | Max zoom |
|----|-------------|----------|
| `osm` | OpenStreetMap (OpenFreeMap bright style) | 20 |
| `blueMarble` | NASA Blue Marble shaded relief + bathymetry | 8 |

Blue Marble is great for overview/flight maps; switch to OSM for ground-level detail.

---

## Colour attributes

Switch track colouring at runtime:

```javascript
map.setColourAttribute('day');           // rainbow spectrum across all days
map.setColourAttribute('speed');         // green → yellow → red
map.setColourAttribute('elevation');     // dark green → yellow → white
map.setColourAttribute('sunAngle');      // night blue → orange → noon yellow
map.setColourAttribute('transportMode'); // per-mode fixed colours
```

Transport mode colours are exported for use in custom UI:

```javascript
import { TRANSPORT_MODE_COLOURS } from './nomad-path.js';
// { walk: '#4CAF50', drive: '#2196F3', flight: '#F44336', ... }
```

---

## Track visibility

```javascript
map.setTrackVisible('2024-03-15::Morning Drive', false);
map.isTrackVisible('2024-03-15::Morning Drive'); // false
```

Track IDs are derived as `${day}::${name}` where `day` is the local-timezone calendar date and
`name` is the GPX track name. See [preprocessing.md](preprocessing.md) for how day keys are
assigned for flights and tracks without timestamps.

---

## Basemap switching

```javascript
map.setBasemap('blueMarble');
map.setBasemap('osm');
```

Track layers are automatically re-added after the new style loads. Visibility state, colour
attribute, and dynamic attribute ranges are all preserved.

---

## Accessing loaded data

```javascript
const trips = map.trips;  // TripData[]
trips.forEach(trip => {
  console.log(trip.metadata.tripName);
  console.log(trip.features.length, 'features');
});
```
