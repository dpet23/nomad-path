interface RenderMapOptions {
  containerId: string;
  tileSource: string;       // URL or folder of MVT tiles
  tracksMeta: string;       // JSON metadata for tracks/days/trips
  backgroundMaps: BackgroundMap[];
  initialZoom?: number;
  initialCenter?: LatLng;
  colorMode?: ColorMode;
  uiOptions?: UIOptions;
}

interface MapController {
  setColorMode(mode: ColorMode): void;
  toggleTrack(trackId: string, visible?: boolean): void;
  highlightTrack(trackId: string): void;
  fitBounds(bounds: LatLngBounds): void;
  setBackgroundMap(mapId: string): void;
  on(event: MapEvent, callback: Function): void;
}
