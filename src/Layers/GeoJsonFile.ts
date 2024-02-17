import { Feature, GeoJsonObject } from 'geojson';
import L from 'leaflet';

import { ProcessedLayerGroup } from '../Types/Layers';
import { LeafletMap } from '../Types/LeafletMap';
import convertToMultiOptionsPolyline, { LineStringStyle, ThresholdStyles } from './MultiOptionsPolyline';

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
type ProcessedLayerGroups = { [key: string]: ProcessedLayerGroup };

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
 * Add details to each Layer group.
 *
 * @param layerGroups - The layer groups to show on top of the base map.
 */
function postProcessLayerGroups(layerGroups: ProcessedLayerGroups) {
    for (const [_layerGroupName, layerGroup] of Object.entries(layerGroups)) {
        let groupTooltip = layerGroup.getTooltip()?.getContent()?.toString() || '';
        let groupPopup = layerGroup.getPopup()?.getContent()?.toString() || '';
        const groupLatLngs: L.LatLng[] = [];

        layerGroup.eachLayer(leafletLayer => {
            // Combine the group's tooltips and popups.
            groupTooltip += `\n${leafletLayer.getTooltip()?.getContent()?.toString() || ''}`;
            groupPopup += `\n\n${leafletLayer.getPopup()?.getContent()?.toString() || ''}`;

            // Get the inner layer's LatLngs.
            if ('getLatLngs' in leafletLayer && typeof leafletLayer.getLatLngs === 'function') {
                const layerLatLngs = (leafletLayer.getLatLngs() as L.LatLng[]).flat(2);
                groupLatLngs.push(...layerLatLngs);
            }
        });

        // Determine the "middle" GPS point for this group.
        const numLatLngs = groupLatLngs.length;
        let middleLatLng: L.LatLng;
        if (numLatLngs === 0) {
            middleLatLng = (layerGroup.getLayers()[0] as L.Marker).getLatLng();
        } else {
            middleLatLng = groupLatLngs[Math.floor((numLatLngs - 1) / 2)];
        }

        // Add a tooltip and popup to this group.
        // FUTURE: GPS Visualizer showed the `layerGroupName` as a tooltip.
        layerGroup.bindTooltip(
            L.tooltip({ content: groupTooltip.trim().replace(/\n/g, '<br/>') }).setLatLng(middleLatLng),
        );
        layerGroup.bindPopup(L.popup({ content: groupPopup.trim().replace(/\n/g, '<br/>') }).setLatLng(middleLatLng));
    }
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
    map.trackLegendControl?.resetLegendContent();
    map.trackLayerControl?.getLayers().forEach(overlayDetails => {
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
        map.trackLayerControl?.removeLayer({ layer: overlayDetails.layer, updateUI: false });
    });

    // Add line thresholds to the legend.
    map.trackLegendControl?.addLegendItems(lineStyleThresholds);

    // Add new layers to the Map and Layers Control.
    for (const [layerGroupName, layerGroup] of Object.entries(layerGroups)) {
        // Add Layer to Map first so that the LayerControl item will already be enabled.
        if (typeof layerGroup.options.enabled === 'undefined' || layerGroup.options.enabled) {
            map.addLayer(layerGroup);
        }

        // Add Layer to the Track Control.
        map.trackLayerControl?.addLayer({ layer: layerGroup, name: layerGroupName, updateUI: false });
    }

    map.trackLayerControl?.updateUI();
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
            postProcessLayerGroups(layerGroups);
            showGeoJsonDataOnMap(layerGroups, lineStringStyle.thresholds, map);
        })
        .catch(error => {
            // Show an error message on error.
            if (typeof error.status !== 'undefined') {
                alert(`Failed to fetch "${geojson}": ${error.status} ${error.statusText}`);
            } else {
                console.error(error);
            }
        });
}
