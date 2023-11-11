/**
 * Common type definitions.
 */

import L from 'leaflet';

import ControlFullScreen from '../ControlButton/ControlFullscreen/ControlFullscreen';
import ControlOpenInNewTab from '../ControlButton/ControlOpenInNewTab/ControlOpenInNewTab';
import ControlReset from '../ControlButton/ControlReset/ControlReset';
import ControlLayers from '../ControlLayers/ControlLayers';
import ControlLegend from '../ControlLegend/ControlLegend';

/**
 * Expand Leaflet's Map type, adding custom attributes.
 */
export type LeafletMap = L.Map & {
    embedded?: boolean;
    openInNewTabControl?: ControlOpenInNewTab;
    fullScreenControl?: ControlFullScreen;
    scaleControl?: L.Control.Scale;
    resetControl?: ControlReset;
    layerControl?: ControlLayers;
    legendControl?: ControlLegend;
};
