import L from 'leaflet';

import ControlLayers from './control-layers';
import { ControlLegend } from './control-legend';

/**
 * Expand Leaflet's Map type, adding custom attributes.
 */
type LeafletMap = L.Map & {
    scaleControl?: L.Control.Scale;
    resetControl?: L.Control;
    layerControl?: ControlLayers;
    legendControl?: ControlLegend;
};

export default LeafletMap;
