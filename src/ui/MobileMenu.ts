import type { BasePanel } from './BasePanel';

// ---------------------------------------------------------------------------
// MobileMenu
// ---------------------------------------------------------------------------

/**
 * Responsive mobile menu: a hamburger button that opens a slide-in drawer
 * containing the legend panels. On desktop the drawer is hidden and panels
 * are positioned normally; on mobile the panels are moved into the drawer.
 */
export class MobileMenu {
    private readonly _container: HTMLElement;
    private readonly _panels: BasePanel[];
    private readonly _btn: HTMLButtonElement;
    private readonly _backdrop: HTMLDivElement;
    private readonly _drawer: HTMLDivElement;
    private readonly _mq: MediaQueryList;
    private _open = false;

    /**
     * Create the mobile menu and attach it to the map container.
     *
     * @param mapContainer - map container element
     * @param panels - legend panels to move into the mobile drawer
     */
    constructor(mapContainer: HTMLElement, panels: BasePanel[]) {
        this._container = mapContainer;
        this._panels = panels;

        // Hamburger button
        this._btn = document.createElement('button');
        this._btn.className = 'np-mobile-btn';
        this._btn.textContent = '\u2630';
        this._btn.title = 'Open navigation';
        this._btn.addEventListener('click', () => this._toggle());
        mapContainer.appendChild(this._btn);

        // Semi-transparent backdrop
        this._backdrop = document.createElement('div');
        this._backdrop.className = 'np-mobile-backdrop';
        this._backdrop.addEventListener('click', () => this._close());
        mapContainer.appendChild(this._backdrop);

        // Slide-in drawer
        this._drawer = document.createElement('div');
        this._drawer.className = 'np-mobile-drawer';
        mapContainer.appendChild(this._drawer);

        // Media query listener
        this._mq = window.matchMedia('(max-width: 768px)');
        this._mq.addEventListener('change', e => this._onMqChange(e.matches));
        this._onMqChange(this._mq.matches);
    }

    /** Clean up event listeners and restore panels to the map container. */
    destroy(): void {
        this._mq.removeEventListener('change', e => this._onMqChange(e.matches));
        this._restorePanels();
        this._btn.remove();
        this._backdrop.remove();
        this._drawer.remove();
    }

    /** Return true if the drawer is currently open. */
    get isOpen(): boolean {
        return this._open;
    }

    /** Move panels into the drawer (mobile) or back to the map container (desktop). */
    private _onMqChange(isMobile: boolean): void {
        if (isMobile) {
            for (const panel of this._panels) {
                this._drawer.appendChild(panel.root);
            }
        } else {
            this._restorePanels();
            this._close();
        }
    }

    /** Move panels back to the map container. */
    private _restorePanels(): void {
        for (const panel of this._panels) {
            this._container.appendChild(panel.root);
        }
    }

    /** Open the drawer. */
    private _openDrawer(): void {
        this._open = true;
        this._backdrop.classList.add('np-mobile-backdrop--open');
        this._drawer.classList.add('np-mobile-drawer--open');
    }

    /** Close the drawer. */
    private _close(): void {
        this._open = false;
        this._backdrop.classList.remove('np-mobile-backdrop--open');
        this._drawer.classList.remove('np-mobile-drawer--open');
    }

    /** Toggle drawer open/closed. */
    private _toggle(): void {
        if (this._open) {
            this._close();
        } else {
            this._openDrawer();
        }
    }
}
