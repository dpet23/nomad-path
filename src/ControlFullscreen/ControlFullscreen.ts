import L from 'leaflet';

/**
 * Leaflet Control for togging fullscreen mode for the map.
 */
export default class ControlFullScreen extends L.Control {
    private fullscreenButton?: HTMLAnchorElement;

    private classFullScreenWrapper = 'leaflet-control-fullscreen';
    private classFullScreenButton = 'leaflet-control-fullscreen-button';
    private classFaExpand = 'fa-expand';
    private classFaCompress = 'fa-compress';

    /**
     * Callback function to define the Control's container.
     *
     * Called by Leaflet when adding the Control to a Map.
     *
     * @param _map - (Unused) The Leaflet Map.
     * @return The wrapper element for toggling fullscreen.
     */
    onAdd = (_map: L.Map): HTMLDivElement => {
        // Create wrapper div to display the button.
        // Use Leaflet's button styles.
        const container = L.DomUtil.create('div', `${this.classFullScreenWrapper} leaflet-bar`);

        // Don't propagate any events on the wrapper.
        L.DomEvent.disableClickPropagation(container);

        // Create the button to trigger a fullscreen mode change.
        const title = 'Toggle fullscreen';
        this.fullscreenButton = L.DomUtil.create('a', this.classFullScreenButton, container);
        this.fullscreenButton.href = '#';
        this.fullscreenButton.title = title;
        this.fullscreenButton.setAttribute('role', 'button');
        this.fullscreenButton.setAttribute('aria-label', title);
        this.fullscreenButton.setAttribute('aria-disabled', 'false');

        // Add custom CSS for the icons.
        document.head.insertAdjacentHTML(
            'beforeend',
            '<style>' +
                `.${this.classFullScreenWrapper}{` +
                'background-color:white;' +
                '}' +
                `.${this.classFullScreenWrapper}:hover,` +
                `.${this.classFullScreenWrapper}:focus{` +
                'background-color:#f4f4f4;' +
                '}' +
                `.${this.classFullScreenWrapper} .${this.classFullScreenButton}.${this.classFaExpand}{` +
                `-webkit-mask:url(${this.faExpandSvg});` +
                `mask:url(${this.faExpandSvg});` +
                '}' +
                `.${this.classFullScreenWrapper} .${this.classFullScreenButton}.${this.classFaCompress}{` +
                `-webkit-mask:url(${this.faCompressSvg});` +
                `mask:url(${this.faCompressSvg});` +
                '}' +
                `.${this.classFullScreenWrapper} .${this.classFullScreenButton}.${this.classFaExpand},` +
                `.${this.classFullScreenWrapper} .${this.classFullScreenButton}.${this.classFaCompress}{` +
                '-webkit-mask-size:19px;' +
                'mask-size:19px;' +
                '-webkit-mask-position:center;' +
                'mask-position:center;' +
                '-webkit-mask-repeat:no-repeat;' +
                'mask-repeat:no-repeat;' +
                'background-color:black;' +
                '}' +
                '</style>',
        );

        // Set the initial icon.
        this.fullscreenButton.classList.add(this.classFaExpand);

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
     * @param event - Button click event to handle.
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
        this.fullscreenButton?.classList.toggle(this.classFaExpand);
        this.fullscreenButton?.classList.toggle(this.classFaCompress);
    };

    /* Icons from Font Awesome 6 */
    private faExpandSvg =
        // eslint-disable-next-line max-len
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NDggNTEyIj48cGF0aCBkPSJNMzIgMzJDMTQuMyAzMiAwIDQ2LjMgMCA2NHY5NmMwIDE3LjcgMTQuMyAzMiAzMiAzMnMzMi0xNC4zIDMyLTMyVjk2aDY0YzE3LjcgMCAzMi0xNC4zIDMyLTMycy0xNC4zLTMyLTMyLTMySDMyek02NCAzNTJjMC0xNy43LTE0LjMtMzItMzItMzJzLTMyIDE0LjMtMzIgMzJ2OTZjMCAxNy43IDE0LjMgMzIgMzIgMzJoOTZjMTcuNyAwIDMyLTE0LjMgMzItMzJzLTE0LjMtMzItMzItMzJINjRWMzUyek0zMjAgMzJjLTE3LjcgMC0zMiAxNC4zLTMyIDMyczE0LjMgMzIgMzIgMzJoNjR2NjRjMCAxNy43IDE0LjMgMzIgMzIgMzJzMzItMTQuMyAzMi0zMlY2NGMwLTE3LjctMTQuMy0zMi0zMi0zMkgzMjB6TTQ0OCAzNTJjMC0xNy43LTE0LjMtMzItMzItMzJzLTMyIDE0LjMtMzIgMzJ2NjRIMzIwYy0xNy43IDAtMzIgMTQuMy0zMiAzMnMxNC4zIDMyIDMyIDMyaDk2YzE3LjcgMCAzMi0xNC4zIDMyLTMyVjM1MnoiLz48L3N2Zz4=';
    private faCompressSvg =
        // eslint-disable-next-line max-len
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0NDggNTEyIj48cGF0aCBkPSJNMTYwIDY0YzAtMTcuNy0xNC4zLTMyLTMyLTMycy0zMiAxNC4zLTMyIDMydjY0SDMyYy0xNy43IDAtMzIgMTQuMy0zMiAzMnMxNC4zIDMyIDMyIDMyaDk2YzE3LjcgMCAzMi0xNC4zIDMyLTMyVjY0ek0zMiAzMjBjLTE3LjcgMC0zMiAxNC4zLTMyIDMyczE0LjMgMzIgMzIgMzJIOTZ2NjRjMCAxNy43IDE0LjMgMzIgMzIgMzJzMzItMTQuMyAzMi0zMlYzNTJjMC0xNy43LTE0LjMtMzItMzItMzJIMzJ6TTM1MiA2NGMwLTE3LjctMTQuMy0zMi0zMi0zMnMtMzIgMTQuMy0zMiAzMnY5NmMwIDE3LjcgMTQuMyAzMiAzMiAzMmg5NmMxNy43IDAgMzItMTQuMyAzMi0zMnMtMTQuMy0zMi0zMi0zMkgzNTJWNjR6TTMyMCAzMjBjLTE3LjcgMC0zMiAxNC4zLTMyIDMydjk2YzAgMTcuNyAxNC4zIDMyIDMyIDMyczMyLTE0LjMgMzItMzJWMzg0aDY0YzE3LjcgMCAzMi0xNC4zIDMyLTMycy0xNC4zLTMyLTMyLTMySDMyMHoiLz48L3N2Zz4=';
}
