/**
 * PhotoSwipe v5 plugin: a minimap in the gallery overlay that follows the
 * current slide's location.
 *
 * PhotoSwipe destroys its whole DOM every time the lightbox closes, so the
 * minimap (a MapLibre instance with a live WebGL context) lives in a hidden
 * holder on <body> and is REPARENTED into each PhotoSwipe session via
 * ui.registerElement + onInit, then rescued on 'destroy'. Moving a canvas
 * within the DOM keeps its WebGL context; only a resize() is needed.
 *
 * Location comes from data-resolved-* attributes that the bridge stashed on
 * each card's <a>; source is shown as a small badge (EXIF vs ≈track).
 * Clicking the minimap toggles a larger size. The minimap itself is
 * non-interactive so it never fights PhotoSwipe's swipe/zoom gestures.
 */

import { TripMap } from './map.js';

/* global maplibregl */

export default class PhotoSwipeMinimapPlugin {
    constructor(lightbox, { tripMap, galleryEl, zoom = 11 } = {}) {
        this.lightbox = lightbox;
        this.mainMap = tripMap;
        this.zoom = zoom;
        this.mini = null;        // TripMap(mini) — created on first open, reused forever
        this.miniReady = null;   // promise
        this.marker = null;
        this.lastLngLat = null;
        this.firstShow = true;

        this.holder = document.createElement('div');
        this.holder.className = 'pswp__minimap no-location';
        this.holder.innerHTML =
            '<div class="nofix">No location recorded for this item</div>'
            + '<span class="src-badge"></span>'
            + '<div class="mapwrap" style="width:100%;height:100%"></div>';
        this.holder.style.display = 'none';
        this.holder.addEventListener('click', (e) => {
            e.stopPropagation();
            this.holder.classList.toggle('expanded');
            // let the CSS size transition finish before resizing the canvas
            setTimeout(() => this.mini?.map.resize(), 220);
        });
        document.body.appendChild(this.holder);

        lightbox.on('uiRegister', () => {
            lightbox.pswp.ui.registerElement({
                name: 'minimap-slot',
                appendTo: 'root',
                onInit: (el) => {
                    el.appendChild(this.holder);
                    this.holder.style.display = '';
                    this.firstShow = true;
                    this.#ensureMini();
                },
            });
        });
        // bound via the lightbox so they survive pswp recreation AND catch
        // the initial 'change' that fires during pswp.init()
        lightbox.on('change', () => this.#update(lightbox.pswp?.currSlide));
        lightbox.on('close', () => {
            // hand the story back to the main map
            if (this.lastLngLat && this.mainMap?.map) {
                this.mainMap.pulseAt(this.lastLngLat);
                const bounds = this.mainMap.map.getBounds();
                if (!bounds.contains(this.lastLngLat)) {
                    this.mainMap.map.easeTo({ center: this.lastLngLat });
                }
            }
        });
        lightbox.on('destroy', () => {
            // rescue the holder before PhotoSwipe removes its DOM
            this.holder.style.display = 'none';
            this.holder.classList.remove('expanded');
            document.body.appendChild(this.holder);
        });

        // if the gallery was opened before the map finished loading, the
        // bridge signals us to re-resolve the current slide
        galleryEl?.addEventListener('spike:locations-resolved', () => {
            if (this.lightbox.pswp?.currSlide) this.#update(this.lightbox.pswp.currSlide);
        });
    }

    #ensureMini() {
        if (this.miniReady) return this.miniReady;
        const wrap = this.holder.querySelector('.mapwrap');
        this.mini = new TripMap(wrap, { data: this.mainMap.data, mini: true });
        this.miniReady = this.mini.init().then(() => {
            this.marker = new maplibregl.Marker({ color: '#ffd75e', scale: 0.8 })
                .setLngLat([0, 0])
                .addTo(this.mini.map);
            this.marker.getElement().style.display = 'none';
            this.mini.map.resize();
        });
        return this.miniReady;
    }

    async #update(slide) {
        const card = slide?.data?.element;
        if (!card) return;
        const a = card.matches('a') ? card : card.querySelector('a');
        const { resolvedLat, resolvedLon, resolvedSource } = a?.dataset ?? {};
        await this.#ensureMini();
        if (resolvedLat === undefined) {
            this.holder.classList.add('no-location');
            this.marker.getElement().style.display = 'none';
            this.lastLngLat = null;
            return;
        }
        const lngLat = [+resolvedLon, +resolvedLat];
        this.lastLngLat = lngLat;
        this.holder.classList.remove('no-location');
        this.holder.querySelector('.src-badge').textContent =
            resolvedSource === 'exif' ? 'EXIF GPS' : '≈ from track';
        this.marker.getElement().style.display = '';
        this.marker.setLngLat(lngLat);
        if (this.firstShow) {
            this.mini.map.jumpTo({ center: lngLat, zoom: this.zoom });
            this.mini.map.resize(); // container was just reparented
            this.firstShow = false;
        } else {
            this.mini.map.easeTo({ center: lngLat, zoom: this.zoom, duration: 700 });
        }
    }
}
