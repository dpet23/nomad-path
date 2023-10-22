import { Feature, GeoJsonObject } from 'geojson';
import L from 'leaflet';

import convertToMultiOptionsPolyline, { LineStringStyle, ThresholdStyles } from './layers-polyline';
import { LeafletMap } from './types';

/**
 * Process a GeoJSON Point Feature into a Leaflet Marker Layer.
 *
 * @see https://tools.ietf.org/html/rfc7946#section-3.2
 * @see https://leafletjs.com/reference.html#marker
 *
 * @param geoJsonFeature - The GeoJSON Feature being processed.
 * @param leafletMarker - The Leaflet object layer created from the GeoJSON Feature.
 * @return The Leaflet layer to add to the map, and the layer name.
 */
function processGeoJsonPoint(
    geoJsonFeature: Feature,
    leafletMarker: L.Marker,
): { leafletLayer: L.Marker; layerGroupName: string } {
    const layerGroupName = 'Stops';

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
}

/**
 * Process a GeoJSON LineString/MultiLineString Feature into a Leaflet Polyline Layer.
 *
 * @see https://tools.ietf.org/html/rfc7946#section-3.2
 * @see https://leafletjs.com/reference.html#polyline
 *
 * @param geoJsonFeature - The GeoJSON Feature being processed.
 * @param leafletPolyline - The Leaflet object layer created from the GeoJSON Feature.
 * @param lineStringStyle - The chosen colour scheme for GeoJSON LineStrings.
 * @return The Leaflet layer to add to the map, and the layer name.
 */
function processGeoJsonLine(
    geoJsonFeature: Feature,
    leafletPolyline: L.Polyline,
    lineStringStyle: LineStringStyle,
): { leafletLayer: L.MultiOptionsPolyline; layerGroupName: string } {
    let layerGroupName: string = '';
    if (typeof geoJsonFeature.properties?.country !== 'undefined' && geoJsonFeature.properties.country.length > 1) {
        layerGroupName = 'International';
    } else {
        layerGroupName = geoJsonFeature.properties?.date;
    }

    // Change track colour based on the chosen property (in map.legendControl.styleSelector).
    const leafletMultiOptionsPolyline = convertToMultiOptionsPolyline(leafletPolyline, geoJsonFeature, lineStringStyle);

    // Add the GeoJSON Feature properties.
    leafletMultiOptionsPolyline.bindTooltip(geoJsonFeature.properties?.name);
    const featureDateStr = new Date(geoJsonFeature.properties?.date).toLocaleDateString('en-GB', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    leafletMultiOptionsPolyline.bindPopup(`<strong>${geoJsonFeature.properties?.name}</strong><br/>${featureDateStr}`);

    return { leafletLayer: leafletMultiOptionsPolyline, layerGroupName };
}

/**
 * Object defining the layer groups to show on top of the base map.
 *  * key: The name of the group, displayed in the Layers Control.
 *  * value: A group of Leaflet Layers to show on the map.
 */
type ProcessedLayerGroups = { [key: string]: L.LayerGroup & { options: L.LayerOptions & { enabled: boolean } } };

/**
 * Read the GeoJSON data, processing each Feature individually.
 *
 * @param jsonData - The data of the requested GeoJSON file.
 * @param lineStringStyle - The chosen colour scheme for GeoJSON LineStrings.
 * @return The layer groups to show on top of the base map.
 */
function processGeoJsonData(jsonData: GeoJsonObject, lineStringStyle: LineStringStyle): ProcessedLayerGroups {
    const layerGroups: ProcessedLayerGroups = {};

    // Parse the GeoJSON data, creating Leaflet Layers and adding them to the map.
    L.geoJSON(jsonData, {
        style: { color: '#000000' },
        onEachFeature: (feature, layer) => {
            let leafletLayerDetails:
                | { leafletLayer: L.Marker | L.MultiOptionsPolyline; layerGroupName: string }
                | undefined;

            // Build a complete Leaflet layer from the GeoJSON Feature.
            switch (feature.geometry.type) {
                case 'Point':
                    leafletLayerDetails = processGeoJsonPoint(feature, layer as L.Marker);
                    break;
                case 'LineString':
                case 'MultiLineString':
                    leafletLayerDetails = processGeoJsonLine(feature, layer as L.Polyline, lineStringStyle);
                    break;
            }

            if (leafletLayerDetails) {
                const { leafletLayer, layerGroupName } = leafletLayerDetails;

                // Add Leaflet layer to a group.
                layerGroups[layerGroupName] = layerGroups[layerGroupName] || new L.LayerGroup();
                leafletLayer.addTo(layerGroups[layerGroupName]);
            }
        },
    });

    return layerGroups;
}

/**
 * Add the processed Leaflet layer groups as overlays on a map.
 *
 * @param layerGroups - The layer groups to show on top of the base map.
 * @param lineStyleThresholds - The thresholds for the chosen LineString colour scheme.
 * @param map - Leaflet map object.
 */
function showGeoJsonDataOnMap(
    layerGroups: ProcessedLayerGroups,
    lineStyleThresholds: ThresholdStyles,
    map: LeafletMap,
) {
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
}

/**
 * Get the GeoJSON file, then process its contents and add the Features to the map.
 *
 * @param geojson - Path to the GeoJSON file containing the Features to display.
 * @param map - Leaflet map object.
 * @param lineStringStyle - The chosen colour scheme for GeoJSON LineStrings.
 */
export default function processGeoJsonFile(geojson: string, map: LeafletMap, lineStringStyle: LineStringStyle) {
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
            const layerGroups = processGeoJsonData(jsonData, lineStringStyle);
            showGeoJsonDataOnMap(layerGroups, lineStringStyle.thresholds, map);
        })
        .catch(error => {
            // Show an error message on error.
            if (typeof error.status !== 'undefined') {
                alert(`Failed to fetch "${geojson}": ${error.status} ${error.statusText}`);
            } else {
                console.error(error);
            }
        })
        .finally(() => {
            if (map.legendControl?.styleSelector) {
                map.legendControl.styleSelector.disabled = false;
            }
        });
}
