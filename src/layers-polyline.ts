import { Feature } from 'geojson';
import L from 'leaflet';

/**
 * Type alias for the threshold values to check for in a property of a GeoJSON LineString Feature,
 * and the CSS color to apply to each point within a threshold.
 */
export type ThresholdKey = number | string | undefined;
export type ThresholdStyles = Map<ThresholdKey, string>;

/**
 * Type alias for a function that will extract a certain property of a GeoJSON LineString Feature or Leaflet Polyline.
 *
 * @param leafletLayer - The Leaflet object layer created from a GeoJSON Feature.
 * @param geoJsonFeature - The GeoJSON Feature being processed.
 * @return The values of a certain property, as a flattened array.
 *         There **MUST** be one value for each point/LatLng in the LineString/Polyline.
 */
type GetParameterValuesFunc = (leafletLayer: L.Polyline, geoJsonFeature: Feature) => ThresholdKey[];

/**
 * A colour scheme for GeoJSON LineStrings.
 *
 * @property name - The style name, displayed in the Legend Control.
 * @property func - Function to extract a certain property from a GeoJSON LineString Feature or Leaflet Polyline.
 * @property thresholds - The threshold values in the chosen GeoJSON property and the CSS style to apply.
 */
export type LineStringStyle = {
    name: string;
    func: GetParameterValuesFunc;
    thresholds: ThresholdStyles;
};

/**
 * Return a constant value for each LineString point.
 */
export const getLineStringConst: GetParameterValuesFunc = (leafletLayer, _geoJsonFeature) => {
    return leafletLayer
        .getLatLngs()
        .flat(2)
        .map((_point: L.LatLng) => {
            return 'Track';
        });
};

/**
 * Extract hour of day (in UTC) for each GeoJSON point.
 *
 * JSONPath: $.features[?(/LineString/.test(@.geometry.type))].properties.coordinateProperties.times
 */
export const getLineStringHourOfDay: GetParameterValuesFunc = (_leafletLayer, geoJsonFeature) => {
    return geoJsonFeature.properties?.coordinateProperties?.times?.flat(2).map((item: string) => {
        return parseInt(item.substring(11, 13), 10);
    });
};

/**
 * Extract altitude (in metres) for each LineString point.
 *
 * JSONPath: $.features[?(/LineString/.test(@.geometry.type))].geometry.coordinates[*][2]
 */
export const getLineStringAltitude: GetParameterValuesFunc = (leafletLayer, _geoJsonFeature) => {
    return leafletLayer
        .getLatLngs()
        .flat(2)
        .map((point: L.LatLng) => {
            return point.alt;
        });
};

/**
 * Extract speed (in km/h) for each LineString point.
 *
 * JSONPath: $.features[?(/LineString/.test(@.geometry.type))].properties.coordinateProperties.speeds
 */
export const getLineStringSpeed: GetParameterValuesFunc = (_leafletLayer, geoJsonFeature) => {
    return geoJsonFeature.properties?.coordinateProperties?.speeds?.flat(2);
};

/**
 * Extract transport mode for each LineString point.
 *
 * JSONPath: $.features[?(/LineString/.test(@.geometry.type))].properties.transport[0]
 */
export const getLineStringTransport: GetParameterValuesFunc = (leafletLayer, geoJsonFeature) => {
    return leafletLayer
        .getLatLngs()
        .flat(2)
        .map((_point: L.LatLng) => {
            if (typeof geoJsonFeature.properties?.transport === 'undefined') {
                return undefined;
            }
            return geoJsonFeature.properties.transport[0];
        });
};

export const defaultLineStringStyleConst: LineStringStyle = {
    name: 'Single colour',
    func: getLineStringConst, // 'Track' for each track point
    thresholds: new Map([
        ['Track', '#E60000'], // Electric Red
    ]),
};

