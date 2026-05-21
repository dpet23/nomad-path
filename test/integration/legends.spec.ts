/**
 * E2E tests for NomadPath legend UI components.
 *
 * Uses the same fixture and test harness as map.spec.ts.
 *
 * Fixture tracks (in day order):
 *   Day 0 — Tokyo Drive    (visible,        drive, speeds 30-60 km/h, elevations 10-20 m)
 *   Day 1 — Sydney Walk    (hidden: true,   walk,  speeds 3-7 km/h,   elevations 1-3 m)
 *   Day 2 — Helsinki Flight(visible,        flight,speeds 200-800 km/h,elevations 5000-10000 m)
 *
 * Attribute ranges are NON-OVERLAPPING so any leaked hidden track is detectable by value:
 *   Visible-only speed:     30-800 km/h  (Sydney Walk would change min to 3)
 *   Visible-only elevation: 10-10000 m   (Sydney Walk would change min to 1)
 *
 * Fixture POIs (in category order):
 *   accommodation — "Test Hotel"   (visible)
 *   viewpoint     — "Mount Takao"  (hidden: true)
 */

import { expect, test } from './fixtures';
import { gotoMap } from './helpers';

// Track IDs derived from day::name
const TRACK_TOKYO   = '2024-01-01::Tokyo Drive';
const TRACK_SYDNEY  = '2024-01-02::Sydney Walk';
const TRACK_HELSINKI = '2024-01-03::Helsinki Flight';

// Expected range labels derived from fixture attribute arrays (visible tracks only at load)
const SPEED_LABEL_VISIBLE    = 'Speed: 30 to 800 km/h';     // Tokyo 30-60 + Helsinki 200-800
const SPEED_LABEL_TOKYO_ONLY = 'Speed: 30 to 60 km/h';      // after hiding Helsinki
const SPEED_LABEL_ALL        = 'Speed: 3 to 800 km/h';      // after showing Sydney Walk too
const ELEV_LABEL_VISIBLE     = 'Elevation: 10 to 10000 m';  // Tokyo 10-20 + Helsinki 5000-10000
const ELEV_LABEL_TOKYO_ONLY  = 'Elevation: 10 to 20 m';     // after hiding Helsinki

type PwPage = import('@playwright/test').Page;

/** Wait for any map animation to settle. */
async function waitForSettle(page: PwPage) {
    await page.waitForTimeout(150);
    await page.waitForFunction(() => !(window as any)._map.isMoving(), { timeout: 10_000, polling: 100 });
}

// ---------------------------------------------------------------------------
// TrackLegend
// ---------------------------------------------------------------------------

test('TrackLegend: panel is visible on page load', async ({ page }) => {
    await gotoMap(page);
    await expect(page.locator('.np-track-legend')).toBeVisible();
});

test('TrackLegend: renders a row per track', async ({ page }) => {
    await gotoMap(page);
    const rows = page.locator('.np-track-legend .np-track-row');
    expect(await rows.count()).toBe(3);
});

test('TrackLegend: unchecking a track hides it', async ({ page }) => {
    await gotoMap(page);
    // Groups start collapsed — expand the first one
    await page.locator('.np-track-legend .np-day-header').first().click();
    // Tokyo Drive is visible; find its checkbox and uncheck it
    const checkbox = page.locator('.np-track-legend .np-track-row__checkbox').first();
    await checkbox.uncheck();
    const visible = await page.evaluate(() =>
        (window as any).nomadMap.isTrackVisible('2024-01-01::Tokyo Drive'),
    );
    expect(visible).toBe(false);
});

test('TrackLegend: zoom button fits map to track', async ({ page }) => {
    await gotoMap(page);
    // Groups start collapsed — expand the first one
    await page.locator('.np-track-legend .np-day-header').first().click();
    const zoomBtn = page.locator('.np-track-legend .np-track-row__action').first();
    await zoomBtn.click();
    await waitForSettle(page);
    const center = await page.evaluate(() => (window as any)._map.getCenter());
    // Tokyo Drive is around 35.7°N 139.7°E
    expect(center.lat).toBeGreaterThan(30);
    expect(center.lat).toBeLessThan(45);
    expect(center.lng).toBeGreaterThan(130);
    expect(center.lng).toBeLessThan(150);
});

