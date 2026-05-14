/**
 * Shared contract types for the on-disk trip-data.geojson file.
 *
 * These types describe the *interface* between preprocessing (producer)
 * and library (consumer). Anything that is serialised to disk lives here.
 *
 * Types are inferred from the valibot schema in ./validate.ts so the
 * runtime validator and the compile-time types are guaranteed to agree.
 *
 * Library-only types (runtime construction config, UI config) live in
 * src/data/types.ts and are not part of this contract.
 */

import type { InferOutput } from 'valibot';

import type {
    AttributeRangeSchema,
    AttributeRangesSchema,
    POIFeatureSchema,
    POIPropertiesSchema,
    TrackFeatureSchema,
    TrackPropertiesSchema,
    TripDataSchema,
    TripMetadataSchema,
    TripStatsSchema,
} from './validate';

export type TripData = InferOutput<typeof TripDataSchema>;
export type TripMetadata = InferOutput<typeof TripMetadataSchema>;
export type TripStats = InferOutput<typeof TripStatsSchema>;
export type AttributeRanges = InferOutput<typeof AttributeRangesSchema>;
export type AttributeRange = InferOutput<typeof AttributeRangeSchema>;
export type TrackFeature = InferOutput<typeof TrackFeatureSchema>;
export type TrackProperties = InferOutput<typeof TrackPropertiesSchema>;
export type POIFeature = InferOutput<typeof POIFeatureSchema>;
export type POIProperties = InferOutput<typeof POIPropertiesSchema>;
