import { WebElement } from 'selenium-webdriver';

import { browser, startBrowser, startBrowserstack, stopBrowser, testingWithBrowserstack } from './helpers/browser';
import { startWebServer, stopWebServer, URL_LEAFLET, URL_LEAFLET_EMBED } from './helpers/webServer';

const CLASS_OVERLAY_PANE = 'leaflet-overlay-pane';
const CLASS_MARKER_PANE = 'leaflet-marker-pane';
const CLASS_TOOLTIP_PANE = 'leaflet-tooltip-pane';
const CLASS_POPUP_PANE = 'leaflet-popup-pane';
const GEOJSON_NUM_TRACKS_TOTAL = 4;
const GEOJSON_NUM_TRACKS_DRIVING = 3;
const GEOJSON_NUM_TRACKS_WALKING = 1;
const GEOJSON_NUM_MARKERS_TOTAL = 4;
const COLOR_BLACK = '#000000';
const COLOR_ELECTRIC_RED = '#E60000';
const COLOR_DARK_MODERATE_VIOLET = '#6A4C93';
const COLOR_STRONG_GREEN = '#8AC926';

let isMobileBrowser: boolean;
let initialBrowserTabs: string[];
let mapElement: WebElement;

/**
 * Conditionally skip a test case.
 */
const testIf = (condition: boolean, ...args: Parameters<typeof test>) =>
    condition ? test(...args) : test.skip(...args);

/**
 * Asynchronously filter an array.
 *
 * @param array - The array to filter.
 * @param callbackfn - Async function to perform the filtering.
 * @return The array elements that meet the condition specified in the callback function.
 */
async function filterAsync<T>(
    array: T[],
    callbackfn: (value: T, index: number, array: T[]) => Promise<boolean>,
): Promise<T[]> {
    const filterMap = await Promise.all(array.map(callbackfn));
    return array.filter((_value, index) => filterMap[index]);
}

/**
 * Setup: start web server and a browser.
 */
beforeAll(async () => {
    if (testingWithBrowserstack()) {
        await startBrowserstack();
        await browser.manage().window().maximize();
    } else {
        await startBrowser();
        await startWebServer();
    }

    isMobileBrowser = await browser.isMobileBrowser();
});

/**
 * Setup: load the Leaflet map and find the map element.
 */
beforeEach(async () => {
    initialBrowserTabs = await browser.getAllWindowHandles();
    await browser.switchTo().window(initialBrowserTabs[0]);

    await browser.get(URL_LEAFLET);
    await browser.sleep(1000);
    mapElement = await browser.findElement({ id: 'map' });
});

/**
 * Teardown: ensure the browser does not report error logs in the console.
 */
afterEach(async () => {
    const errorLogs = await browser.getErrorLogs();
    expect(
        errorLogs.length,
        `The browser reported errors:\n  ${errorLogs.map(entry => entry.message).join('\n  ')}`,
    ).toEqual(0);

    // Close any extra tabs/windows.
    for (const browserTab of await browser.getAllWindowHandles()) {
        if (!initialBrowserTabs.includes(browserTab)) {
            await browser.switchTo().window(browserTab);
            await browser.close();
        }
    }
});

/**
 * Teardown: close the browser and stop the web server.
 */
afterAll(async () => {
    if (!testingWithBrowserstack()) {
        await stopWebServer();
    }
    await stopBrowser();
});

