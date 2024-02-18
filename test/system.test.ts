import { setup as setupDevServer, teardown as teardownDevServer } from 'jest-dev-server';
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
    let driver: ThenableWebDriver;

    const serverHost = '127.0.0.1';
    const serverPort = 1337;
    let servers;

    /**
     * Start a temporary web server for hosting the application.
     */
    const startWebServer = async () => {
        servers = await setupDevServer({
            command: `npx http-server -a ${serverHost} -p ${serverPort}`,
            protocol: 'http',
            host: serverHost,
            port: serverPort,
            usedPortAction: 'error',
            debug: true,
        });
        for (const server of servers) {
            expect(server.pid).not.toEqual(null);
            expect(server.exitCode).toEqual(null);
        }
    };

    /**
     * Stop web server.
     */
    const stopWebServer = async () => {
        // @ts-expect-error
        await teardownDevServer(servers);
        for (const server of servers) {
            expect(server.pid).not.toEqual(null);
            expect(server.exitCode).not.toEqual(null);
        }
    };

    /**
     * Configure and start a new WebDriver instance for testing with a locally-installed browser.
     */
    const startBrowser = async () => {
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
    };

    /**
     * Clean up the WebDriver instance.
     */
    const stopBrowser = async () => {
        await driver.quit();
    };

    /**
     * Setup: start web server and a browser.
     */
    beforeAll(async () => {
        await startWebServer();
        await startBrowser();
    });

    /**
     * Teardown: close the browser and stop the web server.
     */
    afterAll(async () => {
        await stopBrowser();
        await stopWebServer();
    });

    it('should load Google and perform a search', async () => {
        await driver.get('https://www.google.com/');
        expect(await driver.getTitle()).toEqual('Google');

        await driver.findElement(By.name('q')).sendKeys('webdriver', Key.RETURN);
        await driver.wait(until.titleIs('webdriver - Google Search'), 1000);
        await new Promise(res => setTimeout(res, 5000));
    });

    it('should load custom web server', async () => {
        console.log(`host: [${serverHost}], port: [${serverPort}]`);

        await driver.get(`http://${serverHost}:${serverPort}`);
        await new Promise(res => setTimeout(res, 5000));
        expect(await driver.getTitle()).toEqual('Index of /');
    });
});
