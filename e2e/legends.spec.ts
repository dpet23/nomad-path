/**
 * E2E tests for NomadPath legend UI components.
 *
 * Uses the same fixture and test harness as map.spec.ts.
 * Fixture tracks: "Tokyo Drive" (visible), "Sydney Walk" (hidden), "Helsinki Flight" (visible)
 * Fixture POI: "Test Hotel" in category "accommodation"
 */

import { expect, test } from '@playwright/test';

const TEST_PAGE = '/e2e/test.html';

type PwPage = import('@playwright/test').Page;

/** Navigate and wait for NomadPath to be ready. */
async function gotoMap(page: PwPage) {
    await page.goto(TEST_PAGE);
    await page.waitForFunction(() => (window as any).nomadMapReady === true, { timeout: 30_000 });
    const error = await page.evaluate(() => (window as any).nomadMapError);
    expect(error).toBeUndefined();
}

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

test('AttributeLegend: selecting speed shows range label', async ({ page }) => {
    await gotoMap(page);
    await page.selectOption('.np-attr-select', 'speed');
    const label = page.locator('.np-range-label');
    const text = await label.textContent();
    expect(text).toMatch(/Speed/);
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

test('POILegend: category with defaultVisible false starts hidden', async ({ page }) => {
    await gotoMap(page);
    // "viewpoint" category has defaultVisible: false in the fixture
    const visible = await page.evaluate(() =>
        (window as any).nomadMap.isPOICategoryVisible('viewpoint'),
    );
    expect(visible).toBe(false);
});

test('POILegend: category with defaultVisible true starts visible', async ({ page }) => {
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
// ---------------------------------------------------------------------------

/** Switch basemap and wait for track layer restoration. */
async function switchBasemap(page: PwPage, basemapId: string) {
    await page.evaluate(id => (window as any).nomadMap.setBasemap(id), basemapId);
    await page.waitForFunction(
        () => !!(window as any)._map.getLayer('np-tracks-layer'),
        { timeout: 15_000 },
    );
    // Give the styledata handler time to run
    await page.waitForTimeout(200);
}

test('setBasemap: POI category visibility preserved after basemap switch', async ({ page }) => {
    await gotoMap(page);
    // Hide accommodation category
    await page.evaluate(() => (window as any).nomadMap._layers.setPOICategoryVisible('accommodation', false));
    await switchBasemap(page, 'blueMarble');
    const visible = await page.evaluate(() =>
        (window as any).nomadMap.isPOICategoryVisible('accommodation'),
    );
    expect(visible).toBe(false);
});

test('setBasemap: hidden-by-default POI category stays hidden after basemap switch', async ({ page }) => {
    await gotoMap(page);
    // viewpoint starts hidden by defaultVisible: false
    await switchBasemap(page, 'blueMarble');
    const visible = await page.evaluate(() =>
        (window as any).nomadMap.isPOICategoryVisible('viewpoint'),
    );
    expect(visible).toBe(false);
});

test('setBasemap: attribute range label reflects visible tracks after basemap switch', async ({ page }) => {
    await gotoMap(page);
    // Switch to speed attribute so range label is visible
    await page.selectOption('.np-attr-select', 'speed');
    const labelBefore = await page.locator('.np-range-label').textContent();
    // Switch basemap and wait for restoration
    await switchBasemap(page, 'blueMarble');
    const labelAfter = await page.locator('.np-range-label').textContent();
    // Label should still show speed range (not disappear or show "no data")
    expect(labelAfter).toMatch(/Speed/);
    expect(labelAfter).toBe(labelBefore);
});
