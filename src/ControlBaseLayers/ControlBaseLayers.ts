import L from 'leaflet';

import { LayerStruct, MapLayerDetails, ProcessedLayerGroup } from '../Types/Layers';

/**
 * Leaflet Control for changing the map's base layer.
 */
export default class ControlBaseLayers extends L.Control.Layers {
    private _map!: L.Map;
    private _layers!: LayerStruct[];

    /**
     * Get a list of overlay layers that have been added to the Layers Control.
     *
     * @return The details of each overlay layer.
     */
    getLayers = ({ overlay }: { overlay?: boolean }): MapLayerDetails[] => {
        const layers: MapLayerDetails[] = [];

        this._layers.forEach(obj => {
            if (obj.overlay === overlay) {
                layers.push({
                    name: obj.name,
                    layer: obj.layer as ProcessedLayerGroup,
                    enabled: this._map.hasLayer(obj.layer),
                });
            }
        });

        return layers;
    };
}
