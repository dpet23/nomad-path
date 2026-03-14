import type { Map as MaplibreMap } from 'maplibre-gl';

import type { LayerManager } from '../core/LayerManager';
import type { TripData } from '../data/types';

/**
 * Internal context object shared with all UI components.
 * Not exported from the public API — UI components receive this from NomadPath.
 */
export interface UIContext {
    readonly map: MaplibreMap;
    readonly layers: LayerManager;
    readonly trips: TripData[];
    fitToTrack(trackId: string): void;
    fitToPOI(coords: [number, number], zoom?: number): void;
}
