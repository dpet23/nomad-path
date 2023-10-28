import L from 'leaflet';

import { LeafletMap } from './types';

/**
 * Leaflet Control for changing the map zoom.
 * Based on the GPS Visualizer implementation.
 */
export default class ControlZoom extends L.Control.Zoom {
    private _zoomInButton?: HTMLAnchorElement;

    private map?: LeafletMap;
    private zoomBarContainer?: HTMLDivElement;

    private classZoomBarContainer = 'leaflet-control-zoom-bar-container';
    private classZoomBar = 'leaflet-control-zoom-bar';
    private classZoomBarSelected = 'zoom-bar-selected';
    private classZoomBarDisabled = 'zoom-bar-overzoom';
    private barMinZoom = 0;
    private barMaxZoom = 20;

    /**
     * Callback function to define the Control's container.
     *
     * Called by Leaflet when adding the Control to a Map.
     *
     * @param map The Leaflet Map.
     * @return The wrapper element for resetting the map view.
     */
    onAdd = (map: L.Map): HTMLElement => {
        this.map = map;

        // Create Leaflet's native Zoom Control.
        const container = super.onAdd!(map);

        if (!L.Browser.mobile) {
            this.createZoomBars();
        }

        return container;
    };

    /**
     * Add a set of bars to the Zoom Control to indicate the current zoom level,
     * and to allow quick zoom changes.
     */
    private createZoomBars = () => {
        // Create wrapper div to display the zoom bars.
        // Use Leaflet's button styles as a base.
        this.zoomBarContainer = L.DomUtil.create('div', `${this.classZoomBarContainer} leaflet-bar`);
        this.zoomBarContainer.style.backgroundColor = '#fff';
        this.zoomBarContainer.style.padding = '1px 0px';
        this.zoomBarContainer.style.border = '0';
        this.zoomBarContainer.style.borderRadius = '0';

        // Add the wrapper div between the zoom in and zoom out buttons.
        this._zoomInButton!.after(this.zoomBarContainer);

        // Get the current zoom level of the map, to highlight the appropriate zoom bar.
        const currentZoomLevel = this.getMapZoom();

        // If the map already has a base layer, get its min/max zoom, to disable the appropriate zoom bars.
        const enabledBaseLayerZoom = this.getEnabledBaseLayerZoom();

        // Create zoom bars for each supported zoom level, and set appropriate initial styles.
        for (let zoomLevel = this.barMaxZoom; zoomLevel >= this.barMinZoom; zoomLevel--) {
            const zoomBar = L.DomUtil.create('a', this.classZoomBar, this.zoomBarContainer);
            zoomBar.id = `zoom-bar-${zoomLevel}`;
            zoomBar.title = `zoom level ${zoomLevel}`;
            zoomBar.href = '#';
            L.DomEvent.addListener(zoomBar, 'click', this.setMapZoom);

            if (zoomLevel === currentZoomLevel) {
                zoomBar.classList.add(this.classZoomBarSelected);
            } else if (zoomLevel < enabledBaseLayerZoom.minZoom || zoomLevel > enabledBaseLayerZoom.maxZoom) {
                zoomBar.classList.add(this.classZoomBarDisabled);
            }
        }

        // Add custom CSS for the zoom bars.
        document.head.insertAdjacentHTML(
            'beforeend',
            '<style>' +
                `.${this.classZoomBarContainer} a.${this.classZoomBar}{` +
                'height:4px;' +
                'width:auto;' +
                'margin:2px 4px;' +
                'border-radius:2px;' +
                'background-color:#778877;' +
                '}' +
                `.${this.classZoomBarContainer} a.${this.classZoomBar}:hover{` +
                'background-color:#bbddbb;' +
                '}' +
                `.${this.classZoomBarContainer} a.${this.classZoomBarSelected}{` +
                'margin:2px 2px;' +
                'background-color:#335533;' +
                '}' +
                `.${this.classZoomBarContainer} a.${this.classZoomBarDisabled}{` +
                'background-color:#bbbbbb;' +
                'pointer-events:none;' +
                '}' +
                '</style>',
        );

        // Update the zoom bar styles on certain map events.
        if (this.map) {
            this.map.addEventListener('baselayerchange', this.onMapBaseLayerChange);
            this.map.addEventListener('zoomend', this.onMapZoomEnd);
        }
    };