describe('Load map', () => {
    it('should load custom map without errors', async () => {
        expect(await browser.getTitle()).toEqual('Leaflet Test');

        expect(await mapElement.isDisplayed()).toEqual(true);
        const mapElementSize = await mapElement.getRect();
        expect(mapElementSize.height).not.toEqual(0);
        expect(mapElementSize.width).not.toEqual(0);
    });

    /**
     * Requires `X-Frame-Options: SAMEORIGIN`.
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options
     * @see https://www.browserstack.com/docs/app-automate/appium/custom-header#nodejs
     */
    testIf(!testingWithBrowserstack(), 'should load embedded map without errors', async () => {
        await browser.get(URL_LEAFLET_EMBED);
        expect(await browser.getTitle()).toEqual('Leaflet Embed');

        const elementIframe = await browser.findElement({ xpath: '//iframe[@title="Leaflet Map"]' });
        expect(await elementIframe.isDisplayed()).toEqual(true);

        await browser.switchTo().frame(elementIframe);

        mapElement = await browser.findElement({ id: 'map' });
        expect(await mapElement.isDisplayed()).toEqual(true);
        const mapElementSize = await mapElement.getRect();
        expect(mapElementSize.height).not.toEqual(0);
        expect(mapElementSize.width).not.toEqual(0);
    });

    it('should load tracks and markers from GeoJSON', async () => {
        const leafletPaneOverlay = await mapElement.findElement({ className: CLASS_OVERLAY_PANE });
        const trackElements = await leafletPaneOverlay.findElements({ tagName: 'path' });
        expect(trackElements.length).toEqual(GEOJSON_NUM_TRACKS_TOTAL);

        const leafletPaneMarker = await mapElement.findElement({ className: CLASS_MARKER_PANE });
        const markerElements = await leafletPaneMarker.findElements({ tagName: 'img' });
        expect(markerElements.length).toEqual(GEOJSON_NUM_MARKERS_TOTAL);

        // Do not test for visibility here, since the default browser size may change across devices.
    });
});

describe('ControlFullScreen', () => {
    it('should toggle fullscreen when pressing the UI button', async () => {
        const fullscreenButtonElement = await mapElement.findElement({
            className: 'leaflet-control-fullscreen-button',
        });

        // Ensure element has a tooltip.
        expect(await fullscreenButtonElement.getAttribute('title')).not.toEqual('');

        // Ensure element toggles fullscreen mode.
        expect(await browser.isFullscreen()).toBe(false);
        await browser.moveToAndClick(fullscreenButtonElement);
        expect(await browser.isFullscreen()).toBe(true);
        await browser.moveToAndClick(fullscreenButtonElement);
        expect(await browser.isFullscreen()).toBe(false);
    });

    /**
     * Requires `X-Frame-Options: SAMEORIGIN`.
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options
     * @see https://www.browserstack.com/docs/app-automate/appium/custom-header#nodejs
     */
    testIf(!testingWithBrowserstack(), 'should toggle fullscreen from embedded map', async () => {
        await browser.get(URL_LEAFLET_EMBED);

        const elementIframe = await browser.findElement({ xpath: '//iframe' });
        await browser.switchTo().frame(elementIframe);
        mapElement = await browser.findElement({ id: 'map' });

        // Ensure element toggles fullscreen mode.
        const fullscreenButtonElement = await mapElement.findElement({
            className: 'leaflet-control-fullscreen-button',
        });
        expect(await browser.isFullscreen()).toBe(false);
        await browser.moveToAndClick(fullscreenButtonElement);
        expect(await browser.isFullscreen()).toBe(true);
        await browser.moveToAndClick(fullscreenButtonElement);
        expect(await browser.isFullscreen()).toBe(false);
    });
});

describe('ControlZoom', () => {
    let zoomControlElement: WebElement;

    /**
     * Setup: find the zoom control.
     * Runs after the parent `beforeEach` block.
     */
    beforeEach(async () => {
        zoomControlElement = await mapElement.findElement({ className: 'leaflet-control-zoom' });
    });

    it('should zoom in and out using the control +/- buttons', async () => {
        if (isMobileBrowser) return; // FUTURE: Update `getLeafletMapZoomLevel()` to work on mobile devices.

        const initialZoomLevel = await browser.getLeafletMapZoomLevel();

        // Zoom in.
        const zoomInButton = await zoomControlElement.findElement({ className: 'leaflet-control-zoom-in' });
        expect(await zoomInButton.getAttribute('title')).not.toEqual('');
        await browser.moveToAndClick(zoomInButton, { pauseAfterClick: 1000 });
        expect(await browser.getLeafletMapZoomLevel()).toEqual(initialZoomLevel + 1);

        // Zoom out.
        const zoomOutButton = await zoomControlElement.findElement({ className: 'leaflet-control-zoom-out' });
        expect(await zoomOutButton.getAttribute('title')).not.toEqual('');
        await browser.moveToAndClick(zoomOutButton, { pauseAfterClick: 1000 });
        expect(await browser.getLeafletMapZoomLevel()).toEqual(initialZoomLevel);
    });

    it('should zoom in and out using the zoom bars', async () => {
        if (isMobileBrowser) {
            await expect(async () => {
                await zoomControlElement.findElement({ className: 'leaflet-control-zoom-bar-container' });
            }).rejects.toThrow('Unable to locate element');
        } else {
            // Zoom in.
            const zoomInLevel = 15; // note: tiles may not load in time, need to ignore browser errors
            const zoomInBar = await browser.zoomLeafletMapTo(zoomInLevel);
            expect(await zoomInBar.getAttribute('title')).not.toEqual('');
            expect(await browser.getLeafletMapZoomLevel()).toEqual(zoomInLevel);

            // Zoom out.
            const zoomOutLevel = 1;
            const zoomOutBar = await browser.zoomLeafletMapTo(zoomOutLevel);
            expect(await zoomOutBar.getAttribute('title')).not.toEqual('');
            expect(await browser.getLeafletMapZoomLevel()).toEqual(zoomOutLevel);
        }
    });
});

