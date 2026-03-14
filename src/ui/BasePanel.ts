import type { LegendPanelConfig } from '../data/types';

/**
 * Base class for positioned, collapsible legend panels.
 *
 * Creates a container `<div>` with a clickable header that toggles the body
 * visibility. Subclasses populate the body via {@link bodyEl}.
 */
export class BasePanel {
    readonly root: HTMLElement;
    readonly bodyEl: HTMLElement;
    private _collapsed: boolean;

    /**
     * Create a collapsible legend panel and append it to the map container.
     *
     * @param mapContainer - the map's container element (panels are positioned relative to it)
     * @param cssClass - additional CSS class for the panel root (e.g. `np-track-legend`)
     * @param title - header label text
     * @param config - optional position and collapsed state
     */
    constructor(mapContainer: HTMLElement, cssClass: string, title: string, config?: LegendPanelConfig) {
        const position = config?.position ?? 'topright';
        this._collapsed = config?.collapsed ?? false;

        this.root = document.createElement('div');
        this.root.className = `np-panel np-panel--${position} ${cssClass}`;
        if (this._collapsed) this.root.classList.add('np-panel--collapsed');

        const header = document.createElement('div');
        header.className = 'np-panel__header';
        header.innerHTML = `<span>${title}</span><span class="np-panel__toggle">\u25BC</span>`;
        header.addEventListener('click', () => this.toggle());
        this.root.appendChild(header);

        this.bodyEl = document.createElement('div');
        this.bodyEl.className = 'np-panel__body';
        this.root.appendChild(this.bodyEl);

        mapContainer.appendChild(this.root);
    }

    /** Toggle collapsed state. */
    toggle(): void {
        this._collapsed = !this._collapsed;
        this.root.classList.toggle('np-panel--collapsed', this._collapsed);
    }

    /** Whether the panel is currently collapsed. */
    get collapsed(): boolean {
        return this._collapsed;
    }

    /** Remove the panel from the DOM. */
    destroy(): void {
        this.root.remove();
    }
}