test('TrackLegend: day groups start collapsed and header click toggles', async ({ page }) => {
    await gotoMap(page);
    const firstGroup = page.locator('.np-track-legend .np-day-group').first();
    await expect(firstGroup).toHaveClass(/np-day-group--collapsed/);
    await page.locator('.np-track-legend .np-day-header').first().click();
    await expect(firstGroup).not.toHaveClass(/np-day-group--collapsed/);
});

// ---------------------------------------------------------------------------
// AttributeLegend
// ---------------------------------------------------------------------------

test('AttributeLegend: panel is visible on page load', async ({ page }) => {
    await gotoMap(page);
    await expect(page.locator('.np-attr-legend')).toBeVisible();
});

test('AttributeLegend: dropdown has one option per colour attribute', async ({ page }) => {
    await gotoMap(page);
    const options = page.locator('.np-attr-select option');
    expect(await options.count()).toBe(5);
});

test('AttributeLegend: speed label shows range of visible tracks only', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speeds');
    expect(await page.locator('.np-range-label').textContent()).toBe(SPEED_LABEL_VISIBLE);
});

test('AttributeLegend: speed layer ranges exclude hidden tracks on initial load', async ({ page }) => {
    // The map paint property must use dynamic (visible-only) ranges, not the static
    // merged-metadata ranges that include Sydney Walk (min=3 km/h).
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speeds');
    const min = await page.evaluate(() => (window as any).nomadMap._layers._ranges?.speed?.min);
    expect(min).toBe(30); // Tokyo min — if 3, Sydney Walk leaked into the layer expression
});

test('AttributeLegend: elevation label shows range of visible tracks only', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'elevations');
    expect(await page.locator('.np-range-label').textContent()).toBe(ELEV_LABEL_VISIBLE);
});

test('AttributeLegend: elevation layer ranges exclude hidden tracks on initial load', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'elevations');
    const min = await page.evaluate(() => (window as any).nomadMap._layers._ranges?.elevation?.min);
    expect(min).toBe(10); // Tokyo min — if 1, Sydney Walk leaked into the layer expression
});

test('AttributeLegend: hiding a track via checkbox narrows the range label', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speeds');
    // Expand Helsinki Flight's day group (third day header) and uncheck it
    await page.locator('.np-track-legend .np-day-header').nth(2).click();
    await page.locator('.np-track-legend .np-day-group').nth(2).locator('.np-track-row .np-track-row__checkbox').uncheck();
    expect(await page.locator('.np-range-label').textContent()).toBe(SPEED_LABEL_TOKYO_ONLY);
});

test('AttributeLegend: hiding a track via checkbox narrows the layer ranges', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speeds');
    await page.locator('.np-track-legend .np-day-header').nth(2).click();
    await page.locator('.np-track-legend .np-day-group').nth(2).locator('.np-track-row .np-track-row__checkbox').uncheck();
    const max = await page.evaluate(() => (window as any).nomadMap._layers._ranges?.speed?.max);
    expect(max).toBe(60); // Helsinki max 800 removed — only Tokyo 30-60 km/h remains
});

test('AttributeLegend: hiding a track via checkbox narrows the elevation range label', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'elevations');
    await page.locator('.np-track-legend .np-day-header').nth(2).click();
    await page.locator('.np-track-legend .np-day-group').nth(2).locator('.np-track-row .np-track-row__checkbox').uncheck();
    expect(await page.locator('.np-range-label').textContent()).toBe(ELEV_LABEL_TOKYO_ONLY);
});

test('AttributeLegend: showing a hidden track via checkbox widens the range label', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speeds');
    // Expand Sydney Walk's day group (second day header) and check it
    await page.locator('.np-track-legend .np-day-header').nth(1).click();
    await page.locator('.np-track-legend .np-day-group').nth(1).locator('.np-track-row .np-track-row__checkbox').check();
    expect(await page.locator('.np-range-label').textContent()).toBe(SPEED_LABEL_ALL);
});

