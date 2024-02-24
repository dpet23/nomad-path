import { browser, startBrowser, stopBrowser } from './helpers/browser';
import { SERVER_HOST, SERVER_PORT, startWebServer, stopWebServer } from './helpers/webServer';

/**
 * Setup: start web server and a browser.
 */
beforeAll(async () => {
    await startBrowser();
    await startWebServer();
});

/**
 * Teardown: close the browser and stop the web server.
 */
afterAll(async () => {
    await stopWebServer();
    await stopBrowser();
});

it('should load custom web server', async () => {
    await browser.get(`http://${SERVER_HOST}:${SERVER_PORT}`);
    await new Promise(res => setTimeout(res, 5000));
    expect(await browser.getTitle()).toEqual('Index of /');
});
