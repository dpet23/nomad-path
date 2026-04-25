/**
 * Shared Playwright fixtures for E2E tests.
 *
 * Re-exports the console error detection fixture from integration tests —
 * same pattern filtering and auto-fail behaviour.
 */
export { expect, test } from '../integration/fixtures';
