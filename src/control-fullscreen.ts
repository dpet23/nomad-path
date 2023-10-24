import L from 'leaflet';

/**
 * Leaflet Control for togging fullscreen mode for the map.
 */
export default class ControlFullScreen extends L.Control {
    private fullscreenButton?: HTMLAnchorElement;

    /**
     * Callback function to define the Control's container.
     *
     * Called by Leaflet when adding the Control to a Map.
     *
     * @param _map (Unused) The Leaflet Map.
     * @return The div element that toggles fullscreen.
     */
    onAdd = (_map: L.Map): HTMLDivElement => {
        // Create wrapper div to display the button.
        // Use Leaflet's button styles.
        const container = L.DomUtil.create('div', 'leaflet-control-fullscreen leaflet-bar');

        // Don't propagate any events on the wrapper.
        L.DomEvent.disableClickPropagation(container);

        // Create the button to trigger a fullscreen mode change.
        const title = 'Toggle fullscreen';
        this.fullscreenButton = L.DomUtil.create('a', 'leaflet-control-fullscreen-button', container);
        this.fullscreenButton.href = '#';
        this.fullscreenButton.title = title;
        this.fullscreenButton.setAttribute('role', 'button');
        this.fullscreenButton.setAttribute('aria-label', title);
        this.fullscreenButton.setAttribute('aria-disabled', 'false');

        // Add custom CSS for the icons.
        document.head.insertAdjacentHTML(
            'beforeend',
            // eslint-disable-next-line max-len
            `<style>.fa-expand{content:url(${this.faExpandSvg})}.fa-compress{content:url(${this.faCompressSvg})}</style>`,
        );

        // Set the initial icon, and the styles to display the icon.
        this.fullscreenButton.classList.add('fa-expand');
        this.fullscreenButton.style.boxSizing = 'border-box';
        this.fullscreenButton.style.padding = '5px';

        // Toggle full-screen mode when pressing the button.
        L.DomEvent.addListener(this.fullscreenButton, 'click', this.toggleFullScreen);

        // Handle all changes to fullscreen mode (even if not initiated by the button).
        document.addEventListener('fullscreenchange', this.onFullScreenChange);

        return container;
    };

    /**
     * Toggle full-screen mode using the Fullscreen API.
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API
     * @note Some browsers use vendor prefixes for the Fullscreen API, need to check which implementation is available.
     *
     * @param event Button click event to handle.
     */
    private toggleFullScreen = (event: Event) => {
        // Prevent default action (navigating to a link).
        L.DomEvent.preventDefault(event);

        // In fullscreen mode, `document.fullscreenElement` will point to the element that is in fullscreen.
        const fullscreenElement =
            document['fullscreenElement'] ||
            document['mozFullScreenElement'] ||
            document['webkitFullscreenElement'] ||
            document['msFullscreenElement'];

        if (fullscreenElement) {
            // Determine which function will exit fullscreen mode.
            const exitFullscreen =
                document['exitFullscreen'] ||
                document['mozCancelFullScreen'] ||
                document['webkitExitFullscreen'] ||
                document['msExitFullscreen'];

            // Exit fullscreen mode.
            if (exitFullscreen) {
                exitFullscreen.call(document);
            }
        } else {
            // Determine which function will enter fullscreen mode.
            const requestFullScreen =
                document.documentElement['requestFullscreen'] ||
                document.documentElement['mozRequestFullScreen'] ||
                document.documentElement['webkitRequestFullScreen'] ||
                document.documentElement['msRequestFullscreen'];

            // Enter fullscreen mode, preferring to hide the navigation UI.
            // Note that some browsers will ignore this preference.
            if (requestFullScreen) {
                requestFullScreen.call(document.documentElement, { navigationUI: 'hide' });
            }
        }
    };

    /**
     * Handle changes to fullscreen mode.
     */
    private onFullScreenChange = () => {
        // Change the button's icon.
        this.fullscreenButton?.classList.toggle('fa-expand');
        this.fullscreenButton?.classList.toggle('fa-compress');
    };

    /* Icons from Font Awesome v6.4.0 */
    private faExpandSvg =
        // eslint-disable-next-line max-len
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NDggNTEyIj48cGF0aCBkPSJNMzIgMzJDMTQuMyAzMiAwIDQ2LjMgMCA2NHY5NmMwIDE3LjcgMTQuMyAzMiAzMiAzMnMzMi0xNC4zIDMyLTMyVjk2aDY0YzE3LjcgMCAzMi0xNC4zIDMyLTMycy0xNC4zLTMyLTMyLTMySDMyek02NCAzNTJjMC0xNy43LTE0LjMtMzItMzItMzJzLTMyIDE0LjMtMzIgMzJ2OTZjMCAxNy43IDE0LjMgMzIgMzIgMzJoOTZjMTcuNyAwIDMyLTE0LjMgMzItMzJzLTE0LjMtMzItMzItMzJINjRWMzUyek0zMjAgMzJjLTE3LjcgMC0zMiAxNC4zLTMyIDMyczE0LjMgMzIgMzIgMzJoNjR2NjRjMCAxNy43IDE0LjMgMzIgMzIgMzJzMzItMTQuMyAzMi0zMlY2NGMwLTE3LjctMTQuMy0zMi0zMi0zMkgzMjB6TTQ0OCAzNTJjMC0xNy43LTE0LjMtMzItMzItMzJzLTMyIDE0LjMtMzIgMzJ2NjRIMzIwYy0xNy43IDAtMzIgMTQuMy0zMiAzMnMxNC4zIDMyIDMyIDMyaDk2YzE3LjcgMCAzMi0xNC4zIDMyLTMyVjM1MnoiLz48L3N2Zz4=';
    private faCompressSvg =
        // eslint-disable-next-line max-len
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NDggNTEyIj48cGF0aCBkPSJNMTYwIDY0YzAtMTcuNy0xNC4zLTMyLTMyLTMycy0zMiAxNC4zLTMyIDMydjY0SDMyYy0xNy43IDAtMzIgMTQuMy0zMiAzMnMxNC4zIDMyIDMyIDMyaDk2YzE3LjcgMCAzMi0xNC4zIDMyLTMyVjY0ek0zMiAzMjBjLTE3LjcgMC0zMiAxNC4zLTMyIDMyczE0LjMgMzIgMzIgMzJIOTZ2NjRjMCAxNy43IDE0LjMgMzIgMzIgMzJzMzItMTQuMyAzMi0zMlYzNTJjMC0xNy43LTE0LjMtMzItMzItMzJIMzJ6TTM1MiA2NGMwLTE3LjctMTQuMy0zMi0zMi0zMnMtMzIgMTQuMy0zMiAzMnY5NmMwIDE3LjcgMTQuMyAzMiAzMiAzMmg5NmMxNy43IDAgMzItMTQuMyAzMi0zMnMtMTQuMy0zMi0zMi0zMkgzNTJWNjR6TTMyMCAzMjBjLTE3LjcgMC0zMiAxNC4zLTMyIDMydjk2YzAgMTcuNyAxNC4zIDMyIDMyIDMyczMyLTE0LjMgMzItMzJWMzg0aDY0YzE3LjcgMCAzMi0xNC4zIDMyLTMycy0xNC4zLTMyLTMyLTMySDMyMHoiLz48L3N2Zz4=';
}
