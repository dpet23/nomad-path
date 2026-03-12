import type { ExpressionSpecification } from 'maplibre-gl';

import type { AttributeRanges } from '../data/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported colour visualisation modes for track layers. */
export type ColourAttribute = 'day' | 'speed' | 'elevation' | 'sunAngle' | 'transportMode';

// MapLibre's ExpressionSpecification is a complex discriminated union that
// TypeScript cannot verify from manually-built array literals. We cast via
// unknown — the runtime values are valid MapLibre expressions.
export type MaplibreExpression = ExpressionSpecification | string;

/** Cast an unknown array literal to a MapLibre expression. */
const expr = (e: unknown): MaplibreExpression => e as MaplibreExpression;

// ---------------------------------------------------------------------------
// Transport mode colours (exported — usable by UI and colour expressions)
// ---------------------------------------------------------------------------

/**
 * Canonical colour map for transport modes.
 * Keys match the transportMode strings from TrackProperties.
 * The fallback colour is used for unknown/unlisted modes.
 */
export const TRANSPORT_MODE_COLOURS: Record<string, string> = {
    walk: '#4CAF50',
    drive: '#2196F3',
    flight: '#F44336',
    boat: '#00BCD4',
    cycling: '#FF9800',
    skiing: '#9C27B0',
};

/** Fallback colour for unrecognised transport modes. */
export const TRANSPORT_MODE_FALLBACK = '#9E9E9E';

/** Colour used for missing / null attribute data. */
export const MISSING_COLOUR = '#9E9E9E';

// ---------------------------------------------------------------------------
// Colour constants
// ---------------------------------------------------------------------------

// Rainbow spectrum: red (hue 0) at day 0, violet (hue 270) at the last day.
// Uses interpolate-hcl for perceptual uniformity across the hue range.
// Intermediate stops at 1/3 (green) and 2/3 (cyan) force HCL to take the
// 270° forward arc through yellow→green→cyan→blue rather than the short
// 90° backward path through magenta.
const DAY_COLOUR_START = 'hsl(0, 85%, 52%)'; // red
const DAY_COLOUR_MID1 = 'hsl(100, 72%, 38%)'; // green
const DAY_COLOUR_MID2 = 'hsl(200, 78%, 46%)'; // cyan-blue
const DAY_COLOUR_END = 'hsl(270, 85%, 52%)'; // violet

// Speed ramp
const SPEED_LOW = '#4CAF50';
const SPEED_MID = '#FFEB3B';
const SPEED_HIGH = '#F44336';

// Elevation ramp
const ELEV_LOW = '#2E7D32';
const ELEV_MID = '#FDD835';
const ELEV_HIGH = '#FFFFFF';

// Sun angle ramp
const SUN_MIDNIGHT = '#1A237E';
const SUN_HORIZON = '#FF6F00';
const SUN_NOON = '#FDD835';

// ---------------------------------------------------------------------------
// Colour stop generation (for legend gradient rendering)
// ---------------------------------------------------------------------------

/** A colour stop: [normalised position 0–1, CSS colour string]. */
export type ColourStop = [number, string];

/**
 * Return an array of colour stops for rendering a legend gradient.
 *
 * For continuous attributes the stops match the MapLibre interpolation.
 * For `transportMode`, returns one stop per mode (positions evenly spaced).
 * For `day`, returns the rainbow spectrum stops.
 */
export function getColourStops(attribute: ColourAttribute, ranges: AttributeRanges, maxDayIndex: number): ColourStop[] {
    switch (attribute) {
        case 'day':
            if (maxDayIndex === 0)
                return [
                    [0, DAY_COLOUR_START],
                    [1, DAY_COLOUR_START],
                ];
            return [
                [0, DAY_COLOUR_START],
                [1 / 3, DAY_COLOUR_MID1],
                [2 / 3, DAY_COLOUR_MID2],
                [1, DAY_COLOUR_END],
            ];

        case 'speed':
            if (!ranges.speed)
                return [
                    [0, MISSING_COLOUR],
                    [1, MISSING_COLOUR],
                ];
            return [
                [0, SPEED_LOW],
                [0.5, SPEED_MID],
                [1, SPEED_HIGH],
            ];

        case 'elevation':
            if (!ranges.elevation)
                return [
                    [0, MISSING_COLOUR],
                    [1, MISSING_COLOUR],
                ];
            return [
                [0, ELEV_LOW],
                [0.5, ELEV_MID],
                [1, ELEV_HIGH],
            ];

        case 'sunAngle':
            return [
                [0, SUN_MIDNIGHT],
                [0.25, SUN_HORIZON],
                [0.5, SUN_NOON],
                [0.75, SUN_HORIZON],
                [1, SUN_MIDNIGHT],
            ];

        case 'transportMode': {
            const entries = Object.entries(TRANSPORT_MODE_COLOURS);
            return entries.map(([, colour], i) => [i / Math.max(1, entries.length - 1), colour] as ColourStop);
        }
    }
}

// ---------------------------------------------------------------------------
// Colour expressions (for MapLibre paint properties)
// ---------------------------------------------------------------------------

/**
 * Build a MapLibre paint expression for the given colour attribute.
 *
 * @param attribute - which attribute to visualise
 * @param ranges - global min/max ranges from the GeoJSON metadata
 * @param maxDayIndex - highest day index in the data (for spectrum endpoints)
 */
export function buildColourExpression(
    attribute: ColourAttribute,
    ranges: AttributeRanges,
    maxDayIndex: number,
): MaplibreExpression {
    switch (attribute) {
        case 'day':
            // Single day: all red. Multi-day: spread across hue spectrum.
            if (maxDayIndex === 0) return DAY_COLOUR_START;
            return expr([
                'interpolate-hcl',
                ['linear'],
                ['get', 'dayIndex'],
                0,
                DAY_COLOUR_START,
                maxDayIndex * (1 / 3),
                DAY_COLOUR_MID1,
                maxDayIndex * (2 / 3),
                DAY_COLOUR_MID2,
                maxDayIndex,
                DAY_COLOUR_END,
            ]);

        case 'transportMode':
            return expr([
                'match',
                ['get', 'transportMode'],
                ...Object.entries(TRANSPORT_MODE_COLOURS).flat(),
                TRANSPORT_MODE_FALLBACK,
            ]);

        case 'speed': {
            const r = ranges.speed;
            if (!r) return MISSING_COLOUR;
            const mid = (r.min + r.max) / 2;
            return expr([
                'case',
                ['==', ['get', 'speedValue'], null],
                MISSING_COLOUR,
                ['interpolate', ['linear'], ['get', 'speedValue'], r.min, SPEED_LOW, mid, SPEED_MID, r.max, SPEED_HIGH],
            ]);
        }

        case 'elevation': {
            const r = ranges.elevation;
            if (!r) return MISSING_COLOUR;
            const mid = (r.min + r.max) / 2;
            return expr([
                'case',
                ['==', ['get', 'elevValue'], null],
                MISSING_COLOUR,
                ['interpolate', ['linear'], ['get', 'elevValue'], r.min, ELEV_LOW, mid, ELEV_MID, r.max, ELEV_HIGH],
            ]);
        }

        case 'sunAngle':
            return expr([
                'case',
                ['==', ['get', 'sunValue'], null],
                MISSING_COLOUR,
                [
                    'interpolate',
                    ['linear'],
                    ['get', 'sunValue'],
                    0,
                    SUN_MIDNIGHT,
                    90,
                    SUN_HORIZON,
                    180,
                    SUN_NOON,
                    270,
                    SUN_HORIZON,
                    360,
                    SUN_MIDNIGHT,
                ],
            ]);
    }
}
