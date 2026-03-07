
Map libraries:
    * https://maplibre.org/maplibre-gl-js/docs/examples/
    * https://cesium.com/platform/cesiumjs/


Assign colors dynamically:
    * D3.js, chroma.js
    * D3 ordinal scale: `import { scaleOrdinal, schemeCategory10 } from 'd3-scale';`


Polylines:
    * with gradient: Leaflet.Polyline.SnakeAnim
    * simplification: https://mourner.github.io/simplify-js/


While processing tracks:
    * Keep track of the min and max values for speed/heartrate.
    * Keep a list of transportModes


Track preprocessing:
    * Timezone from GPS coords: `tzlookup`, `date-fns-tz`


UI testing:
    * Playwright (UI + Visual + Cross-browser + Mobile Emulation)
