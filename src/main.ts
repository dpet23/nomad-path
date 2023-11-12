import L from 'leaflet';

import ControlFullScreen from './ControlButton/ControlFullscreen/ControlFullscreen';
import ControlOpenInNewTab from './ControlButton/ControlOpenInNewTab/ControlOpenInNewTab';
import ControlReset from './ControlButton/ControlReset/ControlReset';
import ControlLegend, { OnStyleChangeFunc } from './ControlCollapsible/ControlLegend/ControlLegend';
import ControlLayers from './ControlLayers/ControlLayers';
import ControlZoom from './ControlZoom/ControlZoom';
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
        attributionControl: true,
        zoomControl: false,
        zoomSnap: 0.5,
    });

    // Check if the map is being embedded into another page.
    map.embedded = window.location !== window.parent.location;

    // Top-left:
    //  * Open In New Tab Control
    //  * Fullscreen Control
    //  * Zoom Control
    //  * Map View Reset Control
    map.openInNewTabControl = new ControlOpenInNewTab({ position: 'topleft' }).addTo(map);
    map.fullScreenControl = new ControlFullScreen({ position: 'topleft' }).addTo(map);
    new ControlZoom({ position: 'topleft' }).addTo(map);
    map.resetControl = new ControlReset({ position: 'topleft' }).addTo(map);

    // Bottom-right (add in reverse order):
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

    // Bottom-left (add in reverse order):
    //  * Legend Control
    //  * Scale Control
    map.scaleControl = L.control.scale({ metric: true, imperial: true }).addTo(map);
    map.legendControl = new ControlLegend({
        position: 'bottomleft',
        collapsed: true,
        title: 'Track Legend',
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
