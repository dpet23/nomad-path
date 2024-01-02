/**
 * Common Map type definitions.
 */

import L from 'leaflet';

import ControlBaseLayers from '../ControlBaseLayers/ControlBaseLayers';
import ControlFullScreen from '../ControlButton/ControlFullscreen/ControlFullscreen';
import ControlOpenInNewTab from '../ControlButton/ControlOpenInNewTab/ControlOpenInNewTab';
import ControlReset from '../ControlButton/ControlReset/ControlReset';
import ControlTrackLayers from '../ControlCollapsible/ControlTrackLayers/ControlTrackLayers';
import ControlTrackLegend from '../ControlCollapsible/ControlTrackLegend/ControlTrackLegend';

/**
 * Expand Leaflet's Map type, adding custom attributes.
 */
export type LeafletMap = L.Map & {
    embedded?: boolean;
    openInNewTabControl?: ControlOpenInNewTab;
    fullScreenControl?: ControlFullScreen;
    scaleControl?: L.Control.Scale;
    resetControl?: ControlReset;
    baseLayerControl?: ControlBaseLayers;
    trackLayerControl?: ControlTrackLayers;
    trackLegendControl?: ControlTrackLegend;
};
