import { afterEach, describe, expect, it, vi } from 'vitest';

import type { POIFeature, TripData } from '../data/types';
import { groupPOIsByCategory, POILegend } from './POILegend';
import type { UIContext } from './UIContext';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makePOI = (category: string, name: string, label?: string): POIFeature => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [151.2, -33.8] },
    properties: { type: 'poi', category, name, label },
});

const makeTrip = (pois: POIFeature[]): TripData => ({
    type: 'FeatureCollection',
    metadata: { tripName: 'Test', attributeRanges: {} },
    features: pois,
});

/** Spy references returned alongside the UIContext mock for assertion use. */
interface MockSpies {
    fitToPOI: ReturnType<typeof vi.fn>;
}

/** Create a minimal UIContext mock, returning the context and spy references. */
function mockCtx(trips: TripData[]): { ctx: UIContext; spies: MockSpies } {
    const fitToPOI = vi.fn();
    return {
        ctx: {
            map: {} as UIContext['map'],
            layers: {} as UIContext['layers'],
            trips,
            fitToTrack: vi.fn(),
            fitToPOI,
        },
        spies: { fitToPOI },
    };
}

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
// groupPOIsByCategory
// ---------------------------------------------------------------------------

describe('groupPOIsByCategory', () => {
    it('groups POIs by category', () => {
        const trip = makeTrip([makePOI('hotel', 'A'), makePOI('hotel', 'B'), makePOI('beach', 'C')]);
        const groups = groupPOIsByCategory([trip]);
        expect(groups).toHaveLength(2);
        expect(groups[0].pois).toHaveLength(2);
        expect(groups[1].pois).toHaveLength(1);
    });

    it('preserves insertion order of categories', () => {
        const trip = makeTrip([makePOI('hotel', 'A'), makePOI('beach', 'B'), makePOI('hotel', 'C')]);
        const groups = groupPOIsByCategory([trip]);
        expect(groups[0].category).toBe('hotel');
        expect(groups[1].category).toBe('beach');
    });

    it('preserves insertion order of POIs within a category', () => {
        const trip = makeTrip([makePOI('hotel', 'First'), makePOI('hotel', 'Second')]);
        const groups = groupPOIsByCategory([trip]);
        expect(groups[0].pois[0].properties.name).toBe('First');
        expect(groups[0].pois[1].properties.name).toBe('Second');
    });

    it('returns empty array when no POIs exist', () => {
        expect(groupPOIsByCategory([makeTrip([])])).toHaveLength(0);
    });

    it('combines POIs across multiple trips', () => {
        const t1 = makeTrip([makePOI('hotel', 'A')]);
        const t2 = makeTrip([makePOI('beach', 'B')]);
        const groups = groupPOIsByCategory([t1, t2]);
        expect(groups).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// POILegend
// ---------------------------------------------------------------------------

describe('POILegend', () => {
    it('renders a category group per category', () => {
        const c = setup();
        const trip = makeTrip([makePOI('hotel', 'A'), makePOI('beach', 'B')]);
        const { ctx } = mockCtx([trip]);
        new POILegend(c, ctx);
        expect(c.querySelectorAll('.np-category-group')).toHaveLength(2);
    });

    it('renders groups collapsed by default', () => {
        const c = setup();
        const trip = makeTrip([makePOI('hotel', 'A')]);
        const { ctx } = mockCtx([trip]);
        new POILegend(c, ctx);
        expect(c.querySelector('.np-category-group--collapsed')).not.toBeNull();
    });

    it('renders POI names', () => {
        const c = setup();
        const trip = makeTrip([makePOI('hotel', 'Hilton')]);
        const { ctx } = mockCtx([trip]);
        new POILegend(c, ctx);
        const name = c.querySelector('.np-track-row__name');
        expect(name?.textContent).toBe('Hilton');
    });

    it('renders POI label when present', () => {
        const c = setup();
        const trip = makeTrip([makePOI('hotel', 'Hilton', 'A')]);
        const { ctx } = mockCtx([trip]);
        new POILegend(c, ctx);
        const label = c.querySelector('.np-track-row__mode');
        expect(label?.textContent).toBe('A');
    });

    it('omits label element when POI has no label', () => {
        const c = setup();
        const trip = makeTrip([makePOI('hotel', 'Hilton')]);
        const { ctx } = mockCtx([trip]);
        new POILegend(c, ctx);
        expect(c.querySelector('.np-track-row__mode')).toBeNull();
    });

    it('calls fitToPOI when zoom button is clicked', () => {
        const c = setup();
        const trip = makeTrip([makePOI('hotel', 'A')]);
        const { ctx, spies } = mockCtx([trip]);
        new POILegend(c, ctx);
        const btn = c.querySelector('.np-track-row__action') as HTMLElement;
        btn.click();
        expect(spies.fitToPOI).toHaveBeenCalledWith([151.2, -33.8], 15);
    });

    it('clicking category header toggles collapse', () => {
        const c = setup();
        const trip = makeTrip([makePOI('hotel', 'A')]);
        const { ctx } = mockCtx([trip]);
        new POILegend(c, ctx);
        const header = c.querySelector('.np-category-header') as HTMLElement;
        header.click();
        expect(c.querySelector('.np-category-group--collapsed')).toBeNull();
    });

    it('update() rebuilds the legend', () => {
        const c = setup();
        const trip = makeTrip([makePOI('hotel', 'A')]);
        const { ctx } = mockCtx([trip]);
        const legend = new POILegend(c, ctx);
        expect(c.querySelectorAll('.np-track-row')).toHaveLength(1);
        legend.update();
        expect(c.querySelectorAll('.np-track-row')).toHaveLength(1);
    });

    it('accepts position config', () => {
        const c = setup();
        const { ctx } = mockCtx([makeTrip([])]);
        new POILegend(c, ctx, { position: 'bottomright' });
        expect(c.querySelector('.np-panel--bottomright')).not.toBeNull();
    });
});
