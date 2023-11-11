import './_ControlOpenInNewTab.scss';

import L from 'leaflet';

import { LeafletMap } from '../../Types/LeafletMap';
import ControlAbstractButton from '../ControlAbstractButton';

/**
 * Leaflet Control for opening the map in a new tab.
 */
export default class ControlOpenInNewTab extends ControlAbstractButton {
    private classWrapper = 'leaflet-control-open-in-new-tab';
    private classButton = `${this.classWrapper}-button`;

    /**
     * Only add the Control if the Map is being embedded into another page.
     *
     * @param map - The Leaflet Map.
     * @return An instance of the Control object.
     */
    addTo = (map: LeafletMap): this => {
        if (map.embedded) {
            super.addTo(map);
        }
        return this;
    };

    /**
     * Callback function to define the Control's elements and their behaviour.
     *
     * Called by Leaflet when adding the Control to a Map.
     *
     * @param _map - (Unused) The Leaflet Map.
     * @return The wrapper element for resetting the map view.
     */
    onAdd = (_map: L.Map) => {
        const [container] = this.createButton(
            // Element: wrapper div to display the button, using Leaflet's button styles.
            this.classWrapper,
            // Element: main button to display.
            this.classButton,
            'Open map in a new tab',
            // Action to perform when pressing the button.
            this.openInNewTab,
        );
        return container;
    };

    /**
     * Open the map in a new tab.
     *
     * @param event - Button click event to handle.
     */
    private openInNewTab = (event: Event) => {
        L.DomEvent.preventDefault(event); // Prevent default action (navigating to a link).
        window.open(window.location.href, '_blank');
    };
}
