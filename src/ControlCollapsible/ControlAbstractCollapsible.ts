import L from 'leaflet';

import { LeafletMap } from '../Types/LeafletMap';

/**
 * Parameters for the ControlAbstractCollapsible.
 */
export type ControlCollapsibleOptions = L.ControlOptions & {
    collapsed: boolean;
    title: string;
};

/**
 * Function signature for populating the Control's collapsible content.
 */
export type CreateContentElementsFunc = () => void;

/**
 * Function signature for adding a layer to the Control.
 */
export type AddLayerFunc = ({ layer, name, updateUI }: { layer: L.Layer; name: string; updateUI?: boolean }) => void;

/**
 * Function signature for remove a layer from the Control.
 */
export type RemoveLayerFunc = ({ layer, updateUI }: { layer: L.Layer; updateUI?: boolean }) => void;

/**
 * Base class for a Leaflet Control that can be collapsed into an icon and expanded with mouse/touch/keyboard.
 *
 * @see `L.Control.Layers`
 */
export default abstract class ControlAbstractCollapsible extends L.Control {
    protected _map?: LeafletMap;
    public readonly options: ControlCollapsibleOptions;

    protected container?: HTMLDivElement;
    protected content?: HTMLElement;

    private classContainer = 'leaflet-control-collapsible';
    private containerInitialClasses?: string[];
    private classToggleSuffix = 'toggle';
    private classContent = `${this.classContainer}-content`;
    private classContentHeader = `${this.classContent}-header`;
    private classExpanded = `${this.classContainer}-expanded`;
    private classScrollbar = `${this.classContainer}-scrollbar`;

    /**
     * Add a suffix to all initial CSS classes of the container element.
     *
     * @param suffix - The suffix to add to each CSS class.
     * @return New CSS classes to apply to an element.
     */
    private classContainerWithSuffix = (suffix: string) =>
        this.containerInitialClasses?.map(containerClass => `${containerClass}-${suffix}`).join(' ');

    /**
     * Create a Control that can be collapsed and expanded.
     *
     * @param options - Control options.
     * @param options.position - The position of the Control (one of the map corners).
     * @param options.collapsed - Whether the Control will be initially collapsed into an icon.
     * @param options.title - Title to show when hovering over the collapsed icon.
     */
    constructor(options: ControlCollapsibleOptions) {
        super(options);
        this.options = options;
    }

    /**
     * Callback function to define the Control's elements and their behaviour.
     *
     * Called by Leaflet when adding the Control to a Map.
     *
     * @see `_initLayout()` in `L.Control.Layers`
     *
     * @param _map - (Unused) The Leaflet Map.
     * @return The Control's container element.
     */
    onAdd(_map: LeafletMap): HTMLDivElement {
        // Create a container div to display the Control.
        // Use Leaflet's Layers styles as a base.
        this.container = L.DomUtil.create('div', `leaflet-control-layers ${this.classContainer}`);
        this.container.setAttribute('aria-haspopup', 'true');
        this.containerInitialClasses = this.container.className.split(' ');

        // Don't propagate any of the container's click or scroll events to the map.
        L.DomEvent.disableClickPropagation(this.container).disableScrollPropagation(this.container);

        // Create a HTML Section to hold the collapsible content of this Control.
        this.content = L.DomUtil.create('section', this.classContent, this.container);

        // Create a header in the content of this Control.
        L.DomUtil.create('p', this.classContentHeader, this.content).textContent = this.options.title;

        // Create any other elements in the content of this Control.
        this.createContentElements();

        // Create the collapsed icon, or expand the control.
        if (this.options.collapsed) {
            this.createCollapsedIconElements();
        } else {
            this.expand();
        }

        return this.container;
    }

    /**
     * Abstract function to populate the collapsible content.
     *
     * @interface
     * Must be implemented by child classes.
     */
    protected abstract createContentElements: CreateContentElementsFunc;

