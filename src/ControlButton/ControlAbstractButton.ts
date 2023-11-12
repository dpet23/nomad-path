import L from 'leaflet';

/**
 * Parameters for `createButton()`.
 */
interface CreateButtonParams {
    containerClass: string;
    buttonClass?: string;
    title: string;
    onClick?: L.DomEvent.EventHandlerFn;
}

/**
 * Base class for a Leaflet Control that will be displayed as a simple button.
 */
export default class ControlAbstractButton extends L.Control {
    /**
     * Create the HTML elements to display a clickable button as a Leaflet Control.
     *
     * @param containerClass - CSS class for the div container element.
     * @param buttonClass - (Optional) CSS class for the anchor button element.
     * @param title - Title to display on hover.
     * @param onClick - (Optional) Function to call when the button is clicked.
     * @return The div container and anchor button elements.
     */
    protected createButton = ({
        containerClass,
        buttonClass,
        title,
        onClick,
    }: CreateButtonParams): [HTMLDivElement, HTMLAnchorElement] => {
        // Create a container div to display the button.
        // Use Leaflet's button styles as a base.
        const container = L.DomUtil.create('div', `leaflet-bar ${containerClass}`);

        // Don't propagate any of the container's click events to the map.
        L.DomEvent.disableClickPropagation(container);

        // Create the button as an Anchor element.
        const button = L.DomUtil.create('a', buttonClass ?? `${containerClass}-button`, container);
        button.href = '#';
        button.title = title;
        button.setAttribute('role', 'button');
        button.setAttribute('aria-label', title);
        button.setAttribute('aria-disabled', 'false');

        // If a handler function is provided, call it when the button is clicked.
        if (onClick) {
            L.DomEvent.addListener(button, 'click', onClick);
        }

        return [container, button];
    };
}