describe('ControlReset', () => {
    it('should reset map view when pressing the UI button', async () => {
        // FUTURE: Update `getLeafletMapZoomLevel()` and `zoomLeafletMapTo()` to work on mobile devices.
        if (isMobileBrowser) return;

        const initialZoomLevel = await browser.getLeafletMapZoomLevel();

        // Zoom in.
        const zoomInLevel = 10;
        await browser.zoomLeafletMapTo(zoomInLevel);
        expect(await browser.getLeafletMapZoomLevel()).toEqual(zoomInLevel);

        // Reset view.
        const resetViewButton = await mapElement.findElement({ className: 'leaflet-control-reset-button' });
        expect(await resetViewButton.getAttribute('title')).not.toEqual('');
        await browser.moveToAndClick(resetViewButton, { pauseAfterClick: 1000 });
        expect(await browser.getLeafletMapZoomLevel()).toEqual(initialZoomLevel);
    });
});

describe('ControlOpenInNewTab', () => {
    it('should not display control when page is not in an iframe', async () => {
        await expect(async () => {
            await mapElement.findElement({ className: 'leaflet-control-open-in-new-tab' });
        }).rejects.toThrow('Unable to locate element');
    });

    /**
     * Requires `X-Frame-Options: SAMEORIGIN`.
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options
     * @see https://www.browserstack.com/docs/app-automate/appium/custom-header#nodejs
     */
    testIf(!testingWithBrowserstack(), 'should open map in a new tab when pressing the UI button', async () => {
        await browser.get(URL_LEAFLET_EMBED);

        const elementIframe = await browser.findElement({ xpath: '//iframe' });
        await browser.switchTo().frame(elementIframe);
        mapElement = await browser.findElement({ id: 'map' });

        const openInNewTabButtonElement = await mapElement.findElement({
            className: 'leaflet-control-open-in-new-tab',
        });
        expect(await openInNewTabButtonElement.isDisplayed()).toEqual(true);

        // Ensure element opens the map in a new tab/window.
        await browser.moveToAndClick(openInNewTabButtonElement);
        const currentBrowserTabs = await browser.getAllWindowHandles();
        expect(currentBrowserTabs.length).toEqual(initialBrowserTabs.length + 1);

        await browser.switchTo().window(currentBrowserTabs[currentBrowserTabs.length - 1]);
        expect(await browser.getTitle()).toEqual('Leaflet Test');
    });
});

describe.skip('ControlBaseLayers', () => {
    // FUTURE: provide a unique class name for this control.
});

