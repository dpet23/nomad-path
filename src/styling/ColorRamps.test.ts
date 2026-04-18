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

    it('returns one stop per transport mode', () => {
        const stops = getColourStops('transportMode', ranges, 0);
        expect(stops.length).toBe(Object.keys(TRANSPORT_MODE_COLOURS).length);
    });
});
