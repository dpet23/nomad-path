/* Set up a webdriver. */

import { Browser, Builder, Capabilities, ThenableWebDriver, WebDriver, WebElement } from 'selenium-webdriver';
import Chrome from 'selenium-webdriver/chrome';
import Edge from 'selenium-webdriver/edge';
import Firefox from 'selenium-webdriver/firefox';
import { Entry, Level } from 'selenium-webdriver/lib/logging';

const BROWSER_DEFAULT_PAGE_TIMEOUT_MS = 60 * 1000;

export let browser: ThenableWebDriver & ExtendedWebDriver;

/**
 * Determine if testing with a locally-installed browser or with a Browserstack's remote browser.
 */
export function testingWithBrowserstack(): boolean {
    return (
        typeof process.env.BROWSERSTACK_USERNAME !== 'undefined' &&
        typeof process.env.BROWSERSTACK_ACCESS_KEY !== 'undefined'
    );
}

/**
 * Helper functions for common browser tasks.
 */
class ExtendedWebDriver extends WebDriver {
    /**
     * Check if the browser is running on a mobile device.
     */
    async isMobileBrowser(): Promise<boolean> {
        const userAgent: string = await this.executeScript('return navigator.userAgent');
        const size = await this.manage().window().getSize();

        const mobileDevices = [
            'Android',
            'Blackberry',
            'IEMobile',
            'iPhone',
            'iPad',
            'iPod',
            'Opera Mini',
            'SamsungBrowser',
            'webOS',
        ];
        return mobileDevices.some(device => userAgent.includes(device)) || size.width <= 480 || size.height <= 480;
    }

    /**
     * Fetch the error log entries shown in the browser's console.
     * NOTE: not supported on Firefox/Safari.
     */
    async getErrorLogs(): Promise<Entry[]> {
        return (await this.manage().logs().get('browser')).filter(
            entry =>
                // Errors only
                entry.level <= Level.SEVERE &&
                // Browsers try to fetch the favicon automatically, ignore this error
                !entry.message.includes('favicon.ico') &&
                // Ignore any errors from fetching the background map tiles
                !entry.message.includes('google.com'),
        );
    }

    /**
     * Check if the browser is currently in fullscreen mode.
     */
    async isFullscreen(): Promise<boolean> {
        // The `fullscreenElement` property returns the Element that is currently being presented in fullscreen mode,
        // or null if fullscreen mode is not in use.
        return (await this.executeScript('return document.fullscreenElement')) !== null;
    }

    /**
     * Move the mouse over an element and click on it.
     *
     * @param element - The element to interact with.
     * @param options - Customise the actions to take.
     * @param options.pauseAfterMove - Milliseconds to wait after moving the mouse.
     * @param options.pauseAfterClick - Milliseconds to wait after clicking on the element.
     */
    async moveToAndClick(
        element: WebElement,
        { pauseAfterMove, pauseAfterClick }: { pauseAfterMove?: number; pauseAfterClick?: number } = {},
    ): Promise<void> {
        let actions = this.actions({ async: true });

        actions = actions.move({ origin: element });
        if (pauseAfterMove) {
            actions = actions.pause(pauseAfterMove);
        }

        actions = actions.click();
        if (pauseAfterClick) {
            actions = actions.pause(pauseAfterClick);
        }

        await actions.perform();
    }

    /**
     * Find the zoom bar that's currently highlighted, and extract the zoom level from its ID.
     *
     * TODO: doesn't work on mobile
     *
     * @return The map's current zoom level.
     */
    async getLeafletMapZoomLevel(): Promise<number> {
        const selectedZoomBarId = await this.findElement({ className: 'zoom-bar-selected' }).getAttribute('id');
        return Number(selectedZoomBarId.substring(selectedZoomBarId.lastIndexOf('-') + 1));
    }

    /**
     * Zoom the map to a certain level, by clicking on the appropriate zoom bar.
     *
     * @return The zoom bar element.
     */
    async zoomLeafletMapTo(level: number): Promise<WebElement> {
        const zoomBar = await this.findElement({ id: `zoom-bar-${level}` });
        await this.moveToAndClick(zoomBar, { pauseAfterClick: 500 });
        return zoomBar;
    }
}

/**
 * Customise a new WebDriver instance.
 */
async function configureBrowser(thenableBrowser: ThenableWebDriver) {
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
}

/**
 * Configure and start a new WebDriver instance for testing with a locally-installed browser.
 */
export async function startBrowser() {
    const chromeOptions = new Chrome.Options();
    const edgeOptions = new Edge.Options();
    const firefoxOptions = new Firefox.Options();

    if (process.env.SELENIUM_HEADLESS?.toLowerCase() === 'true') {
        chromeOptions.addArguments('--headless=new');
        edgeOptions.addArguments('--headless=new');
        firefoxOptions.addArguments('--headless');
    }

    // Configure the WebDriver instance for all supported browsers.
    // Any options that are irrelevant to the selected browser are automatically ignored.
    const thenableBrowser = new Builder()
        .forBrowser(Browser.CHROME)
        .setChromeOptions(chromeOptions)
        .setEdgeOptions(edgeOptions)
        .setFirefoxOptions(firefoxOptions)
        .build();

    await configureBrowser(thenableBrowser);
}

/**
 * Configure and start a new WebDriver instance for testing with a remote browser controlled by Browserstack.
 */
export async function startBrowserstack() {
    const capabilities = Capabilities.chrome();
    /*
    // Support for HTTP Headers is currently in private Beta. "You do not have access to browserstack.headerParams"
    capabilities.set('bstack:options', {
        headerParams: '{"X-Frame-Options":"SAMEORIGIN"}',
    });
    */

    const thenableBrowser = new Builder()
        .usingServer('http://localhost:4444/wd/hub')
        .withCapabilities(capabilities)
        .build();

    await configureBrowser(thenableBrowser);
}

/**
 * Close the WebDriver instance.
 */
export async function stopBrowser() {
    await browser.quit();
}
