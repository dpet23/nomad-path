import { describe, expect, it } from 'vitest';

import { isIgnored, resolveTrackSettings, resolveWaypointSettings } from '../src/config/resolve.ts';
import { loadConfig } from '../src/config/schema.ts';

/** Parse YAML text through the strict schema; throws on invalid config. */
function config(yaml: string) {
    return loadConfig(yaml, 'nomadpath.yaml');
}

describe('loadConfig: schema validation', () => {
    it('parses a full valid config', () => {
        const cfg = config(`
name: Fictional Trip 2030
ignore:
  - .git/
  - '**/*.swp'
tracks:
  flights/: { hidden: true, divider: true }
  flights/scenic-*.kml: { divider: false }
  tracks/day9/late-taxi.gpx: { day: 2030-01-23 }
waypoints:
  Accommodation: { hidden: true }
`);
        expect(cfg.name).toBe('Fictional Trip 2030');
        expect(cfg.ignore).toEqual(['.git/', '**/*.swp']);
        expect(cfg.tracks['flights/']).toEqual({ hidden: true, divider: true });
        expect(cfg.waypoints.Accommodation).toEqual({ hidden: true });
    });

    it('treats an empty config as all-defaults (no name, no selectors)', () => {
        const cfg = config('');
        expect(cfg.name).toBeUndefined();
        expect(cfg.ignore).toEqual([]);
        expect(cfg.tracks).toEqual({});
        expect(cfg.waypoints).toEqual({});
    });

    it('rejects an unknown top-level key', () => {
        expect(() => config('tracsk: {}')).toThrow();
    });

    it('rejects malformed YAML with "invalid YAML" and the source file in the message', () => {
        expect(() => config('tracks:\n  a.gpx: { hidden: true')).toThrow(/nomadpath\.yaml: invalid YAML/);
    });

    it('rejects an unknown track-selector property', () => {
        expect(() => config('tracks:\n  flights/: { hiden: true }')).toThrow();
    });

    it('rejects a non-boolean hidden value', () => {
        expect(() => config('tracks:\n  flights/: { hidden: yes-please }')).toThrow();
    });

    it('rejects a day that is not an ISO YYYY-MM-DD date', () => {
        expect(() => config('tracks:\n  a.gpx: { day: "23rd Jan" }')).toThrow();
    });

    it('rejects a waypoint selector using a track-only property', () => {
        expect(() => config('waypoints:\n  Accommodation: { divider: true }')).toThrow();
    });
});

describe('resolveTrackSettings: defaults and single match', () => {
    it('returns defaults for a path matching no selector', () => {
        const cfg = config('tracks:\n  flights/: { hidden: true }');
        expect(resolveTrackSettings('tracks/day1/walk.gpx', cfg)).toEqual({
            defaultVisible: true,
            divider: false,
            excludeFromBounds: false,
        });
    });

    it('applies a single matching selector (hidden -> defaultVisible false)', () => {
        const cfg = config('tracks:\n  flights/: { hidden: true, divider: true }');
        expect(resolveTrackSettings('flights/qf1.kml', cfg)).toEqual({
            defaultVisible: false,
            divider: true,
            excludeFromBounds: false,
        });
    });

    it('carries a day override through when set', () => {
        const cfg = config('tracks:\n  tracks/day9/late-taxi.gpx: { day: 2030-01-23 }');
        expect(resolveTrackSettings('tracks/day9/late-taxi.gpx', cfg).day).toBe('2030-01-23');
    });

    it('leaves day undefined when no selector sets it', () => {
        const cfg = config('tracks:\n  flights/: { hidden: true }');
        expect(resolveTrackSettings('flights/qf1.kml', cfg).day).toBeUndefined();
    });
});

describe('resolveTrackSettings: additive merge across matching selectors', () => {
    it('unions disjoint properties from two matching selectors', () => {
        const cfg = config(`
tracks:
  cyclones/: { excludeFromBounds: true }
  cyclones/tc-*.kml: { hidden: true }
`);
        expect(resolveTrackSettings('cyclones/tc-alfred.kml', cfg)).toEqual({
            defaultVisible: false,
            divider: false,
            excludeFromBounds: true,
        });
    });

    it('inherits an unset property from a less-specific selector while overriding a set one', () => {
        const cfg = config(`
tracks:
  flights/: { hidden: true, divider: true }
  flights/scenic-*.kml: { divider: false }
`);
        // scenic file: divider from the specific selector, hidden inherited from the folder selector.
        expect(resolveTrackSettings('flights/scenic-sunset.kml', cfg)).toEqual({
            defaultVisible: false,
            divider: false,
            excludeFromBounds: false,
        });
    });

    it('lets a non-scenic flight keep the folder-level divider', () => {
        const cfg = config(`
tracks:
  flights/: { hidden: true, divider: true }
  flights/scenic-*.kml: { divider: false }
`);
        expect(resolveTrackSettings('flights/qf1.kml', cfg).divider).toBe(true);
    });
});

