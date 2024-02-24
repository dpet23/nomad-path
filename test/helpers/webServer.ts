/* Manage a temporary web server during system testing. */

import { setup as setupDevServer, teardown as teardownDevServer } from 'jest-dev-server';

export const SERVER_HOST = '127.0.0.1';
export const SERVER_PORT = 1337;

let servers;

/**
 * Start a temporary web server for hosting the application.
 */
export const startWebServer = async () => {
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
export const stopWebServer = async () => {
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
