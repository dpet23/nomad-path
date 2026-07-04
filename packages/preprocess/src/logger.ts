/**
 * Consistent, streaming logging for the nomadpath-* bins. The severity ->
 * stream mapping lives here once: info is normal successful-run output (stdout);
 * warn and error are the abnormal (stderr). ConsoleLogger writes immediately so
 * the watch-mode git hook streams progress to the pusher's console live rather
 * than buffering to the end. CapturingLogger lets build() be tested in-process
 * without touching real streams.
 *
 * This module is the single import surface for logging. The concrete classes
 * live in ./logger/ (one class per file, per the repo lint standard) and are
 * re-exported here so consumers import everything from './logger.ts'.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface Logger {
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
}

export { CapturingLogger } from './logger/capturing-logger.ts';
export { ConsoleLogger } from './logger/console-logger.ts';
