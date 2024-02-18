import { Builder, ThenableWebDriver } from 'selenium-webdriver';
import Chrome from 'selenium-webdriver/chrome';

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

    beforeAll(() => {
        const options = new Chrome.Options();
        options.addArguments('--headless=new');

        // eslint-disable-next-line newline-per-chained-call
        driver = new Builder().forBrowser('chrome').setChromeOptions(options).build();
    });

    afterAll(async () => {
        await driver.quit();
    });

    it('should load Google', async () => {
        await driver.get('https://www.google.com/');
        expect(await driver.getTitle()).toEqual('Google');
    });
});
