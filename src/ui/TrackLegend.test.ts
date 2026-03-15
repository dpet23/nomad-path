import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TrackFeature, TripData } from '../data/types';
import { groupTracksByDay, TrackLegend } from './TrackLegend';
import type { UIContext } from './UIContext';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DAY_1 = '2024-03-15';
const DAY_2 = '2024-03-16';
const FLIGHT_DAY = 'flight-2024-03-14-syd-nrt';

const makeTrack = (day: string, name: string, overrides: Partial<TrackFeature['properties']> = {}): TrackFeature => ({
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
        day,
        defaultVisible: true,
        transportMode: 'drive',
        ...overrides,
    },
});

const makeTrip = (tracks: TrackFeature[]): TripData => ({
    type: 'FeatureCollection',
    metadata: { tripName: 'Test', attributeRanges: {} },
    features: tracks,
});

/** Spy references returned alongside the UIContext mock for assertion use. */
interface MockSpies {
    setTrackVisible: ReturnType<typeof vi.fn>;
    fitToTrack: ReturnType<typeof vi.fn>;
}

/** Create a minimal UIContext mock, returning the context and spy references. */
function mockCtx(trips: TripData[]): { ctx: UIContext; spies: MockSpies } {
    const setTrackVisible = vi.fn();
    const fitToTrack = vi.fn();
    return {
        ctx: {
            map: {} as UIContext['map'],
            layers: {
                isTrackVisible: vi.fn().mockReturnValue(true),
                setTrackVisible,
            } as unknown as UIContext['layers'],
            trips,
            fitToTrack,
            fitToPOI: vi.fn(),
        },
        spies: { setTrackVisible, fitToTrack },
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
// groupTracksByDay
// ---------------------------------------------------------------------------

describe('groupTracksByDay', () => {
    it('groups tracks by day key', () => {
        const tracks = [makeTrack(DAY_1, 'A'), makeTrack(DAY_1, 'B'), makeTrack(DAY_2, 'C')];
        const groups = groupTracksByDay(tracks);
        expect(groups).toHaveLength(2);
        expect(groups[0].tracks).toHaveLength(2);
        expect(groups[1].tracks).toHaveLength(1);
    });

    it('sorts groups chronologically by day key', () => {
        const tracks = [makeTrack(DAY_2, 'C'), makeTrack(DAY_1, 'A')];
        const groups = groupTracksByDay(tracks);
        expect(groups[0].day).toBe(DAY_1);
        expect(groups[1].day).toBe(DAY_2);
    });

    it('sorts tracks within a group by name', () => {
        const tracks = [makeTrack(DAY_1, 'Zebra'), makeTrack(DAY_1, 'Alpha')];
        const groups = groupTracksByDay(tracks);
        expect(groups[0].tracks[0].properties.name).toBe('Alpha');
        expect(groups[0].tracks[1].properties.name).toBe('Zebra');
    });

    it('labels regular days as "Day N — Mon DD"', () => {
        const groups = groupTracksByDay([makeTrack(DAY_1, 'A')]);
        expect(groups[0].label).toMatch(/^Day 1/);
        expect(groups[0].label).toContain('Mar');
    });

    it('labels flight-day keys as "Flight — Mon DD"', () => {
        const groups = groupTracksByDay([makeTrack(FLIGHT_DAY, 'SYD-NRT')]);
        expect(groups[0].label).toMatch(/^Flight/);
        expect(groups[0].label).toContain('Mar');
    });

    it('interleaves flight days chronologically with regular days', () => {
        const tracks = [makeTrack(DAY_1, 'A'), makeTrack(FLIGHT_DAY, 'SYD-NRT'), makeTrack(DAY_2, 'B')];
        const groups = groupTracksByDay(tracks);
        // flight-2024-03-14 sorts before 2024-03-15
        expect(groups[0].day).toBe(FLIGHT_DAY);
        expect(groups[1].day).toBe(DAY_1);
        expect(groups[2].day).toBe(DAY_2);
    });
});

// ---------------------------------------------------------------------------
// TrackLegend
// ---------------------------------------------------------------------------

const CHECKBOX_SEL = '.np-track-row__checkbox';

describe('TrackLegend', () => {
    it('renders a panel with day groups', () => {
        const c = setup();
        const trip = makeTrip([makeTrack(DAY_1, 'A'), makeTrack(DAY_2, 'B')]);
        const { ctx } = mockCtx([trip]);
        new TrackLegend(c, ctx);
        const groups = c.querySelectorAll('.np-day-group');
        expect(groups).toHaveLength(2);
    });

    it('renders a checkbox per track', () => {
        const c = setup();
        const trip = makeTrip([makeTrack(DAY_1, 'A'), makeTrack(DAY_1, 'B')]);
        const { ctx } = mockCtx([trip]);
        new TrackLegend(c, ctx);
        const checkboxes = c.querySelectorAll(CHECKBOX_SEL);
        expect(checkboxes).toHaveLength(2);
    });

    it('renders track names', () => {
        const c = setup();
        const trip = makeTrip([makeTrack(DAY_1, 'Morning Drive')]);
        const { ctx } = mockCtx([trip]);
        new TrackLegend(c, ctx);
        const name = c.querySelector('.np-track-row__name');
        expect(name?.textContent).toBe('Morning Drive');
    });

    it('renders transport mode emoji', () => {
        const c = setup();
        const trip = makeTrip([makeTrack(DAY_1, 'A', { transportMode: 'walk' })]);
        const { ctx } = mockCtx([trip]);
        new TrackLegend(c, ctx);
        const mode = c.querySelector('.np-track-row__mode');
        expect(mode?.textContent).toBe('\u{1F6B6}');
    });

    it('calls setTrackVisible when checkbox is toggled', () => {
        const c = setup();
        const trip = makeTrip([makeTrack(DAY_1, 'A')]);
        const { ctx, spies } = mockCtx([trip]);
        new TrackLegend(c, ctx);
        const checkbox = c.querySelector(CHECKBOX_SEL) as HTMLInputElement;
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change'));
        expect(spies.setTrackVisible).toHaveBeenCalledWith(`${DAY_1}::A`, false);
    });

    it('fires onVisibilityChange callback', () => {
        const c = setup();
        const trip = makeTrip([makeTrack(DAY_1, 'A')]);
        const onChange = vi.fn();
        const { ctx } = mockCtx([trip]);
        new TrackLegend(c, ctx, undefined, { onVisibilityChange: onChange });
        const checkbox = c.querySelector(CHECKBOX_SEL) as HTMLInputElement;
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event('change'));
        expect(onChange).toHaveBeenCalledWith(`${DAY_1}::A`, false);
    });

    it('fires onZoomToTrack when zoom button is clicked', () => {
        const c = setup();
        const trip = makeTrip([makeTrack(DAY_1, 'A')]);
        const { ctx, spies } = mockCtx([trip]);
        const onZoom = vi.fn();
        new TrackLegend(c, ctx, undefined, { onZoomToTrack: onZoom });
        const btn = c.querySelector('.np-track-row__action') as HTMLElement;
        btn.click();
        expect(spies.fitToTrack).toHaveBeenCalledWith(`${DAY_1}::A`);
        expect(onZoom).toHaveBeenCalledWith(`${DAY_1}::A`);
    });

    it('setCheckboxState updates checkbox checked state', () => {
        const c = setup();
        const trip = makeTrip([makeTrack(DAY_1, 'A')]);
        const { ctx } = mockCtx([trip]);
        const legend = new TrackLegend(c, ctx);
        const checkbox = c.querySelector(CHECKBOX_SEL) as HTMLInputElement;
        expect(checkbox.checked).toBe(true);
        legend.setCheckboxState(`${DAY_1}::A`, false);
        expect(checkbox.checked).toBe(false);
    });

    it('update() rebuilds the legend', () => {
        const c = setup();
        const trip = makeTrip([makeTrack(DAY_1, 'A')]);
        const { ctx } = mockCtx([trip]);
        const legend = new TrackLegend(c, ctx);
        expect(c.querySelectorAll('.np-track-row')).toHaveLength(1);
        legend.update();
        expect(c.querySelectorAll('.np-track-row')).toHaveLength(1);
    });

    it('clicking day header collapses the group', () => {
        const c = setup();
        const trip = makeTrip([makeTrack(DAY_1, 'A')]);
        const { ctx } = mockCtx([trip]);
        new TrackLegend(c, ctx);
        const header = c.querySelector('.np-day-header') as HTMLElement;
        header.click();
        const group = c.querySelector('.np-day-group');
        expect(group?.classList.contains('np-day-group--collapsed')).toBe(true);
    });

    it('accepts position config', () => {
        const c = setup();
        const trip = makeTrip([makeTrack(DAY_1, 'A')]);
        const { ctx } = mockCtx([trip]);
        new TrackLegend(c, ctx, { position: 'bottomleft' });
        expect(c.querySelector('.np-panel--bottomleft')).not.toBeNull();
    });
});
