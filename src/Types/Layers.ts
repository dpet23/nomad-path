/**
 * Common Layer type definitions.
 */

import L from 'leaflet';

/**
 * A group of several layers. Same as `L.LayerGroup`, but with an extra options.
 */
export type ProcessedLayerGroup = L.LayerGroup & { options: L.LayerOptions & { enabled: boolean } };

/**
 * The details of a layer in the ControlLayers.
 *
 * @property name - The name of the layer, displayed in the Control.
 * @property layer - The Leaflet Layer object.
 * @property enabled - Whether the layer is currently displayed on the map.
 */
export type MapLayerDetails = {
    name: string;
    layer: ProcessedLayerGroup;
    enabled: boolean;
};

/**
 * Type definition for the way `L.Control.Layers` internally stores layer data.
 *
 * @property layer - The Leaflet Layer object.
 * @property name - The name of the layer, displayed in the Control.
 * @property overlay - Whether this is an Overlay Layer (true) or a Base Layer (false).
 */
export type LayerStruct = {
    layer: L.Layer;
    name: string;
    overlay: boolean;
};
