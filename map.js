/**
 * Create a Leaflet map and display the markers and tracks from a GeoJSON file.
 *
 * @param {string} id - DOM ID of a <div> element into which to add the map.
 * @param {string} geojson - Path to the GeoJSON file containing the Features to display.
 */
function createLeafletMap(id, geojson) {
    // Initialize the Leaflet map into a HTML element.
    const map = L.map(id, {
        center: [0, 0], // FUTURE: dynamically calculate after adding the GeoJSON layers
        zoom: 3,
        worldCopyJump: true,
    });

    // Set up the Attribution Control.
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');

    // Set up the Scale Control.
    L.control.scale({ metric: true, imperial: true }).addTo(map);

    // Add a Control for resetting the map view.
    createResetControl().addTo(map);

    // Define the available base map layers.
    const baseMaps = defineBaseMapLayers();
    map.addLayer(baseMaps['NASA Blue Marble']);

    // Set up the Layers Control.
    // TODO: https://github.com/AHAAAAAAA/leaflet-groupedlayercontrol
    const layerControl = L.control.layers(baseMaps, null, { collapsed: false }).addTo(map);

    // Read the GeoJSON file, processing each Feature individually.
    processGeoJsonFile(geojson, map, layerControl);
}

/**
 * Create a Control for resetting the map view.
 *
 * @return {L.Control} A new Leaflet Control.
 */
function createResetControl() {
    var control = new L.Control({ position: 'topleft' });

    control.onAdd = map => {
        var resetView = L.DomUtil.create('a', 'resetview');
        resetView.innerHTML = '[Reset Map]';
        L.DomEvent.disableClickPropagation(resetView).addListener(
            resetView,
            'click',
            () => {
                map.setView(map.options.center, map.options.zoom);
            },
            resetView,
        );
        return resetView;
    };

    return control;
}

/**
 * Define the base map layers.
 *
 * @returns {Object.<string, L.TileLayer>} An object with all initial baselayers for the Leaflet map.
 */
function defineBaseMapLayers() {
    // OpenStreetMap.
    layerOsm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '<a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });

    // Google Maps (hybrid view, static tiles).
    // Docs: https://gis.stackexchange.com/a/341490
    layerGoogleHybridStatic = L.tileLayer('http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '<a href="https://www.google.com.au/maps">NASA, TerraMetrics, Google</a>',
    });

    // NASA Blue Marble.
    layerBlueMarble = L.tileLayer(
        'https://gibs-{s}.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{time}/{tileMatrixSet}/{z}/{y}/{x}.jpg',
        {
            layer: 'BlueMarble_ShadedRelief_Bathymetry',
            tileMatrixSet: 'EPSG3857_500m',
            time: '',
            maxZoom: 8,
            noWrap: true,
            continuousWorld: true,
            bounds: [
                // Prevent Leaflet from retrieving non-existent tiles on the borders.
                [-85.0511287776, -179.999999975],
                [85.0511287776, 179.999999975],
            ],
            attribution: '<a href="https://wiki.earthdata.nasa.gov/display/GIBS">NASA EOSDIS GIBS</a>',
        },
    );

    return {
        'NASA Blue Marble': layerBlueMarble,
        OpenStreetMap: layerOsm,
        'Google Hybrid (static)': layerGoogleHybridStatic,
    };
}

// Icon class
var LeafIcon = L.Icon.extend({
    options: {
        iconSize: [22, 40], // size of icon image (pixels)
        iconAnchor: [11, 40], // coordinates of the tip (pixels, relative to top-left corner)
        popupAnchor: [0, -29], // coordinates where popup will open (pixels, relative to icon anchor)
        tooltipAnchor: [0, -29], // coordinates where tooltip will open (pixels, relative to icon anchor)
    },
});

/**
 * Read the GeoJSON file, processing each Feature individually.
 *
 * @param {string} geojson - Path to the GeoJSON file containing the Features to display.
 * @param {L.Map} map - Leaflet map object.
 * @param {L.LayerControl} layerControl - The map's Layers Control object.
 */
function processGeoJsonFile(geojson, map, layerControl) {
    const requestOptions = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/geo+json',
        },
    };
    fetch(geojson, requestOptions)
        .then(httpRes => httpRes.json())
        .then(jsonData => {
            // Define the layer groups to show on top of the base map.
            var layerGroups = {};

            // Parse the GeoJSON, creating Leaflet Layers and adding them to the map.
            L.geoJSON(jsonData, {
                style: { color: '#000000' },
                onEachFeature: (feature, layer) => {
                    // Build a complete Leaflet layer from the Feature.
                    var { leafletLayer, layerGroupName } = processGeoJsonFeature(feature, layer);

                    // Add the Layer to all required map objects.
                    addLeafletLayerToMap(leafletLayer, map, layerGroupName, layerGroups, layerControl);
                },
            });
        });
}

/**
 * Process a GeoJSON Feature and the associated styled Leaflet Layer.
 *
 * @param {Object.<string, string|number>} geoJsonFeature - The GeoJSON Feature being processed.
 * @param {L.Marker | L.Polyline} leafletLayer - The Leaflet object layer created from the GeoJSON Feature.
 * @return {{leafletLayer: L.Layer, layerGroupName: string}} The Leaflet layer to add to the map, and the layer name.
 */
