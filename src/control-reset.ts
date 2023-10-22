import L from 'leaflet';

/**
 * Leaflet Control for resetting the map view.
 */
export default class ControlReset extends L.Control {
    /**
     * Callback function to define the Control's container.
     *
     * Called by Leaflet when adding the Control to a Map.
     *
     * @param map The Leaflet Map.
     * @return The anchor element that resets the map view.
     */
    onAdd = (map: L.Map): HTMLAnchorElement => {
        const resetView = L.DomUtil.create('a', 'resetview');
        resetView.innerHTML = '[Reset Map]';
        L.DomEvent.disableClickPropagation(resetView).addListener(
            resetView,
            'click',
            () => {
                map.setView(map.options.center ?? [0, 0], map.options.zoom);
            },
            resetView,
        );
        return resetView;
    };
}
