import type { LineGeometry, PerPointAttribute, TripItem } from '@nomadpath/contract';
import { PER_POINT_ATTRIBUTE_NAMES } from '@nomadpath/contract';

interface ContinuousEntry {
    kind: 'continuous';
}

interface CategoricalEntry {
    kind: 'categorical';
    category: (item: TripItem) => string | undefined;
}

const continuousEntries: Record<PerPointAttribute, ContinuousEntry> = Object.fromEntries(
    PER_POINT_ATTRIBUTE_NAMES.map(name => [name, { kind: 'continuous' }]),
) as Record<PerPointAttribute, ContinuousEntry>;

/**
 * The registry of attributes a track line can be colour-coded by: the single
 * source of truth for both the set of valid attributes and how each is
 * dispatched. Each contract per-point numeric attribute (from
 * `PER_POINT_ATTRIBUTE_NAMES`) gets a `continuous` entry; the UI-only
 * synthetic `transportMode` (not a per-point array in the contract; derived
 * by the UI itself) gets a `categorical` entry carrying its category
 * extraction function. Adding a second categorical attribute means adding one
 * entry here, not widening a string-literal check at every dispatch site.
 * Palettes (colour scales) are deliberately NOT part of this registry: which
 * colours represent a domain or a category is a `(basemap x attribute)`
 * presentation concern, deferred to phase 5 where it is tuned against actual
 * visible basemaps.
 */
export const COLOUR_ATTRIBUTE_REGISTRY = {
    ...continuousEntries,
    transportMode: {
        kind: 'categorical',
        category: (item: TripItem): string | undefined => item.transportMode,
    } satisfies CategoricalEntry,
} as const satisfies Record<string, ContinuousEntry | CategoricalEntry>;

/**
 * One key from the `COLOUR_ATTRIBUTE_REGISTRY`: the attribute currently used
 * to colour-code track lines.
 */
export type ColourAttribute = keyof typeof COLOUR_ATTRIBUTE_REGISTRY;

/**
 * The standard neutral grey: the sole source of "no data" across every
 * attribute rendering (missing optional attribute, null point value, unknown
 * category, degenerate domain). Opaque so it composites the same as any
 * other rendered colour.
 */
export const NO_DATA_COLOUR: readonly [number, number, number, number] = [128, 128, 128, 255];

/**
 * The context an item needs to resolve its line colours: `domain` is the
 * continuous ramp's [min, max] over the VISIBLE items (adaptive - absent
 * when no visible item carries the attribute), and `categories` is the full
 * sorted-or-unsorted set of category values across ALL items (not just
 * visible ones), so a category's colour identity does not shuffle when its
 * item is hidden and re-shown.
 */
export interface ColourContext {
    domain?: [min: number, max: number];
    categories: readonly string[];
}

/**
 * Reports whether a geometry is a line geometry, the only geometry kind that
 * carries per-point attribute arrays.
 */
function isLineGeometry(geometry: TripItem['geometries'][number]): geometry is LineGeometry {
    return geometry.type === 'line';
}

/**
 * Computes the continuous colour domain for one per-point attribute over the
 * given items, ignoring null entries. The caller decides which items to
 * pass (typically the currently-visible ones, for the adaptive ramp); this
 * function has no visibility concept of its own. Returns `undefined` when no
 * item carries the attribute or every value is null, so a caller can tell
 * "no data at all" apart from a legitimate degenerate `[v, v]` domain.
 */
export function continuousDomain(items: TripItem[], attr: PerPointAttribute): [number, number] | undefined {
    const values = items.flatMap(item => item.geometries.filter(isLineGeometry).flatMap(line => line[attr] ?? []));
    return numericDomain(values);
}

/**
 * Computes the [min, max] of the non-null entries in `values`, or `undefined`
 * when every entry is null (or there are none): the shared reduction behind
 * `continuousDomain`, split out to keep that function's branching within the
 * cognitive-complexity budget.
 */
function numericDomain(values: readonly (number | null)[]): [number, number] | undefined {
    let min: number | undefined;
    let max: number | undefined;

    for (const value of values) {
        if (value === null) {
            continue;
        }
        min = min === undefined ? value : Math.min(min, value);
        max = max === undefined ? value : Math.max(max, value);
    }

    return min === undefined || max === undefined ? undefined : [min, max];
}

/**
 * Linearly interpolates between two colour stops, both endpoints inclusive.
 * The default (and, for phase 4, only) ramp: a low-to-high blue-to-orange
 * sequential scale, chosen for perceptual monotonicity and colour-blind
 * distinguishability; palette selection per basemap is deferred to phase 5.
 */
const RAMP_LOW: readonly [number, number, number] = [33, 102, 172];
const RAMP_HIGH: readonly [number, number, number] = [214, 96, 24];

/**
 * Maps one already-clamped [0, 1] fraction to an opaque RGBA colour along the
 * default sequential ramp.
 */
function rampColourAt(fraction: number): [number, number, number, number] {
    const [r0, g0, b0] = RAMP_LOW;
    const [r1, g1, b1] = RAMP_HIGH;
    return [r0 + (r1 - r0) * fraction, g0 + (g1 - g0) * fraction, b0 + (b1 - b0) * fraction, 255];
}

/**
 * Maps a sequence of nullable numeric values through a continuous domain to
 * an RGBA byte array, stride 4 per value. A `null` value, or a value under a
 * degenerate domain (`min === max`, where no fraction is well-defined), maps
 * to `NO_DATA_COLOUR`. Out-of-domain values clamp to the nearest endpoint
 * colour rather than extrapolating. Computed once per relevant state change
 * (never per frame) by the phase 5 renderer's binary-attribute path.
 */
