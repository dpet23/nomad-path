/**
 * Common type definitions.
 */

import L from 'leaflet';

import ControlFullScreen from './control-fullscreen';
import ControlLayers from './control-layers';
import ControlLegend from './control-legend';
import ControlReset from './control-reset';

/**
 * Expand Leaflet's Map type, adding custom attributes.
 */
export type LeafletMap = L.Map & {
    scaleControl?: L.Control.Scale;
    resetControl?: ControlReset;
    fullScreenControl?: ControlFullScreen;
    layerControl?: ControlLayers;
    legendControl?: ControlLegend;
};
