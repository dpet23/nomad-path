import { Feature } from 'geojson';
import L from 'leaflet';

import LeafletMap from './leaflet-map';

/**
 * Type alias for the threshold values to check in a GeoJSON LineString,
 * and the style to apply to each segment within a threshold.
 */
type ThresholdStyles = Map<number | string | undefined, { [key: string]: string }>;

/**
 * Type alias for a function that will change the GeoJSON LineString style.
 */
type StyleLineStringFn = (
    thresholds: ThresholdStyles,
    leafletLayer: L.Polyline,
    geoJsonFeature?: Feature,
) => L.MultiOptionsPolyline;

/**
 * Type alias for each available GeoJSON LineString style.
 */
export type LineStringStyle = {
    name: string;
    func: StyleLineStringFn;
    thresholds: ThresholdStyles;
};

/**
 * Partial function for calling `processGeoJsonFile`, with pre-populated params for `geojson` and `map`.
 */
export type ProcessGeoJsonFilePartialFunc = (
    newLineStyleFunc: StyleLineStringFn,
    newLineStyleThresholds: ThresholdStyles,
) => void;

/**
 * Partial function for calling a function that applies styles to GeoJSON LineStrings,
 * with pre-populated threshold values.
 */
type LineStylePartialFunc = (leafletLayer: L.Polyline, geoJsonFeature: Feature) => L.MultiOptionsPolyline;

/**
 * Process a GeoJSON Feature and the associated styled Leaflet Layer.
 *
 * @param geoJsonFeature - The GeoJSON Feature being processed.
 * @param leafletLayer - The Leaflet object layer created from the GeoJSON Feature.
 * @param lineStylePartialFn - A function to apply styles to GeoJSON LineStrings.
 * @return The Leaflet layer to add to the map, and the layer name.
 */
