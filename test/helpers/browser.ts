/* Set up a webdriver. */

import { Browser, Builder, ThenableWebDriver, WebDriver } from 'selenium-webdriver';
import Chrome from 'selenium-webdriver/chrome';
import Edge from 'selenium-webdriver/edge';
import Firefox from 'selenium-webdriver/firefox';
import { Entry, Level } from 'selenium-webdriver/lib/logging';

const BROWSER_DEFAULT_PAGE_TIMEOUT_MS = 60 * 1000;

export let browser: ThenableWebDriver & ExtendedWebDriver;

/**
 * Helper functions for common browser tasks.
 */
class ExtendedWebDriver extends WebDriver {
    /**
     * Fetch the error log entries shown in the browser's console.
     */
    async getErrorLogs(): Promise<Entry[]> {
        return (await this.manage().logs().get('browser')).filter(
            entry => entry.level <= Level.SEVERE && !entry.message.includes('favicon.ico'),
        );
    }
}

/**
 * Configure and start a new WebDriver instance for testing with a locally-installed browser.
 */
export const startBrowser = async () => {
    const chromeOptions = new Chrome.Options();
    const edgeOptions = new Edge.Options();
    const firefoxOptions = new Firefox.Options();

    // chromeOptions.addArguments('--headless=new');
    // edgeOptions.addArguments('--headless=new');
    // firefoxOptions.addArguments('--headless');

    // Configure the WebDriver instance for all supported browsers.
    // Any options that are irrelevant to the selected browser are automatically ignored.
    const thenableBrowser = new Builder()
        .forBrowser(Browser.CHROME)
        .setChromeOptions(chromeOptions)
        .setEdgeOptions(edgeOptions)
        .setFirefoxOptions(firefoxOptions)
        .build();
    expect(thenableBrowser).toBeDefined();

    // Add custom helper functions.
    Object.getOwnPropertyNames(ExtendedWebDriver.prototype).forEach(name => {
        if (name !== 'constructor') {
            WebDriver.prototype[name] = ExtendedWebDriver.prototype[name];
        }
    });
    browser = thenableBrowser as ThenableWebDriver & ExtendedWebDriver;

    // Customise timeout values.
    await browser.manage().setTimeouts({
        pageLoad: BROWSER_DEFAULT_PAGE_TIMEOUT_MS,
    });
};

/**
 * Close the WebDriver instance.
 */
export const stopBrowser = async () => {
    await browser.quit();
};
