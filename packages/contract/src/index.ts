export {
  CONTRACT_VERSION,
  PANEL_NAMES,
  PANELS,
  PER_POINT_ATTRIBUTE_NAMES,
  PER_POINT_ATTRIBUTES,
  tripDataSchema,
} from './schema.ts';
export type {
  Bounds,
  Geometry,
  LineGeometry,
  Panel,
  PerPointAttribute,
  PointGeometry,
  PolygonGeometry,
  TripData,
  TripItem,
} from './schema.ts';
export { validateTripData } from './validate.ts';
export type { ContractIssue } from './validate.ts';
export {
  buildDividerItem,
  buildLineGeometry,
  buildPointGeometry,
  buildPolygonGeometry,
  buildTrackItem,
  buildTripData,
  buildWaypointItem,
} from './fixtures.ts';
