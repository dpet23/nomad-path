/**
 * The map ↔ gallery bridge.
 *
 * Reads photo data baked into the gallery DOM, resolves each item's location
 * (EXIF-baked → track-interpolated → none), pushes camera markers to the map,
 * and opens PhotoSwipe at the right slide when a marker is clicked.
 *
 * The resolved location is stashed back onto the card's <a> as data
 * attributes so the minimap plugin can read it straight off
 * slide.data.element without re-resolving.
 */

export function connectGalleryToMap({ galleryEl, tripMap, lightbox }) {
    const cards = [...galleryEl.querySelectorAll('.pswp-card')];
    const items = cards.map((card, idx) => {
        const a = card.querySelector('a');
        const tsMs = Date.parse(a.dataset.ts);
        let lngLat = null;
        let source = null;
        let gapMs = 0;
        if (a.dataset.lat !== undefined) {
            lngLat = [+a.dataset.lon, +a.dataset.lat];
            source = 'exif';
        } else {
            const hit = tripMap.positionAtTime(tsMs);
            if (hit) ({ lngLat, gapMs } = hit), source = 'track';
        }
        if (lngLat) {
            a.dataset.resolvedLon = lngLat[0];
            a.dataset.resolvedLat = lngLat[1];
            a.dataset.resolvedSource = source;
        }
        return { idx, tsMs, lngLat, source, gapMs, title: a.querySelector('img')?.alt ?? '' };
    });

    const located = items.filter((it) => it.lngLat);
    tripMap.addPhotoLayer(located.map((it) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: it.lngLat },
        properties: { idx: it.idx, title: it.title, source: it.source },
    })));

    // NB: the dataSource arg is required — loadAndOpen(idx) alone leaves
    // getNumItems() at 0 and PhotoSwipe silently sanitises the index to 0
    // (and half-breaks init). Thumbnail clicks pass it internally.
    tripMap.on('photoClick', ({ idx }) => lightbox.loadAndOpen(+idx, { gallery: galleryEl }));

    // let the minimap plugin refresh in case the gallery was opened before
    // the map (and therefore the location resolution) was ready
    galleryEl.dispatchEvent(new CustomEvent('spike:locations-resolved'));

    return { items, locatedCount: located.length };
}
