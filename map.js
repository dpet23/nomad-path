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
 * Create a Control for resetting the map view.
 *
 * @return {L.Control} A new Leaflet Control.
 */
function createResetControl() {
    const control = new L.Control({ position: 'topleft' });

    /**
     * Function to handle adding the Control to a Leaflet Map.
     */
    control.onAdd = map => {
        const resetView = L.DomUtil.create('a', 'resetview');
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
 * Get a list of overlay layers that have been added to the Layers Control.
 *
 * @this {L.LayerControl} Runs in the context of the map's Layers Control object.
 *
 * @typedef {Object} OverlayDetails - The details of each overlay layer.
 * @property {string} name - The name of the layer, displayed in the Control.
 * @property {L.Layer} layer - The Leaflet Layer object.
 * @property {boolean} enabled - Whether the layer is currently displayed on the map.
 *
 * @return {Array<OverlayDetails>} The details of each overlay layer.
 */
function getLayerControlOverlays() {
    const layers = [];

    this._layers.forEach(obj => {
        if (obj.overlay) {
            layers.push({
                name: obj.name,
                layer: obj.layer,
                enabled: this._map.hasLayer(obj.layer),
            });
        }
    });

    return layers;
}

/**
 * Define the available styles for GeoJSON LineStrings.
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
const lineStringStyles = [
    {
        name: 'Hour of day (UTC)',
        func: styleLineStringLayerHourOfDay,
        thresholds: new Map([
            // https://coolors.co/palette/03045e-023e8a-0077b6-0096c7-00b4d8-48cae4-90e0ef-ade8f4-caf0f8
            // https://coolors.co/palette/03071e-370617-6a040f-9d0208-d00000-dc2f02-e85d04-f48c06-faa307-ffba08
            [6, { color: '#03045E' }],
            [7, { color: '#0077B6' }],
            [8, { color: '#00B4D8' }],
            [9, { color: '#FFBA08' }],
            [10, { color: '#FAA307' }],
            [11, { color: '#F48C06' }],
            [12, { color: '#E85D04' }],
            [13, { color: '#DC2F02' }],
            [14, { color: '#D00000' }],
            [15, { color: '#9D0208' }],
            [16, { color: '#6A040F' }],
            [17, { color: '#370617' }],
            [18, { color: '#03071E' }],
            [19, { color: '#000000' }],
        ]),
    },
    {
        name: 'Altitude (m)',
        func: styleLineStringLayerAltitude,
        thresholds: new Map([
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
        ]),
    },
    {
        name: 'Speed (km/h)',
        func: styleLineStringLayerSpeed,
        thresholds: new Map([
            // Walking
            // https://huemint.com/gradient-9/#palette=ffea00-d0d201-c9d006-bec72b-84c918-53b42a-1b9c31-23d396-00ff58
            [1, { color: '#ffea00' }],
            [2, { color: '#d0d201' }],
            [3, { color: '#c9d006' }],
            [4, { color: '#bec72b' }],
            [5, { color: '#84c918' }],
            [6, { color: '#53b42a' }],
            [7, { color: '#1b9c31' }],
            [8, { color: '#23d396' }],
            [9, { color: '#00ff59' }],

            // Driving
            // https://coolors.co/gradient-palette/1900ff-ff0000?number=16
            [10, { color: '#1900FF' }],
            [20, { color: '#2800EE' }],
            [30, { color: '#3800DD' }],
            [40, { color: '#4700CC' }],
            [50, { color: '#5600BB' }],
            [60, { color: '#6600AA' }],
            [70, { color: '#750099' }],
            [80, { color: '#840088' }],
            [90, { color: '#940077' }],
            [100, { color: '#A30066' }],
            [110, { color: '#B20055' }],
            [120, { color: '#C20044' }],
            [130, { color: '#D10033' }],
            [140, { color: '#E00022' }],
            [150, { color: '#F00011' }],
            [160, { color: '#FF0000' }],

            // Other
            ['max', { color: '#000000' }],
        ]),
    },
];

/**
 * Create a Control for displaying the current style for GeoJSON LineStrings.
 *
 * @param {Array<Styles>} supportedLineStringStyles - The available styles for GeoJSON LineStrings.
 * @param {processGeoJsonFilePartialFunc} onChangePartialCallbackFn - Partial function for calling `processGeoJsonFile`.
 * @return {L.Control} A new Leaflet Control.
 */
function createLegendControl(supportedLineStringStyles, onChangePartialCallbackFn) {
    const control = new L.Control({ position: 'bottomleft' });

    /**
     * Function to handle adding the Control to a Leaflet Map.
     */
    control.onAdd = _map => {
        // Create wrapper div to display the legend.
        const legend = L.DomUtil.create('div', 'leaflet-control-legend');
        control.legend = legend;

        // Set styles for the legend element.
        legend.style.border = 'solid #666666 1px';
        legend.style.backgroundColor = '#ffffff';
        legend.style.opacity = '0.9';
        legend.style.padding = '4px';

        // Set header in the legend element.
        legend.innerHTML = '<div id="leaflet-control-legend-header" style="font-weight: bold;">Legend</div>';

        // Create a select box for the various styles.
        const styleSelector = L.DomUtil.create('select', 'leaflet-control-legend-select', legend);
        control.styleSelector = styleSelector;

        // Set styles for the select box.
        styleSelector.style.margin = '0.5em 0';

        // Populate the select box with the name of each option.
        let opt;
        supportedLineStringStyles.forEach((style, index) => {
            opt = L.DomUtil.create('option', 'leaflet-control-legend-option', styleSelector);
            opt.value = index;
            opt.innerHTML = style.name;
        });

        // Create a wrapper div to display the legend content.
        const legendText = L.DomUtil.create('div', 'leaflet-control-legend-content', legend);
        control.legendText = legendText;

        // Redraw GeoJSON data when the legend style changes.
        L.DomEvent.on(styleSelector, 'change', event => {
            const lineStyleIndex = parseInt(event.target.value, 10);
            const newLineStyle = supportedLineStringStyles[lineStyleIndex];

            styleSelector.disabled = true;
            onChangePartialCallbackFn(newLineStyle.func, newLineStyle.thresholds);
        });

        return legend;
    };

    const legendTextIElementCss =
        'display: inline-block; width:0.75em; height: 0.75em; border: solid 1px black; margin: 0 0.75em 0 0;';

    /**
     * Add an item to the legend content.
     * The Control must have been added to the Leaflet Map!
     */
    control.addLegendItem = (colour, label) => {
        control.legendText.innerHTML +=
            '<div style="line-height: 1.2em;">' +
            `<i style="background: ${colour}; ${legendTextIElementCss}"></i>` +
            `<span>${label}</span>` +
            '</div>';
    };

    /**
     * Clear the legend content.
     * The Control must have been added to the Leaflet Map!
     */
    control.resetLegendContent = () => {
        control.legendText.innerHTML = '';
    };

    return control;
}

/**
 * Define the base map layers.
 *
 * @return {Object.<string, L.TileLayer>} An object with all initial baselayers for the Leaflet map.
 */
function defineBaseMapLayers() {
    // OpenStreetMap
    const layerOpenStreetMap = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        minZoom: 0,
        maxZoom: 19,
        attribution: '<a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });

    // Google Maps (satellite view, static tiles)
    // Docs: https://gis.stackexchange.com/a/341490
    const layerGoogleSatelliteStatic = L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        minZoom: 0,
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '<a href="https://www.google.com/intl/en-US_US/help/terms_maps/">TerraMetrics, Google</a>',
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
            attribution: '<a href="https://wiki.earthdata.nasa.gov/display/GIBS">NASA EOSDIS GIBS</a>',
        },
    );

    return {
        'NASA Blue Marble 2004': layerBlueMarble,
        OpenStreetMap: layerOpenStreetMap,
        'Google aerial/satellite': layerGoogleSatelliteStatic,
    };
}

