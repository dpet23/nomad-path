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
