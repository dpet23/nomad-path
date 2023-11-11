import './_ControlFullscreen.scss';

import L from 'leaflet';

import ControlAbstractButton from '../ControlAbstractButton';

/**
 * Leaflet Control for togging fullscreen mode for the map.
 */
export default class ControlFullScreen extends ControlAbstractButton {
    private fullscreenButton?: HTMLAnchorElement;

    private classButtonContainer = 'leaflet-control-fullscreen';
    private classFaExpand = 'fa-expand';
    private classFaCompress = 'fa-compress';

    /**
     * Callback function to define the Control's elements and their behaviour.
     *
     * Called by Leaflet when adding the Control to a Map.
     *
     * @param _map - (Unused) The Leaflet Map.
     * @return The Control's container element.
     */
    onAdd = (_map: L.Map): HTMLDivElement => {
        let container: HTMLDivElement;
        [container, this.fullscreenButton] = this.createButton({
            containerClass: this.classButtonContainer,
            title: 'Toggle fullscreen',
            onClick: this.toggleFullScreen,
        });

        // Set the initial icon.
        this.fullscreenButton.classList.add(this.classFaExpand);

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
        L.DomEvent.preventDefault(event); // Prevent default action (navigating to a link).

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
}
