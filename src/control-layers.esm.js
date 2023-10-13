/**
 * Get a list of overlay layers that have been added to the Layers Control.
 *
 * @this {L.LayerControl} Runs in the context of the map's Layers Control object.
 *
 * @typedef {Object} OverlayDetails - The details of each overlay layer.
 * @property {string} name - The name of the layer, displayed in the Control.
 * @property {L.Layer} layer - The Leaflet Layer object.
 * @property {boolean} enabled - Whether the layer is currently displayed on the map.
 *
 * @return {Array<OverlayDetails>} The details of each overlay layer.
 */
export default function getLayerControlOverlays() {
    const layers = [];

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