test('AttributeLegend: showing a hidden track via checkbox widens the layer ranges', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speeds');
    await page.locator('.np-track-legend .np-day-header').nth(1).click();
    await page.locator('.np-track-legend .np-day-group').nth(1).locator('.np-track-row .np-track-row__checkbox').check();
    const min = await page.evaluate(() => (window as any).nomadMap._layers._ranges?.speed?.min);
    expect(min).toBe(3); // Sydney Walk 3-7 km/h is now included
});

test('AttributeLegend: selecting transportMode shows mode list', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'transportMode');
    await expect(page.locator('.np-mode-list')).toBeVisible();
});

// ---------------------------------------------------------------------------
// POILegend
// ---------------------------------------------------------------------------

test('POILegend: panel is visible on page load', async ({ page }) => {
    await gotoMap(page);
    await expect(page.locator('.np-poi-legend')).toBeVisible();
});

test('POILegend: renders the fixture POI after expanding category', async ({ page }) => {
    await gotoMap(page);
    // Category is collapsed by default — click to expand
    await page.locator('.np-category-header').first().click();
    const name = page.locator('.np-poi-legend .np-track-row__name').first();
    await expect(name).toBeVisible();
    expect(await name.textContent()).toBe('Test Hotel');
});

test('POILegend: category with hidden: true starts hidden', async ({ page }) => {
    await gotoMap(page);
    // "viewpoint" category has hidden: true in the fixture
    const visible = await page.evaluate(() =>
        (window as any).nomadMap.isPOICategoryVisible('viewpoint'),
    );
    expect(visible).toBe(false);
});

test('POILegend: category without hidden starts visible', async ({ page }) => {
    await gotoMap(page);
    const visible = await page.evaluate(() =>
        (window as any).nomadMap.isPOICategoryVisible('accommodation'),
    );
    expect(visible).toBe(true);
});

test('POILegend: category checkbox unchecked for hidden category', async ({ page }) => {
    await gotoMap(page);
    // "viewpoint" starts hidden — its checkbox should be unchecked
    // POI legend shows categories sorted; find the viewpoint category header
    const checkboxes = page.locator('.np-poi-legend .np-category-header input[type="checkbox"]');
    const count = await checkboxes.count();
    let viewpointChecked: boolean | null = null;
    for (let i = 0; i < count; i++) {
        const header = page.locator('.np-poi-legend .np-category-header').nth(i);
        const text = await header.textContent();
        if (text?.toLowerCase().includes('viewpoint')) {
            viewpointChecked = await checkboxes.nth(i).isChecked();
        }
    }
    expect(viewpointChecked).toBe(false);
});

test('POILegend: zoom button fits map to POI', async ({ page }) => {
    await gotoMap(page);
    await page.locator('.np-category-header').first().click();
    await page.locator('.np-poi-legend .np-track-row__action').first().click();
    await waitForSettle(page);
    const center = await page.evaluate(() => (window as any)._map.getCenter());
    // Test Hotel is at 139.695°E 35.691°N
    expect(center.lat).toBeGreaterThan(35);
    expect(center.lat).toBeLessThan(36);
    expect(center.lng).toBeGreaterThan(139);
    expect(center.lng).toBeLessThan(140);
});

// ---------------------------------------------------------------------------
// MobileMenu
// ---------------------------------------------------------------------------

test('MobileMenu: hamburger button is hidden on desktop', async ({ page }) => {
    await gotoMap(page);
    // Desktop viewport — hamburger should be hidden via CSS
    const btn = page.locator('.np-mobile-btn');
    await expect(btn).toBeHidden();
});

test('MobileMenu: hamburger visible and drawer opens on mobile viewport', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await gotoMap(page);
    const btn = page.locator('.np-mobile-btn');
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.locator('.np-mobile-drawer--open')).toBeVisible();
    await context.close();
});

