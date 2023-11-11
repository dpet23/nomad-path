import './_ControlReset.scss';

import L from 'leaflet';

import ControlAbstractButton from '../ControlAbstractButton';

/**
 * Leaflet Control for resetting the map view.
 */
export default class ControlReset extends ControlAbstractButton {
    private _map?: L.Map;

    private classButtonContainer = 'leaflet-control-reset';

    /**
     * Callback function to define the Control's elements and their behaviour.
     *
     * Called by Leaflet when adding the Control to a Map.
     *
     * @param _map - (Unused) The Leaflet Map.
     * @return The Control's container element.
     */
    onAdd = (_map: L.Map): HTMLDivElement => {
        const [container] = this.createButton({
            containerClass: this.classButtonContainer,
            title: 'Re-center the map',
            onClick: this.resetMapView,
        });
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
        this._map?.flyTo(this._map.options.center ?? [0, 0], this._map.options.zoom, { animate: true, duration: 0.5 });
    };
}
