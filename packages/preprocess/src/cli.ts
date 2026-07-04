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
 *
 * This file is ONLY the bin wiring: commander parsing + process.exit, exercised
 * via subprocess in cli.test.ts / pipeline.test.ts (invisible to v8 in-process
 * coverage). The build logic lives in build.ts and is unit-tested in
 * build.test.ts - which is why cli.ts is excluded from the coverage floor.
 */

import { argv } from 'node:process';
import { pathToFileURL } from 'node:url';

import { Command } from 'commander';

import type { Options } from './build.ts';
import { build } from './build.ts';
import { ConsoleLogger } from './logger.ts';

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
