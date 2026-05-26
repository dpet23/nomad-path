// @vitest-environment node
//
// Unit tests for the preprocessing log helpers. Pins the public stdout/stderr
// format used by long-running `nohup npm run watch ... > watch.log 2>&1 &`
// sessions and grepped via ssh — changes here are user-visible.

import { describe, expect, it, vi } from 'vitest';

import { logBuildStart, logFail, logOK, logWatchEvent } from './log.js';

/** Capture a single console.log call's argument as a string. */
function captureLog(fn) {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
        fn();
        expect(spy).toHaveBeenCalledTimes(1);
        return spy.mock.calls[0][0];
    } finally {
        spy.mockRestore();
    }
}

/** Capture a single console.error call's argument as a string. */
function captureErr(fn) {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
        fn();
        expect(spy).toHaveBeenCalledTimes(1);
        return spy.mock.calls[0][0];
    } finally {
        spy.mockRestore();
    }
}

describe('logOK', () => {
    it('prefixes the summary with the [OK] marker', () => {
        const line = captureLog(() => logOK('hello world'));
        expect(line).toBe('[OK] hello world');
    });
});

describe('logFail', () => {
    it('prefixes the detail with [FAIL] <kind>:', () => {
        const line = captureErr(() => logFail('Parse', 'foo.gpx: bad xml'));
        expect(line).toBe('[FAIL] Parse: foo.gpx: bad xml');
    });
});

describe('logBuildStart', () => {
    it('emits a bare [BUILD] Starting line when called with no arg', () => {
        const line = captureLog(() => logBuildStart());
        expect(line).toBe('[BUILD] Starting');
    });

    it('emits a bare [BUILD] Starting line when all cause counts are zero', () => {
        const line = captureLog(() => logBuildStart({ added: 0, changed: 0, removed: 0 }));
        expect(line).toBe('[BUILD] Starting');
    });

    it('appends a cause clause for a single non-zero kind', () => {
        const line = captureLog(() => logBuildStart({ added: 3, changed: 0, removed: 0 }));
        expect(line).toBe('[BUILD] Starting | 3 added');
    });

    it('appends multiple non-zero kinds in fixed order: added, changed, removed', () => {
        const line = captureLog(() => logBuildStart({ added: 3, changed: 1, removed: 2 }));
        expect(line).toBe('[BUILD] Starting | 3 added, 1 changed, 2 removed');
    });

    it('omits zero counts from the cause clause', () => {
        const line = captureLog(() => logBuildStart({ added: 0, changed: 5, removed: 0 }));
        expect(line).toBe('[BUILD] Starting | 5 changed');
    });
});

describe('logWatchEvent', () => {
    it('emits nothing when NOMADPATH_WATCH_DEBUG is unset', () => {
        const prev = process.env.NOMADPATH_WATCH_DEBUG;
        delete process.env.NOMADPATH_WATCH_DEBUG;
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
        try {
            logWatchEvent('add', '/some/path');
            expect(spy).not.toHaveBeenCalled();
        } finally {
            spy.mockRestore();
            if (prev !== undefined) process.env.NOMADPATH_WATCH_DEBUG = prev;
        }
    });

    it('emits [watch] <event> <path> when NOMADPATH_WATCH_DEBUG is set', () => {
        const prev = process.env.NOMADPATH_WATCH_DEBUG;
        process.env.NOMADPATH_WATCH_DEBUG = '1';
        try {
            const line = captureLog(() => logWatchEvent('add', '/some/path'));
            expect(line).toBe('[watch] add /some/path');
        } finally {
            if (prev === undefined) delete process.env.NOMADPATH_WATCH_DEBUG;
            else process.env.NOMADPATH_WATCH_DEBUG = prev;
        }
    });
});
