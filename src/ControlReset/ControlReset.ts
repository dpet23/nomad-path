import './_ControlReset.scss';

import L from 'leaflet';

/**
 * Leaflet Control for resetting the map view.
 */
export default class ControlReset extends L.Control {
    private map?: L.Map;

    private classReset = 'leaflet-control-reset';
    private classResetButton = 'leaflet-control-reset-button';

    /**
     * Callback function to define the Control's container.
     *
     * Called by Leaflet when adding the Control to a Map.
     *
     * @param map - The Leaflet Map.
     * @return The wrapper element for resetting the map view.
     */
    onAdd = (map: L.Map): HTMLDivElement => {
        this.map = map;

        // Create wrapper div to display the button.
        // Use Leaflet's button styles.
        const container = L.DomUtil.create('div', `leaflet-bar ${this.classReset}`);

        // Don't propagate any events on the wrapper.
        L.DomEvent.disableClickPropagation(container);

        // Create the button to reset the view.
        const title = 'Re-center the map';
        const resetViewButton = L.DomUtil.create('a', this.classResetButton, container);
        resetViewButton.href = '#';
        resetViewButton.title = title;
        resetViewButton.setAttribute('role', 'button');
        resetViewButton.setAttribute('aria-label', title);
        resetViewButton.setAttribute('aria-disabled', 'false');

        // Reset the map view when pressing the button.
        L.DomEvent.addListener(resetViewButton, 'click', this.resetMapView);

        return container;
    };

    /**
     * Set the view of the map.
     *
     * @param event - Button click event to handle.
     */
    private resetMapView = (event: Event) => {
        // Prevent default action (navigating to a link).
        L.DomEvent.preventDefault(event);

        // Set the view of the map.
        this.map?.flyTo(this.map.options.center ?? [0, 0], this.map.options.zoom, { animate: true, duration: 0.5 });
    };
}
