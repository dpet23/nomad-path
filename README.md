# leaflet-map

Simple library for creating a Leaflet map.


## Initialization

The library has a single JS file that must be imported.

It can be initialized like this:

```html
<script type="module">
    import createLeafletMap from './dist/leaflet-map.esm.js';

    createLeafletMap({
        id: 'map',
        geojson: 'data.geojson',
        lineStringStyles = [
            // ...
        ],
    });
</script>
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
* thresholds - The threshold values to check in the extracted property values, and the CSS style to apply.
    * This must be a map of the value to check (`number | string | undefined`)
      to the CSS styles as an object (`{ [key: string]: string }`).

Some callback functions are provided for convenience:

* `getLineStringAltitude`: Extracts altitude (in metres) from each point
* `getLineStringConst`: Returns `Track` for each point
* `getLineStringHourOfDay`: Extracts the hour of day (in UTC) from GeoJSON
  (`$.features[?(/LineString/.test(@.geometry.type))].properties.coordinateProperties.times`)
* `getLineStringSpeed`: Extracts speed (in km/h) from GeoJSON
  (`$.features[?(/LineString/.test(@.geometry.type))].properties.coordinateProperties.speeds`)
* `getLineStringTransport`: Extracts transport mode from GeoJSON
  (`$.features[?(/LineString/.test(@.geometry.type))].properties.transport[0]`)

## Development

### Prerequisites

* [Git](https://git-scm.com/)
* [Node.js 18](https://nodejs.org/en/download/releases/) with [npm](https://www.npmjs.com/)

### Structure

The main config files are:

| File | Summary |
| ---- | ------- |
| `package.json` | Main config and list of dependencies |
| `tsconfig.json` | TypeScript compiler configuration |
| `rollup.config.mjs` | Rollup configuration for bundling production packages |
| `.editorconfig`, `.eslint.json`, `.prettierrc` | Code style settings |

### Common commands

Use the Node Package Manager (`npm`) to manage the dependencies and run commands.

| Command | Description |
| ------- | ----------- |
| `npm install` | Install all dependencies from `package.json` to the local `node_modules` folder |
| `npm install <package> [--save-dev]` | Install a package & add it to the runtime or development dependencies |
| `npm uninstall <package>` | Uninstall a package & remove it from the dependencies list |
| `npm ci` | Install all dependencies from `package-lock.json` (for automated environments) |
| `npm run lint` | Run [ESLint](https://www.npmjs.com/package/eslint) over the `src` files (includes [Prettier](https://www.npmjs.com/package/eslint-plugin-prettier) and [SonarJS](https://www.npmjs.com/package/eslint-plugin-sonarjs)) |
| `npm run lint:fix` | Run the lint check and automatically fix problems |
| `npm version [major\|minor\|patch]` | Version bump _(in `package.json`)_ |
| `npm run build` | Build the library for production to the `build` folder |
| `npm run package` | Bundle the production packages into a single ES Module, in the `dist` folder |
| `npm run dist` | Wrapper for `build && package`<br>Build the library for production and bundle into a single ES Module |

`npx` is used to execute npm packages that haven't been installed globally.
`nvm` can be used to manage the current version of Node.
