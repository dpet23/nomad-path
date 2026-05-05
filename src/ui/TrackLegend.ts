import type { TrackFeature } from '../../schema/types';
import { deriveTrackId, extractTracks } from '../core/DataLoader';
import type { LegendPanelConfig } from '../data/types';
import { TRANSPORT_MODE_FALLBACK_INFO, TRANSPORT_MODES } from '../styling/ColorRamps';
import { BasePanel } from './BasePanel';
import type { UIContext } from './UIContext';

// ---------------------------------------------------------------------------
// Day label formatting
// ---------------------------------------------------------------------------

const DATE_FMT = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });

/** Format an ISO date string (or flight-day key) as "Mar 15". */
function formatDayLabel(isoDay: string): string {
    // Flight-day keys: "flight-YYYY-MM-DD-slug" — extract the date part.
    const match = isoDay.match(/^flight-(\d{4}-\d{2}-\d{2})/);
    const dateStr = match ? match[1] : isoDay;
    const [y, m, d] = dateStr.split('-').map(Number);
    return DATE_FMT.format(new Date(y, m - 1, d));
}

/** Return true if the day key represents a flight. */
function isFlightDay(day: string): boolean {
    return day.startsWith('flight-');
}

// ---------------------------------------------------------------------------
// Track grouping
// ---------------------------------------------------------------------------

/** A group of tracks sharing the same day key. */
export interface DayGroup {
    day: string;
    label: string;
    tracks: TrackFeature[];
}

/**
 * Group tracks by day, sorted chronologically.
 * Flight-day keys sort alongside regular ISO dates.
 */
export function groupTracksByDay(tracks: TrackFeature[]): DayGroup[] {
    const byDay = new Map<string, TrackFeature[]>();
    for (const t of tracks) {
        const day = t.properties.day;
        const arr = byDay.get(day);
        if (arr) {
            arr.push(t);
        } else {
            byDay.set(day, [t]);
        }
    }

    const days = [...byDay.keys()];
    let dayNum = 0;

    return days.map(day => {
        const grouped = byDay.get(day)!;

        if (!isFlightDay(day)) dayNum++;
        const prefix = isFlightDay(day) ? 'Flight' : `Day ${dayNum}`;
        const label = `${prefix} \u2014 ${formatDayLabel(day)}`;

        return { day, label, tracks: grouped };
    });
}

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

/** Callbacks for TrackLegend interactions. */
export interface TrackLegendCallbacks {
    onVisibilityChange?: (trackId: string, visible: boolean) => void;
    onZoomToTrack?: (trackId: string) => void;
}

// ---------------------------------------------------------------------------
// TrackLegend
// ---------------------------------------------------------------------------

/**
 * Legend panel listing tracks grouped by day with visibility checkboxes
 * and zoom-to-track buttons.
 */
export class TrackLegend extends BasePanel {
    private readonly _ctx: UIContext;
    private readonly _callbacks: TrackLegendCallbacks;
    private readonly _checkboxes = new Map<string, HTMLInputElement>();

    /**
     * Create and render the track legend panel.
     *
     * @param mapContainer - map container element
     * @param ctx - shared UI context
     * @param config - panel position and collapsed state
     * @param callbacks - optional interaction callbacks
     */
    constructor(
        mapContainer: HTMLElement,
        ctx: UIContext,
        config?: LegendPanelConfig,
        callbacks?: TrackLegendCallbacks,
    ) {
        super(mapContainer, 'np-track-legend', 'Tracks', config);
        this._ctx = ctx;
        this._callbacks = callbacks ?? {};
        this._render();
    }

    /** Rebuild the legend contents from current data. */
    update(): void {
        this.bodyEl.innerHTML = '';
        this._checkboxes.clear();
        this._render();
    }

    /** Update a checkbox to match external visibility changes. */
    setCheckboxState(trackId: string, visible: boolean): void {
        const cb = this._checkboxes.get(trackId);
        if (cb) cb.checked = visible;
    }

    /** Build and append day-group elements for all tracks. */
    private _render(): void {
        const tracks = extractTracks(this._ctx.trips);
        const groups = groupTracksByDay(tracks);

        for (const group of groups) {
            this._renderDayGroup(group);
        }
    }

