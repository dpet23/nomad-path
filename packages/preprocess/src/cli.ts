#!/usr/bin/env node

/**
 * nomadpath-preprocess: turn a folder of raw GPX/KML + nomadpath.yaml into one
 * validated trip-data.json.
 *
 *   nomadpath-preprocess <input-dir> [--config <path>] [--out <path>]
 *
 * config defaults to <input-dir>/nomadpath.yaml, output to
 * <input-dir>/trip-data.json (or, if --out names a directory, <out>/trip-data.json).
 *
 * Output by severity (via Logger): info = successful-run status -> stdout;
 * warn/error = non-fatal warnings + fail-loud report -> stderr. Exit codes:
 * 0 = emitted, 1 = hard errors (nothing written), 2 = bad invocation.
 * See design log 2026-07-04.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';

import { Command } from 'commander';

import type { Config } from './config/schema.ts';
import { loadConfig } from './config/schema.ts';
import { emit } from './emit.ts';
import type { Logger } from './logger.ts';
import { ConsoleLogger } from './logger.ts';
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

/** Wire up commander and run the CLI. Only invoked when this file is the process entry point. */
function main(): void {
    const program = new Command();
    program
        .name('nomadpath-preprocess')
        .description('Build one validated trip-data.json from a folder of raw GPX/KML + nomadpath.yaml.')
        .argument('<input-dir>', 'folder of raw GPX/KML recordings to preprocess')
        .option('-c, --config <path>', 'config file (default: <input-dir>/nomadpath.yaml)')
        .option('-o, --out <path>', 'output file or directory (default: <input-dir>/trip-data.json)')
        .action((inputDir: string, options: Options) => {
            process.exit(build(inputDir, options, new ConsoleLogger()));
        });

    // Explicit --help/--version -> stdout (pipeable); commander's error-triggered
    // usage -> stderr. A usage error exits 2; explicit help/version exits 0.
    program.exitOverride(err => {
        process.exit(err.exitCode === 0 ? 0 : 2);
    });

    try {
        program.parse();
    } catch (err) {
        if (err instanceof Error && 'exitCode' in err) process.exit((err as { exitCode: number }).exitCode);
        throw err;
    }
}

// Run only as a real bin, not when imported (e.g. by build() tests), so importing
// this module never triggers commander's argv parsing / process.exit.
if (argv[1] !== undefined && import.meta.url === pathToFileURL(argv[1]).href) main();
