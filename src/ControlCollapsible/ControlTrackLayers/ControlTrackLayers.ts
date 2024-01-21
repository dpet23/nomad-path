import './_ControlTrackLayers.scss';

import L from 'leaflet';

import { lineWeightDefaultPx, lineWeightHighlightChangePx } from '../../Layers/MultiOptionsPolyline';
import { MapLayerDetails, ProcessedLayerGroup } from '../../Types/Layers';
import ControlAbstractCollapsible, {
    AddLayerFunc,
    CreateContentElementsFunc,
    RemoveLayerFunc,
} from '../ControlAbstractCollapsible';

/**
 * The details of a Layer.
 *
 * @param name - Label to show in the Control.
 * @param layer - The Layer object.
 * @param input - Checkbox element to show or hide the layer from the Control.
 */
type LayerObject = { name: string; layer: ProcessedLayerGroup; input?: HTMLInputElement };

/**
 * Leaflet Control for listing the displayed tracks.
 */
export default class ControlTrackLayers extends ControlAbstractCollapsible {
    // List of Layers to be displayed in the Control, and their associated details.
    private controlLayers: LayerObject[] = [];

    private layersFormElement?: HTMLFormElement;

    private classLayers = 'leaflet-control-layers-tracks';
    private classLayerList = `${this.classLayers}-list`;
    private classLayerListItem = `${this.classLayerList}-item`;
    private classLayerListItemSelector = `${this.classLayerListItem}-selector`;
    private classLayerListItemLabel = `${this.classLayerListItem}-label`;

    /**
     * Populate the Control's collapsible content.
     *
     * @implements {createContentElements} in ControlAbstractCollapsible.
     * Called when adding the Control to a Map.
     */
    protected createContentElements: CreateContentElementsFunc = () => {
        if (!this.container || !this.content) {
            return;
        }

        // Ensure the content container has the appropriate class.
        L.DomUtil.addClass(this.container, this.classLayers);

        // Create an element to hold the list of layers.
        this.layersFormElement = L.DomUtil.create('form', this.classLayerList, this.content);
    };

    /**
     * Add a layer to the Control.
     *
     * @see `_addLayer()` in `L.Control.Layers`
     *
     * @param layer - The Layer object to add.
     * @param name - Label to show in the Control for this Layer.
     * @param updateUI - If false, don't update the displayed content.
     */
    addLayer: AddLayerFunc = ({ layer, name, updateUI = true }) => {
        // Update the Control and the Map every time the given layer is shown/hidden.
        if (this._map) {
            layer.addEventListener('add remove', this.onLayerAddRemove, this);
        }

        // Add layer details to this Control's list of Layers.
        this.controlLayers.push({ name, layer });

        // Update the displayed content if requested.
        if (updateUI) {
            this.updateUI();
        }
    };

    /**
     * Update the Control and the Map every time one of the Control's layers is shown/hidden.
     *
     * This ensures that the Control responds whenever some external item modifies the Layers.
     *
     * @param event - Layer add/remove event to handle.
     */
    private onLayerAddRemove: L.LeafletEventHandlerFn = event => {
        // Update the Control's displayed content.
        this.updateUI();

        // Fire the appropriate `overlay*` event for the Map, per `L.Control.Layers`.
        const layer = event.target as L.Layer;
        const layerObject = this.controlLayers.find(obj => obj.layer === layer);
        this._map?.fire(event.type === 'add' ? 'overlayadd' : 'overlayremove', layerObject);
    };

    /**
     * Update the Control's content by clearing the UI and (re-)adding each layer individually.
     *
     * @see `_update()` in `L.Control.Layers`
     */
    updateUI = () => {
        if (!this.layersFormElement) {
            return;
        }

        // Clear the visible list of layers.
        L.DomUtil.empty(this.layersFormElement);

        // Add each layer from the Control's list of Layers to the visible content.
        // The Control's list may have been modified, so some layers may be new,
        // some may have been removed, and some may be the same.
        for (const layerObject of this.controlLayers) {
            this.addLayerToUI(layerObject);
        }
    };

    /**
     * Add an item to the Control's content.
     *
     * @see `_addItem()` in `L.Control.Layers`
     *
     * @see https://css-tricks.com/html-inputs-and-labels-a-love-story (form best practices)
     *
     * @param layerObject - The details of the item to add.
     */
    private addLayerToUI = (layerObject: LayerObject) => {
        if (!this.layersFormElement) {
            return;
        }

        // Create a wrapper element to hold the various UI elements for this item.
        const wrapperElement = L.DomUtil.create('span', this.classLayerListItem, this.layersFormElement);

        // Checkbox element for hiding/showing the Layer on the Map.
        layerObject.input = this.createCheckboxElement(wrapperElement);
        layerObject.input.checked = Boolean(this._map?.hasLayer(layerObject.layer));
        L.DomEvent.addListener(layerObject.input, 'click', this.onLayerCheckUncheck);
        L.DomEvent.disableClickPropagation(layerObject.input); // Don't propagate the box's click events to the map.

        // Label to show in the Control.
        const nameElement = L.DomUtil.create('span', this.classLayerListItemLabel, wrapperElement);
        nameElement.innerHTML = layerObject.name;
        nameElement.title = layerObject.layer.getTooltip()?.getContent()?.toString() || ''; // hover popup
        L.DomEvent.addListener(nameElement, 'mouseenter', this.onLabelMouseEnter);
        L.DomEvent.addListener(nameElement, 'mouseleave', this.onLabelMouseLeave);
        L.DomEvent.addListener(nameElement, 'click', this.onLabelClick);

        // TODO (GPS Visualizer):
        // Label behaviour:
        //  * Label has same colour as track
        //  * (/) Mouseover: shows label underline, highlights track, brings up track mouseover
        //  * (/) Hover: brings up track description next to label
        //  * Click: brings up track detailed popover (ideally also keeps highlighting?)

        // TODO (GPS Visualizer):
        // Next to each label is a zoom icon
        //  * Icon: base-64 PNG
        //  * Mouseover: cursor becomes magnifying glass
        //  * Hover: "zoom to this track" help text
        //  * Click: zooms map to track (which then updates zoom bar)

        // TODO (GPS Visualizer):
        //  * Track hover highlights track

        // TODO (usability):
        //  * Find a way of making the track checkbox/zoom icon easier to press on mobile
    };