function processGeoJsonFeature(geoJsonFeature, leafletLayer) {
    var layerGroupName;

    // Process each type of Feature.
    switch (geoJsonFeature.geometry.type) {
        case 'Point':
            // Layer type: L.Marker
            // https://leafletjs.com/reference.html#marker

            layerGroupName = 'Stops';

            // Add the GeoJSON Feature properties.
            leafletLayer.bindTooltip(geoJsonFeature.properties.name);
            if (geoJsonFeature.properties.desc) {
                leafletLayer.bindPopup(
                    `<strong>${geoJsonFeature.properties.name}</strong><br/>${geoJsonFeature.properties.desc}`,
                );
            }
            leafletLayer.setIcon(
                new LeafIcon({
                    iconUrl: geoJsonFeature.properties.sym,
                    iconSize: geoJsonFeature.properties.symIconSize,
                    iconAnchor: geoJsonFeature.properties.symIconAnchor,
                    popupAnchor: geoJsonFeature.properties.symPopupAnchor,
                    tooltipAnchor: geoJsonFeature.properties.symTooltipAnchor,
                }),
            );

            break;

        case 'LineString':
        case 'MultiLineString':
            // Layer type: L.Polyline
            // https://leafletjs.com/reference.html#polyline

            layerGroupName = geoJsonFeature.properties.date;

            // styleLineStringLayerTransport(geoJsonFeature, leafletLayer);
            leafletLayer = styleLineStringLayerAltitude(leafletLayer);

            // Add the GeoJSON Feature properties.
            leafletLayer.bindTooltip(geoJsonFeature.properties.name);
            const featureDateStr = new Date(geoJsonFeature.properties.date).toLocaleDateString('en-GB', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
            leafletLayer.bindPopup(`<strong>${geoJsonFeature.properties.name}</strong><br/>${featureDateStr}`);

            break;
    }

    return { leafletLayer, layerGroupName };
}

/**
 * Change track colour based on altitude.
 *
 * @see https://github.com/hgoebl/Leaflet.MultiOptionsPolyline
 * @see https://leafletjs.com/reference.html#featuregroup
 *
 * @param {L.Polyline} leafletLayer - The Leaflet object layer created from the GeoJSON Feature.
 * @return {L.MultiOptionsPolyline} A new MultiOptionsPolyline with grouped and styled GPS points.
 */
function styleLineStringLayerAltitude(leafletLayer) {
    const altThresholds = new Map([
        // https://www.color-name.com/
        [undefined, { color: '#000000' }], // Black
        [30, { color: '#330072' }], // Cadbury Purple
        [60, { color: '#0000FF' }], // Blue
        [120, { color: '#0040FF' }], // Blue (RYB)
        [180, { color: '#0080FF' }], // Azure
        [240, { color: '#00FFB0' }], // Medium Spring Green
        [300, { color: '#00E000' }], // Electric Green
        [360, { color: '#80FF00' }], // Chartreuse (Web)
        [420, { color: '#FFFF00' }], // Yellow
        [480, { color: '#FFC000' }], // Amber
        [540, { color: '#FF0000' }], // Red
        ['max', { color: '#7C0D0E' }], // Deep Red
    ]);

    const multiOptions = {
        optionIdxFn: latLng => {
            const thresholds = [...altThresholds.keys()];
            if (typeof latLng.alt === 'undefined') {
                return 0;
            }
            for (var i = 1; i < thresholds.length - 1; ++i) {
                if (latLng.alt <= thresholds[i]) {
                    return i;
                }
            }
            return thresholds.length - 1;
        },
        options: [...altThresholds.values()],
    };

    return L.multiOptionsPolyline(leafletLayer.getLatLngs().flat(), { multiOptions });
}

/**
 * Change track colour based on transport mode.
 *
 * @see https://coolors.co/palette/ff595e-ffca3a-8ac926-1982c4-6a4c93
 *
 * @param {Object.<string, any>} geoJsonFeature - The GeoJSON Feature being processed.
 * @param {L.Polyline} leafletLayer - The Leaflet object layer created from the GeoJSON Feature.
 */
function styleLineStringLayerTransport(geoJsonFeature, leafletLayer) {
    if (typeof geoJsonFeature.properties.transport === 'undefined') {
        // Use default colour.
        return;
    }

    switch (geoJsonFeature.properties.transport[0]) {
        case 'Driving':
            leafletLayer.setStyle({ color: '#6A4C93' }); // dark moderate violet
            break;
        case 'Passenger':
            leafletLayer.setStyle({ color: '#1982C4' }); // strong blue
            break;
        case 'Public transport':
            leafletLayer.setStyle({ color: '#8AC926' }); // strong green
            break;
        case 'Walking':
            leafletLayer.setStyle({ color: '#FFCA3A' }); // light orange
            break;
        case 'Tourist activity':
            leafletLayer.setStyle({ color: '#FF595E' }); // light red
            break;
        default:
            // Use default colour.
            break;
    }
}

/**
 * Add a Leaflet Layer to all required map objects.
 *
 * @param {L.Layer} leafletLayer - The layer to add to the map.
 * @param {L.map} map - Leaflet map object.
 * @param {string} layerGroupName - The layer group name shown in the Layer Control.
 * @param {Object.<string, L.LayerGroup>} layerGroups - The layer groups to show on top of the base map.
 * @param {L.LayerControl} layerControl - The map's Layers Control object.
 */
function addLeafletLayerToMap(leafletLayer, map, layerGroupName, layerGroups, layerControl) {
    // Get the layer group associated the the returned name, or create a new group.
    layerGroups[layerGroupName] = layerGroups[layerGroupName] || new L.LayerGroup();

    // Add layer to group.
    leafletLayer.addTo(layerGroups[layerGroupName]);

    if (!map.hasLayer(layerGroups[layerGroupName])) {
        // Add layer group to map.
        // Docs: https://leafletjs.com/reference.html#map
        map.addLayer(layerGroups[layerGroupName]);

        // Add layer group to Layer Control.
        // Docs: https://leafletjs.com/reference.html#control-layers
        layerControl.addOverlay(layerGroups[layerGroupName], layerGroupName);
    }
}

// Create the Leaflet map.
createLeafletMap('map', 'data.geojson');
