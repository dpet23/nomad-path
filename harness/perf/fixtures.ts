/**
 * Shared Playwright fixtures for the characterization perf test.
 *
 * Re-exports the console error detection fixture used by the browser test
 * suites — even though the perf test asserts nothing about timings, surfacing
 * page errors (a failed library load, a broken bundle) is still valuable.
 */
export { expect, test } from '../../test/integration/fixtures';