    /**
     * Create a checkbox input element.
     *
     * @param container - (Optional) Add the checkbox to a parent element.
     * @return The input element.
     */
    private createCheckboxElement = (container?: HTMLElement): HTMLInputElement => {
        const input = L.DomUtil.create('input', this.classLayerListItemSelector, container);
        input.type = 'checkbox';
        return input;
    };

    /**
     * Hide or show a Layer on the Map when a checkbox state is changed.
     *
     * @param event - Checkbox click event to handle.
     */
    private onLayerCheckUncheck = (event: Event) => {
        const inputElement = event.target as HTMLInputElement;
        const layer = this.controlLayers.find(layerObject => layerObject.input === inputElement)?.layer;
        if (!layer) {
            return;
        }

        if (inputElement.checked) {
            // Layer was enabled, show on map.
            if (!this._map?.hasLayer(layer)) {
                this._map?.addLayer(layer);
            }
        } else {
            // Layer was disabled, hide from map.
            if (this._map?.hasLayer(layer)) {
                this._map?.removeLayer(layer);
            }
        }
    };

    /**
     * Style a Layer when the mouse pointer hovers over a label.
     *
     * @see `trk[X].overlays[0].openTooltip()` and `GV_Highlight_Track()` in GPS Visualizer.
     *
     * @param event - Span label mouseenter event to handle.
     */
    private onLabelMouseEnter = (event: Event) => {
        // Get the Layer group to modify.
        const labelInput = Array.from(
            (event.target as HTMLSpanElement).parentElement?.children || new HTMLCollection(),
        ).find(e => e.className === this.classLayerListItemSelector);
        const layerGroup = this.controlLayers.find(layerObject => layerObject.input === labelInput)?.layer;
        if (!layerGroup || !this._map?.hasLayer(layerGroup)) {
            return;
        }

        // Show the Layer group's tooltip.
        const layerGroupTooltip = layerGroup.getTooltip();
        if (layerGroupTooltip) {
            layerGroup.openTooltip(layerGroupTooltip.getLatLng());
        }

        // Highlight tracks by making them bolder (increase width).
        layerGroup.eachLayer(leafletLayer => {
            if ('getLatLngs' in leafletLayer && typeof leafletLayer.getLatLngs === 'function') {
                (leafletLayer as L.MultiOptionsPolyline).setStyle({
                    weight: lineWeightDefaultPx + lineWeightHighlightChangePx,
                });
            }
        });
    };

    /**
     * Reset Layer styles when the mouse pointer stops hovering over a label.
     * This is the opposite of `this.onLabelMouseEnter()`.
     *
     * @see `trk[X].overlays[0].closeTooltip()` and `GV_Highlight_Track()` in GPS Visualizer.
     *
     * @param event - Span label mouseleave event to handle.
     */
    private onLabelMouseLeave = (event: Event) => {
        // Get the Layer group to modify.
        const labelInput = Array.from(
            (event.target as HTMLSpanElement).parentElement?.children || new HTMLCollection(),
        ).find(e => e.className === this.classLayerListItemSelector);
        const layerGroup = this.controlLayers.find(layerObject => layerObject.input === labelInput)?.layer;
        if (!layerGroup || !this._map?.hasLayer(layerGroup)) {
            return;
        }

        // Hide the Layer group's tooltip.
        layerGroup.closeTooltip();

        // Un-highlight tracks (reset width to default).
        layerGroup.eachLayer(leafletLayer => {
            if ('getLatLngs' in leafletLayer && typeof leafletLayer.getLatLngs === 'function') {
                (leafletLayer as L.MultiOptionsPolyline).setStyle({ weight: lineWeightDefaultPx });
            }
        });
    };

    /**
     * .
     *
     * @param event - Span label click event to handle.
     */
    private onLabelClick = (event: Event) => {
        console.log(`Click on: ${event.target}`);
    };

    /**
     * Get the list of Layers that have been added to the Control.
     *
     * @return The details of each overlay layer.
     */
    getLayers = (): MapLayerDetails[] => {
        const layers: MapLayerDetails[] = [];

        this.controlLayers.forEach(layerObject => {
            layers.push({
                name: layerObject.name,
                layer: layerObject.layer,
                enabled: Boolean(this._map?.hasLayer(layerObject.layer)),
            });
        });

        return layers;
    };

    /**
     * Remove the given layer from the Control.
     *
     * @see `removeLayer()` in `L.Control.Layers`
     *
     * @param layer - The Layer object to remove.
     * @param updateUI - If false, don't update the displayed content.
     */
    removeLayer: RemoveLayerFunc = ({ layer, updateUI = true }) => {
        // Stop updating the Control and the Map when the layer is shown/hidden.
        layer.removeEventListener('add remove', this.onLayerAddRemove, this);

        // Remove layer details from this Control's list of Layers.
        const layerObject = this.controlLayers.find(obj => obj.layer === layer);
        if (layerObject) {
            this.controlLayers.splice(this.controlLayers.indexOf(layerObject), 1);
        }

        // Update the displayed content if requested.
        if (updateUI) {
            this.updateUI();
        }
    };
}
