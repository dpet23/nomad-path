import maplibregl from 'maplibre-gl';
import { MapController } from './MapController';
import { TrackSegment, ColorMode, BackgroundMap, LatLng } from '../types';
import SunCalc from 'suncalc';
import { DateTime } from 'luxon';
import { scaleOrdinal, schemeCategory10 } from 'd3-scale';

interface TrackPoint {
  lat: number;
  lng: number;
  timestamp: string; // UTC ISO string
  speed?: number;
  transportMode?: string;
  heartRate?: number;
}

interface TrackSegment {
  trackId: string;
  points: TrackPoint[];
  name?: string;
  description?: string;
}

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

  addTracks(tracks: TrackSegment[]) {
    tracks.forEach((track) => {
      const splitSegments = this.splitTrackForAntiMeridian(track.points);
      splitSegments.forEach((segment, idx) => {
        const geojson = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: segment.map((p) => [this.normalizeLng(p.lng), p.lat]),
          },
          properties: { trackId: track.trackId, segmentIndex: idx },
        };

        const layerId = `track-${track.trackId}-${idx}`;
        this.map.addSource(layerId, { type: 'geojson', data: geojson });
        this.map.addLayer({
          id: layerId,
          type: 'line',
          source: layerId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#888888', 'line-width': 3 },
        });
        this.tracks.push(layerId);
      });
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

  private generateTransportModeColors(tracks: TrackSegment[]) {
    const modes = new Set<string>();
    tracks.forEach(track => {
      track.points.forEach(p => {
        if (p.transportMode) modes.add(p.transportMode.toLowerCase());
      });
    });

    const palette = scaleOrdinal(schemeCategory10).domain(Array.from(modes));
    this.transportModeColorMap = Object.fromEntries(
      Array.from(modes).map(mode => [mode, palette(mode)])
    );
  }

  private computeContinuousScales(tracks: TrackSegment[]) {
    const speedValues = tracks.flatMap(t => t.points.map(p => p.speed ?? []).filter(s => s > 0));
    const hrValues = tracks.flatMap(t => t.points.map(p => p.heartRate ?? []).filter(h => h > 0));

    this.speedScale = speedValues.length
      ? (v: number) => this.interpolateColor('#00FF00', '#FF0000', (v - Math.min(...speedValues)) / (Math.max(...speedValues) - Math.min(...speedValues)))
      : null;

    this.heartRateScale = hrValues.length
      ? (v: number) => this.interpolateColor('#00FF00', '#FF0000', (v - Math.min(...hrValues)) / (Math.max(...hrValues) - Math.min(...hrValues)))
      : null;
  }

  private generateColorModeOptions(tracks: TrackSegment[]) {
    const options: { value: ColorMode, label: string }[] = [];

    if (tracks.some(t => t.points.some(p => p.timestamp))) options.push({ value: 'timeOfDay', label: 'Time of Day' });
    if (tracks.some(t => t.points.some(p => p.speed))) options.push({ value: 'speed', label: 'Speed' });
    if (tracks.some(t => t.points.some(p => p.transportMode))) options.push({ value: 'transportMode', label: 'Transport Mode' });
    if (tracks.some(t => t.points.some(p => p.heartRate))) options.push({ value: 'heartRate', label: 'Heart Rate' });

    return options;
  }

  private getColorForTrack(trackId: string, mode: ColorMode): string {
    const track = this.trackSegments.find(t => t.trackId === trackId);
    if (!track || track.points.length === 0) return '#888888';

    switch (mode) {
      case 'timeOfDay':
        return this.getTimeOfDayColor(track);

      case 'speed':
        if (!this.speedScale) return '#888888';
        const speedMid = track.points[Math.floor(track.points.length / 2)].speed ?? 0;
        return this.speedScale(speedMid);

      case 'transportMode':
        const modeKey = track.points[0].transportMode?.toLowerCase() ?? 'unknown';
        return this.transportModeColorMap[modeKey] ?? '#888888';

      case 'heartRate':
        if (!this.heartRateScale) return '#888888';
        const hrMid = track.points[Math.floor(track.points.length / 2)].heartRate ?? 0;
        return this.heartRateScale(hrMid);

      default:
        return '#888888';
    }
  }

  // Simple linear color interpolation
  private interpolateColor(color1: string, color2: string, fraction: number): string {
    const c1 = parseInt(color1.slice(1), 16);
    const c2 = parseInt(color2.slice(1), 16);

    const r = Math.round(((c1 >> 16) * (1 - fraction) + (c2 >> 16) * fraction));
    const g = Math.round((((c1 >> 8) & 0xff) * (1 - fraction) + ((c2 >> 8) & 0xff) * fraction));
    const b = Math.round(((c1 & 0xff) * (1 - fraction) + (c2 & 0xff) * fraction));

    return `rgb(${r},${g},${b})`;
  }

  // Placeholder: return a timezone string based on lat/lng. For more accuracy, integrate a tz lookup library.
  private getTimeZone(lat: number, lng: number): string {
    return 'local'; // or 'Etc/UTC' for now
  }

  fitBounds(coords: LatLng[]) {
    if (!coords.length) return;

    let minLng = coords[0].lng;
    let maxLng = coords[0].lng;
    let minLat = coords[0].lat;
    let maxLat = coords[0].lat;

    coords.forEach(({ lng, lat }) => {
      const nLng = ((lng + 180) % 360 + 360) % 360 - 180;
      minLng = Math.min(minLng, nLng);
      maxLng = Math.max(maxLng, nLng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });

    this.map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 50 });
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

  /**
   * Normalize longitude to [-180, +180]
   */
  private normalizeLng(lng: number): number {
    let v = ((lng + 180) % 360 + 360) % 360 - 180;
    return v;
  }

  /**
   * Split track into segments if crossing anti-meridian
   */
  private splitTrackForAntiMeridian(points: TrackPoint[]): TrackPoint[][] {
    if (points.length === 0) return [];

    const segments: TrackPoint[][] = [];
    let currentSegment: TrackPoint[] = [points[0]];

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      const delta = Math.abs(curr.lng - prev.lng);
      if (delta > 180) {
        // Crossing anti-meridian
        segments.push(currentSegment);
        currentSegment = [curr];
      } else {
        currentSegment.push(curr);
      }
    }

    if (currentSegment.length > 0) segments.push(currentSegment);

    return segments;
  }
}
