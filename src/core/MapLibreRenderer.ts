import maplibregl from 'maplibre-gl';
import { MapController } from './MapController';
import { TrackSegment, ColorMode, BackgroundMap, LatLng } from '../types';

interface MapLibreRendererOptions {
  containerId: string;
  initialCenter?: LatLng;
  initialZoom?: number;
  backgroundMaps: BackgroundMap[];
}

interface Waypoint {
  id: string;
  name: string;
  description?: string;
  lat: number;
  lng: number;
  order?: number; // chronological
}

export class MapLibreRenderer {
  map: maplibregl.Map;
  tracks: string[] = [];
  waypoints: Waypoint[] = [];
  waypointMarkers: maplibregl.Marker[] = [];
  private backgroundMaps: BackgroundMap[];
  private activeBackgroundMap: BackgroundMap;

  constructor(options: MapLibreRendererOptions) {
    this.backgroundMaps = options.backgroundMaps;
    this.activeBackgroundMap = this.backgroundMaps[0];
    this.tracks = new Map();

    this.map = new maplibregl.Map({
      container: options.containerId,
      style: { version: 8, sources: {}, layers: [] },
      center: [options.initialCenter?.lng || 0, options.initialCenter?.lat || 0],
      zoom: options.initialZoom || 3,
    });

    this.setBackgroundMap(this.activeBackgroundMap.id);
  }

  addWaypoints(points: Waypoint[]) {
    this.waypoints = points;
    this.waypointMarkers.forEach((m) => m.remove());
    this.waypointMarkers = [];

    points.forEach((wp, idx) => {
      const el = document.createElement('div');
      el.className = 'waypoint-marker';
      el.textContent = (wp.order ?? idx + 1).toString();
      el.style.background = '#FF4500';
      el.style.color = '#fff';
      el.style.borderRadius = '50%';
      el.style.width = '24px';
      el.style.height = '24px';
      el.style.display = 'flex';
      el.style.justifyContent = 'center';
      el.style.alignItems = 'center';
      el.style.cursor = 'pointer';

      const marker = new maplibregl.Marker(el)
        .setLngLat([wp.lng, wp.lat])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`<strong>${wp.name}</strong><p>${wp.description ?? ''}</p>`))
        .addTo(this.map);

      this.waypointMarkers.push(marker);
    });
  }

  fitBoundsToWaypoints() {
    if (this.waypoints.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    this.waypoints.forEach((wp) => bounds.extend([wp.lng, wp.lat]));
    this.map.fitBounds(bounds, { padding: 50 });
  }

  addTracks(tracks: TrackSegment[]): void {
    tracks.forEach((track) => {
      const layerId = `track-${track.trackId}`;
      if (this.tracks.has(track.trackId)) return;

      const coordinates = track.coords.map((c) => [c.lng, c.lat]);

      this.map.addSource(layerId, {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {} },
      });

      this.map.addLayer({
        id: layerId,
        type: 'line',
        source: layerId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#FF0000', 'line-width': 3 },
      });

      this.tracks.set(track.trackId, layerId);
    });
  }

  removeTracks(trackIds: string[]): void {
    trackIds.forEach((trackId) => {
      const layerId = this.tracks.get(trackId);
      if (!layerId) return;
      if (this.map.getLayer(layerId)) this.map.removeLayer(layerId);
      if (this.map.getSource(layerId)) this.map.removeSource(layerId);
      this.tracks.delete(trackId);
    });
  }

  highlightTrack(trackId: string): void {
    this.tracks.forEach((layerId, id) => {
      this.map.setPaintProperty(layerId, 'line-width', id === trackId ? 6 : 3);
    });
  }

  setColorMode(mode: ColorMode): void {
    // Example: recolor each track based on the mode
    this.tracks.forEach((layerId, trackId) => {
      const color = this.getColorForTrack(trackId, mode);
      this.map.setPaintProperty(layerId, 'line-color', color);
    });
  }

  private getColorForTrack(trackId: string, mode: ColorMode): string {
    // Placeholder logic, can be replaced with real mapping
    switch (mode) {
      case 'timeOfDay':
        return '#FF4500'; // sunset
      case 'speed':
        return '#00FF00'; // slow
      case 'transportMode':
        return '#0000FF'; // walking
      case 'heartRate':
        return '#FF0000'; // high
      default:
        return '#888888';
    }
  }

  fitBounds(bounds: LatLng[]): void {
    if (bounds.length === 0) return;
    const lngLats = bounds.map((b) => [b.lng, b.lat]) as [number, number][];
    const mapBounds = lngLats.reduce(
      (acc, [lng, lat]) => {
        acc[0][0] = Math.min(acc[0][0], lng);
        acc[0][1] = Math.min(acc[0][1], lat);
        acc[1][0] = Math.max(acc[1][0], lng);
        acc[1][1] = Math.max(acc[1][1], lat);
        return acc;
      },
      [
        [Infinity, Infinity],
        [-Infinity, -Infinity],
      ] as [[number, number], [number, number]]
    );
    this.map.fitBounds(mapBounds, { padding: 20 });
  }

  setBackgroundMap(mapId: string): void {
    const mapDef = this.backgroundMaps.find((m) => m.id === mapId);
    if (!mapDef) return;
    this.activeBackgroundMap = mapDef;
    const sourceId = 'background-tile';
    if (!this.map.getSource(sourceId)) {
      this.map.addSource(sourceId, {
        type: 'raster',
        tiles: [mapDef.tileUrl],
        tileSize: 256,
        minzoom: mapDef.minZoom,
        maxzoom: mapDef.maxZoom,
      });
      this.map.addLayer({ id: 'background-layer', type: 'raster', source: sourceId, paint: {} });
    } else {
      (this.map.getSource(sourceId) as any).tiles = [mapDef.tileUrl];
    }
  }
}
