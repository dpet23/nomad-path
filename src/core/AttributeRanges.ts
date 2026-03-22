import type { AttributeRanges, TripData } from '../data/types';
import { deriveTrackId, extractTracks } from './DataLoader';

/** Scan a set of nullable number arrays and return the global min/max, or null if no values. */
function minMax(arrays: ((number | null)[] | undefined)[]): { min: number; max: number } | null {
    let lo = Infinity;
    let hi = -Infinity;
    let found = false;
    for (const arr of arrays) {
        if (!arr) continue;
        for (const v of arr) {
            if (v == null) continue;
            found = true;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }
    }
    return found ? { min: lo, max: hi } : null;
}

/**
 * Compute attribute min/max ranges from only the currently visible tracks.
 *
 * Scans the raw per-point arrays (elevations, speeds) on each visible track
 * to derive true min/max. Returns an empty object when no visible tracks
 * have data for a given attribute.
 */
export function computeVisibleRanges(trips: TripData[], visibleIds: ReadonlySet<string>): AttributeRanges {
    const tracks = extractTracks(trips).filter(t => visibleIds.has(deriveTrackId(t)));

    const ranges: AttributeRanges = {};

    const elev = minMax(tracks.map(t => t.properties.elevations));
    if (elev) ranges.elevation = { ...elev, unit: 'm' };

    const speed = minMax(tracks.map(t => t.properties.speeds));
    if (speed) ranges.speed = { ...speed, unit: 'km/h' };

    return ranges;
}
