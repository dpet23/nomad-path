# Development

## Prerequisites

* [Git](https://git-scm.com/)
* [Node.js 18](https://nodejs.org/en/download/releases/) with [npm](https://www.npmjs.com/)

## Structure

The main config files are:

| File | Summary |
| ---- | ------- |
| `package.json` | Main config and list of dependencies |
| `tsconfig.json` | TypeScript compiler configuration |
| `rollup.config.mjs` | Rollup configuration for bundling production packages |
| `.editorconfig`<br>`.eslint.json`<br>`.stylelintrc.json`<br>`.prettierrc` | Code style settings |
| `jest.config.system.js` | Jest framework configuration for system testing |

## Common commands

Use the Node Package Manager (`npm`) to manage the dependencies and run commands.

| Command | Description |
| ------- | ----------- |
| `npm install` | Install all dependencies from `package.json` to the local `node_modules` folder |
| `npm install <package> [--save-dev]` | Install a package & add it to the runtime or development dependencies |
| `npm uninstall <package>` | Uninstall a package & remove it from the dependencies list |
| `npm ci` | Install all dependencies from `package-lock.json` (for automated environments) |
| `npm run lint` | Run all code linting (ESLint and Stylelint) |
| `npm run lint:fix` | Run all code linting and automatically fix problems |
| `npm run lint:ts` | Run [ESLint](https://www.npmjs.com/package/eslint) over the TypeScript files (includes [Prettier](https://www.npmjs.com/package/eslint-plugin-prettier) and [SonarJS](https://www.npmjs.com/package/eslint-plugin-sonarjs)) |
| `npm run lint:css` | Run [StyleLint](https://www.npmjs.com/package/stylelint) over the SCSS files (includes [Prettier](https://www.npmjs.com/package/stylelint-prettier)) |
| `npm run test:system:<mode>` | Run browser-based system testing |
| `npm version [major\|minor\|patch]` | Version bump _(in `package.json`)_ |
| `npm run build` | Compile the TypeScript code into JavaScript and the Sass code into CSS (for development only) |
| `npm run dist` | Build the library for production as an ES Module and CSS file, in the `dist` folder |
| `npm run dist:expand` | Build the library for production (expanded style), in the `dist` folder |
| `npm run dist:minify` | Build the library for production (minified style), in the `dist` folder |

`npx` is used to execute npm packages that haven't been installed globally.
`nvm` can be used to manage the current version of Node.

## System testing

A set of browser-based system tests is defined in `test/system.test.ts`.
These use [Selenium](https://www.selenium.dev/) to automate browser actions.

Tests can be run in one of 2 modes:

#### `local`

Use a locally-installed browser to run the test suite.

Configuration:
* `SELENIUM_BROWSER=chrome|firefox|MicrosoftEdge|safari`: the browser to use
* `SELENIUM_HEADLESS=true`: run the browser in headless mode (don't show the UI)

#### `browserstack`

Use the [BrowserStack](https://www.browserstack.com/automate) platform for cross-browser testing.

Configuration:
* `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY`: BrowserStack credentials

## JavaScript events

The map reacts to the following events:

* [`click`](https://developer.mozilla.org/en-US/docs/Web/API/Element/click_event)
  * Fired by the browser: after `mousedown` and `mouseup` on an element
  * Handled by:
    * `LeafletMap`: close any open Collapsible Controls
    * `ControlZoom` (zoom bars): set the zoom level of the map
    * `ControlTrackLayers` (checkbox): show or hide a track on the map
    * `ControlTrackLayers` (label): show or hide a track's popup
    * `ControlAbstractButton`: call custom handler when the Button Control is clicked
    * `ControlAbstractCollapsible`: expand a Collapsible Control

* [`mouseenter`](https://developer.mozilla.org/en-US/docs/Web/API/Element/mouseenter_event) / [`mouseover`](https://developer.mozilla.org/en-US/docs/Web/API/Element/mouseover_event)
  * Fired by the browser: when a pointing device is moved over an element
  * Handled by:
    * `ControlAbstractCollapsible`: expand a Collapsible Control
    * `ControlTrackLayers` (label) and `L.Layer`: style a group of tracks, show tooltip

* [`mouseleave`](https://developer.mozilla.org/en-US/docs/Web/API/Element/mouseleave_event) / [`mouseout`](https://developer.mozilla.org/en-US/docs/Web/API/Element/mouseout_event)
  * Fired by the browser: when a pointing device is moved out of an element
  * Handled by:
    * `ControlAbstractCollapsible`: close a Collapsible Control
    * `ControlTrackLayers` (label) and `L.Layer`: reset styles for a group of tracks, hide tooltip

* [`keydown`](https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event)
  * Fired by the browser: when a key is pressed
  * Handled by `ControlAbstractCollapsible` (`Enter`): expand a Collapsible Control

* [`fullscreenchange`](https://developer.mozilla.org/en-US/docs/Web/API/Document/fullscreenchange_event)
  * Fired by the browser: when switching into or out of fullscreen mode
  * Handled by `ControlFullScreen`: handle changes to fullscreen mode

* [`change`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/change_event)
  * Fired by the browser: when value of an `input`/`select`/`textarea` element is changed
  * Handled by `ControlTrackLegend` (select): apply a new LineString style

* [`baselayerchange`](https://leafletjs.com/reference.html#map-baselayerchange)
  * Fired by Leaflet (`L.Control.Layers`): when the base layer is changed
  * Handled by `ControlZoom`: enable or disable the zoom bars

* [`add`](https://leafletjs.com/reference.html#layer-add)
  * Fired by Leaflet: after a layer is added to the map
  * Handled by `ControlTrackLayers`: update the Control's UI and fire an `overlayadd` event

* [`remove`](https://leafletjs.com/reference.html#layer-remove)
  * Fired by Leaflet: after a layer is removed from the map
  * Handled by `ControlTrackLayers`: update the Control's UI and fire an `overlayremove` event

* [`zoomend`](https://leafletjs.com/reference.html#map-zoomend)
  * Fired by Leaflet: when the map zoom changed, after animations
  * Handled by `ControlZoom`: enable or disable the zoom bars
