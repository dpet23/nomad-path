# leaflet-map

Simple library for creating a Leaflet map.


## Initialization

The library has a single JS file that must be imported.

It can be initialized like this:

```html
<head>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <link rel="stylesheet" href="./dist/leaflet-map.min.css" />
</head>
<body>
    <!-- A div in which to place the map. Must be empty. -->
    <div id="map"></div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://unpkg.com/Leaflet.MultiOptionsPolyline@1.0.0/Leaflet.MultiOptionsPolyline.js"></script>

    <script type="module">
        import createLeafletMap, { getLineStringConst } from './dist/leaflet-map.min.esm.js';

        // Create the map and draw the data from the GeoJSON file.
        const leafletMap = createLeafletMap({
            id: 'map',
            geojson: 'data.geojson',
            lineStringStyles: [
                {
                    name: 'Single colour',
                    func: getLineStringConst,
                    thresholds: new Map([
                        ['Track', '#E60000'],
                    ]),
                },
                // ...
            ],
        });

        // Optionally change map settings.
        leafletMap.attributionControl.addAttribution(
            'GPS data recorded with <a target="_blank" href="www.example.com">Example</a>'
        );
    </script>
</body>
```

### Options

#### `id`

DOM ID of a `<div>` element into which to add the map.

#### `mapType: BLUEMARBLE`

The base map initially displayed.

This can be changed at runtime using the Layer Control.

Valid values are:

* `BLUEMARBLE`: NASA Blue Marble 2004
* `OPENSTREETMAP`: OpenStreetMap
* `GOOGLE_SATELLITE`: Google Maps (satellite view, static tiles)

#### `geojson`

Path to the GeoJSON file containing the Features to display.

#### `lineStringStyles`

The available styles for GeoJSON LineStrings, as an array of details.

For each style in the array, the expected fields are:

* `name`: The style name, displayed in the Legend Control.
* `func`: A callback function to extract a certain property from a GeoJSON LineString Feature or Leaflet Polyline.
    * Type: `(leafletLayer: L.Polyline, geoJsonFeature: Feature) => (number | string | undefined)[]`
    * Should return a flattened array of a property's value for each point/LatLng.
      There *must* be one value for each point.
* thresholds - The threshold values to check in the extracted property values, and the color to apply.
    * This must be a map of the value to check (`number | string | undefined`), to the CSS hex color.

Some callback functions are provided for convenience:

* `getLineStringAltitude`: Extracts altitude (in metres) from each point
* `getLineStringConst`: Returns `Track` for each point
* `getLineStringHourOfDay`: Extracts the hour of day (in UTC) from GeoJSON
  * JSONPath: `$.features[?(/LineString/.test(@.geometry.type))].properties.coordinateProperties.times`
* `getLineStringSpeed`: Extracts speed (in km/h) from GeoJSON
  * JSONPath: `$.features[?(/LineString/.test(@.geometry.type))].properties.coordinateProperties.speeds`
* `getLineStringTransport`: Extracts transport mode from GeoJSON
  * JSONPath: `$.features[?(/LineString/.test(@.geometry.type))].properties.transport[0]`

## Embedding

A page containing the Leaflet map can be embedded into another page:

```html
<div id="map" class="ratio shadow border border-light" style="height: 50vh;">
    <iframe src="leaflet.html" title="Leaflet Map" allowfullscreen />
</div>
```

A wrapper `div` can be used for styling (the example uses [Bootstrap](https://getbootstrap.com/)).
