import { basename, extname } from 'path';

import tzlookup from '@photostructure/tz-lookup';
import { DateTime } from 'luxon';

// ---------------------------------------------------------------------------
// Day assignment
// ---------------------------------------------------------------------------

/**
 * Slugify a string for use in a day key (lowercase, hyphens, no spaces).
 *
 * @param {string} str
 * @returns {string}
 */
function slugify(str) {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Assign a local calendar date string (YYYY-MM-DD) to a non-flight track
 * based on the timestamp and timezone of its first timed point.
 *
 * Falls back to the source filename stem if no timestamps are present.
 *
 * @param {import('./enrichment.js').EnrichedTrack} track
 * @returns {string}
 */
function assignGroundDay(track) {
    const firstTimed = track.points.find(p => p.time != null);
    if (!firstTimed) {
        return slugify(basename(track.sourceFile, extname(track.sourceFile)));
    }
    const tz = tzlookup(firstTimed.lat, firstTimed.lon);
    return DateTime.fromMillis(firstTimed.time, { zone: tz }).toFormat('yyyy-MM-dd');
}

/**
 * Assign a unique day key to a flight track so it is never merged with ground
 * tracks from the same calendar date. Each flight can then be toggled
 * independently in the map UI.
 *
 * Format: "flight-YYYY-MM-DD-<name-slug>" using the UTC departure date.
 * Falls back to "flight-<name-slug>" when no timestamp is present.
 *
 * @param {import('./enrichment.js').EnrichedTrack} track
 * @returns {string}
 */
function assignFlightDay(track) {
    const nameSlug = slugify(track.name);
    const firstTimed = track.points.find(p => p.time != null);
    if (!firstTimed) {
        return `flight-${nameSlug}`;
    }
    const utcDate = DateTime.fromMillis(firstTimed.time, { zone: 'UTC' }).toFormat(
        'yyyy-MM-dd',
    );
    return `flight-${utcDate}-${nameSlug}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {import('./enrichment.js').EnrichedTrack & { day: string }} GroupedTrack
 */

/**
 * Assign a `day` label to each enriched track, determining how tracks are
 * grouped for display and toggling on the map.
 *
 * - Ground tracks (drive, walk, boat, etc.): `day` is the local calendar date
 *   (YYYY-MM-DD) of the first timed point in the track's timezone. Tracks
 *   sharing the same date show/hide together.
 * - Flight tracks: each gets a unique `day` key so they are always independent.
 *
 * @param {import('./enrichment.js').EnrichedTrack[]} tracks
 * @returns {GroupedTrack[]}
 */
export function groupTracks(tracks) {
    return tracks.map(track => {
        const day =
            track.transportMode === 'flight'
                ? assignFlightDay(track)
                : assignGroundDay(track);
        return { ...track, day };
    });
}
