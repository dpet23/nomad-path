/* Set up a webdriver. */

import { Browser, Builder, ThenableWebDriver } from 'selenium-webdriver';
import Chrome from 'selenium-webdriver/chrome';
import Edge from 'selenium-webdriver/edge';
import Firefox from 'selenium-webdriver/firefox';

export let browser: ThenableWebDriver;

const BROWSER_DEFAULT_PAGE_TIMEOUT_MS = 60 * 1000;

/**
 * Configure and start a new WebDriver instance for testing with a locally-installed browser.
 */
export const startBrowser = async () => {
    const chromeOptions = new Chrome.Options();
    // chromeOptions.addArguments('--headless=new');

    const edgeOptions = new Edge.Options();
    // edgeOptions.addArguments('--headless=new');

    const firefoxOptions = new Firefox.Options();
    // firefoxOptions.addArguments('--headless');

    // Configure the WebDriver instance for all supported browsers.
    // Any options that are irrelevant to the selected browser are automatically ignored.
    browser = new Builder()
        .forBrowser(Browser.CHROME)
        .setChromeOptions(chromeOptions)
        .setEdgeOptions(edgeOptions)
        .setFirefoxOptions(firefoxOptions)
        .build();
    expect(browser).toBeDefined();

    await browser.manage().setTimeouts({
        pageLoad: BROWSER_DEFAULT_PAGE_TIMEOUT_MS,
    });
};

/**
 * Clean up the WebDriver instance.
 */
export const stopBrowser = async () => {
    await browser.quit();
};
