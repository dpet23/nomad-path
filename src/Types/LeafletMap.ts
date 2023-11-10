/**
 * Common type definitions.
 */

import L from 'leaflet';

import ControlFullScreen from '../ControlButton/ControlFullscreen/ControlFullscreen';
import ControlReset from '../ControlButton/ControlReset/ControlReset';
import ControlLayers from '../ControlLayers/ControlLayers';
import ControlLegend from '../ControlLegend/ControlLegend';

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
