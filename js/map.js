/**
 * TripMap — a stand-in for the nomad-path UI library.
 *
 * The point of the spike is the API surface this class exposes to the
 * gallery bridge; the rendering itself is a minimal imitation of what
 * nomad-path already does (tracks coloured by day, waypoints, legend).
 *
 * Bridge-facing API:
 *   await tripMap.init()
 *   tripMap.positionAtTime(tsMs) -> {lngLat, gapMs, day, trackName} | null
 *   tripMap.addPhotoLayer(features)      clustered camera markers
 *   tripMap.on('photoClick', cb)         cb({idx, title, source, lngLat})
 *   tripMap.focus(lngLat, {zoom})
 *   tripMap.pulseAt(lngLat)
 *   tripMap.data                         the loaded geojson (shared with minimap)
 */

/* global maplibregl */

export const DAY_COLOURS = {
    1: '#4d8fd8', 2: '#3faa53', 3: '#e0a924', 4: '#c04f9b', 5: '#1eacab',
};

const SNAP_MAX_MS = 15 * 60 * 1000; // max gap when snapping to a track end

export function osmRasterStyle() {
    return {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
            osm: {
                type: 'raster',
                tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                tileSize: 256,
                attribution: '© OpenStreetMap contributors',
            },
        },
        layers: [{ id: 'basemap', type: 'raster', source: 'osm' }],
    };
}

function dayColourExpr() {
    const expr = ['match', ['get', 'day']];
    for (const [day, colour] of Object.entries(DAY_COLOURS)) expr.push(+day, colour);
    expr.push('#888');
    return expr;
}

function cameraIcon(bodyColour) {
    const s = 48; // drawn 2x, displayed at 24
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const x = c.getContext('2d');
    x.scale(2, 2);
    x.fillStyle = bodyColour;
    x.strokeStyle = '#1d232b';
    x.lineWidth = 2;
    x.beginPath();
    x.roundRect(2, 7, 20, 13, 3);
    x.fill();
    x.stroke();
    x.beginPath(); // viewfinder bump
    x.roundRect(8, 3, 8, 6, 2);
    x.fill();
    x.stroke();
    x.beginPath(); // lens
    x.arc(12, 13.5, 4, 0, Math.PI * 2);
    x.fillStyle = '#1d232b';
    x.fill();
    return x.getImageData(0, 0, s, s);
}

export class TripMap {
    #handlers = {};

    constructor(container, { dataUrl, data, mini = false } = {}) {
        this.container = container;
        this.dataUrl = dataUrl;
        this.data = data ?? null;
        this.mini = mini;
        this.hiddenDays = new Set();
        this.map = null;
        this.timeIndex = [];
    }

    on(event, cb) {
        (this.#handlers[event] ??= []).push(cb);
    }

    #emit(event, arg) {
        for (const cb of this.#handlers[event] ?? []) cb(arg);
    }

    async init() {
        if (!this.data) this.data = await (await fetch(this.dataUrl)).json();
        this.#buildTimeIndex();

        this.map = new maplibregl.Map({
            container: this.container,
            style: osmRasterStyle(),
            center: [169, -44.9],
            zoom: 8,
            interactive: !this.mini,
            attributionControl: this.mini ? false : { compact: true },
        });
        if (this.mini) {
            this.map.addControl(new maplibregl.AttributionControl({ compact: true }));
            // keep collapsed: expanded attribution covers most of a minimap, and
            // maplibre re-opens it on every resize while the map is narrow
            const collapse = () => {
                const det = this.map.getContainer().querySelector('details.maplibregl-ctrl-attrib');
                det?.removeAttribute('open');
                det?.classList.remove('maplibregl-compact-show');
            };
            collapse();
            this.map.on('resize', () => requestAnimationFrame(collapse));
        } else {
            this.map.addControl(new maplibregl.NavigationControl(), 'top-right');
            this.map.addControl(new maplibregl.FullscreenControl(), 'top-right');
        }
        await new Promise((res) => this.map.on('load', res));
        this.#addTripLayers();
        if (!this.mini) {
            this.#buildLegend();
            this.fitToTracks();
        }
        return this;
    }

    #buildTimeIndex() {
        for (const f of this.data.features) {
            if (f.properties.kind !== 'track') continue;
            const times = f.properties.times.map((t) => Date.parse(t));
            this.timeIndex.push({
                name: f.properties.name,
                day: f.properties.day,
                times,
                coords: f.geometry.coordinates,
                t0: times[0],
                t1: times[times.length - 1],
            });
        }
    }

