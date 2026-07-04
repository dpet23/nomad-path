/**
 * Folder scan: walk an input directory, skip ignored paths, dispatch each
 * recognised file to its parser, and collect all features and errors (never
 * throws - a bad file becomes a collected error and the scan continues).
 *
 * sourceFile on every feature/error is the POSIX path relative to the input
 * root, so it is stable across machines and feeds the item-id derivation.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { isIgnored, selectorMatches } from './config/resolve.ts';
import type { Config } from './config/schema.ts';
import type { ParseError, ParseResult, RawFeature } from './model.ts';
import { BuildStats } from './model.ts';
import { parseGpx } from './parse/gpx.ts';
import { parseKml } from './parse/kml.ts';

export interface ScanResult {
    features: RawFeature[];
    errors: ParseError[];
    /** Build stats aggregated across every parsed file. */
    stats: BuildStats;
    /** Relative POSIX paths of every scanned (non-ignored, recognised) file. */
    paths: string[];
}

type Parser = (xml: string, sourceFile: string) => ParseResult;

const PARSERS: Record<string, Parser> = {
    '.gpx': parseGpx,
    '.kml': parseKml,
};

/** POSIX-normalise a path relative to the input root (forward slashes on every OS). */
function toPosix(inputDir: string, fullPath: string): string {
    return relative(inputDir, fullPath).split(sep).join('/');
}

/** Every recognised file under inputDir, relative-POSIX, sorted, ignore-filtered. */
function collectPaths(inputDir: string, config: Config): string[] {
    const paths: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            const rel = toPosix(inputDir, full);
            if (isIgnored(rel, config)) continue;
            if (entry.isDirectory()) {
                walk(full);
            } else if (extname(entry.name) in PARSERS) {
                paths.push(rel);
            }
        }
    };
    walk(inputDir);
    return paths.sort((a, b) => a.localeCompare(b));
}

/** Lowercased file extension including the dot, or '' if none. */
function extname(name: string): string {
    const dot = name.lastIndexOf('.');
    return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

export function scanFolder(inputDir: string, config: Config): ScanResult {
    const features: RawFeature[] = [];
    const errors: ParseError[] = [];
    let stats = BuildStats.zero();
    const paths = collectPaths(inputDir, config);
    for (const path of paths) {
        const parser = PARSERS[extname(path)];
        if (parser === undefined) continue;
        const xml = readFileSync(join(inputDir, path), 'utf8');
        const result = parser(xml, path);
        features.push(...result.features);
        errors.push(...result.errors);
        stats = BuildStats.merge(stats, result.stats);
    }
    return { features, errors, stats, paths };
}

/**
 * Config selectors that matched nothing in the scan: a `tracks:` key that no
 * scanned file path matched, or a `waypoints:` key not present as any feature's
 * folder value. Usually a typo or a renamed folder - surfaced as a non-fatal
 * warning (a valid config pointing at nothing is occasionally intentional).
 * Returned as "tracks:<key>" / "waypoints:<key>" strings.
 */
export function unmatchedSelectors(result: ScanResult, config: Config): string[] {
    const unmatched: string[] = [];
    for (const key of Object.keys(config.tracks)) {
        if (!result.paths.some(path => selectorMatches(key, path))) {
            unmatched.push(`tracks:${key}`);
        }
    }
    const folders = new Set(result.features.map(f => f.folder).filter((f): f is string => f !== undefined));
    for (const key of Object.keys(config.waypoints)) {
        if (!folders.has(key)) unmatched.push(`waypoints:${key}`);
    }
    return unmatched;
}
