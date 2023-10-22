import L from 'leaflet';

/**
 * The details of each overlay layer.
 *
 * @property name - The name of the layer, displayed in the Control.
 * @property layer - The Leaflet Layer object.
 * @property enabled - Whether the layer is currently displayed on the map.
 */
type OverlayDetails = {
    name: string;
    layer: L.Layer;
    enabled: boolean;
};

/**
 * Type definition for the way `L.Control.Layers` internally stores layer data.
 *
 * @property layer - The Leaflet Layer object.
 * @property name - The name of the layer, displayed in the Control.
 * @property overlay - Whether this is an Overlay Layer (true) or a Base Layer (false).
 */
type LayerStruct = {
    layer: L.Layer;
    name: string;
    overlay: boolean;
};

/**
 * Custom layers control.
 */
export default class ControlLayers extends L.Control.Layers {
    private _map!: L.Map;
    private _layers!: LayerStruct[];

    /**
     * Get a list of overlay layers that have been added to the Layers Control.
     *
     * @return The details of each overlay layer.
     */
    getOverlays(): OverlayDetails[] {
        const layers: OverlayDetails[] = [];

        this._layers.forEach(obj => {
            if (obj.overlay) {
                layers.push({
                    name: obj.name,
                    layer: obj.layer,
                    enabled: this._map.hasLayer(obj.layer),
                });
            }
        });

        return layers;
    }
}
