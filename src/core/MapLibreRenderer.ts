import maplibregl from 'maplibre-gl';
import { MapController } from './MapController';
import { TrackSegment, ColorMode, BackgroundMap, LatLng } from '../types';

interface MapLibreRendererOptions {
  containerId: string;
  initialCenter?: LatLng;
  initialZoom?: number;
  backgroundMaps: BackgroundMap[];
}

export class MapLibreRenderer implements MapController {
  private map: maplibregl.Map;
  private tracks: Map<string, string>; // trackId -> layerId
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
    console.log(`Color mode set to ${mode}`);
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