export function rampColours(values: readonly (number | null)[], domain: [number, number]): Uint8ClampedArray {
    const result = new Uint8ClampedArray(values.length * 4);
    const [min, max] = domain;
    const span = max - min;

    values.forEach((value, index) => {
        const offset = index * 4;
        if (value === null || span === 0) {
            result.set(NO_DATA_COLOUR, offset);
            return;
        }
        const fraction = Math.min(1, Math.max(0, (value - min) / span));
        result.set(rampColourAt(fraction), offset);
    });

    return result;
}

/**
 * Generates a stable RGBA colour for one category out of a set of
 * categories: sorts the unique category values, then spaces hues evenly
 * around the colour wheel by sorted position. Stable under reordering of the
 * `categories` argument (only the sorted set matters) and under the
 * originating items' order, since colour identity must not shuffle when
 * items are hidden, shown, or reordered.
 */
export function categoricalColour(category: string, categories: readonly string[]): [number, number, number, number] {
    const unique = Array.from(new Set(categories)).sort((a, b) => a.localeCompare(b));
    const index = unique.indexOf(category);
    const position = index === -1 ? 0 : index;
    const hue = unique.length === 0 ? 0 : (position / unique.length) * 360;

    return hslToRgba(hue, 0.65, 0.5);
}

/**
 * Converts an HSL colour (hue in degrees, saturation/lightness in [0, 1]) to
 * an opaque RGBA byte tuple. A small self-contained conversion so this
 * module stays dependency-free per the ui-core import boundary.
 */
function hslToRgba(hue: number, saturation: number, lightness: number): [number, number, number, number] {
    const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const hPrime = hue / 60;
    const x = c * (1 - Math.abs((hPrime % 2) - 1));
    const m = lightness - c / 2;

    const [r, g, b] = rgbPrimeForHueSextant(hPrime, c, x);

    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255), 255];
}

/**
 * Maps `hPrime` (hue / 60, in [0, 6)) to the (r', g', b') triple for its
 * 60-degree sextant of the HSL-to-RGB conversion, per the standard formula.
 * Split out of `hslToRgba` so each branch has a single, direct assignment
 * (no intermediate dead store) and the parent function reads as one
 * expression.
 */
function rgbPrimeForHueSextant(hPrime: number, c: number, x: number): [number, number, number] {
    if (hPrime < 1) {
        return [c, x, 0];
    }
    if (hPrime < 2) {
        return [x, c, 0];
    }
    if (hPrime < 3) {
        return [0, c, x];
    }
    if (hPrime < 4) {
        return [0, x, c];
    }
    if (hPrime < 5) {
        return [x, 0, c];
    }
    return [c, 0, x];
}

/**
 * Computes one RGBA byte array per line geometry on `item`, coloured
 * according to `attr`, dispatching on the attribute's registry `kind` (never
 * on its name). A `categorical` attribute (e.g. `transportMode`) floods every
 * point of every line with the item's single category colour, extracted via
 * the registry entry's `category` function and coloured via
 * `categoricalColour` against `ctx.categories` (which spans ALL items so
 * identity survives visibility toggling); a missing category floods
 * `NO_DATA_COLOUR`. A `continuous` attribute maps each line's own values
 * through `ctx.domain` via `rampColours`; a missing `ctx.domain`, or a
 * missing attribute array on a given line, floods `NO_DATA_COLOUR` for that
 * line. Point and polygon geometries never receive line colours; an item
 * with no line geometries returns an empty array. The input item is never
 * mutated.
 */
export function itemLineColours(item: TripItem, attr: ColourAttribute, ctx: ColourContext): Uint8ClampedArray[] {
    const lines = item.geometries.filter(isLineGeometry);
    // Widened so an off-contract attr (reachable only past the type system)
    // resolves to undefined and falls through to the NO_DATA_COLOUR flood,
    // rather than the lookup being type-proven always-present.
    const registry: Partial<Record<string, (typeof COLOUR_ATTRIBUTE_REGISTRY)[ColourAttribute]>> =
        COLOUR_ATTRIBUTE_REGISTRY;
    const entry = registry[attr];

    if (entry?.kind === 'categorical') {
        const category = entry.category(item);
        const colour = category === undefined ? NO_DATA_COLOUR : categoricalColour(category, ctx.categories);
        return lines.map(line => floodColour(colour, line.lon.length));
    }

    return lines.map(line => {
        const values = isPerPointAttribute(attr) ? line[attr] : undefined;
        if (!values || !ctx.domain) {
            return floodColour(NO_DATA_COLOUR, line.lon.length);
        }
        return rampColours(values, ctx.domain);
    });
}

/**
 * Reports whether `attr` is one of the contract's per-point numeric
 * attributes (as opposed to a categorical registry entry like the
 * UI-only synthetic `transportMode`), so `itemLineColours` (and the store's
 * `visibleDomain` computed) can safely index a line geometry by it / pass it
 * to `continuousDomain`. Equivalent to checking the registry entry's `kind`,
 * but phrased as a type guard so callers get the narrowed `PerPointAttribute`
 * type rather than just a boolean.
 */
export function isPerPointAttribute(attr: ColourAttribute): attr is PerPointAttribute {
    return (PER_POINT_ATTRIBUTE_NAMES as readonly string[]).includes(attr);
}

/**
 * Fills an RGBA byte array of `pointCount` points, every point set to the
 * same colour: used for the categorical flood and for the NO_DATA_COLOUR
 * fallback when an attribute is missing or has no usable domain.
 */
function floodColour(colour: readonly [number, number, number, number], pointCount: number): Uint8ClampedArray {
    const result = new Uint8ClampedArray(pointCount * 4);
    for (let i = 0; i < pointCount; i += 1) {
        result.set(colour, i * 4);
    }
    return result;
}
