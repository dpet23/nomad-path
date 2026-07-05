import type { Logger, LogLevel } from '../logger.ts';

/** Records every call for in-process assertions in tests. */
export class CapturingLogger implements Logger {
    readonly entries: { level: LogLevel; msg: string }[] = [];
    info(msg: string): void {
        this.entries.push({ level: 'info', msg });
    }
    warn(msg: string): void {
        this.entries.push({ level: 'warn', msg });
    }
    error(msg: string): void {
        this.entries.push({ level: 'error', msg });
    }
}
