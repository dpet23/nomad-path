/**
 * Common type definitions.
 */

import L from 'leaflet';

import ControlLayers from './control-layers';
import ControlLegend from './control-legend';
import ControlReset from './control-reset';

/**
 * Expand Leaflet's Map type, adding custom attributes.
 */
export type LeafletMap = L.Map & {
    scaleControl?: L.Control.Scale;
    resetControl?: ControlReset;
    layerControl?: ControlLayers;
    legendControl?: ControlLegend;
};
