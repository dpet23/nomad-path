#!/usr/bin/env node

/**
 * nomadpath-preprocess: turn a folder of raw GPX/KML + nomadpath.yaml into one
 * validated trip-data.json.
 *
 *   nomadpath-preprocess <input-dir> [--config <path>] [--out <path>]
 *
 * config defaults to <input-dir>/nomadpath.yaml, output to
 * <input-dir>/trip-data.json. Strict: any hard parse error aborts and writes
 * nothing. Unmatched config selectors print a non-fatal warning.
 *
 * Output convention (all nomadpath bins): stdout carries the product, stderr
 * the narration. Here the product is a file, so EVERYTHING a human reads -
 * summary, warnings, error report, help-on-error - goes to stderr; stdout stays
 * empty. Exit codes: 0 = emitted, 1 = hard errors (nothing written), 2 = bad
 * invocation. See design log 2026-07-04.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { Command } from 'commander';

import type { Config } from './config/schema.ts';
import { loadConfig } from './config/schema.ts';
import { emit } from './emit.ts';
import { BuildStats } from './model.ts';
import { scanFolder, unmatchedSelectors } from './scan.ts';

interface Options {
    config?: string;
    out?: string;
}

/** Load the config from --config, or the default <dir>/nomadpath.yaml if present, else empty. */
function resolveConfig(inputDir: string, options: Options): Config {
    const explicit = options.config;
    const path = explicit ?? join(inputDir, 'nomadpath.yaml');
    if (!existsSync(path)) {
        if (explicit !== undefined) {
            process.stderr.write(`error: config file not found: ${path}\n`);
            process.exit(2);
        }
        return loadConfig('', 'nomadpath.yaml');
    }
    return loadConfig(readFileSync(path, 'utf8'), path);
}

/** Scan the input dir, report warnings/errors to stderr, and emit trip-data.json. */
function run(inputDir: string, options: Options): void {
    if (!existsSync(inputDir) || !statSync(inputDir).isDirectory()) {
        process.stderr.write(`error: input dir not found: ${inputDir}\n`);
        process.exit(2);
    }

    const config = resolveConfig(inputDir, options);
    const scan = scanFolder(inputDir, config);

    for (const selector of unmatchedSelectors(scan, config)) {
        process.stderr.write(`warning: config selector "${selector}" matched no files\n`);
    }

    if (scan.errors.length > 0) {
        process.stderr.write(`\n${String(scan.errors.length)} error(s); nothing written:\n`);
        for (const e of scan.errors) {
            process.stderr.write(`  ${e.sourceFile}: ${e.message}\n`);
        }
        process.exit(1);
    }

    // Info-level status of a successful run -> stdout (warnings/errors go to stderr).
    const parts = [
        `scanned ${String(scan.paths.length)} file(s)`,
        `${String(scan.features.length)} feature(s)`,
        ...BuildStats.format(scan.stats),
    ];
    process.stdout.write(`${parts.join(', ')}.\n`);

    const outPath = options.out ?? join(inputDir, 'trip-data.json');
    try {
        emit(scan.features, config.name, outPath);
    } catch (err) {
        process.stderr.write(`\n${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
    }
}

const program = new Command();
program
    .name('nomadpath-preprocess')
    .description('Build one validated trip-data.json from a folder of raw GPX/KML + nomadpath.yaml.')
    .argument('<input-dir>', 'folder of raw GPX/KML recordings to preprocess')
    .option('-c, --config <path>', 'config file (default: <input-dir>/nomadpath.yaml)')
    .option('-o, --out <path>', 'output file (default: <input-dir>/trip-data.json)')
    .action(run);

// Explicit --help/--version is what the user asked for -> stdout (pipeable to a
// pager). Commander's error-triggered usage text already uses writeErr -> stderr.
// A usage error exits 2; an explicit help/version request exits 0.
program.exitOverride(err => {
    process.exit(err.exitCode === 0 ? 0 : 2);
});

try {
    program.parse();
} catch (err) {
    if (err instanceof Error && 'exitCode' in err) process.exit((err as { exitCode: number }).exitCode);
    throw err;
}
