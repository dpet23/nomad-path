import L from 'leaflet';

import ControlFullScreen from './control-fullscreen';
import ControlLayers from './control-layers';
import ControlLegend, { OnStyleChangeFunc } from './control-legend';
import ControlReset from './control-reset';
import ControlZoom from './control-zoom';
import defineBaseMapLayers, { BaseMapLayers, MapID } from './layers-base';
import processGeoJsonFile from './layers-geojson';
import { defaultLineStringStyleConst, LineStringStyle } from './layers-polyline';
import { LeafletMap } from './types';

/**
 * Parameters for `createLeafletMap()`.
 *
 * @property id                 DOM ID of a `<div>` element into which to add the map.
 * @property mapType            The base map initially displayed.
 * @property geojson            Path to the GeoJSON file containing the Features to display.
 * @property lineStringStyles   (Optional) The available styles for GeoJSON LineStrings.
 */
interface CreateLeafletMapParams {
    id: string;
    mapType: MapID;
    geojson: string;
    lineStringStyles?: LineStringStyle[];
}

/**
 * Create a Leaflet map and display the markers and tracks from a GeoJSON file.
 *
 * @param CreateLeafletMapParams User configuration.
 */
export default function createLeafletMap({ id, mapType, geojson, lineStringStyles }: CreateLeafletMapParams) {
    // Initialize the Leaflet map into an HTML element.
    const map: LeafletMap = L.map(id, {
        center: [0, 0], // FUTURE: dynamically calculate after adding the GeoJSON layers
        zoom: 3,
        worldCopyJump: true,
        attributionControl: true,
        zoomControl: false,
        zoomSnap: 0.5,
    });

    // Top-left:
    //  * Map view reset
    //  * Zoom Control
    //  * Fullscreen Control
    map.resetControl = new ControlReset({ position: 'topleft' }).addTo(map);
    new ControlZoom({ position: 'topleft' }).addTo(map);
    map.fullScreenControl = new ControlFullScreen({ position: 'topleft' }).addTo(map);

    // Bottom-right:
    //  * Attribution Control
    map.attributionControl.setPrefix('<a target="_blank" href="https://leafletjs.com">Leaflet</a>');

    // Define the available base map layers.
    const baseMaps: BaseMapLayers = defineBaseMapLayers();

    // Top-right:
    //  * Layers Control (TODO: https://github.com/AHAAAAAAA/leaflet-groupedlayercontrol)
    const baseMapControlDetails: L.Control.LayersObject = {};
    for (const baseLayerDetail of Object.values(baseMaps)) {
        baseMapControlDetails[baseLayerDetail.menuName] = baseLayerDetail.tileLayer;
    }
    map.layerControl = new ControlLayers(baseMapControlDetails, undefined, { collapsed: true }).addTo(map);

    // Set the default base map layer by adding it to the map.
    // Fires a `baselayerchange` event for the map.
    map.addLayer((baseMaps[mapType] ?? baseMaps.BLUEMARBLE).tileLayer);

    // Partial function for calling `processGeoJsonFile`, with pre-populated params for `geojson` and `map`.
    const reprocessGeoJsonFile: OnStyleChangeFunc = lineStringStyle => {
        processGeoJsonFile(geojson, map, lineStringStyle);
    };

    // Set a default LineString style if none was provided.
    if (!lineStringStyles || lineStringStyles.length === 0) {
        lineStringStyles = [defaultLineStringStyleConst];
    }

    // Bottom-left:
    //  * Legend Control
    //  * Scale Control
    map.legendControl = new ControlLegend({
        position: 'bottomleft',
        supportedStyles: lineStringStyles,
        onStyleChange: reprocessGeoJsonFile,
    }).addTo(map);
    map.scaleControl = L.control.scale({ metric: true, imperial: true }).addTo(map);

    // Read the GeoJSON file, processing each Feature individually and adding the results to the map.
    const initialLineStringStyle = lineStringStyles[0];
    processGeoJsonFile(geojson, map, initialLineStringStyle);
}

export {
    getLineStringAltitude,
    getLineStringConst,
    getLineStringHourOfDay,
    getLineStringSpeed,
    getLineStringTransport,
} from './layers-polyline';
