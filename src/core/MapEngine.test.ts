import { describe, expect, it } from 'vitest';

import type { BasemapConfig } from './MapEngine';
import { BASEMAPS, resolveBasemap, resolveBasemaps } from './MapEngine';

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

describe('resolveBasemaps', () => {
    const custom: BasemapConfig = {
        label: 'Tile-free',
        style: { version: 8, sources: {}, layers: [] },
        minZoom: 0,
        maxZoom: 22,
        attribution: 'none',
    };
    // Pick an arbitrary built-in id without naming a specific one, so these
    // tests survive any future change to the default basemap set.
    const aBuiltinId = Object.keys(BASEMAPS)[0];

    it('returns all built-in basemaps when no custom basemaps are given', () => {
        const resolved = resolveBasemaps();
        for (const id of Object.keys(BASEMAPS)) {
            expect(resolved).toHaveProperty(id);
        }
    });

    it('merges custom basemaps alongside the built-ins', () => {
        const resolved = resolveBasemaps({ blank: custom });
        // Every built-in is still present...
        for (const id of Object.keys(BASEMAPS)) {
            expect(resolved).toHaveProperty(id);
        }
        // ...plus the custom one.
        expect(resolved.blank).toBe(custom);
    });

    it('lets a custom entry override a built-in id (consumer wins)', () => {
        const resolved = resolveBasemaps({ [aBuiltinId]: custom });
        expect(resolved[aBuiltinId]).toBe(custom);
    });

    it('does not mutate the built-in registry on override', () => {
        // A fresh resolve (no custom) reflects the untouched built-ins; it must
        // be unchanged after a resolve that overrode the same id.
        const before = resolveBasemaps()[aBuiltinId];
        resolveBasemaps({ [aBuiltinId]: custom });
        expect(resolveBasemaps()[aBuiltinId]).toBe(before);
    });
});

describe('resolveBasemap', () => {
    it('looks up a basemap by id from a registry', () => {
        const registry = resolveBasemaps();
        const id = Object.keys(registry)[0];
        expect(resolveBasemap(registry, id)).toBe(registry[id]);
    });

    it('throws a clear error for an unknown id', () => {
        const registry = resolveBasemaps();
        expect(() => resolveBasemap(registry, 'definitely-not-a-basemap')).toThrow(/unknown basemap/i);
    });
});
