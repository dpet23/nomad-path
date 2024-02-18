/**
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

/** @type {import('jest').Config} */
const config = {
    // A preset that is used as a base for Jest's configuration
    preset: 'ts-jest',

    // Automatically clear mock calls, instances, contexts and results before every test
    clearMocks: true,

    // Timeout of a test in milliseconds.
    testTimeout: 5 * 60 * 1000, // 5 minutes

    // The number of seconds after which a test is considered as slow and reported as such in the results.
    slowTestThreshold: 30, // 30 seconds
};

module.exports = config;