// Icon class
const LeafIcon = L.Icon.extend({
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
 * @param {StyleLineStringFn} lineStyleFunc - A function to apply styles to GeoJSON LineStrings.
 * @param {ThresholdStyles} lineStyleThresholds - The threshold values for each segment, and the style to apply.
 */
function processGeoJsonFile(geojson, map, lineStyleFunc, lineStyleThresholds) {
    fetch(geojson, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/geo+json',
        },
    })
        .then(httpRes => {
            // Check response status, return content for processing on success.
            if (httpRes.ok) {
                return httpRes.json();
            }

            // Reject further processing on error.
            return Promise.reject(httpRes);
        })
        .then(jsonData => {
            // GeoJSON data was successfully fetched, ready for processing.

            /**
             * Partial function for calling the given `lineStyleFunc` with the given threshold values.
             *
             * @callback lineStylePartialFunc
             * @param {L.Layer} leafletLayer
             * @param {Object.<string, any>} geoJsonFeature
             */
            const lineStylePartialFn = (leafletLayer, geoJsonFeature) => {
                return lineStyleFunc(lineStyleThresholds, leafletLayer, geoJsonFeature);
            };

            // Define the layer groups to show on top of the base map.
            const layerGroups = {};

            // Parse the GeoJSON data, creating Leaflet Layers and adding them to the map.
            L.geoJSON(jsonData, {
                style: { color: '#000000' },
                onEachFeature: (feature, layer) => {
                    // Build a complete Leaflet layer from the Feature.
                    const { leafletLayer, layerGroupName } = processGeoJsonFeature(feature, layer, lineStylePartialFn);

                    // Add Leaflet layer to a group.
                    layerGroups[layerGroupName] = layerGroups[layerGroupName] || new L.LayerGroup();
                    leafletLayer.addTo(layerGroups[layerGroupName]);
                },
            });

            // Clear existing GeoJSON data from the map.
            map.legendControl.resetLegendContent();
            map.layerControl.getOverlays().forEach(overlayDetails => {
                // Save the current enabled state into the new GeoJSON data,
                // for each group with the same name that already exists.
                if (typeof layerGroups[overlayDetails.name] !== 'undefined') {
                    layerGroups[overlayDetails.name].options.enabled = overlayDetails.enabled;
                }

                // Disable layer (hide from map).
                if (overlayDetails.enabled) {
                    map.removeLayer(overlayDetails.layer);
                }

                // Delete layer from Control.
                map.layerControl.removeLayer(overlayDetails.layer);
            });

            // Add line thresholds to the legend.
            lineStyleThresholds.forEach((cssStyles, thresholdLabel) => {
                if (typeof cssStyles.color !== 'undefined') {
                    map.legendControl.addLegendItem(cssStyles.color, thresholdLabel);
                }
            });

            // Add new layers to the Map and Layers Control.
            for (const [layerGroupName, layerGroup] of Object.entries(layerGroups)) {
                if (typeof layerGroup.options.enabled === 'undefined' || layerGroup.options.enabled) {
                    map.addLayer(layerGroup);
                }

                map.layerControl.addOverlay(layerGroup, layerGroupName);
            }
        })
        .catch(error => {
            // Show an error message on error.
            if (typeof error.status !== 'undefined') {
                alert(`Failed to fetch "${geojson}": ${error.status} ${error.statusText}`);
            } else {
                alert(`Failed to process map data:\n${error}`);
            }
        })
        .finally(() => {
            map.legendControl.styleSelector.disabled = false;
        });
}

