import { describe, expect, it, vi } from 'vitest';

import type { TrackFeature, TripData } from '../contract/types';
import { COLOUR_ATTRIBUTE_REGISTRY } from '../styling/ColorRamps';
import { AttributeLegend } from './AttributeLegend';
import type { UIContext } from './UIContext';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SELECT_SEL = '.np-attr-select';
const CANVAS_SEL = '.np-colour-bar canvas';
const RANGE_LABEL_SEL = '.np-range-label';
const DAY = '2024-03-15';

/** Build a minimal TrackFeature fixture with the given elevations. */
function makeTrack(name: string, elevations: number[], visible = true): TrackFeature {
    return {
        type: 'Feature',
        geometry: {
            type: 'LineString',
            coordinates: [
                [0, 0],
                [1, 1],
            ],
        },
        properties: {
            type: 'track',
            name,
            day: DAY,
            defaultVisible: visible,
            transportMode: 'drive',
            elevations,
        },
    };
}

const makeTrip = (tracks: TrackFeature[] = []): TripData => ({
    type: 'FeatureCollection',
    metadata: { tripName: 'Test', attributeRanges: {} },
    features: tracks,
});

/** Spy references returned alongside the UIContext mock for assertion use. */
interface MockSpies {
    setColourAttribute: ReturnType<typeof vi.fn>;
    updateRanges: ReturnType<typeof vi.fn>;
}

/** Create a minimal UIContext mock, returning the context and spy references. */
function mockCtx(trips: TripData[] = [], visibleIds = new Set<string>()): { ctx: UIContext; spies: MockSpies } {
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
                get visibleIds() {
                    return visibleIds;
                },
                get maxDayIndex() {
                    return 0;
                },
            } as unknown as UIContext['layers'],
            trips,
            fitToTrack: vi.fn(),
            fitToTrackGroup: vi.fn(),
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
        select.value = 'speeds';
        select.dispatchEvent(new Event('change'));
        expect(spies.setColourAttribute).toHaveBeenCalledWith('speeds');
    });

    it('shows range label for elevation derived from visible track data', () => {
        const c = setup();
        const track = makeTrack('A', [0, 847]);
        const trip = makeTrip([track]);
        const visibleIds = new Set([`${DAY}::A`]);
        const { ctx } = mockCtx([trip], visibleIds);
        new AttributeLegend(c, ctx);
        const select = c.querySelector(SELECT_SEL) as HTMLSelectElement;
        select.value = 'elevations';
        select.dispatchEvent(new Event('change'));
        const label = c.querySelector(RANGE_LABEL_SEL);
        expect(label?.textContent).toMatch(/Elevation/);
        expect(label?.textContent).toMatch(/847/);
    });

    it('initial ranges exclude tracks hidden at load time', () => {
        // Hidden track has elevation up to 9999 — should not appear in the label.
        const c = setup();
        const visibleTrack = makeTrack('Visible', [0, 100]);
        const hiddenTrack = makeTrack('Hidden', [0, 9999], false);
        const trip = makeTrip([visibleTrack, hiddenTrack]);
        const visibleIds = new Set([`${DAY}::Visible`]);
        const { ctx } = mockCtx([trip], visibleIds);
        new AttributeLegend(c, ctx);
        const select = c.querySelector(SELECT_SEL) as HTMLSelectElement;
        select.value = 'elevations';
        select.dispatchEvent(new Event('change'));
        const label = c.querySelector(RANGE_LABEL_SEL);
        expect(label?.textContent).toMatch(/100/);
        expect(label?.textContent).not.toMatch(/9999/);
    });

    it('shows "no data" label for elevation when ranges absent', () => {
        const c = setup();
        const { ctx } = mockCtx();
        new AttributeLegend(c, ctx);
        const select = c.querySelector(SELECT_SEL) as HTMLSelectElement;
        select.value = 'elevations';
        select.dispatchEvent(new Event('change'));
        const label = c.querySelector(RANGE_LABEL_SEL);
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
        select.value = 'speeds';
        select.dispatchEvent(new Event('change'));
        expect(legend.attribute).toBe('speeds');
    });

    it('updateRanges refreshes the range label when elevation is selected', () => {
        // Start with a visible track, switch to elevation, then call updateRanges
        // with a different visible set — the label must reflect the new data.
        const c = setup();
        const trackA = makeTrack('A', [0, 500]);
        const trackB = makeTrack('B', [0, 1200]);
        const trip = makeTrip([trackA, trackB]);
        const visibleIds = new Set([`${DAY}::A`, `${DAY}::B`]);
        const { ctx } = mockCtx([trip], visibleIds);
        const legend = new AttributeLegend(c, ctx);

        // Switch to elevation so the label is visible
        const select = c.querySelector(SELECT_SEL) as HTMLSelectElement;
        select.value = 'elevations';
        select.dispatchEvent(new Event('change'));

        // Now hide track B — updateRanges should drop the max from 1200 to 500
        const onlyA = new Set([`${DAY}::A`]);
        legend.updateRanges(onlyA);

        const label = c.querySelector(RANGE_LABEL_SEL);
        expect(label?.textContent).toMatch(/500/);
        expect(label?.textContent).not.toMatch(/1200/);
    });

    it('updateRanges shows "no data" label when no tracks are visible', () => {
        const c = setup();
        const track = makeTrack('A', [0, 500]);
        const trip = makeTrip([track]);
        const visibleIds = new Set([`${DAY}::A`]);
        const { ctx } = mockCtx([trip], visibleIds);
        const legend = new AttributeLegend(c, ctx);

        const select = c.querySelector(SELECT_SEL) as HTMLSelectElement;
        select.value = 'elevations';
        select.dispatchEvent(new Event('change'));

        legend.updateRanges(new Set()); // nothing visible
        const label = c.querySelector(RANGE_LABEL_SEL);
        expect(label?.textContent).toBe('Elevation: no data');
    });

    it('accepts position config', () => {
        const c = setup();
        const { ctx } = mockCtx();
        new AttributeLegend(c, ctx, { position: 'bottomleft' });
        expect(c.querySelector('.np-panel--bottomleft')).not.toBeNull();
    });

    it('constructor calls layers.updateRanges to sync initial ranges with the map layer', () => {
        // Without this call, LayerManager._ranges stays at static merged metadata
        // until the first visibility toggle — causing wrong colours on initial load.
        const c = setup();
        const track = makeTrack('A', [0, 847]);
        const trip = makeTrip([track]);
        const visibleIds = new Set([`${DAY}::A`]);
        const { ctx, spies } = mockCtx([trip], visibleIds);
        new AttributeLegend(c, ctx);
        expect(spies.updateRanges).toHaveBeenCalledOnce();
    });

    it('updateRanges passes the computed ranges object to layers.updateRanges', () => {
        const c = setup();
        const track = makeTrack('A', [10, 500]);
        const trip = makeTrip([track]);
        const visibleIds = new Set([`${DAY}::A`]);
        const { ctx, spies } = mockCtx([trip], visibleIds);
        const legend = new AttributeLegend(c, ctx);
        spies.updateRanges.mockClear();
        legend.updateRanges(new Set([`${DAY}::A`]));
        // The data passed to LayerManager must contain the computed elevation range
        expect(spies.updateRanges).toHaveBeenCalledWith(
            expect.objectContaining({
                elevation: expect.objectContaining({ min: 10, max: 500 }),
            }),
        );
    });
});
