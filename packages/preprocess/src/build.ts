/**
 * The build pipeline as a pure-of-process-effects function: scan -> emit,
 * logging via the injected logger, returning an exit code. No process.exit /
 * stream writes here, so it runs (and is coverage-instrumented) in-process. The
 * thin bin wiring (commander + process.exit) lives in cli.ts and calls build().
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { Config } from './config/schema.ts';
import { loadConfig } from './config/schema.ts';
import { emit } from './emit.ts';
import type { Logger } from './logger.ts';
import { BuildStats } from './model.ts';
import { scanFolder, unmatchedSelectors } from './scan.ts';

export interface Options {
    config?: string;
    out?: string;
}

const DEFAULT_OUTPUT_FILENAME = 'trip-data.json';

/** Resolve the output file path. A directory (e.g. `-o .`) means "write the default file into it". */
function resolveOutPath(inputDir: string, out: string | undefined): string {
    if (out === undefined) return join(inputDir, DEFAULT_OUTPUT_FILENAME);
    if (existsSync(out) && statSync(out).isDirectory()) return join(out, DEFAULT_OUTPUT_FILENAME);
    return out;
}

/** Load config from --config, or the default <dir>/nomadpath.yaml if present, else empty. Returns undefined on a missing explicit --config (caller exits 2). */
function resolveConfig(inputDir: string, options: Options, logger: Logger): Config | undefined {
    const explicit = options.config;
    const path = explicit ?? join(inputDir, 'nomadpath.yaml');
    if (!existsSync(path)) {
        if (explicit !== undefined) {
            logger.error(`error: config file not found: ${path}`);
            return undefined;
        }
        return loadConfig('', 'nomadpath.yaml');
    }
    return loadConfig(readFileSync(path, 'utf8'), path);
}

/**
 * The whole build as a pure-of-process-effects function: scan -> emit, logging
 * via the injected logger, returning an exit code. No process.exit / stream
 * writes here, so it runs (and is coverage-instrumented) in-process.
 */
export function build(inputDir: string, options: Options, logger: Logger): number {
    if (!existsSync(inputDir) || !statSync(inputDir).isDirectory()) {
        logger.error(`error: input dir not found: ${inputDir}`);
        return 2;
    }

    const config = resolveConfig(inputDir, options, logger);
    if (config === undefined) return 2;

    const scan = scanFolder(inputDir, config);

    for (const selector of unmatchedSelectors(scan, config)) {
        logger.warn(`warning: config selector "${selector}" matched no files`);
    }

    if (scan.errors.length > 0) {
        logger.error(`\n${String(scan.errors.length)} error(s); nothing written:`);
        for (const e of scan.errors) {
            logger.error(`  ${e.sourceFile}: ${e.message}`);
        }
        return 1;
    }

    const outPath = resolveOutPath(inputDir, options.out);
    try {
        emit(scan.features, config.name, outPath);
    } catch (err) {
        logger.error(`\n${err instanceof Error ? err.message : String(err)}`);
        return 1;
    }

    const parts = [
        `scanned ${String(scan.paths.length)} file(s)`,
        `${String(scan.features.length)} feature(s)`,
        ...BuildStats.format(scan.stats),
    ];
    logger.info(`${parts.join(', ')}.`);
    return 0;
}