/**
 * Build the "multiOptions" item to apply the chosen style to a MultiOptionsPolyline.
 *
 * @see https://github.com/hgoebl/Leaflet.MultiOptionsPolyline
 *
 * @property values - The values of a certain GeoJSON property, as a flattened array.
 * @property thresholds - The thresholds for the chosen LineString colour scheme.
 * @return The "multiOptions" object to use for building a MultiOptionsPolyline.
 */
const buildMultiOptions = (values: ThresholdKey[], thresholds: ThresholdStyles): L.MultiOptions => ({
    // A list of the given CSS styles.
    options: [...thresholds.values()].map(thresholdColor => ({ color: thresholdColor })),

    // Function to determine which CSS style to apply.
    // Called for each Leaflet LatLng in a Polyline.
    optionIdxFn: (_latLng: L.LatLng, _prevLatLng: L.LatLng, index: number, _allLatlngs: L.LatLng[]): number => {
        // Get the value of the given attribute within this L.LatLng.
        const latLngAttrVal = values[index];

        // If the value is undefined or of an unsupported type, use the style of the first (smallest) threshold.
        const defaultIndex = 0;

        if (typeof latLngAttrVal === 'undefined') {
            // This L.LatLng doesn't have a value for the given attribute.
            return defaultIndex;
        } else if (typeof latLngAttrVal === 'string') {
            const thresholdKeys = [...thresholds.keys()];
            for (let i = 0; i < thresholdKeys.length; i++) {
                if (latLngAttrVal === thresholdKeys[i]) {
                    return i;
                }
            }
            return defaultIndex;
        } else if (typeof latLngAttrVal === 'number') {
            const thresholdKeys = [...thresholds.keys()];
            for (let i = 0; i < thresholdKeys.length; i++) {
                if (latLngAttrVal <= Number(thresholdKeys[i] ?? defaultIndex)) {
                    return i;
                }
            }
            return thresholdKeys.length - 1;
        }

        // Value of the given attribute within this L.LatLng has an unsupported type.
        return defaultIndex;
    },
});

/**
 * Convert a Leaflet Polyline Layer into a MultiOptionsPolyline
 * (a group of Polylines with a certain colour scheme).
 *
 * @param leafletPolyline - The Leaflet object layer created from a GeoJSON Feature.
 * @param geoJsonFeature - The GeoJSON Feature being processed.
 * @param lineStringStyle - The chosen colour scheme for GeoJSON LineStrings.
 * @param options - (Optional) Other Polyline options to use.
 * @return A MultiOptionsPolyline with the same LatLng points as the original Polyline,
 *         and styled with the given scheme.
 */
export default function convertToMultiOptionsPolyline(
    leafletPolyline: L.Polyline,
    geoJsonFeature: Feature,
    lineStringStyle: LineStringStyle,
    options?: L.PolylineOptions,
): L.MultiOptionsPolyline {
    // Flatten the list of Leaflet Points (ignoring the original track segments).
    // The MultiOptionsPolyline will segment the Polyline based on the chosen style.
    const polylineLatLngFlat = leafletPolyline.getLatLngs().flat(2);

    // Call the given function to extract the chosen property from a GeoJSON LineString Feature or Leaflet Polyline.
    // The result will be a flattened array of the property's value for each point/LatLng.
    const parameterValues = lineStringStyle.func(leafletPolyline, geoJsonFeature);

    // Double-check that we've got a property value for each point/LatLng.
    if (parameterValues.length !== polylineLatLngFlat.length) {
        alert(
            `The array returned by function ${lineStringStyle.func.name} does not ` +
                'have the same length as the number of points in the Polyline!\n' +
                `Saw ${parameterValues.length} items, expected ${polylineLatLngFlat.length}.`,
        );
    }

    // Build a MultiOptionsPolyline and apply the given style.
    return L.multiOptionsPolyline(polylineLatLngFlat, {
        multiOptions: buildMultiOptions(parameterValues, lineStringStyle.thresholds),
        ...options,
    });
}
