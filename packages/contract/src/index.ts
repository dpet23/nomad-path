export {
    buildLineGeometry,
    buildPointGeometry,
    buildPolygonGeometry,
    buildTrackItem,
    buildTripData,
    buildWaypointItem,
} from './fixtures.ts';
export type {
    Geometry,
    LineGeometry,
    PerPointAttribute,
    PointGeometry,
    PolygonGeometry,
    TripData,
    TripItem,
} from './schema.ts';
export { CONTRACT_VERSION, PER_POINT_ATTRIBUTE_NAMES, PER_POINT_ATTRIBUTES, tripDataSchema } from './schema.ts';
export type { ContractIssue } from './validate.ts';
export { validateTripData } from './validate.ts';
