import { type BasemapRegistry, BASEMAPS } from '../core/MapEngine';

// ---------------------------------------------------------------------------
// MapControls
// ---------------------------------------------------------------------------

/**
 * Lightweight map overlay controls: a fit-to-visible button and a basemap
 * selector. Both are positioned in the bottom-left corner of the map
 * container, below the legend panels.
 */
export class MapControls {
    private readonly _root: HTMLDivElement;

    /**
     * Create the fit button and basemap selector and append them to the map container.
     *
     * @param mapContainer - the map's container element
     * @param onFit        - called when the user clicks the fit-to-visible button
     * @param onBasemap    - called with the chosen basemap id when the selector changes
     * @param currentBasemap - the initially selected basemap id (defaults to 'osm')
     * @param basemaps     - the basemap registry to populate the selector from
     *                       (defaults to the built-in {@link BASEMAPS})
     */
    constructor(
        mapContainer: HTMLElement,
        onFit: () => void,
        onBasemap: (id: string) => void,
        currentBasemap = 'osm',
        basemaps: BasemapRegistry = BASEMAPS,
    ) {
        this._root = document.createElement('div');
        this._root.className = 'np-map-controls';

        const fitBtn = document.createElement('button');
        fitBtn.className = 'np-fit-btn';
        fitBtn.title = 'Fit to visible tracks';
        fitBtn.textContent = '\u26F6'; // ⛶ target/fit icon
        fitBtn.addEventListener('click', onFit);
        this._root.appendChild(fitBtn);

        const select = document.createElement('select');
        select.className = 'np-basemap-select';
        for (const [id, cfg] of Object.entries(basemaps)) {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = cfg.label;
            select.appendChild(opt);
        }
        select.value = currentBasemap;
        select.addEventListener('change', () => onBasemap(select.value));
        this._root.appendChild(select);

        mapContainer.appendChild(this._root);
    }

    /** Remove the controls from the DOM. */
    destroy(): void {
        this._root.remove();
    }
}
