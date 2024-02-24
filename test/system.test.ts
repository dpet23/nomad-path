import { WebElement } from 'selenium-webdriver';

import { browser, startBrowser, stopBrowser } from './helpers/browser';
import { startWebServer, stopWebServer, URL_LEAFLET } from './helpers/webServer';

let elementMap: WebElement;

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

    elementMap = await browser.findElement({ id: 'map' });
});

/**
 * Teardown: close the browser and stop the web server.
 */
afterAll(async () => {
    await stopWebServer();
    await stopBrowser();
});

it('should load custom map', async () => {
    expect(await browser.getTitle()).toEqual('Leaflet Test');

    expect(await elementMap.isDisplayed()).toEqual(true);
    const elementMapSize = await elementMap.getRect();
    expect(elementMapSize.height).not.toEqual(0);
    expect(elementMapSize.width).not.toEqual(0);
});

it('should show tracks on the map', async () => {
    const elementTrackList = await elementMap.findElements({ className: 'leaflet-interactive' });

    expect(elementTrackList.length).toEqual(4);
    for (const trackElement of elementTrackList) {
        expect(await trackElement.isDisplayed()).toEqual(false);
        expect(await trackElement.getAttribute('stroke-width')).toEqual('3');
    }
});
