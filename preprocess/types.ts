export interface TrackPoint {
  lat: number;
  lng: number;
  timestamp: string; // UTC ISO string
  transportMode?: string;
  speed?: number; // m/s
  heartRate?: number; // bpm
}

export interface TrackSegment {
  points: TrackPoint[];
}

export interface Track {
  name: string;
  description?: string;
  segments: TrackSegment[];
}

export interface IntermediateTrack {
  date?: string; // local date for day grouping
  track: Track;
}

export interface PreprocessedDay {
  date: string; // YYYY-MM-DD
  tracks: Track[];
}

export interface Waypoint {
  lat: number;
  lng: number;
  label: string;
  order?: number;
}