// ---------------------------------------------------------------------------
// Basemap switch — state preservation
// Full state space:
//   Track visibility:   defaultTrue/no-op, defaultFalse/no-op,
//                       defaultTrue/user-hides, defaultFalse/user-shows
//   POI category:       same 4 cells
//   Attribute ranges:   correct values preserved across switch
// All user interactions go through the UI (checkbox clicks), not internal API.
// ---------------------------------------------------------------------------

/** Switch basemap and wait for track layer and POI layer restoration. */
async function switchBasemap(page: PwPage, basemapId: string) {
    await page.evaluate(id => (window as any).nomadMap.setBasemap(id), basemapId);
    await page.waitForFunction(
        () =>
            !!(window as any)._map.getLayer('np-tracks-layer') &&
            !!(window as any)._map.getLayer('np-pois-layer'),
        { timeout: 15_000 },
    );
    // Allow the synchronous onStyleData restoration handler to finish
    await page.waitForTimeout(300);
}

// --- Track visibility × basemap switch ---

test('setBasemap: visible-by-default track stays visible (no user interaction)', async ({ page }) => {
    await gotoMap(page);
    await switchBasemap(page, 'blueMarble');
    expect(await page.evaluate(id => (window as any).nomadMap.isTrackVisible(id), TRACK_TOKYO)).toBe(true);
});

test('setBasemap: hidden-by-default track stays hidden (no user interaction)', async ({ page }) => {
    await gotoMap(page);
    await switchBasemap(page, 'blueMarble');
    expect(await page.evaluate(id => (window as any).nomadMap.isTrackVisible(id), TRACK_SYDNEY)).toBe(false);
});

test('setBasemap: user-hidden track stays hidden after basemap switch', async ({ page }) => {
    await gotoMap(page);
    // Hide Helsinki Flight via UI: expand its day group then uncheck
    await page.locator('.np-track-legend .np-day-header').nth(2).click();
    await page.locator('.np-track-legend .np-day-group').nth(2).locator('.np-track-row .np-track-row__checkbox').uncheck();
    await switchBasemap(page, 'blueMarble');
    expect(await page.evaluate(id => (window as any).nomadMap.isTrackVisible(id), TRACK_HELSINKI)).toBe(false);
});

test('setBasemap: user-shown track stays visible after basemap switch', async ({ page }) => {
    await gotoMap(page);
    // Show Sydney Walk via UI: expand its day group then check
    await page.locator('.np-track-legend .np-day-header').nth(1).click();
    await page.locator('.np-track-legend .np-day-group').nth(1).locator('.np-track-row .np-track-row__checkbox').check();
    await switchBasemap(page, 'blueMarble');
    expect(await page.evaluate(id => (window as any).nomadMap.isTrackVisible(id), TRACK_SYDNEY)).toBe(true);
});

// --- POI category visibility × basemap switch ---

test('setBasemap: visible-by-default POI category stays visible (no user interaction)', async ({ page }) => {
    await gotoMap(page);
    await switchBasemap(page, 'blueMarble');
    expect(await page.evaluate(() => (window as any).nomadMap.isPOICategoryVisible('accommodation'))).toBe(true);
});

test('setBasemap: hidden-by-default POI category stays hidden (no user interaction)', async ({ page }) => {
    await gotoMap(page);
    await switchBasemap(page, 'blueMarble');
    expect(await page.evaluate(() => (window as any).nomadMap.isPOICategoryVisible('viewpoint'))).toBe(false);
});

test('setBasemap: user-hidden POI category stays hidden after basemap switch', async ({ page }) => {
    await gotoMap(page);
    // Uncheck accommodation via UI (first category header)
    await page.locator('.np-poi-legend .np-category-header').nth(0).locator('input[type="checkbox"]').uncheck();
    await switchBasemap(page, 'blueMarble');
    expect(await page.evaluate(() => (window as any).nomadMap.isPOICategoryVisible('accommodation'))).toBe(false);
});

test('setBasemap: user-shown POI category stays visible after basemap switch', async ({ page }) => {
    await gotoMap(page);
    // Check viewpoint via UI (second category header, starts unchecked)
    await page.locator('.np-poi-legend .np-category-header').nth(1).locator('input[type="checkbox"]').check();
    await switchBasemap(page, 'blueMarble');
    expect(await page.evaluate(() => (window as any).nomadMap.isPOICategoryVisible('viewpoint'))).toBe(true);
});

