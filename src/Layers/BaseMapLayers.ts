/**
 * Define the base map layers.
 */

import L from 'leaflet';

// Type alias for a function that will define a base map layer.
type CreateLayerFunc = () => L.TileLayer;

/**
 * Define a base map using OpenStreetMap.
 */
const layerOpenStreetMap: CreateLayerFunc = () =>
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        minZoom: 0,
        maxZoom: 19,
        attribution: '<a target="_blank" href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });

/**
 * Define a base map using Google Maps (satellite view, static tiles).
 *
 * @see https://gis.stackexchange.com/a/341490
 */
const layerGoogleSatelliteStatic: CreateLayerFunc = () =>
    L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        minZoom: 0,
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution:
            '<a target="_blank" href="https://www.google.com/intl/en-US_US/help/terms_maps/">TerraMetrics, Google</a>',
    });

// Expand Leaflet's TileLayerOptions type, adding custom attributes.
type TileLayerOptionsBlueMarble = L.TileLayerOptions & {
    layer: string;
    tileMatrixSet: string;
    time: string;
    continuousWorld: boolean;
};

/**
 * Define a base map using NASA's Blue Marble imagery.
 *
 * @see https://nasa-gibs.github.io/gibs-api-docs/available-visualizations/#visualization-product-catalog
 */
const layerBlueMarble: CreateLayerFunc = () =>
    L.tileLayer(
        'https://gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{time}/{tileMatrixSet}/{z}/{y}/{x}.jpg',
        {
            layer: 'BlueMarble_ShadedRelief_Bathymetry',
            tileMatrixSet: 'EPSG3857_500m',
            time: '',
            minZoom: 0,
            maxZoom: 8,
            noWrap: true,
            continuousWorld: true,
            bounds: [
                // Prevent Leaflet from retrieving non-existent tiles on the borders.
                [-85.0511287776, -179.999999975],
                [85.0511287776, 179.999999975],
            ],
            attribution: '<a target="_blank" href="https://wiki.earthdata.nasa.gov/display/GIBS">NASA EOSDIS GIBS</a>',
        } as TileLayerOptionsBlueMarble,
    );

/**
 * Supported map types.
 */
export type MapID = 'BLUEMARBLE' | 'OPENSTREETMAP' | 'GOOGLE_SATELLITE';

/**
 * Object defining the details of a supported base map layer.
 *
 * @property menuName - The name of the layer, displayed in the Layers Control.
 * @property tileLayer - The Leaflet Layer object.
 */
type BaseLayerDetail = {
    menuName: string;
    tileLayer: L.TileLayer;
};

/**
 * Object defining the details of all available base map layers.
 *  * key: The internal ID of a map type.
 *  * value: The details of the base map layer.
 */
export type BaseMapLayers = { [id in MapID]: BaseLayerDetail };

/**
 * Define the base map layers, in the order they will appear in the Layers Control.
 *
 * @return An object with all initial baselayers for the Leaflet map.
 */
export default function defineBaseMapLayers(): BaseMapLayers {
    return {
        BLUEMARBLE: { menuName: 'NASA Blue Marble 2004', tileLayer: layerBlueMarble() },
        OPENSTREETMAP: { menuName: 'OpenStreetMap', tileLayer: layerOpenStreetMap() },
        GOOGLE_SATELLITE: { menuName: 'Google aerial/satellite', tileLayer: layerGoogleSatelliteStatic() },
    };
}
