import L from 'leaflet';

/**
 * Leaflet Control for resetting the map view.
 */
export default class ControlReset extends L.Control {
    private map?: L.Map;

    /**
     * Callback function to define the Control's container.
     *
     * Called by Leaflet when adding the Control to a Map.
     *
     * @param map The Leaflet Map.
     * @return The wrapper element for resetting the map view.
     */
    onAdd = (map: L.Map): HTMLDivElement => {
        this.map = map;

        // Create wrapper div to display the button.
        // Use Leaflet's button styles.
        const container = L.DomUtil.create('div', 'leaflet-control-reset leaflet-bar');

        // Don't propagate any events on the wrapper.
        L.DomEvent.disableClickPropagation(container);

        // Create the button to reset the view.
        const title = 'Re-center the map';
        const resetViewButton = L.DomUtil.create('a', 'leaflet-control-reset-button', container);
        resetViewButton.href = '#';
        resetViewButton.title = title;
        resetViewButton.setAttribute('role', 'button');
        resetViewButton.setAttribute('aria-label', title);
        resetViewButton.setAttribute('aria-disabled', 'false');

        // Add custom style for the icon.
        resetViewButton.style.content = `url(${this.arrowsToDotSvg})`;
        resetViewButton.style.boxSizing = 'border-box';
        resetViewButton.style.padding = '5px';

        // Reset the map view when pressing the button.
        L.DomEvent.addListener(resetViewButton, 'click', this.resetMapView);

        return container;
    };

    /**
     * Set the view of the map.
     *
     * @param event Button click event to handle.
     */
    private resetMapView = (event: Event) => {
        // Prevent default action (navigating to a link).
        L.DomEvent.preventDefault(event);

        // Set the view of the map.
        this.map?.flyTo(this.map.options.center ?? [0, 0], this.map.options.zoom, { animate: true, duration: 0.5 });
    };

    /* Icon from Font Awesome 6 */
    private arrowsToDotSvg =
        // eslint-disable-next-line max-len
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgNTEyIDUxMiI+PHBhdGggZD0iTTI1NiAwYzE3LjcgMCAzMiAxNC4zIDMyIDMyVjY0aDMyYzEyLjkgMCAyNC42IDcuOCAyOS42IDE5LjhzMi4yIDI1LjctNi45IDM0LjlsLTY0IDY0Yy0xMi41IDEyLjUtMzIuOCAxMi41LTQ1LjMgMGwtNjQtNjRjLTkuMi05LjItMTEuOS0yMi45LTYuOS0zNC45czE2LjYtMTkuOCAyOS42LTE5LjhoMzJWMzJjMC0xNy43IDE0LjMtMzIgMzItMzJ6TTE2OS40IDM5My40bDY0LTY0YzEyLjUtMTIuNSAzMi44LTEyLjUgNDUuMyAwbDY0IDY0YzkuMiA5LjIgMTEuOSAyMi45IDYuOSAzNC45cy0xNi42IDE5LjgtMjkuNiAxOS44SDI4OHYzMmMwIDE3LjctMTQuMyAzMi0zMiAzMnMtMzItMTQuMy0zMi0zMlY0NDhIMTkyYy0xMi45IDAtMjQuNi03LjgtMjkuNi0xOS44cy0yLjItMjUuNyA2LjktMzQuOXpNMzIgMjI0SDY0VjE5MmMwLTEyLjkgNy44LTI0LjYgMTkuOC0yOS42czI1LjctMi4yIDM0LjkgNi45bDY0IDY0YzEyLjUgMTIuNSAxMi41IDMyLjggMCA0NS4zbC02NCA2NGMtOS4yIDkuMi0yMi45IDExLjktMzQuOSA2LjlzLTE5LjgtMTYuNi0xOS44LTI5LjZWMjg4SDMyYy0xNy43IDAtMzItMTQuMy0zMi0zMnMxNC4zLTMyIDMyLTMyem0yOTcuNCA1NC42Yy0xMi41LTEyLjUtMTIuNS0zMi44IDAtNDUuM2w2NC02NGM5LjItOS4yIDIyLjktMTEuOSAzNC45LTYuOXMxOS44IDE2LjYgMTkuOCAyOS42djMyaDMyYzE3LjcgMCAzMiAxNC4zIDMyIDMycy0xNC4zIDMyLTMyIDMySDQ0OHYzMmMwIDEyLjktNy44IDI0LjYtMTkuOCAyOS42cy0yNS43IDIuMi0zNC45LTYuOWwtNjQtNjR6TTI1NiAyMjRhMzIgMzIgMCAxIDEgMCA2NCAzMiAzMiAwIDEgMSAwLTY0eiIvPjwvc3ZnPg==';
}
