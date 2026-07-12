/* Wire up the page: PhotoSwipe gallery (mirroring the album sites' config),
 * the TripMap stand-in, the bridge, and the minimap plugin. */

import PhotoSwipeLightbox from '../vendor/photoswipe-5.3.7/photoswipe-lightbox.esm.min.js';
import PhotoSwipe from '../vendor/photoswipe-5.3.7/photoswipe.esm.min.js';
import PhotoSwipeVideoPlugin from '../vendor/photoswipe-video-plugin-1.0.2/photoswipe-video-plugin.esm.min.js';
import PhotoSwipeCaption from '../vendor/photoswipe-caption.esm.js';
import PhotoSwipeFullscreen from '../vendor/photoswipe-fullscreen-1.0.5/photoswipe-fullscreen.esm.min.js';
import PhotoSwipeSlideshow from '../vendor/photoswipe-slideshow-2.0.0/photoswipe-slideshow.esm.min.js';

import { TripMap } from './map.js';
import { connectGalleryToMap } from './bridge.js';
import PhotoSwipeMinimapPlugin from './pswp-minimap-plugin.js';

const galleryEl = document.querySelector('#photoswipe-gallery');

// --- gallery, configured like the real album pages ---
const lightbox = new PhotoSwipeLightbox({
    pswpModule: PhotoSwipe,
    gallery: '#photoswipe-gallery',
    children: '.pswp-card',
    thumbSelector: '.pswp-card a img',
    bgOpacity: 1,
    arrowKeys: true,
    loop: true,
    pinchToClose: true,
    closeOnVerticalDrag: true,
    escKey: true,
    clickToCloseNonZoomable: false,
});
const videoPlugin = new PhotoSwipeVideoPlugin(lightbox, {});
const captionPlugin = new PhotoSwipeCaption(lightbox, {
    type: 'below',
    mobileCaptionOverlapRatio: 0,
    captionContent: 'figcaption',
    autoHide: false,
});
const fullscreenPlugin = new PhotoSwipeFullscreen(lightbox, {
    fullscreenTitle: 'Toggle fullscreen',
});
const slideshowPlugin = new PhotoSwipeSlideshow(lightbox, {
    defaultDelayMs: 4000,
    restartOnSlideChange: true,
    autoHideProgressBar: false,
});

// --- map + bridge ---
const tripMap = new TripMap(document.querySelector('#map'), { dataUrl: 'data/trip.geojson' });

// the minimap plugin must exist before lightbox.init() so it can hook uiRegister
// (?nominimap kill switch for debugging)
const minimapPlugin = location.search.includes('nominimap')
    ? null
    : new PhotoSwipeMinimapPlugin(lightbox, { tripMap, galleryEl });

lightbox.init();

const ready = tripMap.init().then(() => {
    const bridge = connectGalleryToMap({ galleryEl, tripMap, lightbox });
    console.log(`bridge: located ${bridge.locatedCount}/${bridge.items.length} media items`);
    return bridge;
});

// hooks for the verification script (and console poking)
window.__spike = { lightbox, tripMap, minimapPlugin, ready };
