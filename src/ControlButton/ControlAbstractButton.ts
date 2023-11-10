import L from 'leaflet';

/**
 * Base class for a Leaflet Control that will be displayed as a simple button.
 */
export default class ControlAbstractButton extends L.Control {
    /**
     * Create the HTML elements to display a clickable button as a Leaflet Control.
     *
     * @param classWrapper - CSS class for the div wrapper element.
     * @param classButton - CSS class for the anchor button element.
     * @param titleButton - Title to display on hover.
     * @param eventHandlerFn - (Optional) Function to call when the button is clicked.
     * @return The div wrapper and anchor button elements.
     */
    protected createButton = (
        classWrapper: string,
        classButton: string,
        titleButton: string,
        eventHandlerFn?: L.DomEvent.EventHandlerFn,
    ): [HTMLDivElement, HTMLAnchorElement] => {
        // Create wrapper div to display the button.
        // Use Leaflet's button styles.
        const container = L.DomUtil.create('div', `leaflet-bar ${classWrapper}`);

        // Don't propagate any events on the wrapper.
        L.DomEvent.disableClickPropagation(container);

        // Create the button as an Anchor element.
        const button = L.DomUtil.create('a', classButton, container);
        button.href = '#';
        button.title = titleButton;
        button.setAttribute('role', 'button');
        button.setAttribute('aria-label', titleButton);
        button.setAttribute('aria-disabled', 'false');

        // If a handler function is provided, call it when the button is clicked.
        if (eventHandlerFn) {
            L.DomEvent.addListener(button, 'click', eventHandlerFn);
        }

        return [container, button];
    };
}
