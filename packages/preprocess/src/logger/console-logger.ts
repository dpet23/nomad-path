import type { Logger } from '../logger.ts';

/** Streams to stdout/stderr by severity, one line per call, immediately. */
export class ConsoleLogger implements Logger {
    info(msg: string): void {
        process.stdout.write(`${msg}\n`);
    }
    warn(msg: string): void {
        process.stderr.write(`${msg}\n`);
    }
    error(msg: string): void {
        process.stderr.write(`${msg}\n`);
    }
}