describe('ControlTrackLayers', () => {
    let trackLayersControlElement: WebElement;
    let trackLayersIconElement: WebElement;
    let trackLayersContentElement: WebElement;

    /**
     * Setup: find the control elements.
     * Runs after the parent `beforeEach` block.
     */
    beforeEach(async () => {
        trackLayersControlElement = await mapElement.findElement({ className: 'leaflet-control-layers-tracks' });
        trackLayersIconElement = await trackLayersControlElement.findElement({
            className: 'leaflet-control-layers-toggle',
        });
        trackLayersContentElement = await trackLayersControlElement.findElement({
            className: 'leaflet-control-collapsible-content',
        });
    });

    it('should initially display only the icon', async () => {
        expect(await trackLayersIconElement.isDisplayed()).toBe(true);
        expect(await trackLayersContentElement.isDisplayed()).toBe(false);
    });

    it('should display the control content when hovering over the icon', async () => {
        await browser.moveToAndClick(trackLayersIconElement, { pauseAfterClick: 500 });
        expect(await trackLayersIconElement.isDisplayed()).toBe(false);
        expect(await trackLayersContentElement.isDisplayed()).toBe(true);

        expect(await trackLayersContentElement.findElement({ tagName: 'p' }).isDisplayed()).toBe(true);
        expect(await trackLayersContentElement.findElement({ tagName: 'form' }).isDisplayed()).toBe(true);
    });

    it('should open track popup when clicking on a label', async () => {
        if (isMobileBrowser) return; // FUTURE: Update `zoomLeafletMapTo()` to work on mobile devices.

        await browser.zoomLeafletMapTo(13); // note: tiles may not load in time, need to ignore browser errors

        await browser.moveToAndClick(trackLayersIconElement, { pauseAfterClick: 500 });
        const trackListItems = await trackLayersContentElement
            .findElement({ tagName: 'form' })
            .findElements({ className: 'leaflet-control-layers-tracks-list-item' });
        expect(trackListItems.length).toBeGreaterThanOrEqual(1);

        const trackListEntryLabel = await trackListItems[0].findElement({
            className: 'leaflet-control-layers-tracks-list-item-label',
        });
        expect(await trackListEntryLabel.getCssValue('text-decoration-line')).not.toContain('underline');

        await browser.actions().move({ origin: trackListEntryLabel }).pause(500).perform();
        expect(await trackListEntryLabel.getCssValue('text-decoration-line')).toContain('underline');
        expect(
            (await mapElement.findElement({ className: CLASS_TOOLTIP_PANE }).findElements({ tagName: 'div' })).length,
        ).toEqual(1);

        // FUTURE: split test here

        await trackListEntryLabel.click();
        expect(
            (await mapElement.findElement({ className: CLASS_POPUP_PANE }).findElements({ className: 'leaflet-popup' }))
                .length,
        ).toEqual(1);
    });

    it('should disable and enable tracks when clicking on a checkbox', async () => {
        const leafletPaneOverlay = await mapElement.findElement({ className: CLASS_OVERLAY_PANE });

        const initialNumTracks = (await leafletPaneOverlay.findElements({ tagName: 'path' })).length;
        expect(initialNumTracks).toBeGreaterThanOrEqual(1);

        const findTrackListEntryCheckbox = async (index: number) => {
            const trackListItems = await trackLayersContentElement
                .findElement({ tagName: 'form' })
                .findElements({ className: 'leaflet-control-layers-tracks-list-item' });
            return await trackListItems[index].findElement({
                className: 'leaflet-control-layers-tracks-list-item-selector',
            });
        };
        let trackListEntryCheckbox: WebElement;

        await browser.moveToAndClick(trackLayersIconElement, { pauseAfterClick: 500 });
        trackListEntryCheckbox = await findTrackListEntryCheckbox(0);
        expect(await trackListEntryCheckbox.isSelected()).toBe(true);

        await trackListEntryCheckbox.click();
        trackListEntryCheckbox = await findTrackListEntryCheckbox(0);
        expect(await trackListEntryCheckbox.isSelected()).toBe(false);
        expect((await leafletPaneOverlay.findElements({ tagName: 'path' })).length).toBeLessThan(initialNumTracks);

        await trackListEntryCheckbox.click();
        trackListEntryCheckbox = await findTrackListEntryCheckbox(0);
        expect(await trackListEntryCheckbox.isSelected()).toBe(true);
        expect((await leafletPaneOverlay.findElements({ tagName: 'path' })).length).toEqual(initialNumTracks);
    });
});

