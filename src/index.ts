import { MapLibreRenderer } from './core/MapLibreRenderer';
import { TrackSegment, BackgroundMap, LatLng } from './types';

export interface RenderMapOptions {
  containerId: string;
  tracks: TrackSegment[];
  backgroundMaps: BackgroundMap[];
  initialCenter?: LatLng;
  initialZoom?: number;
}

export function renderMap(options: RenderMapOptions) {
  const renderer = new MapLibreRenderer({
    containerId: options.containerId,
    initialCenter: options.initialCenter,
    initialZoom: options.initialZoom,
    backgroundMaps: options.backgroundMaps,
  });

  renderer.addTracks(options.tracks);
  return renderer;
}
