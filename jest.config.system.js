/**
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

/** @type {import('jest').Config} */
const config = {
    // A preset that is used as a base for Jest's configuration.
    preset: 'ts-jest',

    // Modules that run code to configure the testing framework, before each test file in the suite is executed.
    setupFilesAfterEnv: ['jest-expect-message'],

    // Automatically clear mock calls, instances, contexts and results before every test.
    clearMocks: true,

    // Timeout of a test in milliseconds.
    testTimeout: 5 * 60 * 1000, // 5 minutes

    // The number of seconds after which a test is considered as slow and reported as such in the results.
    slowTestThreshold: 30, // 30 seconds
};

module.exports = config;
