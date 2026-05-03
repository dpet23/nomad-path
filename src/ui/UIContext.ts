import type { Map as MaplibreMap } from 'maplibre-gl';

import type { TripData } from '../../schema/types';
import type { LayerManager } from '../core/LayerManager';

/**
 * Internal context object shared with all UI components.
 * Not exported from the public API — UI components receive this from NomadPath.
 */
export interface UIContext {
    readonly map: MaplibreMap;
    readonly layers: LayerManager;
    readonly trips: TripData[];
    fitToTrack(trackId: string): void;
    fitToTrackGroup(trackIds: string[]): void;
    fitToPOI(coords: [number, number], zoom?: number): void;
}