    /** Time -> position on the recorded tracks. This is the lookup the real
     *  library must expose so GPS-less photos can be located. */
    positionAtTime(tsMs) {
        let best = null;
        for (const seg of this.timeIndex) {
            if (tsMs >= seg.t0 && tsMs <= seg.t1) {
                let i = seg.times.findIndex((t, j) => t <= tsMs && seg.times[j + 1] >= tsMs);
                if (i < 0) i = seg.times.length - 2;
                const span = seg.times[i + 1] - seg.times[i] || 1;
                const g = (tsMs - seg.times[i]) / span;
                const a = seg.coords[i];
                const b = seg.coords[i + 1];
                return {
                    lngLat: [a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g],
                    gapMs: 0,
                    day: seg.day,
                    trackName: seg.name,
                };
            }
            const gap = Math.min(Math.abs(seg.t0 - tsMs), Math.abs(seg.t1 - tsMs));
            if (!best || gap < best.gapMs) {
                const pt = Math.abs(seg.t0 - tsMs) < Math.abs(seg.t1 - tsMs)
                    ? seg.coords[0] : seg.coords[seg.coords.length - 1];
                best = { lngLat: [pt[0], pt[1]], gapMs: gap, day: seg.day, trackName: seg.name };
            }
        }
        return best && best.gapMs <= SNAP_MAX_MS ? best : null;
    }

