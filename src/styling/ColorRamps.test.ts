import { describe, expect, it } from 'vitest';

import { buildColourExpression, getColourStops, TRANSPORT_MODE_COLOURS } from './ColorRamps';

// ---------------------------------------------------------------------------
// buildColourExpression
// ---------------------------------------------------------------------------

describe('buildColourExpression', () => {
    const ranges = {
        speed: { min: 0, max: 100, unit: 'km/h' },
        elevation: { min: 0, max: 1000, unit: 'm' },
    };

    it('returns a string for day mode with a single day (maxDayIndex 0)', () => {
        const result = buildColourExpression('day', ranges, 0);
        expect(typeof result).toBe('string');
    });

    it('returns an array expression for day mode with multiple days', () => {
        const result = buildColourExpression('day', ranges, 5);
        expect(Array.isArray(result)).toBe(true);
        expect((result as unknown[])[0]).toBe('interpolate-hcl');
    });

    it('returns a match expression for transportMode', () => {
        const result = buildColourExpression('transportMode', ranges, 0);
        expect(Array.isArray(result)).toBe(true);
        expect((result as unknown[])[0]).toBe('match');
    });

    it('returns a fallback colour when speed range is absent', () => {
        const result = buildColourExpression('speed', {}, 0);
        expect(typeof result).toBe('string');
    });

    it('returns an interpolate expression when speed range is present', () => {
        const result = buildColourExpression('speed', ranges, 0);
        expect(Array.isArray(result)).toBe(true);
        expect((result as unknown[])[0]).toBe('case');
    });

    it('returns an interpolate expression for elevation', () => {
        const result = buildColourExpression('elevation', ranges, 0);
        expect(Array.isArray(result)).toBe(true);
        expect((result as unknown[])[0]).toBe('case');
    });

    it('returns an interpolate expression for sunAngle', () => {
        const result = buildColourExpression('sunAngle', ranges, 0);
        expect(Array.isArray(result)).toBe(true);
        expect((result as unknown[])[0]).toBe('case');
    });

    it('speed expression uses flat colour when min === max (no degenerate interpolation)', () => {
        const equalRanges = { speed: { min: 50, max: 50, unit: 'km/h' } };
        const result = buildColourExpression('speed', equalRanges, 0) as unknown[];
        // Should be a case expression with no interpolation
        expect(result[0]).toBe('case');
        // The non-null branch should be a flat colour string, not an array
        expect(typeof result[3]).toBe('string');
    });

    it('elevation expression uses flat colour when min === max (no degenerate interpolation)', () => {
        const equalRanges = { elevation: { min: 100, max: 100, unit: 'm' } };
        const result = buildColourExpression('elevation', equalRanges, 0) as unknown[];
        expect(result[0]).toBe('case');
        expect(typeof result[3]).toBe('string');
    });
});

// ---------------------------------------------------------------------------
// TRANSPORT_MODE_COLOURS
// ---------------------------------------------------------------------------

describe('TRANSPORT_MODE_COLOURS', () => {
    it('covers the core transport modes', () => {
        expect(TRANSPORT_MODE_COLOURS).toHaveProperty('walk');
        expect(TRANSPORT_MODE_COLOURS).toHaveProperty('drive');
        expect(TRANSPORT_MODE_COLOURS).toHaveProperty('flight');
        expect(TRANSPORT_MODE_COLOURS).toHaveProperty('boat');
    });

    it('all values are hex colour strings', () => {
        for (const colour of Object.values(TRANSPORT_MODE_COLOURS)) {
            expect(colour).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
    });
});

// ---------------------------------------------------------------------------
// getColourStops
// ---------------------------------------------------------------------------

describe('getColourStops', () => {
    const ranges = {
        speed: { min: 0, max: 100, unit: 'km/h' },
        elevation: { min: 0, max: 1000, unit: 'm' },
    };

    it('returns 4 stops for multi-day rainbow', () => {
        const stops = getColourStops('day', ranges, 5);
        expect(stops).toHaveLength(4);
        expect(stops[0][0]).toBe(0);
        expect(stops[stops.length - 1][0]).toBe(1);
    });

    it('returns 2 identical stops for single-day', () => {
        const stops = getColourStops('day', ranges, 0);
        expect(stops).toHaveLength(2);
        expect(stops[0][1]).toBe(stops[1][1]);
    });

    it('returns 3 stops for speed', () => {
        const stops = getColourStops('speed', ranges, 0);
        expect(stops).toHaveLength(3);
    });

    it('returns grey fallback stops when speed range is absent', () => {
        const stops = getColourStops('speed', {}, 0);
        expect(stops[0][1]).toBe('#9E9E9E');
    });

    it('returns 3 stops for elevation', () => {
        const stops = getColourStops('elevation', ranges, 0);
        expect(stops).toHaveLength(3);
    });

    it('returns 11 stops for sunAngle (symmetric cycle)', () => {
        const stops = getColourStops('sunAngle', ranges, 0);
        expect(stops).toHaveLength(11);
        // First and last should be the same colour (midnight)
        expect(stops[0][1]).toBe(stops[10][1]);
    });

    it('sunAngle legend key colours match the map paint expression', () => {
        const stops = getColourStops('sunAngle', ranges, 0);
        const expr = buildColourExpression('sunAngle', ranges, 0) as unknown[];
        // Structure: ['case', null-check, MISSING, ['interpolate', ...]]
        const interp = expr[3] as unknown[];
        // interp = ['interpolate', ['linear'], ['get', 'sunValue'], 0, colour, ...]
        const mapStops = interp.slice(3);
        const mapColourAt = (angle: number) => {
            for (let i = 0; i < mapStops.length; i += 2) {
                if (mapStops[i] === angle) return mapStops[i + 1];
            }
            return undefined;
        };
        // Legend position → angle: 0→0, 0.25→90, 0.5→180, 0.75→270, 1.0→360
        expect(stops[0][1]).toBe(mapColourAt(0));
        expect(stops.find(s => s[0] === 0.25)?.[1]).toBe(mapColourAt(90));
        expect(stops.find(s => s[0] === 0.5)?.[1]).toBe(mapColourAt(180));
        expect(stops.find(s => s[0] === 0.75)?.[1]).toBe(mapColourAt(270));
        expect(stops.find(s => s[0] === 1.0)?.[1]).toBe(mapColourAt(360));
    });

    it('returns one stop per transport mode', () => {
        const stops = getColourStops('transportMode', ranges, 0);
        expect(stops.length).toBe(Object.keys(TRANSPORT_MODE_COLOURS).length);
    });
});
