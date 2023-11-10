import './_ControlReset.scss';

import L from 'leaflet';

import ControlAbstractButton from '../ControlAbstractButton';

/**
 * Leaflet Control for resetting the map view.
 */
export default class ControlReset extends ControlAbstractButton {
    private map?: L.Map;

    private classResetWrapper = 'leaflet-control-reset';
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
        const [container] = this.createButton(
            // Element: wrapper div to display the button, using Leaflet's button styles.
            this.classResetWrapper,
            // Element: button to reset the view.
            this.classResetButton,
            'Re-center the map',
            // When pressing the button: reset the map view.
            this.resetMapView,
        );
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
