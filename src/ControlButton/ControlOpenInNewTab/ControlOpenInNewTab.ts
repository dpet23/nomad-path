import './_ControlOpenInNewTab.scss';

import L from 'leaflet';

import { LeafletMap } from '../../Types/LeafletMap';
import ControlAbstractButton from '../ControlAbstractButton';

/**
 * Leaflet Control for opening the map in a new tab.
 */
export default class ControlOpenInNewTab extends ControlAbstractButton {
    private classButtonContainer = 'leaflet-control-open-in-new-tab';

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
     * @return The Control's container element.
     */
    onAdd = (_map: L.Map) => {
        const [container] = this.createButton({
            containerClass: this.classButtonContainer,
            title: 'Open map in a new tab',
            onClick: this.openInNewTab,
        });
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
