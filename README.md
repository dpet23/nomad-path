# leaflet-map

Simple library for creating a Leaflet map.


## Initialization

The library has a single JS file that must be imported.

It can be initialized like this:

```html
<script type="module">
    import createLeafletMap from './dist/leaflet-map.js';

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

#### `geojson`

Path to the GeoJSON file containing the Features to display.

#### `lineStringStyles`

The available styles for GeoJSON LineStrings.


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
