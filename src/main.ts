import L from 'leaflet';

import ControlLayers from './ControlLayers/ControlLayers';
import ControlLegend, { OnStyleChangeFunc } from './ControlLegend/ControlLegend';
import ControlReset from './ControlReset/ControlReset';
import defineBaseMapLayers, { BaseMapLayers, MapID } from './Layers/BaseMapLayers';
import processGeoJsonFile from './Layers/GeoJsonFile';
import { defaultLineStringStyleConst, LineStringStyle } from './Layers/MultiOptionsPolyline';
import { LeafletMap } from './Types/LeafletMap';

/**
 * Parameters for `createLeafletMap()`.
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
 * @param props - User configuration.
 * @param props.id - DOM ID of a `<div>` element into which to add the map.
 * @param props.mapType - (Optional) The base map initially displayed.
 * @param props.geojson - Path to the GeoJSON file containing the Features to display.
 * @param props.lineStringStyles - (Optional) The available styles for GeoJSON LineStrings.
 */
export default function createLeafletMap({
    id,
    mapType,
    geojson,
    lineStringStyles,
}: CreateLeafletMapParams): LeafletMap {
    // Initialize the Leaflet map into an HTML element.
    const map: LeafletMap = L.map(id, {
        center: [0, 0], // FUTURE: dynamically calculate after adding the GeoJSON layers
        zoom: 3,
        worldCopyJump: true,
    });

    // Top-left:
    //  * Scale Control
    //  * Map view reset
    map.scaleControl = L.control.scale({ metric: true, imperial: true }).addTo(map);
    map.resetControl = new ControlReset({ position: 'topleft' }).addTo(map);

    // Bottom-right:
    //  * Attribution Control
    map.attributionControl.setPrefix('<a target="_blank" href="https://leafletjs.com">Leaflet</a>');

    // Define the available base map layers,
    // and set the default type by adding it to the map.
    const baseMaps: BaseMapLayers = defineBaseMapLayers();
    map.addLayer((baseMaps[mapType] ?? baseMaps.BLUEMARBLE).tileLayer);

    // Top-right:
    //  * Layers Control (TODO: https://github.com/AHAAAAAAA/leaflet-groupedlayercontrol)
    const baseMapControlDetails: L.Control.LayersObject = {};
    for (const baseLayerDetail of Object.values(baseMaps)) {
        baseMapControlDetails[baseLayerDetail.menuName] = baseLayerDetail.tileLayer;
    }
    map.layerControl = new ControlLayers(baseMapControlDetails, undefined, { collapsed: true }).addTo(map);

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
    map.legendControl = new ControlLegend({
        position: 'bottomleft',
        supportedStyles: lineStringStyles,
        onStyleChange: reprocessGeoJsonFile,
    }).addTo(map);

    // Read the GeoJSON file, processing each Feature individually and adding the results to the map.
    const initialLineStringStyle = lineStringStyles[0];
    processGeoJsonFile(geojson, map, initialLineStringStyle);

    return map;
}

export {
    getLineStringAltitude,
    getLineStringConst,
    getLineStringHourOfDay,
    getLineStringSpeed,
    getLineStringTransport,
} from './Layers/MultiOptionsPolyline';
