import { Browser, Builder, By, Key, ThenableWebDriver, until } from 'selenium-webdriver';
import Chrome from 'selenium-webdriver/chrome';
import Edge from 'selenium-webdriver/edge';
import Firefox from 'selenium-webdriver/firefox';
import Safari from 'selenium-webdriver/safari';

/**
 * Sample function to test.
 */
function sum(a, b) {
    return a + b;
}

it('should correctly perform addition', () => {
    expect(sum(1, 2)).toBe(3);
});

describe('Sandbox', () => {
    jest.setTimeout(1 * 60 * 1000); // 1 minute

    let driver: ThenableWebDriver;

    /**
     * Create a new WebDriver instance for testing with a locally-installed browser.
     */
    beforeAll(() => {
        const chromeOptions = new Chrome.Options();
        // chromeOptions.addArguments('--headless=new');

        const edgeOptions = new Edge.Options();
        // edgeOptions.addArguments('--headless=new');

        const firefoxOptions = new Firefox.Options();
        // firefoxOptions.addArguments('--headless');

        const safariOptions = new Safari.Options();

        // Configure the WebDriver instance for all supported browsers.
        // Any options that are irrelevant to the selected browser are automatically ignored.
        driver = new Builder()
            .forBrowser(Browser.CHROME)
            .setChromeOptions(chromeOptions)
            .setEdgeOptions(edgeOptions)
            .setFirefoxOptions(firefoxOptions)
            .setSafariOptions(safariOptions)
            .build();
    });

    /**
     * Clean up the WebDriver instance.
     */
    afterAll(async () => {
        await driver.quit();
    });

    it('should load Google and perform a search', async () => {
        await driver.get('https://www.google.com/');
        expect(await driver.getTitle()).toEqual('Google');

        await driver.findElement(By.name('q')).sendKeys('webdriver', Key.RETURN);
        await driver.wait(until.titleIs('webdriver - Google Search'), 1000);
    });
});
