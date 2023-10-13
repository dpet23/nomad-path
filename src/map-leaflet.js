import createResetControl from "./control-reset.esm.js";
import getLayerControlOverlays from "./control-layers.esm.js";
import createLegendControl from "./control-legend.esm.js";
import defineBaseMapLayers from "./layers-base.esm.js";
import processGeoJsonFile from "./layers-geojson.esm.js";

/**
 * Create a Leaflet map and display the markers and tracks from a GeoJSON file.
 *
 * @param {string} id - DOM ID of a <div> element into which to add the map.
 * @param {string} geojson - Path to the GeoJSON file containing the Features to display.
 * @param {Array<Styles>} lineStringStyles - The available styles for GeoJSON LineStrings.
 */
export default function createLeafletMap({id, geojson, lineStringStyles}) {
    // Initialize the Leaflet map into a HTML element.
    const map = L.map(id, {
        center: [0, 0], // FUTURE: dynamically calculate after adding the GeoJSON layers
        zoom: 3,
        worldCopyJump: true,
    });

    // Set up the Attribution Control.
    map.attributionControl.setPrefix('<a target="_blank" href="https://leafletjs.com">Leaflet</a>');

    // Set up the Scale Control.
    const scaleControl = L.control.scale({ metric: true, imperial: true }).addTo(map);
    map.scaleControl = scaleControl;

    // Add a Control for resetting the map view.
    const resetControl = createResetControl().addTo(map);
    map.resetControl = resetControl;

    // Define the available base map layers.
    const baseMaps = defineBaseMapLayers();
    map.addLayer(baseMaps['NASA Blue Marble 2004']);

    // Set up the Layers Control.
    // TODO: https://github.com/AHAAAAAAA/leaflet-groupedlayercontrol
    L.Control.Layers.include({ getOverlays: getLayerControlOverlays });
    const layerControl = L.control.layers(baseMaps, null, { collapsed: true }).addTo(map);
    map.layerControl = layerControl;

    /**
     * Partial function for calling `processGeoJsonFile`, with pre-populated params for `geojson` and `map`.
     *
     * @callback processGeoJsonFilePartialFunc
     * @param {StyleLineStringFn} newLineStyleFunc
     * @param {ThresholdStyles} newLineStyleThresholds
     */
    const processGeoJsonFilePartialFn = (newLineStyleFunc, newLineStyleThresholds) => {
        processGeoJsonFile(geojson, map, newLineStyleFunc, newLineStyleThresholds);
    };

    // Set up Legend Control (gv_infobox).
    const legendControl = createLegendControl(lineStringStyles, processGeoJsonFilePartialFn).addTo(map);
    map.legendControl = legendControl;

    // Read the GeoJSON file, processing each Feature individually.
    const defaultLineStringStyle = lineStringStyles[0];
    processGeoJsonFile(geojson, map, defaultLineStringStyle.func, defaultLineStringStyle.thresholds);
}

/**
 * Type definitions for the GeoJSON LineString styles.
 *
 * @typedef {Object.<string, string>} CssStyles
 * @typedef {Map<number|string|undefined, CssStyles>} ThresholdStyles
 *
 * @callback StyleLineStringFn
 * @param {ThresholdStyles} thresholds
 * @param {L.Polyline} leafletLayer
 * @param {Object.<string, any>} geoJsonFeature
 * @return {L.MultiOptionsPolyline}
 *
 * @typedef {Object} Styles - A known style for a LineString.
 * @property {string} name - The display name in the drop-down selector.
 * @property {StyleLineStringFn} func - A function to apply the style, converting to a MultiOptionsPolyline object.
 * @property {ThresholdStyles} thresholds - The threshold values for each segment, and the style to apply.
 */
