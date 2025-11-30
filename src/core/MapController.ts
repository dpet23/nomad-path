import { TrackSegment, ColorMode, LatLng } from '../types';

export interface MapController {
  addTracks(tracks: TrackSegment[]): void;
  removeTracks(trackIds: string[]): void;
  highlightTrack(trackId: string): void;
  setColorMode(mode: ColorMode): void;
  fitBounds(bounds: LatLng[]): void;
  setBackgroundMap(mapId: string): void;
}
