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
} as const;

export type PerPointAttribute = keyof typeof PER_POINT_ATTRIBUTES;

export const PER_POINT_ATTRIBUTE_NAMES = Object.keys(PER_POINT_ATTRIBUTES) as readonly PerPointAttribute[];

const lineGeometrySchema = z.strictObject({
    type: z.literal('line'),
    lon: z.array(longitude).min(2),
    lat: z.array(latitude).min(2),
    /** Epoch seconds UTC. Not required to be ordered - multi-device merges legitimately interleave timestamps; the UI draws in array order and reads time per-point. */
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
 * A raw trip item: one named or unnamed geometry group carried through from
 * source data, with no UI-shaped identity, ordering, or panel assignment.
 */
const itemSchema = z.strictObject({
    name: z.string().min(1).optional(),
    /** Popup text shown on hover/tap. */
    description: z.string().optional(),
    /** From osmand:activity, verbatim; absent = no data ("other"). */
    transportMode: z.string().optional(),
    /** Waypoint folder value; absent = top-level ungrouped item. */
    folder: z.string().optional(),
    geometries: z.array(geometrySchema).min(1),
});

export const tripDataSchema = z.strictObject({
    version: z.literal(CONTRACT_VERSION),
    name: z.string().optional(),
    items: z.array(itemSchema),
});

export type TripData = z.infer<typeof tripDataSchema>;
export type TripItem = z.infer<typeof itemSchema>;
export type Geometry = z.infer<typeof geometrySchema>;
export type LineGeometry = z.infer<typeof lineGeometrySchema>;
export type PointGeometry = z.infer<typeof pointGeometrySchema>;
export type PolygonGeometry = z.infer<typeof polygonGeometrySchema>;
