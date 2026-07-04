/**
 * The nomadpath.yaml schema is the single source of truth for the project
 * config format. Strict throughout (unknown keys fail loud) - the config is
 * hand-edited by the author, so a typo like `hiden` must be an error, never a
 * silently-ignored no-op. All TypeScript types derive from the schema.
 */

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/** An ISO calendar date (YYYY-MM-DD); the day-override for a track. */
const isoDate = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'day must be an ISO date (YYYY-MM-DD)')
    .refine(s => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'day is not a real calendar date');

/**
 * Track-selector properties (keyed by file/folder path glob). Every property is
 * optional: an entry names only what it changes, and unset properties inherit
 * from less-specific matches during resolution.
 */
const trackSelector = z
    .object({
        /** Hidden-by-default (resolves to defaultVisible = false). */
        hidden: z.boolean().optional(),
        /** Renders a day/section divider before this item. */
        divider: z.boolean().optional(),
        /** Kept out of the auto-computed map bounds. */
        excludeFromBounds: z.boolean().optional(),
        /** Overrides the day this item is grouped under. */
        day: isoDate.optional(),
    })
    .strict();

/** Waypoint-selector properties (keyed by in-file <folder> value). */
const waypointSelector = z
    .object({
        hidden: z.boolean().optional(),
    })
    .strict();

/** The whole nomadpath.yaml document. */
export const configSchema = z
    .object({
        /** Optional trip name -> TripData.name. */
        name: z.string().optional(),
        /** Path globs skipped entirely by the scan (and watch). */
        ignore: z.array(z.string()).default([]),
        /** Track exceptions, keyed by path glob anchored at the input root. */
        tracks: z.record(z.string(), trackSelector).default({}),
        /** Waypoint exceptions, keyed by in-file <folder> value. */
        waypoints: z.record(z.string(), waypointSelector).default({}),
    })
    .strict();

export type Config = z.infer<typeof configSchema>;
export type TrackSelector = z.infer<typeof trackSelector>;
export type WaypointSelector = z.infer<typeof waypointSelector>;

/**
 * Parse and strictly validate nomadpath.yaml text. Throws on malformed YAML or
 * any schema violation, with the source file in the message (fail loud).
 */
export function loadConfig(yaml: string, sourceFile: string): Config {
    let raw: unknown;
    try {
        raw = parseYaml(yaml) ?? {};
    } catch (e) {
        throw new Error(`${sourceFile}: invalid YAML - ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
    const result = configSchema.safeParse(raw);
    if (!result.success) {
        const issues = result.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
        throw new Error(`${sourceFile}: invalid config - ${issues}`);
    }
    return result.data;
}