    /**
     * Set up the Control's ability to be collapsed by adding HTML elements and event handlers.
     */
    private createCollapsedIconElements = () => {
        if (!this.container) {
            return; // Type narrowing only, this should never fail.
        }

        // Expand and collapse the Control when hovering over the container div.
        L.DomEvent.addListener(
            this.container,
            {
                mouseenter: this.expand,
                mouseleave: this.collapse,
            },
            this,
        );

        // Collapse the Control when clicking on the Map.
        this._map!.addEventListener('click', this.collapse, this);

        // Create a button to expand the Control details.
        const link = L.DomUtil.create('a', this.classContainerWithSuffix(this.classToggleSuffix), this.container);
        link.href = '#';
        link.title = this.options.title;
        link.setAttribute('role', 'button');
        link.setAttribute('aria-label', this.options.title);
        link.setAttribute('aria-disabled', 'false');

        // Expand the Control for keyboard events on the link itself.
        L.DomEvent.addListener(
            link,
            {
                keydown: (event: Event) => {
                    if ((event as KeyboardEvent).key === 'Enter') {
                        this.expand();
                    }
                },
                click: (event: Event) => {
                    L.DomEvent.preventDefault(event); // Prevent default action (navigating to a link).
                    this.expand();
                },
            },
            this,
        );
    };

    /**
     * Expand the control container if collapsed.
     *
     * @see `expand()` in `L.Control.Layers`
     */
    private expand = () => {
        if (!this._map || !this.container || !this.content) {
            return; // Type narrowing only, this should never fail.
        }
        L.DomUtil.addClass(this.container, this.classExpanded);
        this.makeContentScrollableIfNeeded();
    };

    /**
     * Make the content scrollable if it's too tall for the current display.
     */
    protected makeContentScrollableIfNeeded = () => {
        if (!this._map || !this.container || !this.content) {
            return; // Type narrowing only, this should never fail.
        }

        this.content.style.height = '';
        const acceptableHeight = this.getScrollableHeight();
        if (this.content.offsetHeight > acceptableHeight) {
            this.content.style.height = `${acceptableHeight}px`;
            L.DomUtil.addClass(this.content, this.classScrollbar);
        } else {
            L.DomUtil.removeClass(this.content, this.classScrollbar);
        }
    };

    /**
     * Calculate the maximum possible height for the scrollable content.
     */
    private getScrollableHeight = (): number => {
        if (!this._map || !this.container || !this.content) {
            return 0; // Type narrowing only, this should never fail.
        }

        if (!this.container.parentElement) {
            return 0; // Ensure that the Control has been added to the map.
        }

        let offsetFromCurrentEdgePx: number;
        let marginFromOtherEdgeProperty: string;
        if (this.options.position === 'topleft' || this.options.position === 'topright') {
            offsetFromCurrentEdgePx = Math.round(this.container.getBoundingClientRect().top);
            marginFromOtherEdgeProperty = 'margin-top';
        } else {
            offsetFromCurrentEdgePx = Math.round(window.innerHeight - this.container.getBoundingClientRect().bottom);
            marginFromOtherEdgeProperty = 'margin-bottom';
        }

        const containerStyles = this.container.computedStyleMap();
        const marginFromOtherEdgePx = Math.round(
            (containerStyles.get(marginFromOtherEdgeProperty) as CSSUnitValue).value,
        );
        const containerBorder =
            Math.round((containerStyles.get('border-top-width') as CSSUnitValue).value) +
            Math.round((containerStyles.get('border-bottom-width') as CSSUnitValue).value);

        const contentStyles = this.content.computedStyleMap();
        const contentPadding =
            Math.round((contentStyles.get('padding-top') as CSSUnitValue).value) +
            Math.round((contentStyles.get('padding-bottom') as CSSUnitValue).value);

        return window.innerHeight - offsetFromCurrentEdgePx - marginFromOtherEdgePx - containerBorder - contentPadding;
    };

    /**
     * Collapse the control container if expanded.
     *
     * @see `collapse()` in `L.Control.Layers`
     */
    private collapse = () => {
        if (!this.container) {
            return; // Type narrowing only, this should never fail.
        }
        L.DomUtil.removeClass(this.container, this.classExpanded);
    };
}