describe('ControlTrackLegend', () => {
    let trackLegendControlElement: WebElement;
    let trackLegendIconElement: WebElement;
    let trackLegendContentElement: WebElement;

    /**
     * Setup: find the control elements.
     * Runs after the parent `beforeEach` block.
     */
    beforeEach(async () => {
        trackLegendControlElement = await mapElement.findElement({ className: 'leaflet-control-legend-tracks' });
        trackLegendIconElement = await trackLegendControlElement.findElement({
            className: 'leaflet-control-layers-toggle',
        });
        trackLegendContentElement = await trackLegendControlElement.findElement({
            className: 'leaflet-control-collapsible-content',
        });
    });

    it('should initially display only the icon', async () => {
        expect(await trackLegendIconElement.isDisplayed()).toBe(true);
        expect(await trackLegendContentElement.isDisplayed()).toBe(false);
    });

    it('should display the control content when hovering over the icon', async () => {
        await browser.moveToAndClick(trackLegendIconElement, { pauseAfterClick: 500 });
        expect(await trackLegendIconElement.isDisplayed()).toBe(false);
        expect(await trackLegendContentElement.isDisplayed()).toBe(true);

        expect(await trackLegendContentElement.findElement({ tagName: 'p' }).isDisplayed()).toBe(true);
        expect(await trackLegendContentElement.findElement({ tagName: 'select' }).isDisplayed()).toBe(true);
        expect(await trackLegendContentElement.findElement({ tagName: 'div' }).isDisplayed()).toBe(true);
    });

    it('should use the top line string style by default', async () => {
        await browser.moveToAndClick(trackLegendIconElement, { pauseAfterClick: 500 });
        const selectBox = await trackLegendContentElement.findElement({ tagName: 'select' });

        const selectBoxOptions = await selectBox.findElements({ tagName: 'option' });
        expect(selectBoxOptions.length).toEqual(2);
        expect(await selectBox.isEnabled()).toBe(true);

        const legendContentDiv = await trackLegendContentElement.findElement({ tagName: 'div' });
        expect(await legendContentDiv.getText()).toEqual('Track');

        const trackElements = await mapElement
            .findElement({ className: CLASS_OVERLAY_PANE })
            .findElements({ tagName: 'path' });
        expect(
            (await filterAsync(trackElements, async e => (await e.getAttribute('stroke')) === COLOR_ELECTRIC_RED))
                .length,
        ).toEqual(GEOJSON_NUM_TRACKS_TOTAL);
    });

    it('should redraw the tracks and update the legend when changing the line style', async () => {
        await browser.moveToAndClick(trackLegendIconElement, { pauseAfterClick: 500 });

        const selectBox = await trackLegendContentElement.findElement({ tagName: 'select' });
        await browser.moveToAndClick(selectBox, { pauseAfterClick: 500 });

        const selectBoxOptions = await selectBox.findElements({ tagName: 'option' });
        await selectBoxOptions[1].click();
        await browser.sleep(2000);

        const legendContentDiv = await trackLegendContentElement.findElement({ tagName: 'div' });
        expect(await legendContentDiv.getText()).toEqual('Driving\nWalking\n(undefined)');

        const trackElements = await mapElement
            .findElement({ className: CLASS_OVERLAY_PANE })
            .findElements({ tagName: 'path' });
        expect(
            (
                await filterAsync(
                    trackElements,
                    async e => (await e.getAttribute('stroke')) === COLOR_DARK_MODERATE_VIOLET,
                )
            ).length,
        ).toEqual(GEOJSON_NUM_TRACKS_DRIVING);
        expect(
            (await filterAsync(trackElements, async e => (await e.getAttribute('stroke')) === COLOR_STRONG_GREEN))
                .length,
        ).toEqual(GEOJSON_NUM_TRACKS_WALKING);
        expect(
            (await filterAsync(trackElements, async e => (await e.getAttribute('stroke')) === COLOR_BLACK)).length,
        ).toEqual(0);
    });
});

describe.skip('Track groups', () => {
    // FUTURE: determine which track elements belong to a certain group.

    it.skip('should highlight a whole track group when hovering over each track', async () => {});

    it.skip("should show the individual track's popup when clicking on a track", async () => {});

    it.skip('should highlight a whole track group when hovering on a ControlTrackLayers label', async () => {});

    it.skip('should persist highlighting of a track group when clicking on a ControlTrackLayers label', async () => {
        // Also should show the whole group's popup
    });
});
