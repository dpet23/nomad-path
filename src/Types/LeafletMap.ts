/**
 * Common type definitions.
 */

import L from 'leaflet';

import ControlLayers from '../ControlLayers/ControlLayers';
import ControlLegend from '../ControlLegend/ControlLegend';
import ControlReset from '../ControlReset/ControlReset';

/**
 * Expand Leaflet's Map type, adding custom attributes.
 */
export type LeafletMap = L.Map & {
    scaleControl?: L.Control.Scale;
    resetControl?: ControlReset;
    layerControl?: ControlLayers;
    legendControl?: ControlLegend;
};
