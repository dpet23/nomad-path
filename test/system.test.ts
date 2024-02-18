import { setup as setupDevServer, teardown as teardownDevServer } from 'jest-dev-server';
import { Browser, Builder, ThenableWebDriver } from 'selenium-webdriver';
import Chrome from 'selenium-webdriver/chrome';
import Edge from 'selenium-webdriver/edge';
import Firefox from 'selenium-webdriver/firefox';
import Safari from 'selenium-webdriver/safari';

const SERVER_HOST = '127.0.0.1';
const SERVER_PORT = 1337;

let servers;
let driver: ThenableWebDriver;

/**
 * Start a temporary web server for hosting the application.
 */
const startWebServer = async () => {
    servers = await setupDevServer({
        command: `npx http-server -a ${SERVER_HOST} -p ${SERVER_PORT}`,
        protocol: 'http',
        host: SERVER_HOST,
        port: SERVER_PORT,
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
    // Close the web server process and allow a bit of leeway for completion.
    // @ts-expect-error
    await teardownDevServer(servers);
    await new Promise(res => setTimeout(res, 500));

    // Ensure the web server process has shut down.
    for (const server of servers) {
        try {
            // Use signal 0 to check for process existence (man page: "no signal is sent").
            process.kill(server.pid, 0);
            console.error(`Web server is still running, PID ${server.pid}`);
        } catch (e) {
            // Ignore: the web server process has successfully exited.
        }
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

    // Configure the WebDriver instance for all supported browsers.
    // Any options that are irrelevant to the selected browser are automatically ignored.
    driver = new Builder()
        .forBrowser(Browser.CHROME)
        .setChromeOptions(chromeOptions)
        .setEdgeOptions(edgeOptions)
        .setFirefoxOptions(firefoxOptions)
        .build();
    expect(driver).toBeDefined();
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
    await driver.get(`http://${SERVER_HOST}:${SERVER_PORT}`);
    await new Promise(res => setTimeout(res, 5000));
    expect(await driver.getTitle()).toEqual('Index of /');
});
