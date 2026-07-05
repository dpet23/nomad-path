import { buildLineGeometry, buildTrackItem, buildTripData, buildWaypointItem } from '@nomadpath/contract';
import { computed } from '@preact/signals-core';
import { describe, expect, it } from 'vitest';

import { NO_DATA_COLOUR } from '../src/core/colour.ts';
import { COLOUR_ATTRIBUTES, createTripStore } from '../src/core/store.ts';

describe('COLOUR_ATTRIBUTES', () => {
    it('lists the per-point attributes followed by transportMode', () => {
        expect(COLOUR_ATTRIBUTES).toEqual(['ele', 'speed', 'transportMode']);
    });
});

describe('createTripStore', () => {
    it('starts with data undefined (not loaded)', () => {
        const store = createTripStore();

        expect(store.data.value).toBeUndefined();
    });

    it('starts with an empty visibility array', () => {
        const store = createTripStore();

        expect(store.visibility.value).toEqual([]);
    });

    it("starts with selectedAttribute 'transportMode'", () => {
        const store = createTripStore();

        expect(store.selectedAttribute.value).toBe('transportMode');
    });

    it("starts with activeBasemap ''", () => {
        const store = createTripStore();

        expect(store.activeBasemap.value).toBe('');
    });

    it('starts with hoveredItem null', () => {
        const store = createTripStore();

        expect(store.hoveredItem.value).toBeNull();
    });

    describe('load', () => {
        it('sets data on a valid payload', () => {
            const store = createTripStore();
            const raw = buildTripData({ items: [buildTrackItem(), buildWaypointItem()] });

            store.load(raw);

            expect(store.data.value).toEqual({
                ok: true,
                name: 'Fictional Archipelago 2030',
                items: [buildTrackItem(), buildWaypointItem()],
                notices: [],
            });
        });

        it('sets visibility to all-true, sized to the decoded items, on a valid payload', () => {
            const store = createTripStore();
            const raw = buildTripData({ items: [buildTrackItem(), buildWaypointItem()] });

            store.load(raw);

            expect(store.visibility.value).toEqual([true, true]);
        });

        it('sets visibility to an empty array when the decoded payload has no items', () => {
            const store = createTripStore();
            const raw = buildTripData({ items: [] });

            store.load(raw);

            expect(store.visibility.value).toEqual([]);
        });

        it('resets hoveredItem to null on a valid payload, even if previously set', () => {
            const store = createTripStore();
            store.load(buildTripData({ items: [buildTrackItem(), buildWaypointItem()] }));
            store.setHovered(1);
            expect(store.hoveredItem.value).toBe(1);

            store.load(buildTripData());

            expect(store.hoveredItem.value).toBeNull();
        });

        it('sets data to the failed result on a failing payload', () => {
            const store = createTripStore();

            store.load({ not: 'trip data' });

            expect(store.data.value).toEqual({ ok: false, reason: expect.any(String) as string });
        });

        it('sets visibility to an empty array on a failing payload', () => {
            const store = createTripStore();
            store.load(buildTripData());

            store.load({ not: 'trip data' });

            expect(store.visibility.value).toEqual([]);
        });

        it('resets hoveredItem to null on a failing payload, even if previously set', () => {
            const store = createTripStore();
            store.load(buildTripData());
            store.setHovered(0);

            store.load({ not: 'trip data' });

            expect(store.hoveredItem.value).toBeNull();
        });

        it('does not reset selectedAttribute on load', () => {
            const store = createTripStore();
            store.setSelectedAttribute('ele');

            store.load(buildTripData());

            expect(store.selectedAttribute.value).toBe('ele');
        });

        it('does not reset activeBasemap on load', () => {
            const store = createTripStore();
            store.setActiveBasemap('satellite');

            store.load(buildTripData());

            expect(store.activeBasemap.value).toBe('satellite');
        });
    });

    describe('setItemVisible', () => {
        it('flips a single index to false, leaving other indices unchanged', () => {
            const store = createTripStore();
            store.load(buildTripData({ items: [buildTrackItem(), buildWaypointItem()] }));

            store.setItemVisible(1, false);

            expect(store.visibility.value).toEqual([true, false]);
        });

        it('flips a single index back to true', () => {
            const store = createTripStore();
            store.load(buildTripData({ items: [buildTrackItem(), buildWaypointItem()] }));
            store.setItemVisible(1, false);

            store.setItemVisible(1, true);

            expect(store.visibility.value).toEqual([true, true]);
        });

        it('replaces the array by reference rather than mutating in place', () => {
            const store = createTripStore();
            store.load(buildTripData({ items: [buildTrackItem(), buildWaypointItem()] }));
            const before = store.visibility.value;

            store.setItemVisible(0, false);

            expect(store.visibility.value).not.toBe(before);
        });

        it('is a safe no-op for a negative out-of-range index', () => {
            const store = createTripStore();
            store.load(buildTripData({ items: [buildTrackItem(), buildWaypointItem()] }));

            expect(() => {
                store.setItemVisible(-1, false);
            }).not.toThrow();
            expect(store.visibility.value).toEqual([true, true]);
        });

        it('is a safe no-op for an index past the end', () => {
            const store = createTripStore();
            store.load(buildTripData({ items: [buildTrackItem(), buildWaypointItem()] }));

            expect(() => {
                store.setItemVisible(5, false);
            }).not.toThrow();
            expect(store.visibility.value).toEqual([true, true]);
        });

        it('is a safe no-op when nothing has been loaded yet', () => {
            const store = createTripStore();

            expect(() => {
                store.setItemVisible(0, false);
            }).not.toThrow();
            expect(store.visibility.value).toEqual([]);
        });
    });

    describe('setSelectedAttribute', () => {
        it('updates selectedAttribute to a per-point attribute', () => {
            const store = createTripStore();

            store.setSelectedAttribute('speed');

            expect(store.selectedAttribute.value).toBe('speed');
        });

        it("updates selectedAttribute back to 'transportMode'", () => {
            const store = createTripStore();
            store.setSelectedAttribute('ele');

            store.setSelectedAttribute('transportMode');

            expect(store.selectedAttribute.value).toBe('transportMode');
        });
    });

    describe('setActiveBasemap', () => {
        it('updates activeBasemap to the given opaque id', () => {
            const store = createTripStore();

            store.setActiveBasemap('terrain');

            expect(store.activeBasemap.value).toBe('terrain');
        });

        it('accepts an empty string as a valid id', () => {
            const store = createTripStore();
            store.setActiveBasemap('terrain');

            store.setActiveBasemap('');

            expect(store.activeBasemap.value).toBe('');
        });
    });

    describe('setHovered', () => {
        it('sets hoveredItem to a valid index', () => {
            const store = createTripStore();
            store.load(buildTripData({ items: [buildTrackItem(), buildWaypointItem()] }));

            store.setHovered(1);

            expect(store.hoveredItem.value).toBe(1);
        });

        it('clears hoveredItem back to null', () => {
            const store = createTripStore();
            store.load(buildTripData({ items: [buildTrackItem(), buildWaypointItem()] }));
            store.setHovered(1);

            store.setHovered(null);

            expect(store.hoveredItem.value).toBeNull();
        });

        it('is a safe no-op (leaves hoveredItem unchanged) for an out-of-range index', () => {
            const store = createTripStore();
            store.load(buildTripData({ items: [buildTrackItem()] }));
            store.setHovered(0);

            store.setHovered(99);

            expect(store.hoveredItem.value).toBe(0);
        });

        it('keeps hoveredItem null as a safe no-op when called with an out-of-range index from the initial state', () => {
            const store = createTripStore();
            store.load(buildTripData({ items: [buildTrackItem()] }));

            store.setHovered(99);

            expect(store.hoveredItem.value).toBeNull();
        });

        it('accepts null even when nothing has been loaded', () => {
            const store = createTripStore();

            expect(() => {
                store.setHovered(null);
            }).not.toThrow();
            expect(store.hoveredItem.value).toBeNull();
        });
    });

    describe('visibleDomain', () => {
        it('is undefined before anything is loaded', () => {
            const store = createTripStore();
            store.setSelectedAttribute('ele');

            expect(store.visibleDomain.value).toBeUndefined();
        });

        it('is undefined for the transportMode attribute', () => {
            const store = createTripStore();
            store.load(
                buildTripData({
                    items: [
                        buildTrackItem({
                            geometries: [buildLineGeometry({ lon: [1, 2], lat: [1, 2], ele: [100, 200] })],
                        }),
                    ],
                }),
            );

            expect(store.visibleDomain.value).toBeUndefined();
        });

        it('computes the domain over all items when all are visible', () => {
            const store = createTripStore();
            store.load(
                buildTripData({
                    items: [
                        buildTrackItem({
                            name: 'A',
                            geometries: [buildLineGeometry({ lon: [1, 2], lat: [1, 2], ele: [100, 150] })],
                        }),
                        buildTrackItem({
                            name: 'B',
                            geometries: [buildLineGeometry({ lon: [1, 2], lat: [1, 2], ele: [90, 400] })],
                        }),
                    ],
                }),
            );
            store.setSelectedAttribute('ele');

            expect(store.visibleDomain.value).toEqual([90, 400]);
        });

        it('shrinks the domain when the item carrying the max value is hidden', () => {
            const store = createTripStore();
            store.load(
                buildTripData({
                    items: [
                        buildTrackItem({
                            name: 'A',
                            geometries: [buildLineGeometry({ lon: [1, 2], lat: [1, 2], ele: [100, 150] })],
                        }),
                        buildTrackItem({
                            name: 'B (max)',
                            geometries: [buildLineGeometry({ lon: [1, 2], lat: [1, 2], ele: [90, 400] })],
                        }),
                    ],
                }),
            );
            store.setSelectedAttribute('ele');
            expect(store.visibleDomain.value).toEqual([90, 400]);

            store.setItemVisible(1, false);

            expect(store.visibleDomain.value).toEqual([100, 150]);
        });

        it('returns the same array reference when toggling a non-extreme item leaves the domain value-equal', () => {
            const store = createTripStore();
            store.load(
                buildTripData({
                    items: [
                        buildTrackItem({
                            name: 'Extremes',
                            geometries: [buildLineGeometry({ lon: [1, 2], lat: [1, 2], ele: [90, 400] })],
                        }),
                        buildTrackItem({
                            name: 'Middle',
                            geometries: [buildLineGeometry({ lon: [1, 2], lat: [1, 2], ele: [150, 200] })],
                        }),
                    ],
                }),
            );
            store.setSelectedAttribute('ele');
            const before = store.visibleDomain.value;
            expect(before).toEqual([90, 400]);

            store.setItemVisible(1, false);

            expect(store.visibleDomain.value).toBe(before);
        });

        it('recomputes reactively when selectedAttribute changes', () => {
            const store = createTripStore();
            store.load(
                buildTripData({
                    items: [
                        buildTrackItem({
                            geometries: [
                                buildLineGeometry({ lon: [1, 2], lat: [1, 2], ele: [100, 200], speed: [1, 2] }),
                            ],
                        }),
                    ],
                }),
            );
            store.setSelectedAttribute('ele');
            expect(store.visibleDomain.value).toEqual([100, 200]);

            store.setSelectedAttribute('speed');

            expect(store.visibleDomain.value).toEqual([1, 2]);
        });
    });

    describe('itemColours', () => {
        it('is an empty array before anything is loaded', () => {
            const store = createTripStore();

            expect(store.itemColours.value).toEqual([]);
        });

        it('is an empty array after a failing load', () => {
            const store = createTripStore();

            store.load({ not: 'trip data' });

            expect(store.itemColours.value).toEqual([]);
        });

        it('produces one colour-array-list per item, parallel to data.items', () => {
            const store = createTripStore();
            store.load(
                buildTripData({
                    items: [
                        buildTrackItem({
                            geometries: [buildLineGeometry({ lon: [1, 2], lat: [1, 2], ele: [100, 200] })],
                        }),
                        buildWaypointItem(),
                    ],
                }),
            );
            store.setSelectedAttribute('ele');

            expect(store.itemColours.value).toHaveLength(2);
            expect(store.itemColours.value[1]).toEqual([]);
        });

        it('floods NO_DATA_COLOUR for an item missing the selected attribute', () => {
            const store = createTripStore();
            store.load(
                buildTripData({
                    items: [
                        buildTrackItem({
                            geometries: [buildLineGeometry({ ele: undefined, lon: [1, 2], lat: [1, 2] })],
                        }),
                    ],
                }),
            );
            store.setSelectedAttribute('ele');

            const colours = store.itemColours.value[0]?.[0];
            expect(Array.from(colours ?? [])).toEqual([...NO_DATA_COLOUR, ...NO_DATA_COLOUR]);
        });

        it("keeps a transportMode item's colour identity stable when the item is hidden and re-shown", () => {
            const store = createTripStore();
            store.load(
                buildTripData({
                    items: [
                        buildTrackItem({
                            name: 'A',
                            transportMode: 'Cycling',
                            geometries: [buildLineGeometry({ lon: [1, 2] })],
                        }),
                        buildTrackItem({
                            name: 'B',
                            transportMode: 'Driving',
                            geometries: [buildLineGeometry({ lon: [1, 2] })],
                        }),
                    ],
                }),
            );
            store.setSelectedAttribute('transportMode');
            const before = store.itemColours.value[0]?.[0];

            store.setItemVisible(1, false);
            store.setItemVisible(1, true);

            expect(Array.from(store.itemColours.value[0]?.[0] ?? [])).toEqual(Array.from(before ?? []));
        });

        it('recomputes reactively after setSelectedAttribute', () => {
            const store = createTripStore();
            store.load(
                buildTripData({
                    items: [
                        buildTrackItem({
                            geometries: [
                                buildLineGeometry({
                                    lon: [1, 2, 3],
                                    lat: [1, 2, 3],
                                    ele: [100, 175, 200],
                                    speed: [1, 1.1, 2],
                                }),
                            ],
                        }),
                    ],
                }),
            );
            store.setSelectedAttribute('ele');
            const eleColours = store.itemColours.value[0]?.[0]?.subarray(4, 8);

            store.setSelectedAttribute('speed');

            const speedColours = store.itemColours.value[0]?.[0]?.subarray(4, 8);
            expect(Array.from(speedColours ?? [])).not.toEqual(Array.from(eleColours ?? []));
        });
    });

    describe('reactivity', () => {
        it('updates a computed derived from selectedAttribute after setSelectedAttribute', () => {
            const store = createTripStore();
            const label = computed(() => `attribute: ${store.selectedAttribute.value}`);
            expect(label.value).toBe('attribute: transportMode');

            store.setSelectedAttribute('ele');

            expect(label.value).toBe('attribute: ele');
        });

        it('updates a computed derived from visibility after setItemVisible', () => {
            const store = createTripStore();
            store.load(buildTripData({ items: [buildTrackItem(), buildWaypointItem()] }));
            const visibleCount = computed(() => store.visibility.value.filter(Boolean).length);
            expect(visibleCount.value).toBe(2);

            store.setItemVisible(0, false);

            expect(visibleCount.value).toBe(1);
        });

        it('updates a computed derived from hoveredItem after setHovered', () => {
            const store = createTripStore();
            store.load(buildTripData({ items: [buildTrackItem()] }));
            const isHovering = computed(() => store.hoveredItem.value !== null);
            expect(isHovering.value).toBe(false);

            store.setHovered(0);

            expect(isHovering.value).toBe(true);
        });

        it('updates a computed derived from data after load', () => {
            const store = createTripStore();
            const itemCount = computed(() => {
                const current = store.data.value;
                return current?.ok ? current.items.length : -1;
            });
            expect(itemCount.value).toBe(-1);

            store.load(buildTripData({ items: [buildTrackItem()] }));

            expect(itemCount.value).toBe(1);
        });
    });
});
