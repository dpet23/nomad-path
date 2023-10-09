/* eslint-disable camelcase */
/* eslint-disable new-cap */
/* eslint-disable unused-imports/no-unused-vars */

const gv_options = {
    full_screen: true,
    map_type: 'OPENSTREETMAP',
    center: [51.32327, -2.27902],
    zoom: 15,
    zoom_control: 'auto',
    animated_zoom: true,
    recenter_button: true,
    center_coordinates: false,
    scale_units: 'both',
    measurement_tools: false,
    utilities_menu: false,
};

/**
 * Create a Leaflet map based on the GPS Visualizer functions
 * and display the markers and tracks from a GeoJSON file.
 *
 * @param {string} id - DOM ID of a <div> element into which to add the map.
 * @param {string} geojson - Path to the GeoJSON file containing the Features to display.
 */
function createLeafletMap(id, geojson) {
    gv_options.map_div = id;

    const ret = GV_Setup_Map();
    if (typeof ret !== 'undefined') {
        alert('Failed to set up the GV Map');
    }

    // Set up the Attribution Control.
    L.DomUtil.get('gv_credit').remove();
    gmap.attributionControl.setPrefix('<a target="_blank" href="https://leafletjs.com">Leaflet</a>');

    console.log('gvg', gvg);
    console.log('gmap', gmap);

    GV_Finish_Map();
}



/**
 * Notes on GV track functions
 *
 * Creation:
 *  * GV_Draw_Track                 generates L.Polyline for each "segment", immediately adds to map
 *  * GV_Finish_Track               configures UI popups, hides track if necessary
 *      * GV_Make_Track_Clickable       calls bindPopup()
 *      * GV_Make_Track_Mouseoverable   useful to copy, with subfunction
 *
 * Tracklist:
 *  * GV_Add_Track_to_Tracklist: uses custom Control to display tracks as a table of (checkbox, name, icon)
 *      * Checkbox calls a function to toggle the track
 *      * Name highlights track on mouseover
 *      * Icon calls a function to zoom to track(accesses track object, gets bounds, zooms map)
 */



/**
 * Issue:
 * "Uncaught Error: Attempted to load an infinite number of tiles"
 */
//
// /**
//  * Define the base map layers.
//  *
//  * @return {?} A list of all supported baselayers for the Leaflet map.
//  */
// function GV_Background_Map_List() {
//     return [
//         {
//             // Docs: https://nasa-gibs.github.io/gibs-api-docs/available-visualizations/#visualization-product-catalog
//             id: 'BLUEMARBLE',
//             menu_name: 'NASA Blue Marble 2004',
//             url: [
//                 // eslint-disable-next-line max-len
//                 'https://gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{time}/{tileMatrixSet}/{z}/{y}/{x}.jpg',
//             ],
//             opts: {
//                 layer: 'BlueMarble_ShadedRelief_Bathymetry',
//                 tileMatrixSet: 'EPSG3857_500m',
//                 time: '',
//                 minZoom: 0,
//                 maxZoom: 8,
//                 noWrap: true,
//                 continuousWorld: true,
//                 bounds: [
//                     // Prevent Leaflet from retrieving non-existent tiles on the borders.
//                     [-85.0511287776, -179.999999975],
//                     [85.0511287776, 179.999999975],
//                 ],
//                 attribution:
//                     '<a target="_blank" href="https://wiki.earthdata.nasa.gov/display/GIBS">NASA EOSDIS GIBS</a>',
//             },
//         },
//         {
//             id: 'OPENSTREETMAP',
//             menu_name: 'OpenStreetMap',
//             url: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
//             opts: {
//                 minZoom: 0,
//                 maxZoom: 19,
//                 attribution: '<a target="_blank" href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
//             },
//         },
//         {
//             // Docs: https://gis.stackexchange.com/a/341490
//             id: 'GOOGLE_SATELLITE',
//             menu_name: 'Google aerial/satellite',
//             url: ['https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'],
//             opts: {
//                 subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
//                 minZoom: 1,
//                 maxZoom: 21,
//                 attribution:
//                     // eslint-disable-next-line max-len
//                     '<a target="_blank" href="https://www.google.com/intl/en-US_US/help/terms_maps/">TerraMetrics, Google</a>',
//             },
//         },
//     ];
// }
//
// /**
//  * Convert from a map info array into a group of Leaflet TileLayers (one for each URL).
//  *
//  * @return {L.LayerGroup} .
//  */
// function GV_Define_Map(mapinfo) {
//     const { opts, ...settings } = mapinfo;
//     const sublayers = [];

//     for (const element of mapinfo.url) {
//         const url = element.toString();
//         const cn = mapinfo.blending ? `blend-${mapinfo.blending}` : 'blend-normal';
//         const tileLayerOptions = { ...opts, className: cn };

//         const layer = L.tileLayer(url, tileLayerOptions);
//         sublayers.push(layer);

//         gvg.bg[mapinfo.id] = mapinfo.id; // GPSVisualizer: "everything is an alias to itself"
//     }

//     const layergroup_options = { pane: 'tilePane', opacity: 1, attribution: mapinfo.opts.attribution };
//     for (let attribute in settings) {
//         layergroup_options[attribute] = mapinfo[attribute];
//     };

//     return L.layerGroup(sublayers, layergroup_options);
// }

// Create the Leaflet map.
createLeafletMap('map', './data/data.geojson');
