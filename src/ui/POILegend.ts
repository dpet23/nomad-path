import type { LegendPanelConfig, POIFeature, TripData } from '../data/types';
import { BasePanel } from './BasePanel';
import type { UIContext } from './UIContext';

// ---------------------------------------------------------------------------
// POI grouping
// ---------------------------------------------------------------------------

/** A group of POIs sharing the same category. */
export interface POIGroup {
    category: string;
    pois: POIFeature[];
}

/**
 * Group POIs by category, preserving insertion order for both categories
 * and POIs within each category.
 *
 * @param trips - trip data to extract POIs from
 */
export function groupPOIsByCategory(trips: TripData[]): POIGroup[] {
    const pois = trips.flatMap(t => t.features.filter((f): f is POIFeature => f.properties.type === 'poi'));
    const byCategory = new Map<string, POIFeature[]>();
    for (const poi of pois) {
        const cat = poi.properties.category;
        const arr = byCategory.get(cat);
        if (arr) {
            arr.push(poi);
        } else {
            byCategory.set(cat, [poi]);
        }
    }
    return [...byCategory.entries()].map(([category, p]) => ({ category, pois: p }));
}

// ---------------------------------------------------------------------------
// POILegend
// ---------------------------------------------------------------------------

/**
 * Legend panel listing POIs grouped by category with zoom-to-POI buttons.
 */
export class POILegend extends BasePanel {
    private readonly _ctx: UIContext;

    /**
     * Create and render the POI legend panel.
     *
     * @param mapContainer - map container element
     * @param ctx - shared UI context
     * @param config - panel position and collapsed state
     */
    constructor(mapContainer: HTMLElement, ctx: UIContext, config?: LegendPanelConfig) {
        super(mapContainer, 'np-poi-legend', 'Places', { position: 'bottomright', ...config });
        this._ctx = ctx;
        this._render();
    }

    /** Rebuild the legend contents from current data. */
    update(): void {
        this.bodyEl.innerHTML = '';
        this._render();
    }

    /** Build and append category-group elements for all POIs. */
    private _render(): void {
        const groups = groupPOIsByCategory(this._ctx.trips);
        for (const group of groups) {
            this._renderCategoryGroup(group);
        }
    }

    /** Render a collapsible category-group section (collapsed by default). */
    private _renderCategoryGroup(group: POIGroup): void {
        const wrapper = document.createElement('div');
        wrapper.className = 'np-category-group np-category-group--collapsed';

        const header = document.createElement('div');
        header.className = 'np-category-header np-category-header--collapsed';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'np-track-row__checkbox';
        checkbox.checked = this._ctx.layers.isPOICategoryVisible(group.category);
        checkbox.addEventListener('click', e => e.stopPropagation());
        checkbox.addEventListener('change', () => {
            this._ctx.layers.setPOICategoryVisible(group.category, checkbox.checked);
        });
        header.appendChild(checkbox);

        const toggle = document.createElement('span');
        toggle.className = 'np-toggle';
        toggle.textContent = '\u25BC';
        header.appendChild(toggle);

        const labelEl = document.createElement('span');
        labelEl.textContent = group.category;
        header.appendChild(labelEl);

        const zoomBtn = document.createElement('button');
        zoomBtn.className = 'np-track-row__action';
        zoomBtn.title = 'Zoom to category';
        zoomBtn.textContent = '\u{1F50D}';
        zoomBtn.addEventListener('click', e => {
            e.stopPropagation();
            const lngs = group.pois.map(p => p.geometry.coordinates[0]);
            const lats = group.pois.map(p => p.geometry.coordinates[1]);
            this._ctx.map.fitBounds(
                [
                    [Math.min(...lngs), Math.min(...lats)],
                    [Math.max(...lngs), Math.max(...lats)],
                ],
                { padding: 80, maxZoom: 15 },
            );
        });
        header.appendChild(zoomBtn);

        header.addEventListener('click', () => {
            wrapper.classList.toggle('np-category-group--collapsed');
            header.classList.toggle('np-category-header--collapsed');
        });
        wrapper.appendChild(header);

        for (const poi of group.pois) {
            this._renderPOIRow(wrapper, poi);
        }

        this.bodyEl.appendChild(wrapper);
    }

    /** Render a single POI row with swatch, optional label, name, and zoom button. */
    private _renderPOIRow(parent: HTMLElement, poi: POIFeature): void {
        const { name, label } = poi.properties;
        const [lng, lat] = poi.geometry.coordinates;

        const row = document.createElement('div');
        row.className = 'np-track-row';

        const swatch = document.createElement('span');
        swatch.className = 'np-poi-swatch';
        row.appendChild(swatch);

        if (label) {
            const labelEl = document.createElement('span');
            labelEl.className = 'np-track-row__mode';
            labelEl.textContent = label;
            row.appendChild(labelEl);
        }

        const nameEl = document.createElement('span');
        nameEl.className = 'np-track-row__name';
        nameEl.textContent = name;
        row.appendChild(nameEl);

        const zoomBtn = document.createElement('button');
        zoomBtn.className = 'np-track-row__action';
        zoomBtn.title = 'Zoom to place';
        zoomBtn.textContent = '\u{1F50D}';
        zoomBtn.addEventListener('click', e => {
            e.stopPropagation();
            this._ctx.fitToPOI([lng, lat], 15);
        });
        row.appendChild(zoomBtn);

        parent.appendChild(row);
    }
}
