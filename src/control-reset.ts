/**
 * Create a Control for resetting the map view.
 *
 * @return {L.Control} A new Leaflet Control.
 */
export default function createResetControl() {
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
                map.setView(map.options.center, map.options.zoom);
            },
            resetView,
        );
        return resetView;
    };

    return control;
}
