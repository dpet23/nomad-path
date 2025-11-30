interface MapRenderer {
  addTracks(tracks: TrackSegment[]): void;
  removeTracks(trackIds: string[]): void;
  highlightTrack(trackId: string): void;
  setColorMode(mode: ColorMode): void;
  fitBounds(bounds: LatLngBounds): void;
}
