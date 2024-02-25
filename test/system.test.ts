import { WebElement } from 'selenium-webdriver';

import { browser, startBrowser, stopBrowser } from './helpers/browser';
import { startWebServer, stopWebServer, URL_LEAFLET } from './helpers/webServer';

let mapElement: WebElement;

/**
 * Setup: start web server and a browser.
 */
beforeAll(async () => {
    await startBrowser();
    await startWebServer();
});

/**
 * Setup: load the Leaflet map and find the map element.
 */
beforeEach(async () => {
    await browser.get(URL_LEAFLET);
    // await new Promise(res => setTimeout(res, 10 * 1000));

    mapElement = await browser.findElement({ id: 'map' });
});

/**
 * Teardown: close the browser and stop the web server.
 */
afterAll(async () => {
    await stopWebServer();
    await stopBrowser();
});

it('should load custom map without errors', async () => {
    expect(await browser.getTitle()).toEqual('Leaflet Test');

    expect(await mapElement.isDisplayed()).toEqual(true);
    const mapElementSize = await mapElement.getRect();
    expect(mapElementSize.height).not.toEqual(0);
    expect(mapElementSize.width).not.toEqual(0);

    const errorLogs = await browser.getErrorLogs();
    expect(
        errorLogs.length,
        `The browser reported errors:\n  ${errorLogs.map(entry => entry.message).join('\n  ')}`,
    ).toEqual(0);
});

it('should show tracks on the map', async () => {
    const trackElements = await mapElement.findElements({ className: 'leaflet-interactive' });

    expect(trackElements.length).toEqual(4);
    for (const trackElement of trackElements) {
        expect(await trackElement.isDisplayed()).toEqual(false);
        expect(await trackElement.getAttribute('stroke-width')).toEqual('3');
    }
});
