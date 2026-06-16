import type { TrackFeature, TripData } from '../contract/types';
import { profileAsync } from '../profiling';

// ---------------------------------------------------------------------------
// Track ID
// ---------------------------------------------------------------------------

/**
 * Derive a stable client-side ID for a track from its GeoJSON properties.
 * Stable means the same input always produces the same ID.
 */
export function deriveTrackId(track: TrackFeature): string {
    return `${track.properties.day}::${track.properties.name}`;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * Fetch and validate one or more trip-data.geojson URLs.
 *
 * @throws if any URL returns a non-OK response or non-FeatureCollection JSON
 */
export async function loadTripData(urls: string[]): Promise<TripData[]> {
    return profileAsync('nomadpath.Initial load/Load trip data', () =>
        Promise.all(
            urls.map(async url => {
                let res: Response;
                try {
                    res = await fetch(url);
                } catch (err) {
                    throw new Error(`Network error loading trip data from ${url}: ${(err as Error).message}`);
                }
                if (!res.ok) {
                    throw new Error(`Failed to load trip data from ${url}: HTTP ${res.status}`);
                }
                let data: unknown;
                try {
                    data = await res.json();
                } catch {
                    throw new Error(`Invalid JSON in trip data from ${url}`);
                }
                if (
                    typeof data !== 'object' ||
                    data === null ||
                    (data as Record<string, unknown>).type !== 'FeatureCollection'
                ) {
                    throw new Error(`Trip data from ${url} is not a GeoJSON FeatureCollection`);
                }
                return data as TripData;
            }),
        ),
    );
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

/** Collect all track features across multiple TripData objects.
 *
 * Features whose `properties.type` is neither 'track' nor 'poi' are skipped
 * and a console.warn is emitted; this surfaces typos or schema drift instead
 * of silently dropping data.
 */
export function extractTracks(trips: TripData[]): TrackFeature[] {
    const tracks: TrackFeature[] = [];
    for (const trip of trips) {
        for (const f of trip.features) {
            const t = f.properties.type;
            if (t === 'track') {
                tracks.push(f as TrackFeature);
            } else if (t !== 'poi') {
                console.warn(
                    `[NomadPath] Skipping feature with unrecognised properties.type=${JSON.stringify(t)}; ` +
                        'expected "track" or "poi".',
                );
            }
        }
    }
    return tracks;
}
