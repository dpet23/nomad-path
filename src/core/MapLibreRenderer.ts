import maplibregl from 'maplibre-gl';
import { MapController } from './MapController';
import { TrackSegment, ColorMode, BackgroundMap, LatLng } from '../types';
import SunCalc from 'suncalc';
import { DateTime } from 'luxon';

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

  private getColorForTrack(trackId: string, mode: ColorMode): string {
    const track = this.trackSegments.find((t) => t.trackId === trackId);
    if (!track || track.points.length === 0) return '#888888';

    switch (mode) {
      case 'timeOfDay': {
        // Stage 6 implementation (sunrise/midday/sunset gradient)
        const midIndex = Math.floor(track.points.length / 2);
        const midPoint = track.points[midIndex];
        const localTime = DateTime.fromISO(midPoint.timestamp, { zone: 'utc' }).setZone(this.getTimeZone(midPoint.lat, midPoint.lng));
        const { sunrise, sunset } = SunCalc.getTimes(new Date(localTime.toISO()), midPoint.lat, midPoint.lng);

        let dayFraction: number;
        const sunriseT = DateTime.fromJSDate(sunrise);
        const sunsetT = DateTime.fromJSDate(sunset);
        if (localTime < sunriseT) dayFraction = 0;
        else if (localTime > sunsetT) dayFraction = 1;
        else dayFraction = (localTime.toMillis() - sunriseT.toMillis()) / (sunsetT.toMillis() - sunriseT.toMillis());

        return this.interpolateColor('#FFA500', '#00FF00', dayFraction); // sunrise->midday
      }

      case 'speed': {
        // Continuous linear scale: slow=green, medium=yellow, fast=red
        const speeds = track.points.map((p) => p.speed ?? 0);
        const validSpeeds = speeds.filter((s) => s > 0);
        if (validSpeeds.length === 0) return '#888888'; // no data

        const minSpeed = Math.min(...validSpeeds);
        const maxSpeed = Math.max(...validSpeeds);
        const midIndex = Math.floor(speeds.length / 2);
        const speed = speeds[midIndex] ?? minSpeed;

        const fraction = maxSpeed === minSpeed ? 0.5 : (speed - minSpeed) / (maxSpeed - minSpeed);
        return this.interpolateColor('#00FF00', '#FF0000', fraction); // green->red
      }

      case 'transportMode': {
        // Categorical mapping
        const transportColors: Record<string, string> = {
          walking: '#00FF00',
          driving: '#0000FF',
          public: '#FF00FF',
          boat: '#00FFFF',
        };
        const mode = track.points[0].transportMode?.toLowerCase() ?? 'unknown';
        return transportColors[mode] ?? '#888888';
      }

      case 'heartRate': {
        const hrValues = track.points.map((p) => p.heartRate ?? 0).filter((v) => v > 0);
        if (hrValues.length === 0) return '#888888'; // no data

        const minHR = Math.min(...hrValues);
        const maxHR = Math.max(...hrValues);
        const midIndex = Math.floor(track.points.length / 2);
        const hr = track.points[midIndex].heartRate ?? minHR;

        const fraction = maxHR === minHR ? 0.5 : (hr - minHR) / (maxHR - minHR);
        return this.interpolateColor('#00FF00', '#FF0000', fraction); // low->high
      }

      default:
        return '#888888';
    }
  };

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
    if (coords.length === 0) return;

    let minLng = coords[0].lng;
    let maxLng = coords[0].lng;
    let minLat = coords[0].lat;
    let maxLat = coords[0].lat;

    coords.forEach(({ lng, lat }) => {
      const nLng = this.normalizeLng(lng);
      minLng = Math.min(minLng, nLng);
      maxLng = Math.max(maxLng, nLng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });

    // Handle crossing anti-meridian
    if (maxLng - minLng > 180) {
      // Shift all longitudes to positive or negative side
      coords.forEach((c) => (c.lng = c.lng < 0 ? c.lng + 360 : c.lng));
      minLng = Math.min(...coords.map((c) => c.lng));
      maxLng = Math.max(...coords.map((c) => c.lng));
    }

    const bounds = new maplibregl.LngLatBounds([minLng, minLat], [maxLng, maxLat]);
    this.map.fitBounds(bounds, { padding: 50 });
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
