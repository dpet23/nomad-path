import { MapLibreRenderer } from './core/MapLibreRenderer';
import { TrackSegment, BackgroundMap, LatLng } from './types';
import { h, render } from 'preact';
import { Sidebar } from './ui/Sidebar';
import { ZoomControl } from './ui/ZoomControl';
import { MapSwitcher } from './ui/MapSwitcher';

export interface RenderMapOptions {
  containerId: string;
  tracks: TrackSegment[];
  backgroundMaps: BackgroundMap[];
  initialCenter?: LatLng;
  initialZoom?: number;
  sidebarContainerId?: string;
  zoomControlContainerId?: string;
  mapSwitcherContainerId?: string;
}

export function renderMap(options: RenderMapOptions) {
  const renderer = new MapLibreRenderer({
    containerId: options.containerId,
    initialCenter: options.initialCenter,
    initialZoom: options.initialZoom,
    backgroundMaps: options.backgroundMaps,
  });

  renderer.addTracks(options.tracks);

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

  if (options.zoomControlContainerId) {
    const zoomEl = document.getElementById(options.zoomControlContainerId);
    if (zoomEl) {
      render(<ZoomControl map={renderer} />, zoomEl);
    }
  }

  if (options.mapSwitcherContainerId) {
    const switcherEl = document.getElementById(options.mapSwitcherContainerId);
    if (switcherEl) {
      render(<MapSwitcher map={renderer} maps={options.backgroundMaps} />, switcherEl);
    }
  }

  return renderer;
}
