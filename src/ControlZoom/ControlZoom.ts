import './_ControlZoom.scss';

import L from 'leaflet';

import { LeafletMap } from '../Types/LeafletMap';

/**
 * Leaflet Control for changing the map zoom.
 * Based on the GPS Visualizer implementation.
 */
export default class ControlZoom extends L.Control.Zoom {
    private _map?: LeafletMap;
    private _zoomInButton?: HTMLAnchorElement;

    private zoomBarContainer?: HTMLDivElement;

    private classZoomBarContainer = 'leaflet-control-zoom-bar-container';
    private classZoomBar = 'leaflet-control-zoom-bar';
    private classZoomBarSelected = 'zoom-bar-selected';
    private classZoomBarDisabled = 'zoom-bar-overzoom';
    private barMinZoom = 0;
    private barMaxZoom = 20;

    /**
     * Callback function to define the Control's elements and their behaviour.
     *
     * Called by Leaflet when adding the Control to a Map.
     *
     * @param map - The Leaflet Map.
     * @return The Control's container element.
     */
    onAdd = (map: L.Map): HTMLElement => {
        // Create Leaflet's native Zoom Control.
        const container = super.onAdd!(map);

        if (!L.Browser.mobile) {
            this.createZoomBars();
        }

        return container;
    };

    /**
     * Add a set of bars to the Zoom Control
     * to indicate the current and supported zoom levels,
     * and to allow quick zoom changes.
     */
    private createZoomBars = () => {
        // Create a container div to display the zoom bars.
        // Use Leaflet's button styles as a base.
        this.zoomBarContainer = L.DomUtil.create('div', `leaflet-bar ${this.classZoomBarContainer}`);

        // Add the container div between the zoom in and zoom out buttons.
        this._zoomInButton!.after(this.zoomBarContainer);

        // Get the current zoom level of the map, to highlight the appropriate zoom bar.
        const currentZoomLevel = this.getMapZoom();

        // If the map already has a base layer, get its min/max zoom, to disable the appropriate zoom bars.
        const enabledBaseLayerZoom = this.getEnabledBaseLayerZoom();

        // Create zoom bars for each supported zoom level, and set appropriate initial styles.
        for (let zoomLevel = this.barMaxZoom; zoomLevel >= this.barMinZoom; zoomLevel--) {
            const zoomBar = L.DomUtil.create('a', this.classZoomBar, this.zoomBarContainer);
            zoomBar.id = `zoom-bar-${zoomLevel}`;
            zoomBar.title = `Zoom level ${zoomLevel}`;
            zoomBar.href = '#';
            L.DomEvent.addListener(zoomBar, 'click', this.setMapZoom);

            if (zoomLevel === currentZoomLevel) {
                zoomBar.classList.add(this.classZoomBarSelected);
            } else if (zoomLevel < enabledBaseLayerZoom.minZoom || zoomLevel > enabledBaseLayerZoom.maxZoom) {
                zoomBar.classList.add(this.classZoomBarDisabled);
            }
        }

        // Update the zoom bar styles on certain map events.
        if (this._map) {
            this._map.addEventListener('baselayerchange', this.onMapBaseLayerChange);
            this._map.addEventListener('zoomend', this.onMapZoomEnd);
        }
    };

    /**
     * Extract a zoom bar's level from its ID.
     */
    private getZoomBarLevel = (zoomBar: HTMLAnchorElement) => Number(zoomBar.id.split('-').pop());

    /**
     * Set the zoom level of the map.
     *
     * @param event - Button click event to handle.
     */
    private setMapZoom = (event: Event) => {
        // Prevent default action (navigating to a link).
        L.DomEvent.preventDefault(event);

        // Set the map zoom.
        const zoomLevel = this.getZoomBarLevel(event.currentTarget as HTMLAnchorElement);
        this._map?.setZoom(zoomLevel, { animate: true });
    };

    /**
     * Get the current zoom level of the map view.
     *
     * @param map - (Optional) The map instance from which to get the zoom level.
     * @return The zoom level, if a map is defined.
     */
    private getMapZoom = (map?: LeafletMap): number | undefined => {
        return (map ?? this._map)?.getZoom();
    };

    /**
     * Get the min and max zoom levels of the base map currently displayed on the map.
     *
     * @param map - (Optional) The map instance from which to get the base map.
     * @return The base map zoom levels, or the Control's default zoom levels.
     */
    private getEnabledBaseLayerZoom = (map?: LeafletMap): { minZoom: number; maxZoom: number } => {
        const enabledBaseLayer = (map ?? this._map)?.layerControl
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
     * @param event - Map baselayerchange event to handle.
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
     * @param event - Map zoomend event to handle.
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

            if (zoomLevel === currentZoomLevel) {
                zoomBar.classList.add(this.classZoomBarSelected);
            } else {
                zoomBar.classList.remove(this.classZoomBarSelected);
            }
        }
    };
}