    /** Render a collapsible day-group section. */
    private _renderDayGroup(group: DayGroup): void {
        const trackIds = group.tracks.map(t => deriveTrackId(t));

        const wrapper = document.createElement('div');
        wrapper.className = 'np-day-group np-day-group--collapsed';

        const header = document.createElement('div');
        header.className = 'np-day-header np-day-header--collapsed';

        // Group visibility checkbox — tristate
        const groupCheckbox = document.createElement('input');
        groupCheckbox.type = 'checkbox';
        groupCheckbox.className = 'np-track-row__checkbox';
        const updateGroupCheckbox = () => {
            const visibleCount = trackIds.filter(id => this._ctx.layers.isTrackVisible(id)).length;
            groupCheckbox.checked = visibleCount > 0;
            groupCheckbox.indeterminate = visibleCount > 0 && visibleCount < trackIds.length;
        };
        updateGroupCheckbox();
        groupCheckbox.addEventListener('click', e => e.stopPropagation());
        groupCheckbox.addEventListener('change', () => {
            for (const id of trackIds) {
                this._ctx.layers.setTrackVisible(id, groupCheckbox.checked);
                const cb = this._checkboxes.get(id);
                if (cb) {
                    cb.checked = groupCheckbox.checked;
                    const btn = cb.closest('.np-track-row')?.querySelector<HTMLButtonElement>('.np-track-row__action');
                    if (btn) btn.disabled = !groupCheckbox.checked;
                }
            }
            this._callbacks.onVisibilityChange?.(trackIds[0] ?? '', groupCheckbox.checked);
        });
        header.appendChild(groupCheckbox);

        const toggle = document.createElement('span');
        toggle.className = 'np-toggle';
        toggle.textContent = '\u25BC';
        header.appendChild(toggle);

        const label = document.createElement('span');
        label.textContent = group.label;
        header.appendChild(label);

        const zoomBtn = document.createElement('button');
        zoomBtn.className = 'np-track-row__action';
        zoomBtn.title = 'Zoom to day';
        zoomBtn.textContent = '\u{1F50D}';
        zoomBtn.addEventListener('click', e => {
            e.stopPropagation();
            this._ctx.fitToTrackGroup(trackIds);
        });
        header.appendChild(zoomBtn);

        header.addEventListener('click', () => {
            wrapper.classList.toggle('np-day-group--collapsed');
            header.classList.toggle('np-day-header--collapsed');
        });
        wrapper.appendChild(header);

        for (const track of group.tracks) {
            this._renderTrackRow(wrapper, track, updateGroupCheckbox);
        }

        this.bodyEl.appendChild(wrapper);
    }

    /** Render a single track row with checkbox, name, mode emoji, and zoom button. */
    private _renderTrackRow(parent: HTMLElement, track: TrackFeature, onGroupUpdate?: () => void): void {
        const trackId = deriveTrackId(track);
        const { name, transportMode } = track.properties;
        const visible = this._ctx.layers.isTrackVisible(trackId);
        const modeInfo = TRANSPORT_MODES[transportMode ?? ''] ?? TRANSPORT_MODE_FALLBACK_INFO;

        const row = document.createElement('div');
        row.className = 'np-track-row';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'np-track-row__checkbox';
        checkbox.checked = visible;
        this._checkboxes.set(trackId, checkbox);
        row.appendChild(checkbox);

        const nameEl = document.createElement('span');
        nameEl.className = 'np-track-row__name';
        nameEl.textContent = name;
        row.appendChild(nameEl);

        const modeEl = document.createElement('span');
        modeEl.className = 'np-track-row__mode';
        modeEl.textContent = modeInfo.emoji;
        modeEl.title = modeInfo.label;
        row.appendChild(modeEl);

        const zoomBtn = document.createElement('button');
        zoomBtn.className = 'np-track-row__action';
        zoomBtn.title = 'Zoom to track';
        zoomBtn.textContent = '\u{1F50D}';
        zoomBtn.disabled = !visible;
        checkbox.addEventListener('change', () => {
            this._ctx.layers.setTrackVisible(trackId, checkbox.checked);
            zoomBtn.disabled = !checkbox.checked;
            onGroupUpdate?.();
            this._callbacks.onVisibilityChange?.(trackId, checkbox.checked);
        });
        zoomBtn.addEventListener('click', e => {
            e.stopPropagation();
            this._ctx.fitToTrack(trackId);
            this._callbacks.onZoomToTrack?.(trackId);
        });
        row.appendChild(zoomBtn);

        parent.appendChild(row);
    }
}
