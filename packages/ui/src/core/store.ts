import { PER_POINT_ATTRIBUTE_NAMES } from '@nomadpath/contract';
import { type Signal, signal } from '@preact/signals-core';

import { type DecodeResult, decodeTripData } from './decode.ts';

/**
 * The registry of attributes a track line can be colour-coded by: the
 * contract's per-point numeric attributes, plus the UI-only synthetic
 * `transportMode` attribute (not a per-point array in the contract; it is
 * derived by the UI itself). This is UI-side vocabulary, not contract
 * vocabulary, so it lives here rather than in `@nomadpath/contract`.
 */
export const COLOUR_ATTRIBUTES = [...PER_POINT_ATTRIBUTE_NAMES, 'transportMode'] as const;

/**
 * One value from the `COLOUR_ATTRIBUTES` registry: the attribute currently
 * used to colour-code track lines.
 */
export type ColourAttribute = (typeof COLOUR_ATTRIBUTES)[number];

/**
 * The UI core's reactive store: signals for the small set of mutable
 * application state, plus actions that update them. `data` is written once
 * per `load()` call and treated as immutable afterwards; `visibility`,
 * `selectedAttribute`, `activeBasemap`, and `hoveredItem` are the only
 * mutable surface, so computeds over `(data, selectedAttribute)` stay
 * isolated from hover/visibility churn. Map-agnostic and framework-agnostic:
 * this module imports only `@preact/signals-core` and `@nomadpath/contract`.
 */
export interface TripStore {
    /** The most recently decoded trip data, or `undefined` if `load` has never been called. */
    data: Signal<DecodeResult | undefined>;
    /** Per-item visibility, parallel to `data.items` when `data.ok` is true. */
    visibility: Signal<boolean[]>;
    /** The attribute currently used to colour-code track lines. */
    selectedAttribute: Signal<ColourAttribute>;
    /** The active basemap id; opaque to the core, defined by the basemap registry (phase 5). */
    activeBasemap: Signal<string>;
    /** The index of the currently hovered item, or `null` when nothing is hovered. */
    hoveredItem: Signal<number | null>;
    /**
     * Decodes `raw` via `decodeTripData` and stores the result. On success,
     * resets `visibility` to an all-true array sized to the decoded items and
     * clears `hoveredItem`. On failure, sets `visibility` to an empty array
     * and clears `hoveredItem`. Never resets `selectedAttribute` or
     * `activeBasemap`, which are user preferences rather than loaded data.
     */
    load(raw: unknown): void;
    /**
     * Sets the visibility of the item at `index`. Out-of-range indices are a
     * safe no-op, matching the library's never-crash guarantee.
     */
    setItemVisible(index: number, visible: boolean): void;
    /** Sets the attribute used to colour-code track lines. */
    setSelectedAttribute(attr: ColourAttribute): void;
    /** Sets the active basemap id. */
    setActiveBasemap(id: string): void;
    /** Sets or clears (`null`) the currently hovered item's index. */
    setHovered(index: number | null): void;
}

/**
 * Creates a fresh `TripStore` with its initial state: no data loaded, empty
 * visibility, `selectedAttribute` defaulted to `'transportMode'` (provisional
 * until a `day` attribute exists), `activeBasemap` defaulted to `''` (the
 * basemap registry is defined in phase 5), and no hovered item.
 */
export function createTripStore(): TripStore {
    const data = signal<DecodeResult | undefined>(undefined);
    const visibility = signal<boolean[]>([]);
    const selectedAttribute = signal<ColourAttribute>('transportMode');
    const activeBasemap = signal('');
    const hoveredItem = signal<number | null>(null);

    function load(raw: unknown): void {
        const result = decodeTripData(raw);
        data.value = result;
        visibility.value = result.ok ? result.items.map(() => true) : [];
        hoveredItem.value = null;
    }

    function setItemVisible(index: number, visible: boolean): void {
        const current = visibility.value;
        if (index < 0 || index >= current.length) {
            return;
        }
        visibility.value = current.map((existing, itemIndex) => (itemIndex === index ? visible : existing));
    }

    function setSelectedAttribute(attr: ColourAttribute): void {
        selectedAttribute.value = attr;
    }

    function setActiveBasemap(id: string): void {
        activeBasemap.value = id;
    }

    function setHovered(index: number | null): void {
        if (index !== null && (index < 0 || index >= visibility.value.length)) {
            return;
        }
        hoveredItem.value = index;
    }

    return {
        data,
        visibility,
        selectedAttribute,
        activeBasemap,
        hoveredItem,
        load,
        setItemVisible,
        setSelectedAttribute,
        setActiveBasemap,
        setHovered,
    };
}
