import type { AttributeRanges } from '../contract/types';
import { computeVisibleRanges } from '../core/AttributeRanges';
import type { LegendPanelConfig } from '../data/types';
import { profile } from '../profiling';
import {
    COLOUR_ATTRIBUTE_REGISTRY,
    type ColourAttribute,
    getColourStops,
    TRANSPORT_MODE_FALLBACK_INFO,
    TRANSPORT_MODES,
} from '../styling/ColorRamps';
import { BasePanel } from './BasePanel';
import type { UIContext } from './UIContext';

// ---------------------------------------------------------------------------
// AttributeLegend
// ---------------------------------------------------------------------------

/**
 * Legend panel with a colour-attribute dropdown, gradient colour scale,
 * and dynamic range label.
 */
export class AttributeLegend extends BasePanel {
    private readonly _ctx: UIContext;
    private _attribute: ColourAttribute = 'day';
    private _ranges: AttributeRanges;

    // DOM refs kept for efficient updates
    private _canvas!: HTMLCanvasElement;
    private _modeList!: HTMLDivElement;
    private _rangeLabel!: HTMLDivElement;

    /**
     * Create and render the attribute legend panel.
     *
     * @param mapContainer - map container element
     * @param ctx - shared UI context
     * @param config - panel position and collapsed state
     */
    constructor(mapContainer: HTMLElement, ctx: UIContext, config?: LegendPanelConfig) {
        super(mapContainer, 'np-attr-legend', 'Colour', { position: 'bottomleft', ...config });
        this._ctx = ctx;
        this._ranges = profile('nomadpath.computeVisibleRanges', () =>
            computeVisibleRanges(ctx.trips, ctx.layers.visibleIds),
        );
        ctx.layers.updateRanges(this._ranges);
        this._render();
    }

    /**
     * Recompute visible attribute ranges and refresh the legend display.
     * Call this whenever track visibility changes.
     *
     * @param visibleIds - set of currently visible track IDs
     */
    updateRanges(visibleIds: ReadonlySet<string>): void {
        this._ranges = profile('nomadpath.computeVisibleRanges', () =>
            computeVisibleRanges(this._ctx.trips, visibleIds),
        );
        this._ctx.layers.updateRanges(this._ranges);
        this._refreshScale();
    }

    /** Return the currently selected colour attribute. */
    get attribute(): ColourAttribute {
        return this._attribute;
    }

    /** Build the initial panel DOM. */
    private _render(): void {
        const select = document.createElement('select');
        select.className = 'np-attr-select';
        for (const [value, meta] of Object.entries(COLOUR_ATTRIBUTE_REGISTRY) as [
            ColourAttribute,
            { label: string },
        ][]) {
            const el = document.createElement('option');
            el.value = value;
            el.textContent = meta.label;
            select.appendChild(el);
        }
        select.value = this._attribute;
        select.addEventListener('change', () => {
            this._attribute = select.value as ColourAttribute;
            this._ctx.layers.setColourAttribute(this._attribute);
            this._refreshScale();
        });
        this.bodyEl.appendChild(select);

        const barWrapper = document.createElement('div');
        barWrapper.className = 'np-colour-bar';
        this._canvas = document.createElement('canvas');
        this._canvas.width = 240;
        this._canvas.height = 14;
        barWrapper.appendChild(this._canvas);
        this.bodyEl.appendChild(barWrapper);

        this._modeList = document.createElement('div');
        this._modeList.className = 'np-mode-list';
        this.bodyEl.appendChild(this._modeList);

        this._rangeLabel = document.createElement('div');
        this._rangeLabel.className = 'np-range-label';
        this.bodyEl.appendChild(this._rangeLabel);

        this._refreshScale();
    }

    /** Redraw the colour scale and range label for the current attribute and ranges. */
    private _refreshScale(): void {
        const isMode = this._attribute === 'transportMode';
        this._canvas.style.display = isMode ? 'none' : 'block';
        this._modeList.style.display = isMode ? 'block' : 'none';

        if (isMode) {
            this._renderModeList();
        } else {
            this._renderGradient();
        }

        this._renderRangeLabel();
    }

    /** Draw a linear gradient onto the canvas from the colour stops. */
    private _renderGradient(): void {
        const maxDayIndex = this._ctx.layers.maxDayIndex;
        const stops = getColourStops(this._attribute, this._ranges, maxDayIndex);
        const ctx = this._canvas.getContext('2d');
        if (!ctx) return;

        const w = this._canvas.width;
        const h = this._canvas.height;
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        for (const [pos, colour] of stops) {
            grad.addColorStop(pos, colour);
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    }

    /** Render a list of transport mode colour swatches. */
    private _renderModeList(): void {
        this._modeList.innerHTML = '';
        const allModes = [...Object.entries(TRANSPORT_MODES), ['other', TRANSPORT_MODE_FALLBACK_INFO]] as [
            string,
            (typeof TRANSPORT_MODES)[string],
        ][];
        for (const [, info] of allModes) {
            const item = document.createElement('div');
            item.className = 'np-mode-item';
            item.innerHTML =
                `<span class="np-track-row__swatch" style="background:${info.colour}"></span>` +
                `<span>${info.emoji} ${info.label}</span>`;
            this._modeList.appendChild(item);
        }
    }

    /** Update the range label text for the current attribute. */
    private _renderRangeLabel(): void {
        const r = this._ranges;
        switch (this._attribute) {
            case 'speeds':
                this._rangeLabel.textContent = r.speed
                    ? `Speed: ${r.speed.min.toFixed(0)} to ${r.speed.max.toFixed(0)} ${r.speed.unit ?? 'km/h'}`
                    : 'Speed: no data';
                break;
            case 'elevations': {
                const e = r.elevation;
                this._rangeLabel.textContent = e
                    ? `Elevation: ${e.min.toFixed(0)} to ${e.max.toFixed(0)} ${e.unit ?? 'm'}`
                    : 'Elevation: no data';
                break;
            }
            case 'sunAngles':
                this._rangeLabel.textContent = 'Daylight: morning → noon → evening';
                break;
            case 'day':
            case 'transportMode':
                this._rangeLabel.textContent = '';
                break;
        }
    }
}
