import { describe, expect, it } from 'vitest';

import { BASEMAPS } from './MapEngine';

// MapLibre's Map requires WebGL — instantiation is not testable in happy-dom.
// Tests cover the pure configuration data and helper logic only.
// Full map init and layer interaction are covered by E2E tests.

describe('BASEMAPS config', () => {
    it('defines osm and blueMarble entries', () => {
        expect(BASEMAPS).toHaveProperty('osm');
        expect(BASEMAPS).toHaveProperty('blueMarble');
    });

    it('osm has higher maxZoom than blueMarble', () => {
        expect(BASEMAPS.osm.maxZoom).toBeGreaterThan(BASEMAPS.blueMarble.maxZoom);
    });

    it('both basemaps have minZoom 0', () => {
        expect(BASEMAPS.osm.minZoom).toBe(0);
        expect(BASEMAPS.blueMarble.minZoom).toBe(0);
    });

    it('blueMarble style is an inline object (no API key required)', () => {
        expect(typeof BASEMAPS.blueMarble.style).toBe('object');
    });

    it('osm style is a URL string', () => {
        expect(typeof BASEMAPS.osm.style).toBe('string');
    });

    it('all basemaps have attribution text', () => {
        for (const [, config] of Object.entries(BASEMAPS)) {
            expect(config.attribution.length).toBeGreaterThan(0);
        }
    });
});