describe('resolveTrackSettings: specificity (depth + literalness)', () => {
    it('a deeper selector outranks a shallower one on a conflicting property', () => {
        const cfg = config(`
tracks:
  a/: { hidden: true }
  a/b/: { hidden: false }
`);
        expect(resolveTrackSettings('a/b/x.gpx', cfg).defaultVisible).toBe(true);
    });

    it('at equal depth, a more literal selector outranks a wildcard one', () => {
        const cfg = config(`
tracks:
  flights/scenic-*.kml: { hidden: true }
  flights/scenic-01.kml: { hidden: false }
`);
        expect(resolveTrackSettings('flights/scenic-01.kml', cfg).defaultVisible).toBe(true);
    });

    it('an exact file path outranks every glob that also matches it', () => {
        const cfg = config(`
tracks:
  tracks/: { divider: true }
  tracks/day9/*.gpx: { divider: false }
  tracks/day9/late-taxi.gpx: { divider: true }
`);
        expect(resolveTrackSettings('tracks/day9/late-taxi.gpx', cfg).divider).toBe(true);
    });
});

describe('resolveTrackSettings: equal-specificity conflict = hard error', () => {
    it('throws when two equally-specific selectors set the same property to different values', () => {
        const cfg = config(`
tracks:
  a/*.gpx: { hidden: true }
  '*/x.gpx': { hidden: false }
`);
        expect(() => resolveTrackSettings('a/x.gpx', cfg)).toThrow(/hidden/);
    });

    it('names both conflicting selectors in the error', () => {
        const cfg = config(`
tracks:
  a/*.gpx: { hidden: true }
  '*/x.gpx': { hidden: false }
`);
        expect(() => resolveTrackSettings('a/x.gpx', cfg)).toThrow(
            /a\/\*\.gpx[\s\S]*\*\/x\.gpx|\*\/x\.gpx[\s\S]*a\/\*\.gpx/,
        );
    });

    it('does NOT throw when equally-specific selectors set the same property to the SAME value', () => {
        const cfg = config(`
tracks:
  a/*.gpx: { hidden: true }
  '*/x.gpx': { hidden: true }
`);
        expect(resolveTrackSettings('a/x.gpx', cfg).defaultVisible).toBe(false);
    });

    it('does NOT throw when equally-specific selectors set DISJOINT properties', () => {
        const cfg = config(`
tracks:
  a/*.gpx: { hidden: true }
  '*/x.gpx': { divider: true }
`);
        expect(resolveTrackSettings('a/x.gpx', cfg)).toEqual({
            defaultVisible: false,
            divider: true,
            excludeFromBounds: false,
        });
    });
});

describe('resolveWaypointSettings: keyed by folder value', () => {
    it('returns defaultVisible true for an unlisted folder', () => {
        const cfg = config('waypoints:\n  Accommodation: { hidden: true }');
        expect(resolveWaypointSettings('Restaurants', cfg)).toEqual({ defaultVisible: true });
    });

    it('applies hidden for a listed folder', () => {
        const cfg = config('waypoints:\n  Accommodation: { hidden: true }');
        expect(resolveWaypointSettings('Accommodation', cfg)).toEqual({ defaultVisible: false });
    });

    it('returns defaults when the feature has no folder', () => {
        const cfg = config('waypoints:\n  Accommodation: { hidden: true }');
        expect(resolveWaypointSettings(undefined, cfg)).toEqual({ defaultVisible: true });
    });
});

describe('isIgnored: scan-time path filtering', () => {
    it('matches a folder-glob ignore entry', () => {
        const cfg = config('ignore:\n  - .git/');
        expect(isIgnored('.git/config', cfg)).toBe(true);
    });

    it('matches a double-star extension ignore entry at any depth', () => {
        const cfg = config("ignore:\n  - '**/*.swp'");
        expect(isIgnored('tracks/day1/.walk.gpx.swp', cfg)).toBe(true);
    });

    it('leaves a normal track path un-ignored', () => {
        const cfg = config('ignore:\n  - .git/');
        expect(isIgnored('tracks/day1/walk.gpx', cfg)).toBe(false);
    });
});