    #addTripLayers() {
        this.map.addSource('trip', { type: 'geojson', data: this.data });
        const w = this.mini ? 2 : 3;
        this.map.addLayer({
            id: 'tracks', type: 'line', source: 'trip',
            filter: ['all', ['==', ['get', 'kind'], 'track'], ['!=', ['get', 'mode'], 'flight']],
            paint: { 'line-color': dayColourExpr(), 'line-width': w, 'line-opacity': 0.9 },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        this.map.addLayer({
            id: 'tracks-flight', type: 'line', source: 'trip',
            filter: ['all', ['==', ['get', 'kind'], 'track'], ['==', ['get', 'mode'], 'flight']],
            paint: { 'line-color': dayColourExpr(), 'line-width': w - 1, 'line-dasharray': [2, 3] },
        });
        this.map.addLayer({
            id: 'waypoints', type: 'circle', source: 'trip',
            filter: ['==', ['get', 'kind'], 'waypoint'],
            paint: {
                'circle-radius': this.mini ? 3 : 5, 'circle-color': '#fff',
                'circle-stroke-color': '#1d232b', 'circle-stroke-width': 2,
            },
        });
        if (!this.mini) {
            this.map.addLayer({
                id: 'waypoint-labels', type: 'symbol', source: 'trip',
                filter: ['==', ['get', 'kind'], 'waypoint'],
                layout: {
                    'text-field': ['get', 'name'], 'text-size': 11,
                    'text-font': ['Open Sans Semibold'],
                    'text-offset': [0, 1], 'text-anchor': 'top', 'text-optional': true,
                },
                paint: { 'text-color': '#fff', 'text-halo-color': '#1d232b', 'text-halo-width': 1.5 },
            });
        }
    }

    fitToTracks() {
        const bounds = new maplibregl.LngLatBounds();
        for (const seg of this.timeIndex) for (const c of seg.coords) bounds.extend([c[0], c[1]]);
        this.map.fitBounds(bounds, { padding: 40, duration: 0 });
    }

    /** Clustered camera markers. `features` are Point features with flat
     *  properties {idx, title, source: 'exif'|'track'}. */
    addPhotoLayer(features) {
        this.map.addImage('photo-exif', cameraIcon('#ffffff'), { pixelRatio: 2 });
        this.map.addImage('photo-track', cameraIcon('#ffd75e'), { pixelRatio: 2 });
        this.map.addSource('photos', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features },
            cluster: true, clusterRadius: 36, clusterMaxZoom: 15,
        });
        this.map.addLayer({
            id: 'photo-clusters', type: 'circle', source: 'photos',
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': '#ffd75e',
                'circle-radius': ['step', ['get', 'point_count'], 12, 5, 16, 10, 20],
                'circle-stroke-color': '#1d232b', 'circle-stroke-width': 2,
            },
        });
        this.map.addLayer({
            id: 'photo-cluster-count', type: 'symbol', source: 'photos',
            filter: ['has', 'point_count'],
            layout: {
                'text-field': ['get', 'point_count_abbreviated'],
                'text-font': ['Open Sans Semibold'], 'text-size': 12,
            },
            paint: { 'text-color': '#1d232b' },
        });
        this.map.addLayer({
            id: 'photo-points', type: 'symbol', source: 'photos',
            filter: ['!', ['has', 'point_count']],
            layout: {
                'icon-image': ['concat', 'photo-', ['get', 'source']],
                'icon-allow-overlap': true, 'icon-size': 1,
            },
        });

        this.map.on('click', 'photo-points', (e) => {
            const f = e.features[0];
            this.#emit('photoClick', {
                ...f.properties,
                lngLat: f.geometry.coordinates,
            });
        });
        this.map.on('click', 'photo-clusters', async (e) => {
            const f = e.features[0];
            const zoom = await this.map.getSource('photos')
                .getClusterExpansionZoom(f.properties.cluster_id);
            this.map.easeTo({ center: f.geometry.coordinates, zoom: zoom + 0.5 });
        });
        for (const layer of ['photo-points', 'photo-clusters']) {
            this.map.on('mouseenter', layer, () => { this.map.getCanvas().style.cursor = 'pointer'; });
            this.map.on('mouseleave', layer, () => { this.map.getCanvas().style.cursor = ''; });
        }
        this.#legendAddPhotosRow?.();
    }

    setPhotoVisibility(visible) {
        for (const layer of ['photo-clusters', 'photo-cluster-count', 'photo-points']) {
            if (this.map.getLayer(layer)) {
                this.map.setLayoutProperty(layer, 'visibility', visible ? 'visible' : 'none');
            }
        }
    }

    focus(lngLat, { zoom = 13 } = {}) {
        this.map.flyTo({ center: lngLat, zoom, speed: 1.4 });
    }

    pulseAt(lngLat) {
        const el = document.createElement('div');
        el.className = 'spike-pulse';
        const marker = new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(this.map);
        setTimeout(() => marker.remove(), 3800);
    }

    #applyDayFilter() {
        const hidden = [...this.hiddenDays];
        const notHidden = ['!', ['in', ['get', 'day'], ['literal', hidden]]];
        this.map.setFilter('tracks', ['all',
            ['==', ['get', 'kind'], 'track'], ['!=', ['get', 'mode'], 'flight'], notHidden]);
        this.map.setFilter('tracks-flight', ['all',
            ['==', ['get', 'kind'], 'track'], ['==', ['get', 'mode'], 'flight'], notHidden]);
    }

    #legendAddPhotosRow = null;

    #buildLegend() {
        const el = document.createElement('div');
        el.className = 'legend';
        const days = [...new Set(this.timeIndex.map((s) => s.day))].sort();
        for (const day of days) {
            const row = document.createElement('div');
            row.className = 'row';
            row.innerHTML = `<span class="swatch" style="background:${DAY_COLOURS[day]}"></span>Day ${day}`;
            row.onclick = () => {
                this.hiddenDays.has(day) ? this.hiddenDays.delete(day) : this.hiddenDays.add(day);
                row.classList.toggle('off', this.hiddenDays.has(day));
                this.#applyDayFilter();
            };
            el.appendChild(row);
        }
        // photos row appears once the bridge adds the layer
        this.#legendAddPhotosRow = () => {
            const hr = document.createElement('hr');
            el.appendChild(hr);
            const row = document.createElement('div');
            row.className = 'row';
            row.innerHTML = '<span class="swatch dot" style="background:#ffd75e"></span>Photos';
            let visible = true;
            row.onclick = () => {
                visible = !visible;
                row.classList.toggle('off', !visible);
                this.setPhotoVisibility(visible);
            };
            el.appendChild(row);
        };
        this.map.getContainer().appendChild(el);
    }

    destroy() {
        this.map?.remove();
    }
}
