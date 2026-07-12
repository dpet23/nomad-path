import {Deck, FlyToInterpolator, WebMercatorViewport} from '@deck.gl/core';
import {PathLayer, ScatterplotLayer} from '@deck.gl/layers';
import {Tile3DLayer} from '@deck.gl/geo-layers';
import {_TerrainExtension as TerrainExtension} from '@deck.gl/extensions';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const TILESET_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json';
const MAX_SSE = Number(import.meta.env.VITE_MAX_SCREEN_SPACE_ERROR) || 16;

// Categorical palette: fixed slot order (CVD-optimized), dark-surface variants.
// Modes beyond 8 fold into the muted "other" gray — never generate extra hues.
const PALETTE = [
  [57, 135, 229], // blue
  [25, 158, 112], // aqua
  [201, 133, 0], // yellow
  [0, 131, 0], // green
  [144, 133, 233], // violet
  [230, 103, 103], // red
  [213, 81, 129], // magenta
  [217, 89, 38] // orange
];
const OTHER_COLOR = [137, 135, 129];

const $ = id => document.getElementById(id);
const els = {
  stats: $('stats'),
  banner: $('banner'),
  controls: $('controls'),
  legend: $('legend'),
  attribution: $('attribution'),
  offset: $('offset'),
  offsetValue: $('offset-value'),
  exag: $('exag'),
  exagValue: $('exag-value'),
  clampRow: $('clamp-row'),
  clamp: $('clamp'),
  xray: $('xray'),
  fileInput: $('file-input')
};

const tilesEnabled = Boolean(GOOGLE_MAPS_API_KEY);

const state = {
  tracks: [], // {path: [[lng,lat,z],...], name, day, group, mode}
  pois: [], // {position: [lng,lat,z], name, category}
  modeColors: new Map(), // mode -> [r,g,b]
  offset: 0,
  exaggeration: 1,
  clamp: false,
  xray: false
};

function showBanner(msg, isError = false) {
  els.banner.style.display = 'block';
  els.banner.className = isError ? 'error' : '';
  els.banner.textContent = msg;
}

if (!tilesEnabled) {
  showBanner(
    'No Google Maps API key found — tracks will render without the 3D tiles basemap. ' +
      'Copy .env.example to .env.local, set VITE_GOOGLE_MAPS_API_KEY and restart. See README.'
  );
} else {
  els.clampRow.style.display = 'flex';
}

const esc = s =>
  String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);

function getTooltip({object, layer}) {
  if (!object) return null;
  const style = {
    background: '#1a1a19',
    color: '#ffffff',
    border: '1px solid rgba(255,255,255,0.15)',
    'border-radius': '6px',
    padding: '6px 10px',
    'font-size': '12px',
    'font-family': 'system-ui, sans-serif',
    'max-width': '260px'
  };
  if (layer.id === 'pois') {
    return {html: `<b>${esc(object.name)}</b>${object.category ? `<br/>${esc(object.category)}` : ''}`, style};
  }
  const parts = [object.day, object.mode, object.group].filter(Boolean).map(esc);
  return {html: `<b>${esc(object.name)}</b><br/>${parts.join(' · ')}`, style};
}

function buildTileLayer() {
  if (!tilesEnabled) return null;
  return new Tile3DLayer({
    id: 'google-3d-tiles',
    data: TILESET_URL,
    loadOptions: {
      // Custom fetch so HTTP failures (bad key, API not enabled) surface in
      // the UI instead of only the console.
      fetch: async (url, options) => {
        const response = await fetch(url, {
          ...options,
          headers: {...options?.headers, 'X-GOOG-API-KEY': GOOGLE_MAPS_API_KEY}
        });
        if (!response.ok) {
          showBanner(
            `Google 3D Tiles request failed: ${response.status} ${response.statusText}. ` +
              'Check that your API key is valid and the Map Tiles API is enabled (see README).',
            true
          );
        }
        return response;
      },
      tileset: {
        maximumScreenSpaceError: MAX_SSE,
        // Google requires displaying data attributions; collect them from
        // the tiles currently on screen.
        onTraversalComplete(selectedTiles) {
          const credits = new Set();
          for (const tile of selectedTiles) {
            const copyright = tile.content?.gltf?.asset?.copyright;
            if (copyright) copyright.split(';').forEach(c => credits.add(c.trim()));
          }
          els.attribution.textContent = ['Google', ...credits].join(' • ');
          return selectedTiles;
        }
      }
    },
    operation: 'terrain+draw'
  });
}