function processGeoJsonFeature(
    geoJsonFeature: Feature,
    leafletLayer: L.Layer,
    lineStylePartialFn: LineStylePartialFunc,
): { leafletLayer: L.Marker | L.MultiOptionsPolyline; layerGroupName: string } | undefined {
    let layerGroupName: string = '';

    // Process each type of Feature.
    switch (geoJsonFeature.geometry.type) {
        case 'Point':
            const leafletMarker = leafletLayer as L.Marker; // https://leafletjs.com/reference.html#marker

            layerGroupName = 'Stops';

            // Add the GeoJSON Feature properties.
            leafletMarker.bindTooltip(geoJsonFeature.properties?.name);
            if (geoJsonFeature.properties?.desc) {
                leafletMarker.bindPopup(
                    `<strong>${geoJsonFeature.properties.name}</strong><br/>${geoJsonFeature.properties.desc}`,
                );
            }
            leafletMarker.setIcon(
                new L.Icon({
                    iconUrl: geoJsonFeature.properties?.sym,

                    // size of icon image (pixels)
                    iconSize: geoJsonFeature.properties?.symIconSize || [22, 40],

                    // coordinates of the tip (pixels from top-left corner)
                    iconAnchor: geoJsonFeature.properties?.symIconAnchor || [11, 40],

                    // coordinates where popup will open (pixels from icon anchor)
                    popupAnchor: geoJsonFeature.properties?.symPopupAnchor || [0, -29],

                    // coordinates where tooltip will open (pixels from icon anchor)
                    tooltipAnchor: geoJsonFeature.properties?.symTooltipAnchor || [0, -29],
                }),
            );

            return { leafletLayer: leafletMarker, layerGroupName };

        case 'LineString':
        case 'MultiLineString':
            const leafletPolyline = leafletLayer as L.Polyline; // https://leafletjs.com/reference.html#polyline

            if (
                typeof geoJsonFeature.properties?.country !== 'undefined' &&
                geoJsonFeature.properties.country.length > 1
            ) {
                layerGroupName = 'International';
            } else {
                layerGroupName = geoJsonFeature.properties?.date;
            }

            // Change track colour based on the chosen property (in map.legendControl.styleSelector).
            const leafletMultiOptionsPolyline = lineStylePartialFn(leafletPolyline, geoJsonFeature);

            // Add the GeoJSON Feature properties.
            leafletMultiOptionsPolyline.bindTooltip(geoJsonFeature.properties?.name);
            const featureDateStr = new Date(geoJsonFeature.properties?.date).toLocaleDateString('en-GB', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
            leafletMultiOptionsPolyline.bindPopup(
                `<strong>${geoJsonFeature.properties?.name}</strong><br/>${featureDateStr}`,
            );

            return { leafletLayer: leafletMultiOptionsPolyline, layerGroupName };
    }
}

/**
 * Read the GeoJSON file, processing each Feature individually.
 *
 * @param geojson - Path to the GeoJSON file containing the Features to display.
 * @param map - Leaflet map object.
 * @param lineStyleFunc - A function to apply styles to GeoJSON LineStrings.
 * @param lineStyleThresholds - The threshold values for each segment, and the style to apply.
 */
export default function processGeoJsonFile(
    geojson: string,
    map: LeafletMap,
    lineStyleFunc: StyleLineStringFn,
    lineStyleThresholds: ThresholdStyles,
) {
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

            // Partial function for calling the given `lineStyleFunc` with the given threshold values.
            const lineStylePartialFn: LineStylePartialFunc = (leafletLayer, geoJsonFeature) => {
                return lineStyleFunc(lineStyleThresholds, leafletLayer, geoJsonFeature);
            };

            // Define the layer groups to show on top of the base map.
            const layerGroups: { [key: string]: L.LayerGroup & { options: L.LayerOptions & { enabled: boolean } } } =
                {};

            // Parse the GeoJSON data, creating Leaflet Layers and adding them to the map.
            L.geoJSON(jsonData, {
                style: { color: '#000000' },
                onEachFeature: (feature, layer) => {
                    // Build a complete Leaflet layer from the Feature.
                    const layerDetails = processGeoJsonFeature(feature, layer, lineStylePartialFn);

                    if (layerDetails) {
                        const { leafletLayer, layerGroupName } = layerDetails;

                        // Add Leaflet layer to a group.
                        layerGroups[layerGroupName] = layerGroups[layerGroupName] || new L.LayerGroup();
                        leafletLayer.addTo(layerGroups[layerGroupName]);
                    }
                },
            });

            // Clear existing GeoJSON data from the map.
            if (map.legendControl?.resetLegendContent) {
                map.legendControl.resetLegendContent();
            }
            map.layerControl?.getOverlays().forEach(overlayDetails => {
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
                map.layerControl?.removeLayer(overlayDetails.layer);
            });

            // Add line thresholds to the legend.
            lineStyleThresholds.forEach((cssStyles, thresholdLabel) => {
                if (typeof cssStyles.color !== 'undefined' && map.legendControl?.addLegendItem) {
                    map.legendControl.addLegendItem(cssStyles.color, (thresholdLabel ?? 'undefined').toString());
                }
            });

            // Add new layers to the Map and Layers Control.
            for (const [layerGroupName, layerGroup] of Object.entries(layerGroups)) {
                if (typeof layerGroup.options.enabled === 'undefined' || layerGroup.options.enabled) {
                    map.addLayer(layerGroup);
                }

                if (map.layerControl?.addOverlay) {
                    map.layerControl.addOverlay(layerGroup, layerGroupName);
                }
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
            if (map.legendControl?.styleSelector) {
                map.legendControl.styleSelector.disabled = false;
            }
        });
}

/**
 * Change track colour based on altitude (in metres).
 *
 * @see https://github.com/hgoebl/Leaflet.MultiOptionsPolyline
 * @see https://leafletjs.com/reference.html#featuregroup
 *
 * @param altThresholds - The threshold values for each segment, and the style to apply.
 * @param leafletLayer - The Leaflet object layer created from the GeoJSON Feature.
 * @return A new MultiOptionsPolyline with grouped and styled GPS points.
 */
