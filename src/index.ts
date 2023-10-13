/* eslint-disable unused-imports/no-unused-vars */
/**
 * Create a Leaflet map.
 */
function createLeafletMap() {
    /* eslint-enable unused-imports/no-unused-vars */
    const mapCenterDefault: import('leaflet').LatLngExpression = [0, 0];
    const mapZoomDefault = 3;

    // Define base map layers.
    const layerOsm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '<a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });
    const layerGoogleHybridStatic = L.tileLayer(
        'http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
        {
            // https://gis.stackexchange.com/a/341490
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: '<a href="https://www.google.com.au/maps">NASA, TerraMetrics, Google</a>',
        }
    );
    const layerBlueMarble = L.tileLayer(
        // eslint-disable-next-line  max-len
        'https://gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default//EPSG3857_500m/{z}/{y}/{x}.jpg',
        {
            maxZoom: 8,
            noWrap: true,
            bounds: [
                // Prevent Leaflet from retrieving non-existent tiles on the borders.
                [-85.0511287776, -179.999999975],
                [85.0511287776, 179.999999975],
            ],
            attribution:
                '<a href="https://wiki.earthdata.nasa.gov/display/GIBS">NASA EOSDIS GIBS</a>',
        }
    );

    // Initialize the map.
    const map = L.map('map', {
        center: mapCenterDefault,
        zoom: mapZoomDefault,
        layers: [layerBlueMarble],
        worldCopyJump: true,
    });

    // Layer control.
    const baseMaps = {
        'NASA Blue Marble': layerBlueMarble,
        'Google Hybrid (static)': layerGoogleHybridStatic,
        OpenStreetMap: layerOsm,
    };
    L.control.layers(baseMaps).addTo(map);

    // Scale control.
    L.control.scale({metric: true, imperial: true}).addTo(map);

    // Reset map control.
    (() => {
        const control = new L.Control({position: 'topleft'});
        control.onAdd = mapObj => {
            const resetView = L.DomUtil.create('a', 'resetview');
            resetView.innerHTML = '[Reset Map]';
            L.DomEvent.disableClickPropagation(resetView).addListener(
                resetView,
                'click',
                () => {
                    mapObj.setView(mapCenterDefault, mapZoomDefault);
                },
                resetView
            );
            return resetView;
        };
        return control;
    })().addTo(map);
}