function buildLayers() {
  const layers = [buildTileLayer()];

  if (state.tracks.length) {
    layers.push(
      new PathLayer({
        id: 'tracks',
        data: state.tracks,
        getPath: d =>
          state.offset === 0 && state.exaggeration === 1
            ? d.path
            : d.path.map(([x, y, z]) => [x, y, z * state.exaggeration + state.offset]),
        getColor: d => state.modeColors.get(d.mode) ?? OTHER_COLOR,
        getWidth: 4,
        widthMinPixels: 2.5,
        capRounded: true,
        jointRounded: true,
        billboard: false,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 180],
        updateTriggers: {getPath: [state.offset, state.exaggeration]},
        extensions: state.clamp && tilesEnabled ? [new TerrainExtension()] : [],
        parameters: state.xray ? {depthCompare: 'always'} : {}
      })
    );
  }

  if (state.pois.length) {
    layers.push(
      new ScatterplotLayer({
        id: 'pois',
        data: state.pois,
        getPosition: d => d.position,
        getFillColor: [255, 255, 255],
        getLineColor: [13, 13, 13],
        lineWidthMinPixels: 1.5,
        stroked: true,
        radiusMinPixels: 5,
        radiusMaxPixels: 10,
        pickable: true,
        // POIs carry no elevation — drape them onto the 3D surface when we have one.
        extensions: tilesEnabled ? [new TerrainExtension()] : [],
        parameters: state.xray ? {depthCompare: 'always'} : {}
      })
    );
  }

  return layers.filter(Boolean);
}

const deck = new Deck({
  parent: $('map'),
  initialViewState: {longitude: 0, latitude: 20, zoom: 1.2, pitch: 0, bearing: 0},
  controller: {touchRotate: true, inertia: 250},
  getTooltip,
  onError: err => {
    console.error(err);
    showBanner(
      `Layer error: ${err.message}. ` +
        (tilesEnabled ? 'If 3D tiles fail to load, check that your API key is valid and Map Tiles API is enabled.' : ''),
      true
    );
  },
  layers: buildLayers()
});

function updateLayers() {
  deck.setProps({layers: buildLayers()});
}

// ---------------------------------------------------------------------------
// GeoJSON processing
// ---------------------------------------------------------------------------

const normalizeLon = lon => ((((lon + 180) % 360) + 360) % 360) - 180;

// Rewrite longitudes so consecutive points never differ by more than 180° —
// a path crossing the antimeridian stays continuous (e.g. 179.8 → 180.2
// instead of 179.8 → -179.8), which stops deck drawing world-spanning
// segments.
function unwrapPath(path) {
  let prev = normalizeLon(path[0][0]);
  return path.map(([lon, lat, z]) => {
    const unwrapped = lon - 360 * Math.round((lon - prev) / 360);
    prev = unwrapped;
    return [unwrapped, lat, z];
  });
}

// deck's MapView doesn't repeat world copies (repeat:true hangs with this
// scene), so every item gets duplicates shifted ±360°: whichever side of the
// antimeridian the camera is on, a continuous copy of everything is visible.
// ~3x vertex count is trivial at this data size.
function pushWithMirrors(list, item, shiftItem) {
  list.push(item);
  list.push({...shiftItem(item, -360), isCopy: true});
  list.push({...shiftItem(item, 360), isCopy: true});
}

const shiftTrack = (t, dx) => ({...t, path: t.path.map(([x, y, z]) => [x + dx, y, z])});
const shiftPoi = (p, dx) => ({...p, position: [p.position[0] + dx, p.position[1], p.position[2]]});

function processGeoJSON(geojson) {
  const tracks = [];
  const pois = [];
  let missingElevations = 0;
  let skipped = 0;

  for (const f of geojson.features ?? []) {
    const geom = f.geometry;
    const props = f.properties ?? {};
    if (!geom) continue;

    if (geom.type === 'LineString' || geom.type === 'MultiLineString') {
      const lines = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;
      // elevations is a per-point array in properties, aligned with coordinates
      // (only meaningful for single LineStrings).
      const elevs = geom.type === 'LineString' ? props.elevations : null;
      const aligned = Array.isArray(elevs) && elevs.length === geom.coordinates.length;
      if (geom.type === 'LineString' && !aligned) missingElevations++;

      for (const coords of lines) {
        const path = unwrapPath(
          coords.map((c, i) => [
            c[0],
            c[1],
            aligned && Number.isFinite(elevs[i]) ? elevs[i] : Number.isFinite(c[2]) ? c[2] : 0
          ])
        );
        pushWithMirrors(
          tracks,
          {
            path,
            name: props.name ?? 'Unnamed track',
            day: props.day,
            group: props.group,
            mode: props.transportMode ?? 'unknown'
          },
          shiftTrack
        );
      }
    } else if (geom.type === 'Point') {
      const [lng, lat, z] = geom.coordinates;
      pushWithMirrors(
        pois,
        {position: [normalizeLon(lng), lat, Number.isFinite(z) ? z : 0], name: props.name ?? 'POI', category: props.category},
        shiftPoi
      );
    } else {
      skipped++;
    }
  }

  return {tracks, pois, missingElevations, skipped};
}

