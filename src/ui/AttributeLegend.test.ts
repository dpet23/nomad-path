import { describe, expect, it, vi } from 'vitest';

import type { TripData } from '../data/types';
import { COLOUR_ATTRIBUTE_REGISTRY } from '../styling/ColorRamps';
import { AttributeLegend } from './AttributeLegend';
import type { UIContext } from './UIContext';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SELECT_SEL = '.np-attr-select';
const CANVAS_SEL = '.np-colour-bar canvas';

const makeTrip = (ranges = {}): TripData => ({
    type: 'FeatureCollection',
    metadata: {
        tripName: 'Test',
        attributeRanges: ranges,
    },
    features: [],
});

/** Spy references returned alongside the UIContext mock for assertion use. */
interface MockSpies {
    setColourAttribute: ReturnType<typeof vi.fn>;
    updateRanges: ReturnType<typeof vi.fn>;
}

/** Create a minimal UIContext mock, returning the context and spy references. */
function mockCtx(trips: TripData[] = []): { ctx: UIContext; spies: MockSpies } {
    const setColourAttribute = vi.fn();
    const updateRanges = vi.fn();
    return {
        ctx: {
            map: {} as UIContext['map'],
            layers: {
                isTrackVisible: vi.fn().mockReturnValue(true),
                setTrackVisible: vi.fn(),
                setColourAttribute,
                updateRanges,
                get maxDayIndex() {
                    return 0;
                },
            } as unknown as UIContext['layers'],
            trips,
            fitToTrack: vi.fn(),
            fitToPOI: vi.fn(),
        },
        spies: { setColourAttribute, updateRanges },
    };
}

/** Create a fresh container attached to the DOM. */
function setup(): HTMLElement {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AttributeLegend', () => {
    it('renders a dropdown with one option per colour attribute', () => {
        const c = setup();
        const { ctx } = mockCtx();
        new AttributeLegend(c, ctx);
        const options = c.querySelectorAll('.np-attr-select option');
        expect(options).toHaveLength(Object.keys(COLOUR_ATTRIBUTE_REGISTRY).length);
    });

    it('dropdown options match the registry labels', () => {
        const c = setup();
        const { ctx } = mockCtx();
        new AttributeLegend(c, ctx);
        const options = Array.from(c.querySelectorAll<HTMLOptionElement>('.np-attr-select option'));
        for (const [value, meta] of Object.entries(COLOUR_ATTRIBUTE_REGISTRY)) {
            const opt = options.find(o => o.value === value);
            expect(opt?.textContent).toBe(meta.label);
        }
    });

    it('renders a canvas element for the colour bar', () => {
        const c = setup();
        const { ctx } = mockCtx();
        new AttributeLegend(c, ctx);
        expect(c.querySelector(CANVAS_SEL)).not.toBeNull();
    });

    it('shows canvas and hides mode list for non-categorical attributes', () => {
        const c = setup();
        const { ctx } = mockCtx();
        new AttributeLegend(c, ctx);
        const canvas = c.querySelector(CANVAS_SEL) as HTMLElement;
        const modeList = c.querySelector('.np-mode-list') as HTMLElement;
        expect(canvas.style.display).not.toBe('none');
        expect(modeList.style.display).toBe('none');
    });

    it('hides canvas and shows mode list when transportMode is selected', () => {
        const c = setup();
        const { ctx } = mockCtx();
        new AttributeLegend(c, ctx);
        const select = c.querySelector(SELECT_SEL) as HTMLSelectElement;
        select.value = 'transportMode';
        select.dispatchEvent(new Event('change'));
        const canvas = c.querySelector(CANVAS_SEL) as HTMLElement;
        const modeList = c.querySelector('.np-mode-list') as HTMLElement;
        expect(canvas.style.display).toBe('none');
        expect(modeList.style.display).toBe('block');
    });

    it('calls setColourAttribute on dropdown change', () => {
        const c = setup();
        const { ctx, spies } = mockCtx();
        new AttributeLegend(c, ctx);
        const select = c.querySelector(SELECT_SEL) as HTMLSelectElement;
        select.value = 'speed';
        select.dispatchEvent(new Event('change'));
        expect(spies.setColourAttribute).toHaveBeenCalledWith('speed');
    });

    it('shows range label for elevation when ranges present', () => {
        const c = setup();
        const { ctx } = mockCtx([makeTrip({ elevation: { min: 0, max: 847, unit: 'm' } })]);
        new AttributeLegend(c, ctx);
        const select = c.querySelector(SELECT_SEL) as HTMLSelectElement;
        select.value = 'elevation';
        select.dispatchEvent(new Event('change'));
        const label = c.querySelector('.np-range-label');
        expect(label?.textContent).toMatch(/Elevation/);
        expect(label?.textContent).toMatch(/847/);
    });

    it('shows "no data" label for elevation when ranges absent', () => {
        const c = setup();
        const { ctx } = mockCtx();
        new AttributeLegend(c, ctx);
        const select = c.querySelector(SELECT_SEL) as HTMLSelectElement;
        select.value = 'elevation';
        select.dispatchEvent(new Event('change'));
        const label = c.querySelector('.np-range-label');
        expect(label?.textContent).toBe('Elevation: no data');
    });

    it('updateRanges calls layers.updateRanges', () => {
        const c = setup();
        const { ctx, spies } = mockCtx();
        const legend = new AttributeLegend(c, ctx);
        legend.updateRanges(new Set());
        expect(spies.updateRanges).toHaveBeenCalled();
    });

    it('attribute getter returns selected attribute', () => {
        const c = setup();
        const { ctx } = mockCtx();
        const legend = new AttributeLegend(c, ctx);
        expect(legend.attribute).toBe('day');
        const select = c.querySelector(SELECT_SEL) as HTMLSelectElement;
        select.value = 'speed';
        select.dispatchEvent(new Event('change'));
        expect(legend.attribute).toBe('speed');
    });

    it('accepts position config', () => {
        const c = setup();
        const { ctx } = mockCtx();
        new AttributeLegend(c, ctx, { position: 'bottomleft' });
        expect(c.querySelector('.np-panel--bottomleft')).not.toBeNull();
    });
});
