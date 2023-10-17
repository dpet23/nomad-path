import L from 'leaflet';

import ControlLayers from './control-layers';
import createLegendControl from './control-legend';
import createResetControl from './control-reset';
import defineBaseMapLayers from './layers-base';
import processGeoJsonFile, { LineStringStyle, ProcessGeoJsonFilePartialFunc } from './layers-geojson';
import LeafletMap from './leaflet-map';

/**
 * Parameters for `createLeafletMap()`.
 *
 * @property id                 DOM ID of a `<div>` element into which to add the map.
 * @property geojson            Path to the GeoJSON file containing the Features to display.
 * @property lineStringStyles   The available styles for GeoJSON LineStrings.
 */
interface CreateLeafletMapParams {
    id: string;
    geojson: string;
    lineStringStyles: LineStringStyle[];
}

/**
 * Create a Leaflet map and display the markers and tracks from a GeoJSON file.
 *
 * @param CreateLeafletMapParams User configuration.
 */
export default function createLeafletMap({ id, geojson, lineStringStyles }: CreateLeafletMapParams) {
    // Initialize the Leaflet map into a HTML element.
    const map: LeafletMap = L.map(id, {
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
    const layerControl = new ControlLayers(baseMaps, undefined, { collapsed: true }).addTo(map);
    map.layerControl = layerControl;

    // Partial function for calling `processGeoJsonFile`, with pre-populated params for `geojson` and `map`.
    const processGeoJsonFilePartialFn: ProcessGeoJsonFilePartialFunc = (newLineStyleFunc, newLineStyleThresholds) => {
        processGeoJsonFile(geojson, map, newLineStyleFunc, newLineStyleThresholds);
    };

    // Set up Legend Control (gv_infobox).
    const legendControl = createLegendControl(lineStringStyles, processGeoJsonFilePartialFn).addTo(map);
    map.legendControl = legendControl;

    // Read the GeoJSON file, processing each Feature individually.
    const defaultLineStringStyle = lineStringStyles[0];
    processGeoJsonFile(geojson, map, defaultLineStringStyle.func, defaultLineStringStyle.thresholds);
}

export {
    styleLineStringLayerAltitude,
    styleLineStringLayerHourOfDay,
    styleLineStringLayerSpeed,
} from './layers-geojson';