/**
 * Process a GeoJSON Feature and the associated styled Leaflet Layer.
 *
 * @param {Object.<string, any>} geoJsonFeature - The GeoJSON Feature being processed.
 * @param {L.Marker | L.Polyline} leafletLayer - The Leaflet object layer created from the GeoJSON Feature.
 * @param {lineStylePartialFunc} lineStylePartialFn - A function to apply styles to GeoJSON LineStrings.
 * @return {{leafletLayer: L.Layer, layerGroupName: string}} The Leaflet layer to add to the map, and the layer name.
 */
function processGeoJsonFeature(geoJsonFeature, leafletLayer, lineStylePartialFn) {
    let layerGroupName;

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

            if (
                typeof geoJsonFeature.properties.country !== 'undefined' &&
                geoJsonFeature.properties.country.length > 1
            ) {
                layerGroupName = 'International';
            } else {
                layerGroupName = geoJsonFeature.properties.date;
            }

            // Change track colour based on the chosen property (in map.legendControl.styleSelector).
            leafletLayer = lineStylePartialFn(leafletLayer, geoJsonFeature);

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
 * Change track colour based on altitude (in metres).
 *
 * @see https://github.com/hgoebl/Leaflet.MultiOptionsPolyline
 * @see https://leafletjs.com/reference.html#featuregroup
 *
 * @param {ThresholdStyles} altThresholds - The threshold values for each segment, and the style to apply.
 * @param {L.Polyline} leafletLayer - The Leaflet object layer created from the GeoJSON Feature.
 * @return {L.MultiOptionsPolyline} A new MultiOptionsPolyline with grouped and styled GPS points.
 */
function styleLineStringLayerAltitude(altThresholds, leafletLayer) {
    const multiOptions = {
        optionIdxFn: latLng => {
            const thresholds = [...altThresholds.keys()];
            if (typeof latLng.alt === 'undefined') {
                return 0;
            }
            for (let i = 1; i < thresholds.length - 1; ++i) {
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
 * Change track colour based on speed (in km/h).
 *
 * @param {ThresholdStyles} speedThresholds - The threshold values for each segment, and the style to apply.
 * @param {L.Polyline} leafletLayer - The Leaflet object layer created from the GeoJSON Feature.
 * @param {Object.<string, any>} geoJsonFeature - The GeoJSON Feature being processed.
 * @return {L.MultiOptionsPolyline} A new MultiOptionsPolyline with grouped and styled GPS points.
 */
function styleLineStringLayerSpeed(speedThresholds, leafletLayer, geoJsonFeature) {
    const multiOptions = {
        optionIdxFn: latLng => {
            const thresholds = [...speedThresholds.keys()];
            if (typeof latLng.speed === 'undefined') {
                return { color: '#000000' };
            }
            for (let i = 0; i < thresholds.length - 1; ++i) {
                if (latLng.speed <= thresholds[i]) {
                    return i;
                }
            }
            return thresholds.length - 1;
        },
        options: [...speedThresholds.values()],
    };

    const speeds = geoJsonFeature.properties.coordinateProperties.speeds.flat();
    const latLngsWithSpeed = leafletLayer
        .getLatLngs()
        .flat()
        .map((item, index) => {
            item.speed = speeds[index];
            return item;
        });

    return L.multiOptionsPolyline(latLngsWithSpeed, { multiOptions });
}

/**
 * Change track colour based on hour of day (in UTC).
 *
 * @param {ThresholdStyles} timeThresholds - The threshold values for each segment, and the style to apply.
 * @param {L.Polyline} leafletLayer - The Leaflet object layer created from the GeoJSON Feature.
 * @param {Object.<string, any>} geoJsonFeature - The GeoJSON Feature being processed.
 * @return {L.MultiOptionsPolyline} A new MultiOptionsPolyline with grouped and styled GPS points.
 */
function styleLineStringLayerHourOfDay(timeThresholds, leafletLayer, geoJsonFeature) {
    const multiOptions = {
        optionIdxFn: latLng => {
            const thresholds = [...timeThresholds.keys()];
            if (typeof latLng.hour === 'undefined') {
                return { color: '#000000' };
            }
            for (let i = 0; i < thresholds.length - 1; ++i) {
                if (latLng.hour <= thresholds[i]) {
                    return i;
                }
            }
            return thresholds.length - 1;
        },
        options: [...timeThresholds.values()],
    };

    const hours = geoJsonFeature.properties.coordinateProperties.times.flat().map(item => {
        return parseInt(item.substring(11, 13), 10);
    });
    const latLngsWithHour = leafletLayer
        .getLatLngs()
        .flat()
        .map((item, index) => {
            item.hour = hours[index];
            return item;
        });

    return L.multiOptionsPolyline(latLngsWithHour, { multiOptions });
}

/**
 * Change track colour based on transport mode.
 *
 * @see https://coolors.co/palette/ff595e-ffca3a-8ac926-1982c4-6a4c93
 *
 * @param {L.Polyline} leafletLayer - The Leaflet object layer created from the GeoJSON Feature.
 * @param {Object.<string, any>} geoJsonFeature - The GeoJSON Feature being processed.
 */
function _styleLineStringLayerTransport(leafletLayer, geoJsonFeature) {
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
        case 'Flight':
            leafletLayer.setStyle({ color: '#80E1E2' }); // fresh mint
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

// Create the Leaflet map.
createLeafletMap('map', 'data.geojson');
