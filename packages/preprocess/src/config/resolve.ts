/**
 * Config resolution: turn the exceptions-only selector map into concrete
 * settings for one track path or waypoint folder.
 *
 * Resolution is ADDITIVE per property: a path's settings are the merge of ALL
 * matching selectors, property by property. A more-specific selector wins only
 * for a property it and a less-specific selector both set to different values.
 * Two EQUALLY-specific selectors that set the same property to different values
 * are a hard error (fail loud, no heuristic tiebreak).
 *
 * Specificity = path depth, then literalness: more path segments wins; at equal
 * depth, more literal (non-wildcard) segments wins. An exact file path is the
 * most specific selector that can match it.
 */

import picomatch from 'picomatch';

import type { Config, TrackSelector } from './schema.ts';

/** Resolved settings for a track item, as the compute/assemble stages consume them. */
export interface TrackSettings {
    defaultVisible: boolean;
    divider: boolean;
    excludeFromBounds: boolean;
    day?: string;
}

/** Resolved settings for a waypoint item. */
export interface WaypointSettings {
    defaultVisible: boolean;
}

/** A folder selector (trailing slash) matches everything beneath it. */
function toGlob(selector: string): string {
    return selector.endsWith('/') ? `${selector}**` : selector;
}

/**
 * Whether a path-glob selector matches a POSIX path. Single source of truth for
 * the glob semantics (folder-prefix expansion + dotfile matching) used by track
 * resolution, ignore filtering, and the scan's unmatched-selector check.
 */
export function selectorMatches(selector: string, path: string): boolean {
    return picomatch.isMatch(path, toGlob(selector), { dot: true });
}

/**
 * Specificity score: [segment count, literal-segment count]. Scored on the
 * ORIGINAL selector, not its ** normalization - a folder-prefix like `flights/`
 * (depth 1) is deliberately LESS specific than a same-area file glob like
 * `flights/scenic-*.kml` (depth 2). Higher wins, compared left to right.
 */
function specificity(selector: string): [number, number] {
    const segments = selector.split('/').filter(s => s !== '');
    const literal = segments.filter(s => !/[*?[\]{}]/.test(s)).length;
    return [segments.length, literal];
}

/** Compare two specificity scores; positive if a is more specific than b. */
function compareSpecificity(a: [number, number], b: [number, number]): number {
    return a[0] - b[0] || a[1] - b[1];
}

interface Match {
    selector: string;
    settings: TrackSelector;
    score: [number, number];
}

/** Every selector whose glob matches the path, with its specificity, least-specific first. */
function matchesFor(path: string, config: Config): Match[] {
    const matches: Match[] = [];
    for (const [selector, settings] of Object.entries(config.tracks)) {
        if (selectorMatches(selector, path)) {
            matches.push({ selector, settings, score: specificity(selector) });
        }
    }
    return matches.sort((a, b) => compareSpecificity(a.score, b.score));
}

type TrackProp = keyof TrackSelector;
const TRACK_PROPS: TrackProp[] = ['hidden', 'divider', 'excludeFromBounds', 'day'];

/**
 * Additively merge matching selectors into one raw settings object. For each
 * property the most-specific setter wins; an equal-specificity disagreement on
 * the same property is a hard error naming both selectors and the property.
 */
function mergeTrackSelectors(path: string, matches: Match[]): TrackSelector {
    const merged: TrackSelector = {};
    for (const prop of TRACK_PROPS) {
        const setting = resolveProp(path, prop, matches);
        if (setting !== undefined) {
            (merged[prop] as unknown) = setting;
        }
    }
    return merged;
}

/** Resolve one property across the matches, erroring on an equal-specificity conflict. */
function resolveProp<K extends TrackProp>(path: string, prop: K, matches: Match[]): TrackSelector[K] {
    const setters = matches.filter(m => m.settings[prop] !== undefined);
    let best: Match | undefined;
    for (const setter of setters) {
        if (best === undefined) {
            best = setter;
            continue;
        }
        const cmp = compareSpecificity(setter.score, best.score);
        if (cmp > 0) {
            best = setter;
        } else if (cmp === 0 && setter.settings[prop] !== best.settings[prop]) {
            throw new Error(
                `config conflict for "${path}": selectors "${best.selector}" and "${setter.selector}" ` +
                    `set "${prop}" to conflicting values at equal specificity`,
            );
        }
    }
    return best?.settings[prop];
}

/** Resolve concrete settings for a track path from the config's selectors. */
export function resolveTrackSettings(path: string, config: Config): TrackSettings {
    const merged = mergeTrackSelectors(path, matchesFor(path, config));
    const settings: TrackSettings = {
        defaultVisible: merged.hidden !== true,
        divider: merged.divider ?? false,
        excludeFromBounds: merged.excludeFromBounds ?? false,
    };
    if (merged.day !== undefined) settings.day = merged.day;
    return settings;
}

/** Resolve concrete settings for a waypoint from its in-file folder value. */
export function resolveWaypointSettings(folder: string | undefined, config: Config): WaypointSettings {
    const selector = folder === undefined ? undefined : config.waypoints[folder];
    return { defaultVisible: selector?.hidden !== true };
}

/** Whether a scanned path should be skipped entirely (any ignore glob matches). */
export function isIgnored(path: string, config: Config): boolean {
    return config.ignore.some(glob => selectorMatches(glob, path));
}