// --- Attribute ranges × basemap switch ---

test('setBasemap: speed range preserved for default visible tracks', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speeds');
    await switchBasemap(page, 'blueMarble');
    expect(await page.locator('.np-range-label').textContent()).toBe(SPEED_LABEL_VISIBLE);
});

test('setBasemap: speed layer ranges preserved for default visible tracks', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speeds');
    await switchBasemap(page, 'blueMarble');
    const min = await page.evaluate(() => (window as any).nomadMap._layers._ranges?.speed?.min);
    expect(min).toBe(30); // Sydney Walk must stay excluded
});

test('setBasemap: elevation range preserved for default visible tracks', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'elevations');
    await switchBasemap(page, 'blueMarble');
    expect(await page.locator('.np-range-label').textContent()).toBe(ELEV_LABEL_VISIBLE);
});

test('setBasemap: user-hidden track remains excluded from range after basemap switch', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speeds');
    // Hide Helsinki Flight via UI
    await page.locator('.np-track-legend .np-day-header').nth(2).click();
    await page.locator('.np-track-legend .np-day-group').nth(2).locator('.np-track-row .np-track-row__checkbox').uncheck();
    expect(await page.locator('.np-range-label').textContent()).toBe(SPEED_LABEL_TOKYO_ONLY);
    await switchBasemap(page, 'blueMarble');
    expect(await page.locator('.np-range-label').textContent()).toBe(SPEED_LABEL_TOKYO_ONLY);
});

test('setBasemap: user-hidden track excluded from layer ranges after basemap switch', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speeds');
    await page.locator('.np-track-legend .np-day-header').nth(2).click();
    await page.locator('.np-track-legend .np-day-group').nth(2).locator('.np-track-row .np-track-row__checkbox').uncheck();
    await switchBasemap(page, 'blueMarble');
    const max = await page.evaluate(() => (window as any).nomadMap._layers._ranges?.speed?.max);
    expect(max).toBe(60); // Helsinki 200-800 removed — only Tokyo 30-60 km/h remains
});

test('setBasemap: user-shown track remains included in range after basemap switch', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speeds');
    // Show Sydney Walk via UI
    await page.locator('.np-track-legend .np-day-header').nth(1).click();
    await page.locator('.np-track-legend .np-day-group').nth(1).locator('.np-track-row .np-track-row__checkbox').check();
    expect(await page.locator('.np-range-label').textContent()).toBe(SPEED_LABEL_ALL);
    await switchBasemap(page, 'blueMarble');
    expect(await page.locator('.np-range-label').textContent()).toBe(SPEED_LABEL_ALL);
});

test('setBasemap: user-shown track included in layer ranges after basemap switch', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speeds');
    await page.locator('.np-track-legend .np-day-header').nth(1).click();
    await page.locator('.np-track-legend .np-day-group').nth(1).locator('.np-track-row .np-track-row__checkbox').check();
    await switchBasemap(page, 'blueMarble');
    const min = await page.evaluate(() => (window as any).nomadMap._layers._ranges?.speed?.min);
    expect(min).toBe(3); // Sydney Walk 3-7 km/h is included after being shown
});

// ---------------------------------------------------------------------------
// Basemap switch — DOM checkbox state
// Verify the TrackLegend DOM .checked attribute (not just JS isTrackVisible())
// is consistent after a basemap switch.
// ---------------------------------------------------------------------------

test('setBasemap: hidden-by-default track checkbox remains unchecked after basemap switch', async ({ page }) => {
    await gotoMap(page);
    await switchBasemap(page, 'blueMarble');
    await page.locator('.np-track-legend .np-day-header').nth(1).click();
    const checkbox = page.locator('.np-track-legend .np-day-group').nth(1).locator('.np-track-row .np-track-row__checkbox');
    expect(await checkbox.isChecked()).toBe(false);
});

