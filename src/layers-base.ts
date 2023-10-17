import L from 'leaflet';

/**
 * Expand Leaflet's TileLayerOptions type, adding custom attributes.
 */
type TileLayerOptionsBlueMarble = L.TileLayerOptions & {
    layer: string;
    tileMatrixSet: string;
    time: string;
    continuousWorld: boolean;
};

/**
 * Define the base map layers.
 *
 * @return An object with all initial baselayers for the Leaflet map.
 */
export default function defineBaseMapLayers(): { [menuName: string]: L.TileLayer } {
    // OpenStreetMap
    const layerOpenStreetMap = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        minZoom: 0,
        maxZoom: 19,
        attribution: '<a target="_blank" href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });

    // Google Maps (satellite view, static tiles)
    // Docs: https://gis.stackexchange.com/a/341490
    const layerGoogleSatelliteStatic = L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        minZoom: 0,
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution:
            '<a target="_blank" href="https://www.google.com/intl/en-US_US/help/terms_maps/">TerraMetrics, Google</a>',
    });

    // NASA Blue Marble
    // Docs: https://nasa-gibs.github.io/gibs-api-docs/available-visualizations/#visualization-product-catalog
    const layerBlueMarble = L.tileLayer(
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

    return {
        'NASA Blue Marble 2004': layerBlueMarble,
        OpenStreetMap: layerOpenStreetMap,
        'Google aerial/satellite': layerGoogleSatelliteStatic,
    };
}