export const styleLineStringLayerAltitude: StyleLineStringFn = (altThresholds, leafletLayer) => {
    const multiOptions = {
        optionIdxFn: (latLng: L.LatLng & { alt: number | string | undefined }) => {
            const thresholds = [...altThresholds.keys()];
            if (typeof latLng.alt === 'undefined') {
                return 0;
            }
            for (let i = 1; i < thresholds.length - 1; ++i) {
                if (latLng.alt <= Number(thresholds[i] ?? 0)) {
                    return i;
                }
            }
            return thresholds.length - 1;
        },
        options: [...altThresholds.values()],
    };

    return L.multiOptionsPolyline(leafletLayer.getLatLngs().flat(2), { multiOptions });
};

/**
 * Change track colour based on speed (in km/h).
 *
 * @param speedThresholds - The threshold values for each segment, and the style to apply.
 * @param leafletLayer - The Leaflet object layer created from the GeoJSON Feature.
 * @param geoJsonFeature - The GeoJSON Feature being processed.
 * @return A new MultiOptionsPolyline with grouped and styled GPS points.
 */
export const styleLineStringLayerSpeed: StyleLineStringFn = (speedThresholds, leafletLayer, geoJsonFeature) => {
    const multiOptions = {
        optionIdxFn: (latLng: L.LatLng & { speed: number }) => {
            const thresholds = [...speedThresholds.keys()];
            if (typeof latLng.speed === 'undefined') {
                return thresholds.length - 1;
            }
            for (let i = 0; i < thresholds.length - 1; ++i) {
                if (latLng.speed <= Number(thresholds[i] ?? 0)) {
                    return i;
                }
            }
            return thresholds.length - 1;
        },
        options: [...speedThresholds.values()],
    };

    const speeds = geoJsonFeature!.properties!.coordinateProperties.speeds.flat();
    const latLngsWithSpeed = leafletLayer
        .getLatLngs()
        .flat(2)
        .map((item: L.LatLng & { speed?: number | string }, index) => {
            item.speed = speeds[index];
            return item;
        });

    return L.multiOptionsPolyline(latLngsWithSpeed, { multiOptions });
};

/**
 * Change track colour based on hour of day (in UTC).
 *
 * @param timeThresholds - The threshold values for each segment, and the style to apply.
 * @param leafletLayer - The Leaflet object layer created from the GeoJSON Feature.
 * @param geoJsonFeature - The GeoJSON Feature being processed.
 * @return A new MultiOptionsPolyline with grouped and styled GPS points.
 */
export const styleLineStringLayerHourOfDay: StyleLineStringFn = (timeThresholds, leafletLayer, geoJsonFeature) => {
    const multiOptions = {
        optionIdxFn: (latLng: L.LatLng & { hour: number }) => {
            const thresholds = [...timeThresholds.keys()];
            if (typeof latLng.hour === 'undefined') {
                return thresholds.length - 1;
            }
            for (let i = 0; i < thresholds.length - 1; ++i) {
                if (latLng.hour <= Number(thresholds[i] ?? 0)) {
                    return i;
                }
            }
            return thresholds.length - 1;
        },
        options: [...timeThresholds.values()],
    };

    const hours = geoJsonFeature!.properties?.coordinateProperties.times.flat().map(item => {
        return parseInt(item.substring(11, 13), 10);
    });
    const latLngsWithHour = leafletLayer
        .getLatLngs()
        .flat(2)
        .map((item: L.LatLng & { hour?: number }, index) => {
            item.hour = hours[index];
            return item;
        });

    return L.multiOptionsPolyline(latLngsWithHour, { multiOptions });
};

/**
 * Change track colour based on transport mode.
 *
 * @see https://coolors.co/palette/ff595e-ffca3a-8ac926-1982c4-6a4c93
 *
 * @param leafletLayer - The Leaflet object layer created from the GeoJSON Feature.
 * @param geoJsonFeature - The GeoJSON Feature being processed.
 */
export function styleLineStringLayerTransport(leafletLayer: L.Polyline, geoJsonFeature: Feature) {
    if (typeof geoJsonFeature.properties?.transport === 'undefined') {
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
