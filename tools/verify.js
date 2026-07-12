/* End-to-end verification of the photo↔map bridge spike. */
// playwright: local install, or borrow a sibling project's
const { chromium } = (() => {
    for (const p of ['playwright', '/home/dan/code/nomad-path-fable/node_modules/playwright']) {
        try { return require(p); } catch { /* next */ }
    }
    throw new Error('playwright not found');
})();

const BASE = 'http://localhost:8765/';
const SHOTS = process.env.SHOTS_DIR || __dirname;
let failures = 0;
function check(name, ok, detail = '') {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
    if (!ok) failures++;
}

async function mapIdle(page, expr = 'window.__spike.tripMap.map') {
    await page.evaluate((e) => new Promise((res) => {
        const m = eval(e);
        if (m.loaded() && m.areTilesLoaded()) res(); else m.once('idle', res);
    }), expr);
}

(async () => {
    const browser = await chromium.launch();
    const errors = [];

    // ---------- desktop ----------
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    const bridge = await page.evaluate(() => window.__spike.ready.then((b) => ({
        located: b.locatedCount, total: b.items.length,
        sources: b.items.reduce((acc, i) => ((acc[i.source ?? 'none'] = (acc[i.source ?? 'none'] ?? 0) + 1), acc), {}),
    })));
    check('bridge resolves locations', bridge.located === 25 && bridge.total === 28,
        JSON.stringify(bridge));

    await mapIdle(page);
    await page.screenshot({ path: `${SHOTS}/01-overview.png` });

    // photo layers rendered?
    const rendered = await page.evaluate(() => {
        const m = window.__spike.tripMap.map;
        return {
            clusters: m.queryRenderedFeatures({ layers: ['photo-clusters'] }).length,
            points: m.queryRenderedFeatures({ layers: ['photo-points'] }).length,
            tracks: m.queryRenderedFeatures({ layers: ['tracks'] }).length > 0,
        };
    });
    check('tracks + photo markers render', rendered.tracks && (rendered.clusters + rendered.points) > 0,
        JSON.stringify(rendered));

    // ---------- click a marker -> gallery opens at that slide ----------
    await page.evaluate(() => window.__spike.tripMap.map.jumpTo({ center: [168.3925, -44.8375], zoom: 14.5 }));
    await mapIdle(page);
    await page.screenshot({ path: `${SHOTS}/02-glenorchy-markers.png` });
    const target = await page.evaluate(() => {
        const m = window.__spike.tripMap.map;
        const f = m.queryRenderedFeatures({ layers: ['photo-points'] })[0];
        if (!f) return null;
        const p = m.project(f.geometry.coordinates);
        const r = m.getContainer().getBoundingClientRect();
        return { idx: f.properties.idx, x: r.x + p.x, y: r.y + p.y, title: f.properties.title };
    });
    check('found clickable marker', !!target, target && `#${target.idx} ${target.title}`);
    await page.mouse.click(target.x, target.y);
    await page.waitForSelector('.pswp', { timeout: 5000 });
    const curr = await page.evaluate(() => window.__spike.lightbox.pswp.currIndex);
    check('marker click opens the right slide', curr === target.idx, `pswp index ${curr} vs marker ${target.idx}`);

    // ---------- minimap follows ----------
    await page.waitForSelector('.pswp__minimap:not(.no-location)', { timeout: 8000 });
    await mapIdle(page, 'window.__spike.minimapPlugin.mini.map');
    await page.screenshot({ path: `${SHOTS}/03-lightbox-minimap.png` });
    const badge = await page.textContent('.pswp__minimap .src-badge');
    check('minimap shows location + badge', !!badge, badge);

    const miniCenter = async () => page.evaluate(() => {
        const c = window.__spike.minimapPlugin.mini.map.getCenter();
        return [c.lng, c.lat];
    });
    const c1 = await miniCenter();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1200);
    const c2 = await miniCenter();
    check('minimap pans on slide change', c1[0] !== c2[0] || c1[1] !== c2[1],
        `${c1} -> ${c2}`);

    // interpolated photo shows the ≈track badge (idx 12 = "Tūī in the flax")
    await page.evaluate(() => window.__spike.lightbox.pswp.goTo(12));
    await page.waitForTimeout(1000);
    const badge2 = await page.textContent('.pswp__minimap .src-badge');
    check('interpolated photo badge', badge2.includes('track'), badge2);

    // no-location slide (idx 2 = dinner)
    await page.evaluate(() => window.__spike.lightbox.pswp.goTo(2));
    await page.waitForTimeout(800);
    const noloc = await page.isVisible('.pswp__minimap .nofix');
    check('no-GPS/no-track slide shows no-location state', noloc);
    await page.screenshot({ path: `${SHOTS}/04-no-location.png` });

    // ---------- video slide (idx 18) ----------
    await page.evaluate(() => window.__spike.lightbox.pswp.goTo(18));
    await page.waitForTimeout(1500);
    const video = await page.evaluate(() => {
        const v = document.querySelector('.pswp video');
        return v ? { present: true, src: v.currentSrc.split('/').pop() } : { present: false };
    });
    check('video slide renders a <video>', video.present, video.src);
    const vidBadge = await page.textContent('.pswp__minimap .src-badge');
    check('video slide has minimap location', vidBadge.includes('EXIF'), vidBadge);
    await page.screenshot({ path: `${SHOTS}/05-video-slide.png` });

    // ---------- fullscreen ----------
    await page.evaluate(() => document.getElementById('pswp__icn-fullscreen-request').closest('button').click());
    await page.waitForTimeout(800);
    const fs = await page.evaluate(() => ({
        fsElement: document.fullscreenElement?.className ?? null,
        minimapInside: !!document.fullscreenElement?.querySelector('.pswp__minimap'),
    }));
    check('fullscreen contains minimap', fs.minimapInside, JSON.stringify(fs));
    await page.screenshot({ path: `${SHOTS}/06-fullscreen.png` });
    await page.evaluate(() => document.exitFullscreen().catch(() => {}));
    await page.waitForTimeout(500);

    // ---------- expand minimap on click ----------
    await page.click('.pswp__minimap');
    await page.waitForTimeout(400);
    const expanded = await page.evaluate(() =>
        document.querySelector('.pswp__minimap').classList.contains('expanded'));
    check('minimap expands on click', expanded);
    await page.screenshot({ path: `${SHOTS}/07-minimap-expanded.png` });

    // ---------- close -> pulse on main map, holder rescued ----------
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    const afterClose = await page.evaluate(() => ({
        pswpGone: !document.querySelector('.pswp'),
        holderOnBody: document.querySelector('body > .pswp__minimap') !== null,
        pulse: !!document.querySelector('.spike-pulse'),
    }));
    check('close: pswp destroyed, holder rescued, pulse shown',
        afterClose.pswpGone && afterClose.holderOnBody && afterClose.pulse,
        JSON.stringify(afterClose));
    await page.screenshot({ path: `${SHOTS}/08-after-close-pulse.png` });

    // ---------- reopen: reparented minimap must still work (WebGL survives) ----------
    await page.click('.pswp-card a img');
    await page.waitForSelector('.pswp', { timeout: 5000 });
    await page.waitForTimeout(1200);
    const reopen = await page.evaluate(() => {
        const holder = document.querySelector('.pswp .pswp__minimap');
        const canvas = holder?.querySelector('canvas');
        const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
        return {
            inPswp: !!holder,
            hasCanvas: !!canvas,
            contextLost: gl ? gl.isContextLost() : null,
            noLocation: holder?.classList.contains('no-location'),
        };
    });
    check('reopen: minimap reparented, WebGL context alive',
        reopen.inPswp && reopen.hasCanvas && reopen.contextLost === false,
        JSON.stringify(reopen));
    await page.screenshot({ path: `${SHOTS}/09-reopened.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // ---------- legend toggle hides photo layer ----------
    await page.evaluate(() => window.__spike.tripMap.fitToTracks());
    await mapIdle(page);
    const rows = await page.$$('.legend .row');
    await rows[rows.length - 1].click(); // "Photos"
    await page.waitForTimeout(400);
    const hidden = await page.evaluate(() => {
        const m = window.__spike.tripMap.map;
        return m.queryRenderedFeatures({ layers: ['photo-clusters', 'photo-points'] }).length;
    });
    check('legend toggles photo markers off', hidden === 0, `${hidden} still rendered`);
    await rows[rows.length - 1].click();

    // ---------- mobile ----------
    const mob = await browser.newPage({
        viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    mob.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
    await mob.goto(BASE, { waitUntil: 'networkidle' });
    await mob.evaluate(() => window.__spike.ready);
    await mapIdle(mob);
    await mob.screenshot({ path: `${SHOTS}/10-mobile-page.png` });
    await mob.tap('.pswp-card a img');
    await mob.waitForSelector('.pswp', { timeout: 5000 });
    await mob.waitForTimeout(1500);
    const mobMini = await mob.evaluate(() => {
        const el = document.querySelector('.pswp__minimap');
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height, visible: r.width > 0 };
    });
    check('mobile: minimap visible at small size', mobMini.visible && mobMini.w <= 160,
        JSON.stringify(mobMini));
    await mob.screenshot({ path: `${SHOTS}/11-mobile-lightbox.png` });

    console.log('\nconsole/page errors:', errors.length ? errors : 'none');
    await browser.close();
    process.exit(failures || errors.length ? 1 : 0);
})();
