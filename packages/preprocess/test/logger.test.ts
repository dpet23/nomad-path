import { describe, expect, it, vi } from 'vitest';

import { CapturingLogger, ConsoleLogger } from '../src/logger.ts';

describe('CapturingLogger', () => {
    it('records each call with its level and message in order', () => {
        const log = new CapturingLogger();
        log.info('scanned 3 files');
        log.warn('selector matched nothing');
        log.error('boom');
        expect(log.entries).toEqual([
            { level: 'info', msg: 'scanned 3 files' },
            { level: 'warn', msg: 'selector matched nothing' },
            { level: 'error', msg: 'boom' },
        ]);
    });
});

describe('ConsoleLogger', () => {
    it('routes info to stdout and warn/error to stderr, each newline-terminated', () => {
        const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
        const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
        try {
            const log = new ConsoleLogger();
            log.info('ok');
            log.warn('careful');
            log.error('bad');
            expect(out).toHaveBeenCalledWith('ok\n');
            expect(err).toHaveBeenCalledWith('careful\n');
            expect(err).toHaveBeenCalledWith('bad\n');
            expect(out).toHaveBeenCalledTimes(1);
            expect(err).toHaveBeenCalledTimes(2);
        } finally {
            out.mockRestore();
            err.mockRestore();
        }
    });
});
