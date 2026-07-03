import { z } from 'zod';

/**
 * The Zod schema is the single source of truth for the pipeline-to-UI file
 * format; all TypeScript types derive from it. Structural rules live here;
 * cross-field rules live in validate.ts. See docs/architecture/data-contract.md.
 */

export const CONTRACT_VERSION = 1;

const longitude = z.number().min(-180).max(180);
const latitude = z.number().min(-90).max(90);

/**
 * [west, south, east, north] in lon/lat. West > east is VALID: it means the
 * box crosses the antimeridian (Pacific trips are core data). Nothing may
 * assume west <= east.
 */
const boundsSchema = z.tuple([longitude, latitude, longitude, latitude]);

/**
 * Optional per-point attribute arrays carried by line geometries, parallel to
 * lon/lat. Absent array = the item legitimately lacks the attribute (a valid
 * state, not an error). A null entry = no data at that point. Both render in
 * the standard neutral "no data" grey.
 *
 * Registry: add a per-point attribute here and both the line schema and the
 * derived types pick it up.
 */
export const PER_POINT_ATTRIBUTES = {
    /** Elevation in metres. */
    ele: z.array(z.number().nullable()).optional(),
    /** Speed in metres per second. */
    speed: z.array(z.number().nullable()).optional(),
    /** Solar elevation in degrees (the time-of-day proxy). */
    sunAngle: z.array(z.number().nullable()).optional(),
} as const;

export type PerPointAttribute = keyof typeof PER_POINT_ATTRIBUTES;

export const PER_POINT_ATTRIBUTE_NAMES = Object.keys(PER_POINT_ATTRIBUTES) as readonly PerPointAttribute[];

const lineGeometrySchema = z.strictObject({
    type: z.literal('line'),
    lon: z.array(longitude).min(2),
    lat: z.array(latitude).min(2),
    /** Epoch seconds UTC, non-decreasing (checked in validate.ts). */
    time: z.array(z.number()).optional(),
    ...PER_POINT_ATTRIBUTES,
});

const pointGeometrySchema = z.strictObject({
    type: z.literal('point'),
    lon: longitude,
    lat: latitude,
    /** Marker image URL, from a GPX <sym>. */
    sym: z.string().optional(),
});

const polygonGeometrySchema = z.strictObject({
    type: z.literal('polygon'),
    /** Single outer ring, parallel arrays, >= 4 positions, closed (validate.ts). */
    lon: z.array(longitude).min(4),
    lat: z.array(latitude).min(4),
});

const geometrySchema = z.discriminatedUnion('type', [lineGeometrySchema, pointGeometrySchema, polygonGeometrySchema]);

/**
 * Which widget an item belongs to. Registry: adding a panel means adding an
 * entry here plus a widget and a bucketing derivation in the UI; the UI treats
 * an unknown panel value in data as item-level degrade (skip + notice).
 */
export const PANELS = {
    tracks: { description: 'Track tree grouped by local day, split by dividers' },
    waypoints: { description: 'Waypoint list grouped by folder label' },
} as const;

export type Panel = keyof typeof PANELS;

export const PANEL_NAMES = Object.keys(PANELS) as readonly Panel[];

const itemSchema = z.strictObject({
    /**
     * Unique. Pipeline-derived from source provenance (file + element) so UI
     * notices and debug output trace back to the file that produced the item.
     */
    id: z.string().min(1),
    name: z.string().min(1),
    /** Popup text shown on hover/tap. */
    description: z.string().optional(),
    panel: z.enum(PANEL_NAMES),
    /** Waypoint folder value; absent = top-level ungrouped item. */
    groupLabel: z.string().optional(),
    /** Local calendar date (YYYY-MM-DD) of the item's first point. */
    day: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    /**
     * Splits the track tree and renders as a separator row. Kept as a per-item
     * flag (2026-07-02 decision); the UI's walk-and-split lives in one pure
     * core function so this representation can change without a codebase-wide
     * rework.
     */
    divider: z.boolean(),
    defaultVisible: z.boolean(),
    /** Global chronological ordering; unique integer per item. */
    order: z.int(),
    /** From osmand:activity, verbatim; absent = no data ("other"). */
    transportMode: z.string().optional(),
    /** Zoom-to target. Precomputed by the pipeline (antimeridian-aware). */
    bounds: boundsSchema,
    geometries: z.array(geometrySchema).min(1),
});

export const tripDataSchema = z.strictObject({
    version: z.literal(CONTRACT_VERSION),
    name: z.string().optional(),
    /** Initial viewport fit, with config exclusions already applied. */
    bounds: boundsSchema,
    items: z.array(itemSchema),
});

export type TripData = z.infer<typeof tripDataSchema>;
export type TripItem = z.infer<typeof itemSchema>;
export type Geometry = z.infer<typeof geometrySchema>;
export type LineGeometry = z.infer<typeof lineGeometrySchema>;
export type PointGeometry = z.infer<typeof pointGeometrySchema>;
export type PolygonGeometry = z.infer<typeof polygonGeometrySchema>;
export type Bounds = z.infer<typeof boundsSchema>;