test('setBasemap: visible-by-default track checkbox remains checked after basemap switch', async ({ page }) => {
    await gotoMap(page);
    await switchBasemap(page, 'blueMarble');
    await page.locator('.np-track-legend .np-day-header').first().click();
    const checkbox = page.locator('.np-track-legend .np-day-group').first().locator('.np-track-row .np-track-row__checkbox');
    expect(await checkbox.isChecked()).toBe(true);
});

test('setBasemap: user-hidden track checkbox stays unchecked after basemap switch', async ({ page }) => {
    await gotoMap(page);
    // Hide Helsinki Flight via UI then switch basemap
    await page.locator('.np-track-legend .np-day-header').nth(2).click();
    await page.locator('.np-track-legend .np-day-group').nth(2).locator('.np-track-row .np-track-row__checkbox').uncheck();
    await switchBasemap(page, 'blueMarble');
    // Group remains expanded — checkbox should still be unchecked
    const checkbox = page.locator('.np-track-legend .np-day-group').nth(2).locator('.np-track-row .np-track-row__checkbox');
    expect(await checkbox.isChecked()).toBe(false);
});

test('setBasemap: user-shown track checkbox stays checked after basemap switch', async ({ page }) => {
    await gotoMap(page);
    // Show Sydney Walk via UI then switch basemap
    await page.locator('.np-track-legend .np-day-header').nth(1).click();
    await page.locator('.np-track-legend .np-day-group').nth(1).locator('.np-track-row .np-track-row__checkbox').check();
    await switchBasemap(page, 'blueMarble');
    const checkbox = page.locator('.np-track-legend .np-day-group').nth(1).locator('.np-track-row .np-track-row__checkbox');
    expect(await checkbox.isChecked()).toBe(true);
});

// ---------------------------------------------------------------------------
// Group-level visibility toggle
// The day-header contains a tristate group checkbox that toggles all tracks
// in that day group simultaneously.
// ---------------------------------------------------------------------------

test('TrackLegend: group header checkbox hides all tracks in that day group', async ({ page }) => {
    await gotoMap(page);
    // Tokyo Drive (day group index 0) starts visible — uncheck via group header checkbox
    const groupCheckbox = page.locator('.np-track-legend .np-day-header').first().locator('input[type="checkbox"]');
    await groupCheckbox.uncheck();
    expect(await page.evaluate(id => (window as any).nomadMap.isTrackVisible(id), TRACK_TOKYO)).toBe(false);
});

test('TrackLegend: group header checkbox shows all tracks in that day group', async ({ page }) => {
    await gotoMap(page);
    // Sydney Walk (day group index 1) starts hidden — check via group header checkbox
    const groupCheckbox = page.locator('.np-track-legend .np-day-header').nth(1).locator('input[type="checkbox"]');
    await groupCheckbox.check();
    expect(await page.evaluate(id => (window as any).nomadMap.isTrackVisible(id), TRACK_SYDNEY)).toBe(true);
});

test('TrackLegend: group checkbox uncheck also unchecks individual track row checkboxes', async ({ page }) => {
    await gotoMap(page);
    // Uncheck Tokyo group, then expand to verify row checkbox is also unchecked
    const groupCheckbox = page.locator('.np-track-legend .np-day-header').first().locator('input[type="checkbox"]');
    await groupCheckbox.uncheck();
    await page.locator('.np-track-legend .np-day-header').first().click();
    const rowCheckbox = page.locator('.np-track-legend .np-day-group').first().locator('.np-track-row .np-track-row__checkbox');
    expect(await rowCheckbox.isChecked()).toBe(false);
});

test('TrackLegend: group checkbox check also checks individual track row checkboxes', async ({ page }) => {
    await gotoMap(page);
    // Check Sydney group, then expand to verify row checkbox is also checked
    const groupCheckbox = page.locator('.np-track-legend .np-day-header').nth(1).locator('input[type="checkbox"]');
    await groupCheckbox.check();
    await page.locator('.np-track-legend .np-day-header').nth(1).click();
    const rowCheckbox = page.locator('.np-track-legend .np-day-group').nth(1).locator('.np-track-row .np-track-row__checkbox');
    expect(await rowCheckbox.isChecked()).toBe(true);
});

