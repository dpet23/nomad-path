export type {
    AttributeRange,
    AttributeRanges,
    LegendPanelConfig,
    LegendsConfig,
    MobileConfig,
    POIFeature,
    POIProperties,
    TrackFeature,
    TrackProperties,
    TravelMapConfig,
    TripData,
    TripMetadata,
} from './data/types';

/**
 * Main entry point for the Nomad Path travel map library.
 *
 * @example
 * ```html
 * <div id="map" style="width: 80%; height: 40vh;"></div>
 * <script src="nomad-path.js"></script>
 * <script>
 *   NomadPath.create({
 *     container: 'map',
 *     dataUrls: ['tracks/trip-data.geojson'],
 *   });
 * </script>
 * ```
 */
// TODO(Epic 3): Replace stub with full TravelMap implementation.
export const NomadPath = {
    create: (_config: unknown): void => {
        throw new Error('Not yet implemented — coming in Epic 3.');
    },
};
