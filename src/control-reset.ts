import L from 'leaflet';

/**
 * Create a Control for resetting the map view.
 *
 * @return A new Leaflet Control.
 */
export default function createResetControl(): L.Control {
    const control = new L.Control({ position: 'topleft' });

    /**
     * Function to handle adding the Control to a Leaflet Map.
     */
    control.onAdd = map => {
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

    return control;
}
