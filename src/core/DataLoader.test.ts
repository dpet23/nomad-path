import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TrackFeature, TripData } from '../data/types';
import { deriveTrackId, extractTracks, loadTripData } from './DataLoader';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DAY = '2024-03-15';
const TRACK_NAME = 'Morning Drive';

const makeTrack = (day: string, name: string): TrackFeature => ({
    type: 'Feature',
    geometry: {
        type: 'LineString',
        coordinates: [
            [139.69, 35.68],
            [139.7, 35.69],
        ],
    },
    properties: {
        type: 'track',
        name,
        day,
        defaultVisible: true,
        transportMode: 'drive',
    },
});

const makeTrip = (tracks: TrackFeature[]): TripData => ({
    type: 'FeatureCollection',
    metadata: {
        tripName: 'Test Trip',
        attributeRanges: { speed: { min: 0, max: 100, unit: 'km/h' } },
    },
    features: tracks,
});

// ---------------------------------------------------------------------------
// deriveTrackId
// ---------------------------------------------------------------------------

describe('deriveTrackId', () => {
    it('combines day and name with "::"', () => {
        const track = makeTrack(DAY, TRACK_NAME);
        expect(deriveTrackId(track)).toBe(`${DAY}::${TRACK_NAME}`);
    });

    it('produces consistent IDs for the same input', () => {
        const track = makeTrack('flight-2024-03-14-syd-nrt', 'SYD-NRT');
        expect(deriveTrackId(track)).toBe(deriveTrackId(track));
    });
});

// ---------------------------------------------------------------------------
// extractTracks
// ---------------------------------------------------------------------------

describe('extractTracks', () => {
    it('collects track features from multiple trips', () => {
        const t1 = makeTrack(DAY, TRACK_NAME);
        const t2 = makeTrack('2024-03-16', 'Afternoon Walk');
        const trips = [makeTrip([t1]), makeTrip([t2])];
        const result = extractTracks(trips);
        expect(result).toHaveLength(2);
        expect(result[0].properties.name).toBe(TRACK_NAME);
        expect(result[1].properties.name).toBe('Afternoon Walk');
    });

    it('filters out POI features', () => {
        const trip: TripData = {
            type: 'FeatureCollection',
            metadata: { tripName: 'Test', attributeRanges: {} },
            features: [
                makeTrack(DAY, 'Drive'),
                {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [139.69, 35.68] },
                    properties: { type: 'poi', name: 'Hotel', category: 'accommodation' },
                },
            ],
        };
        expect(extractTracks([trip])).toHaveLength(1);
    });

    it('returns empty array for trips with no tracks', () => {
        const trip = makeTrip([]);
        expect(extractTracks([trip])).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// loadTripData
// ---------------------------------------------------------------------------

describe('loadTripData', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const mockFetch = (data: unknown, status = 200) => {
        vi.mocked(fetch).mockResolvedValue({
            ok: status >= 200 && status < 300,
            status,
            json: async () => data,
        } as Response);
    };

    it('fetches and returns valid TripData', async () => {
        const trip = makeTrip([makeTrack(DAY, 'Drive')]);
        mockFetch(trip);
        const result = await loadTripData(['https://example.com/trip.geojson']);
        expect(result).toHaveLength(1);
        expect(result[0].metadata.tripName).toBe('Test Trip');
    });

    it('loads multiple URLs in parallel', async () => {
        const trip = makeTrip([]);
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => trip,
        } as Response);
        const result = await loadTripData(['url1', 'url2', 'url3']);
        expect(result).toHaveLength(3);
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('rejects on HTTP error status', async () => {
        mockFetch(null, 404);
        await expect(loadTripData(['https://example.com/missing.geojson'])).rejects.toThrow('HTTP 404');
    });

    it('rejects when response is not a FeatureCollection', async () => {
        mockFetch({ type: 'Feature' });
        await expect(loadTripData(['https://example.com/bad.geojson'])).rejects.toThrow('FeatureCollection');
    });

    it('rejects on network error', async () => {
        vi.mocked(fetch).mockRejectedValue(new Error('Failed to fetch'));
        await expect(loadTripData(['https://example.com/trip.geojson'])).rejects.toThrow('Network error');
    });
});