function assignModeColors(tracks) {
  const counts = new Map();
  for (const t of tracks) {
    if (t.isCopy) continue;
    counts.set(t.mode, (counts.get(t.mode) ?? 0) + 1);
  }
  const modes = [...counts.keys()].sort();

  const colors = new Map();
  modes.forEach((mode, i) => colors.set(mode, i < PALETTE.length ? PALETTE[i] : OTHER_COLOR));
  return {colors, counts, modes};
}

function renderLegend(modes, counts, colors) {
  els.legend.style.display = 'block';
  els.legend.innerHTML = '';
  for (const mode of modes) {
    const row = document.createElement('div');
    row.className = 'row';
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = `rgb(${colors.get(mode).join(',')})`;
    const label = document.createElement('span');
    label.textContent = mode;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = counts.get(mode);
    row.append(swatch, label, count);
    els.legend.appendChild(row);
  }
}

function flyToData() {
  // Mirror copies sit ±360° out of the canonical range and would wreck the bbox.
  const all = state.tracks
    .filter(t => !t.isCopy)
    .flatMap(t => t.path)
    .concat(state.pois.filter(p => !p.isCopy).map(p => p.position));
  if (!all.length) return;

  // The data may straddle the antimeridian (e.g. Australia → Hawaii → Fiji).
  // Compute the bbox in both raw [-180,180] and shifted [0,360) framings and
  // keep whichever is narrower.
  const bbox = lngs => {
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    all.forEach(([lng, lat], i) => {
      minLng = Math.min(minLng, lngs[i]);
      maxLng = Math.max(maxLng, lngs[i]);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });
    return {minLng, maxLng, minLat, maxLat, span: maxLng - minLng};
  };
  const raw = bbox(all.map(p => p[0]));
  const shifted = bbox(all.map(p => (p[0] < 0 ? p[0] + 360 : p[0])));
  const b = shifted.span < raw.span ? shifted : raw;

  const viewport = new WebMercatorViewport({width: window.innerWidth, height: window.innerHeight});
  let vs;
  try {
    vs = viewport.fitBounds(
      [
        [b.minLng, b.minLat],
        [b.maxLng, b.maxLat]
      ],
      {padding: 40, maxZoom: 16}
    );
  } catch {
    vs = {longitude: (b.minLng + b.maxLng) / 2, latitude: (b.minLat + b.maxLat) / 2, zoom: 12};
  }

  deck.setProps({
    initialViewState: {
      longitude: vs.longitude > 180 ? vs.longitude - 360 : vs.longitude,
      latitude: vs.latitude,
      zoom: vs.zoom,
      pitch: 45,
      bearing: 0,
      transitionDuration: 2500,
      transitionInterpolator: new FlyToInterpolator()
    }
  });
}

function loadGeoJSONText(text, filename) {
  let geojson;
  try {
    geojson = JSON.parse(text);
  } catch (e) {
    showBanner(`Could not parse ${filename}: ${e.message}`, true);
    return;
  }

  const {tracks, pois, missingElevations, skipped} = processGeoJSON(geojson);
  if (!tracks.length && !pois.length) {
    showBanner(`${filename}: no LineString or Point features found.`, true);
    return;
  }

  state.tracks = tracks;
  state.pois = pois;
  const {colors, counts, modes} = assignModeColors(tracks);
  state.modeColors = colors;

  const notes = [];
  if (missingElevations) notes.push(`${missingElevations} track(s) without aligned elevations (rendered at ground level)`);
  if (skipped) notes.push(`${skipped} unsupported feature(s) skipped`);
  const nTracks = tracks.filter(t => !t.isCopy).length;
  const nPois = pois.filter(p => !p.isCopy).length;
  els.stats.textContent =
    `${filename}: ${nTracks} tracks, ${nPois} POIs.` + (notes.length ? ` ${notes.join('; ')}.` : '');

  els.controls.style.display = 'block';
  renderLegend(modes, counts, colors);
  updateLayers();
  flyToData();
}

function loadFile(file) {
  file.text().then(text => loadGeoJSONText(text, file.name));
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------

els.fileInput.addEventListener('change', e => {
  if (e.target.files?.[0]) loadFile(e.target.files[0]);
});

let dragDepth = 0;
window.addEventListener('dragenter', e => {
  e.preventDefault();
  dragDepth++;
  document.body.classList.add('dragging');
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    document.body.classList.remove('dragging');
  }
});
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const file = e.dataTransfer?.files?.[0];
  if (file) loadFile(file);
});

els.offset.addEventListener('input', () => {
  state.offset = Number(els.offset.value);
  els.offsetValue.textContent = `${state.offset} m`;
  updateLayers();
});
els.exag.addEventListener('input', () => {
  state.exaggeration = Number(els.exag.value);
  els.exagValue.textContent = `×${state.exaggeration.toFixed(1)}`;
  updateLayers();
});
els.clamp.addEventListener('change', () => {
  state.clamp = els.clamp.checked;
  updateLayers();
});
els.xray.addEventListener('change', () => {
  state.xray = els.xray.checked;
  updateLayers();
});

// Expose for headless verification.
window.__app = {state, deck, loadGeoJSONText};