    /**
     * Extract a zoom bar's level from its ID.
     */
    private getZoomBarLevel = (zoomBar: HTMLAnchorElement) => Number(zoomBar.id.split('-').pop());

    /**
     * Set the zoom level of the map.
     *
     * @param event Button click event to handle.
     */
    private setMapZoom = (event: Event) => {
        // Prevent default action (navigating to a link).
        L.DomEvent.preventDefault(event);

        // Set the map zoom.
        const zoomLevel = this.getZoomBarLevel(event.currentTarget as HTMLAnchorElement);
        this.map?.setZoom(zoomLevel, { animate: true });
    };

    /**
     * Get the current zoom level of the map view.
     *
     * @param map - (Optional) The map instance from which to get the zoom level.
     * @return The zoom level, if a map is defined.
     */
    private getMapZoom = (map?: LeafletMap): number | undefined => {
        return (map ?? this.map)?.getZoom();
    };

    /**
     * Get the min and max zoom levels of the base map currently displayed on the map.
     *
     * @param map - (Optional) The map instance from which to get the base map.
     * @return The base map zoom levels, or the Control's default zoom levels.
     */
    private getEnabledBaseLayerZoom = (map?: LeafletMap): { minZoom: number; maxZoom: number } => {
        const enabledBaseLayer = (map ?? this.map)?.layerControl
            ?.getLayers({ overlay: undefined })
            .find(overlayDetails => overlayDetails.enabled)?.layer as L.TileLayer | undefined;

        return {
            minZoom: enabledBaseLayer?.options.minZoom ?? this.barMinZoom,
            maxZoom: enabledBaseLayer?.options.maxZoom ?? this.barMaxZoom,
        };
    };

    /**
     * Enable or disable the zoom bars on base layer change.
     *
     * @param event Map baselayerchange event to handle.
     */
    private onMapBaseLayerChange = (event: L.LayersControlEvent) => {
        if (!this.zoomBarContainer) {
            return;
        }

        const enabledBaseLayerZoom = this.getEnabledBaseLayerZoom(event.target as LeafletMap);
        for (const zoomBar of this.zoomBarContainer.children) {
            // Extract the bar's zoom level from its ID.
            const zoomLevel = this.getZoomBarLevel(zoomBar as HTMLAnchorElement);

            if (zoomLevel < enabledBaseLayerZoom.minZoom || zoomLevel > enabledBaseLayerZoom.maxZoom) {
                zoomBar.classList.add(this.classZoomBarDisabled);
            } else {
                zoomBar.classList.remove(this.classZoomBarDisabled);
            }
        }
    };

    /**
     * Enable or disable the zoom bars on a zoom change.
     *
     * @param event Map zoomend event to handle.
     */
    private onMapZoomEnd = (event: L.LeafletEvent) => {
        if (!this.zoomBarContainer) {
            return;
        }

        let currentZoomLevel = this.getMapZoom(event.target as LeafletMap);
        if (currentZoomLevel) {
            currentZoomLevel = Math.round(currentZoomLevel);
        }

        for (const zoomBar of this.zoomBarContainer.children) {
            const zoomLevel = this.getZoomBarLevel(zoomBar as HTMLAnchorElement);

            // TODO: handle fractional zooms
            if (zoomLevel === currentZoomLevel) {
                zoomBar.classList.add(this.classZoomBarSelected);
            } else {
                zoomBar.classList.remove(this.classZoomBarSelected);
            }
        }
    };
}
