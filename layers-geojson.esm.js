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
export default function processGeoJsonFile(geojson, map, lineStyleFunc, lineStyleThresholds) {
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
export function styleLineStringLayerAltitude(altThresholds, leafletLayer) {
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
export function styleLineStringLayerSpeed(speedThresholds, leafletLayer, geoJsonFeature) {
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
export function styleLineStringLayerHourOfDay(timeThresholds, leafletLayer, geoJsonFeature) {
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
export function styleLineStringLayerTransport(leafletLayer, geoJsonFeature) {
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
