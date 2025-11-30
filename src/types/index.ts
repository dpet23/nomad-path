// LatLng, TrackSegment, BackgroundMap, ColorMode

export interface LatLng {
  lat: number;
  lng: number;
}

export interface TrackSegment {
  tripId: string;
  tripName: string;
  dayId: string;
  dayLabel: string;
  trackId: string;
  trackName: string;
  segmentId: number;
  coords: LatLng[];
  timestamps: number[]; // UTC timestamps
  speed?: number[];
  transportMode?: string;
  heartRate?: number[];
}

export interface BackgroundMap {
  id: string;
  name: string;
  tileUrl: string;
  minZoom: number;
  maxZoom: number;
  attribution?: string;
}

export type ColorMode = 'timeOfDay' | 'speed' | 'transportMode' | 'heartRate';
