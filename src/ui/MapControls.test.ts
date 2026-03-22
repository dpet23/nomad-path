import { afterEach, describe, expect, it, vi } from 'vitest';

import { BASEMAPS } from '../core/MapEngine';
import { MapControls } from './MapControls';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASEMAP_SEL = '.np-basemap-select';

let container: HTMLElement;

/** Create a fresh container attached to the DOM. */
function setup(): HTMLElement {
    container = document.createElement('div');
    document.body.appendChild(container);
    return container;
}

afterEach(() => {
    container?.remove();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MapControls', () => {
    it('renders a fit-to-visible button', () => {
        const c = setup();
        new MapControls(c, vi.fn(), vi.fn());
        expect(c.querySelector('.np-fit-btn')).not.toBeNull();
    });

    it('fit button calls onFit when clicked', () => {
        const c = setup();
        const onFit = vi.fn();
        new MapControls(c, onFit, vi.fn());
        (c.querySelector('.np-fit-btn') as HTMLElement).click();
        expect(onFit).toHaveBeenCalledOnce();
    });

    it('renders a basemap selector with one option per basemap', () => {
        const c = setup();
        new MapControls(c, vi.fn(), vi.fn());
        const options = c.querySelectorAll(`${BASEMAP_SEL} option`);
        expect(options).toHaveLength(Object.keys(BASEMAPS).length);
    });

    it('basemap options use BASEMAPS labels', () => {
        const c = setup();
        new MapControls(c, vi.fn(), vi.fn());
        const options = Array.from(c.querySelectorAll<HTMLOptionElement>(`${BASEMAP_SEL} option`));
        for (const [id, cfg] of Object.entries(BASEMAPS)) {
            const opt = options.find(o => o.value === id);
            expect(opt?.textContent).toBe(cfg.label);
        }
    });

    it('basemap selector shows the current basemap as selected', () => {
        const c = setup();
        new MapControls(c, vi.fn(), vi.fn(), 'blueMarble');
        const select = c.querySelector(BASEMAP_SEL) as HTMLSelectElement;
        expect(select.value).toBe('blueMarble');
    });

    it('basemap selector defaults to osm when no current basemap provided', () => {
        const c = setup();
        new MapControls(c, vi.fn(), vi.fn());
        const select = c.querySelector(BASEMAP_SEL) as HTMLSelectElement;
        expect(select.value).toBe('osm');
    });

    it('changing basemap selector calls onBasemap with the selected id', () => {
        const c = setup();
        const onBasemap = vi.fn();
        new MapControls(c, vi.fn(), onBasemap);
        const select = c.querySelector(BASEMAP_SEL) as HTMLSelectElement;
        select.value = 'blueMarble';
        select.dispatchEvent(new Event('change'));
        expect(onBasemap).toHaveBeenCalledWith('blueMarble');
    });

    it('destroy() removes the controls from the DOM', () => {
        const c = setup();
        const ctrl = new MapControls(c, vi.fn(), vi.fn());
        ctrl.destroy();
        expect(c.querySelector('.np-map-controls')).toBeNull();
    });
});
