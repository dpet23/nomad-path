import { MapLibreRenderer } from './core/MapLibreRenderer';
import { TrackSegment, BackgroundMap, LatLng } from './types';
import { h, render } from 'preact';
import { Sidebar } from './ui/Sidebar';

export interface RenderMapOptions {
  containerId: string;
  tracks: TrackSegment[];
  backgroundMaps: BackgroundMap[];
  initialCenter?: LatLng;
  initialZoom?: number;
  sidebarContainerId?: string;
}

export function renderMap(options: RenderMapOptions) {
  const renderer = new MapLibreRenderer({
    containerId: options.containerId,
    initialCenter: options.initialCenter,
    initialZoom: options.initialZoom,
    backgroundMaps: options.backgroundMaps,
  });

  renderer.addTracks(options.tracks);

  // Wrap MapController for sidebar
  const mapControllerWrapper = {
    toggleTrack: (trackId: string, visible: boolean) => {
      if (visible) {
        const track = options.tracks.find((t) => t.trackId === trackId);
        if (track) renderer.addTracks([track]);
      } else {
        renderer.removeTracks([trackId]);
      }
    },
    highlightTrack: (trackId: string | null) => {
      if (trackId) renderer.highlightTrack(trackId);
      else renderer.tracks.forEach((layerId) => renderer.map.setPaintProperty(layerId, 'line-width', 3));
    },
    fitBounds: (coords: LatLng[]) => {
      renderer.fitBounds(coords);
    },
  };

  if (options.sidebarContainerId) {
    const sidebarEl = document.getElementById(options.sidebarContainerId);
    if (sidebarEl) {
      render(<Sidebar tracks={options.tracks} mapController={mapControllerWrapper} />, sidebarEl);
    }
  }

  return renderer;
}