test('TrackLegend: hiding a group via group checkbox narrows the attribute range', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speeds');
    // Hide Helsinki Flight via its group header checkbox
    const groupCheckbox = page.locator('.np-track-legend .np-day-header').nth(2).locator('input[type="checkbox"]');
    await groupCheckbox.uncheck();
    expect(await page.locator('.np-range-label').textContent()).toBe(SPEED_LABEL_TOKYO_ONLY);
});

// ---------------------------------------------------------------------------
// Edge cases — hiding all tracks, attribute persistence
// ---------------------------------------------------------------------------

test('AttributeLegend: hiding all visible tracks shows "no data" for speed', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speeds');
    // Hide Tokyo Drive (group 0) and Helsinki Flight (group 2) via group checkboxes
    const groupCheckboxes = page.locator('.np-track-legend .np-day-header input[type="checkbox"]');
    await groupCheckboxes.nth(0).uncheck();
    await groupCheckboxes.nth(2).uncheck();
    expect(await page.locator('.np-range-label').textContent()).toBe('Speed: no data');
});

test('AttributeLegend: hiding all visible tracks empties layer ranges', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speeds');
    const groupCheckboxes = page.locator('.np-track-legend .np-day-header input[type="checkbox"]');
    await groupCheckboxes.nth(0).uncheck();
    await groupCheckboxes.nth(2).uncheck();
    const speedRange = await page.evaluate(() => (window as any).nomadMap._layers._ranges?.speed);
    expect(speedRange).toBeUndefined();
});

test('AttributeLegend: re-showing a track after hiding all restores speed range', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speeds');
    const groupCheckboxes = page.locator('.np-track-legend .np-day-header input[type="checkbox"]');
    // Hide all
    await groupCheckboxes.nth(0).uncheck();
    await groupCheckboxes.nth(2).uncheck();
    expect(await page.locator('.np-range-label').textContent()).toBe('Speed: no data');
    // Re-show Tokyo Drive
    await groupCheckboxes.nth(0).check();
    expect(await page.locator('.np-range-label').textContent()).toBe(SPEED_LABEL_TOKYO_ONLY);
});

test('AttributeLegend: re-showing a track after hiding all restores speed layer ranges', async ({ page }) => {
    // Pair to the label-only test above. CLAUDE.md "Two-Layer Observable
    // State" rule: assert both label AND _ranges. The "restores from
    // no-data" transition was previously label-only; this pins the
    // map paint side too, catching a future regression where the label
    // re-renders but the layer expression is left at its empty state.
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speeds');
    const groupCheckboxes = page.locator('.np-track-legend .np-day-header input[type="checkbox"]');
    await groupCheckboxes.nth(0).uncheck();
    await groupCheckboxes.nth(2).uncheck();
    // Sanity: layer ranges are empty
    let speedRange = await page.evaluate(() => (window as any).nomadMap._layers._ranges?.speed);
    expect(speedRange).toBeUndefined();
    // Re-show Tokyo Drive
    await groupCheckboxes.nth(0).check();
    speedRange = await page.evaluate(() => (window as any).nomadMap._layers._ranges?.speed);
    expect(speedRange?.min).toBe(30);
    expect(speedRange?.max).toBe(60);
});

test('setBasemap: colour attribute dropdown preserves selected value', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speeds');
    await switchBasemap(page, 'blueMarble');
    const selected = await page.locator('.np-attr-select').inputValue();
    expect(selected).toBe('speeds');
});

test('setBasemap: colour attribute paint expression uses correct attribute after switch', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speeds');
    await switchBasemap(page, 'blueMarble');
    // The paint expression should be an interpolation array (not a flat string),
    // proving the speed expression was correctly restored
    const lineColor = await page.evaluate(() =>
        (window as any)._map.getPaintProperty('np-tracks-layer', 'line-color'),
    );
    expect(Array.isArray(lineColor)).toBe(true);
    // First element should be 'case' (the speed expression wraps interpolate in case)
    expect(lineColor[0]).toBe('case');
});
