#!/usr/bin/env node
import { readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join, relative, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

import { parse as parseYAML } from 'yaml';

import { validate } from '../dist/contract.js';

import { CONFIG_FILE, OUTPUT_FILE, configPath } from './lib/config.js';
import { parseFile } from './lib/parsers.js';
import { enrichTrack } from './lib/enrichment.js';
import { groupTracks } from './lib/grouping.js';
import { buildIgnoreMatcher } from './lib/ignore.js';
import { buildGeoJSON } from './lib/output.js';
import { expandPath } from './lib/paths.js';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const USAGE = `
Usage: node preprocessing/build-trip-data.js -i <dir> [-o <file>] [-n <name>] [--init]

Options:
  -i, --input  <dir>   Directory to scan for GPS files (recursive) [required]
  -o, --output <file>  Output path (default: <input>/${OUTPUT_FILE})
  -n, --name   <name>  Trip name in GeoJSON metadata (default: parent dir name, title-cased)
      --init           Write a ${CONFIG_FILE} template to <input>/ and exit

Example:
  npm run build:data -- -i ./trips/japan-2024/tracks
  npm run build:data -- -i ./trips/japan-2024/tracks --init
  npm run build:data -- -i ./trips/japan-2024/tracks -n "Japan 2024" -o ./public/${OUTPUT_FILE}
`.trim();

let values;
try {
    ({ values } = parseArgs({
        options: {
            input:  { type: 'string',  short: 'i' },
            output: { type: 'string',  short: 'o' },
            name:   { type: 'string',  short: 'n' },
            init:   { type: 'boolean'              },
        },
    }));
} catch (err) {
    console.error(`Error: ${err.message}\n\n${USAGE}`);
    process.exit(1);
}

if (!values.input) {
    console.error(`Error: --input is required.\n\n${USAGE}`);
    process.exit(1);
}

const inputDir   = expandPath(values.input);
const outputFile = expandPath(values.output) ?? join(inputDir, OUTPUT_FILE);

// Invariant: output is library-compatible-or-absent. Any non-success exit
// must remove a prior output file before terminating, so the consumer never
// sees stale data that doesn't reflect current input.
function removeOutputIfExists() {
    try {
        unlinkSync(outputFile);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
}

function failExit(message) {
    console.error(message);
    removeOutputIfExists();
    process.exit(1);
}
const tripName   = values.name ?? basename(dirname(inputDir))
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

// ---------------------------------------------------------------------------
// --init: generate config template
// ---------------------------------------------------------------------------

if (values.init) {
    const outPath = configPath(inputDir);

    // Discover immediate subdirectories to seed the scaffold. Hidden
    // dirs (.git, .DS_Store, ...) are skipped — they're never groups.
    let subdirs = [];
    try {
        subdirs = readdirSync(inputDir)
            .filter(e => !e.startsWith('.') && statSync(join(inputDir, e)).isDirectory())
            .sort();
    } catch { /* ignore scan errors */ }

    // Read the on-disk template and substitute the `# <<subdirs>>` marker
    // with one `<name>: {}` line per discovered subdir (empty body — user
    // adds settings inline only when they want a non-default). If no
    // subdirs exist, leave a commented example so the file isn't bare.
    const templatePath = join(dirname(fileURLToPath(import.meta.url)), 'nomadpath.template.yaml');
    const template = readFileSync(templatePath, 'utf8');

    const scaffold = subdirs.length > 0
        ? subdirs.map(d => `  ${d}: {}`).join('\n')
        : '  # my-flights: { hidden: true }';
    const rendered = template.replace(/^[ \t]*#[ \t]*<<subdirs>>[ \t]*$/m, scaffold);

    writeFileSync(outPath, rendered);
    console.log(`Created: ${outPath}`);
    console.log(`Edit the file, then re-run without --init to build your trip data.`);
    process.exit(0);
}

// ---------------------------------------------------------------------------
// Config file
// ---------------------------------------------------------------------------

/**
 * @typedef {{ hidden?: boolean, excludeFromAutoBounds?: boolean }} GroupConfig
 * @typedef {{ hidden?: boolean }} POICategoryConfig
 */

/** @type {Record<string, GroupConfig>} */
let groupConfig = {};

/** @type {Record<string, POICategoryConfig>} */
let poiCategoryConfig = {};

/** Raw `ignore:` value from the yaml, passed to buildIgnoreMatcher in
 * the file-discovery section below. */
let rawIgnore;

try {
    const raw = readFileSync(configPath(inputDir), 'utf8');
    const parsed = parseYAML(raw);
    groupConfig = parsed?.groups ?? {};
    poiCategoryConfig = parsed?.poi_categories ?? {};
    rawIgnore = parsed?.ignore;
} catch (err) {
    if (err.code !== 'ENOENT') {
        console.error(`Warning: failed to load ${CONFIG_FILE}: ${err.message}`);
    }
}

// ---------------------------------------------------------------------------
// Track augmentation
// ---------------------------------------------------------------------------

/**
 * Augment an enriched track with `group` and `hidden` fields derived from
 * the file's position relative to the input directory.
 *
 * The group is the first subfolder component under inputDir (e.g. "flights-2025"
 * for a file at "flights-2025/QFA468.kml"). Files at the root level have group = null.
 *
 * `hidden` defaults to false (visible). Set true only when the group's
 * nomadpath.yaml entry specifies `hidden: true`.
 *
 * @param {import('./lib/enrichment.js').EnrichedTrack} track
 * @param {string} filePath
 * @returns {import('./lib/enrichment.js').EnrichedTrack & { group: string|null, hidden: boolean, excludeFromAutoBounds: boolean }}
 */
function augmentTrack(track, filePath) {
    const rel = relative(inputDir, filePath).replace(/\\/g, '/');
    const firstComponent = rel.split('/')[0];
    // Use statSync to reliably distinguish directory names from filenames — dot-based
    // heuristics fail for folder names like "0. Australia".
    const firstComponentPath = join(inputDir, firstComponent);
    const isSubdir = rel.includes('/') && statSync(firstComponentPath).isDirectory();
    const group = isSubdir ? firstComponent : null;

    const cfg = (group && groupConfig[group]) ?? {};
    const hidden = cfg.hidden === true;
    const excludeFromAutoBounds = cfg.excludeFromAutoBounds ?? false;

    return { ...track, group: group ?? null, hidden, excludeFromAutoBounds };
}

// ---------------------------------------------------------------------------
// File discovery (recursive)
// ---------------------------------------------------------------------------

// Predicate sourced from the yaml `ignore:` list. Applied inside collectFiles
// before statSync / recursion, so ignored directories (e.g. .git on the
// user's workflow) are never opened — not just filtered out after the walk.
// Malformed config fails the build loudly: a silent typo that re-enables
// .git scanning would be worse than a clear error.
let isInputIgnored;
try {
    isInputIgnored = buildIgnoreMatcher(rawIgnore, inputDir);
} catch (err) {
    failExit(err.message);
}

/**
 * Recursively collect all file paths under a directory, skipping anything
 * the user listed under `ignore:` in nomadpath.yaml.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function collectFiles(dir) {
    const files = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (isInputIgnored(full)) continue;
        if (full === configPath(inputDir)) continue;
        if (statSync(full).isDirectory()) {
            files.push(...collectFiles(full));
        } else {
            files.push(full);
        }
    }
    return files;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

const allFiles = collectFiles(inputDir);

const allTracks = [];
const allWaypoints = [];
let skipped = 0;
let parsed = 0;

for (const filePath of allFiles) {
    try {
        const { tracks, waypoints } = parseFile(filePath);
        allTracks.push(...tracks.map(t => augmentTrack(enrichTrack(t), filePath)));
        allWaypoints.push(...waypoints);
        parsed++;
    } catch (err) {
        if (err.message?.startsWith('Unsupported file format')) {
            skipped++;
        } else {
            // Real parse failure — surface it with context and abort
            failExit(`Error parsing ${filePath}: ${err.message}`);
        }
    }
}

if (allTracks.length === 0) {
    failExit(`No tracks found in ${inputDir}. Check that the directory contains GPX or KML files.`);
}

const grouped = groupTracks(allTracks);
const geojson = buildGeoJSON({ tracks: grouped, waypoints: allWaypoints, tripName, poiCategoryConfig });

// `featureSource[i]` maps validator featureIndex → input filename (relative to
// inputDir, forward slashes). Mirrors buildGeoJSON's feature ordering: tracks
// sorted by day (flight-prefix stripped for sort key) then waypoints. Built
// here rather than in output.js so source-file knowledge stays inside the
// preprocessing entry point — buildGeoJSON's contract is "geojson only".
const sortedGrouped = [...grouped].sort((a, b) => {
    const keyA = a.day.match(/^flight-(\d{4}-\d{2}-\d{2})/)?.[1] ?? a.day;
    const keyB = b.day.match(/^flight-(\d{4}-\d{2}-\d{2})/)?.[1] ?? b.day;
    return keyA.localeCompare(keyB);
});
const featureSource = [
    ...sortedGrouped.map(t => relative(inputDir, t.sourceFile).replace(/\\/g, '/')),
    ...allWaypoints.map(() => null),
];

// Validate against the capability contract before writing. Failures route
// through failExit so the output file is never left in an invalid state.
// The producer of `ValidationResult` is ../src/contract/validate.ts; the
// shape (discriminated union of `kind: 'feature' | 'top-level' | 'metadata'`)
// is imported via JSDoc rather than redeclared here.
/** @type {import('../src/contract/validate.js').ValidationResult} */
const validation = validate(geojson);
if (!validation.ok) {
    const lines = validation.failures.map(f => {
        if (f.kind === 'feature') {
            const src = featureSource[f.featureIndex] ?? `features[${f.featureIndex}]`;
            return `${src}: ${f.checks.join(', ')}`;
        }
        if (f.kind === 'top-level') return f.message;
        return `metadata: ${f.message}`;
    });
    failExit(`Validation failed:\n  ${lines.join('\n  ')}`);
}

// Atomic write: write to a sibling temp path and rename onto the output.
// rename(2) is atomic within a filesystem, so concurrent readers see either
// the old file or the new file — never a partial write.
const tmpOutput = `${outputFile}.tmp.${process.pid}`;
try {
    writeFileSync(tmpOutput, JSON.stringify(geojson));
    renameSync(tmpOutput, outputFile);
} catch (err) {
    try { unlinkSync(tmpOutput); } catch { /* ignore */ }
    failExit(`Error writing output ${outputFile}: ${err.message}`);
}

const { stats } = geojson.metadata;
const modesSummary = Object.entries(stats.transportModes)
    .sort((a, b) => b[1] - a[1])
    .map(([mode, count]) => `${count} ${mode}`)
    .join(', ');
const rangeSummary = stats.dateRange
    ? ` · ${stats.dateRange.start} → ${stats.dateRange.end}`
    : '';

console.log(`Done: ${parsed} file(s) parsed, ${skipped} skipped.`);
console.log(`Output: ${stats.trackCount} track(s)${rangeSummary}, ${stats.waypointCount} POI(s) → ${outputFile}`);
console.log(`Modes:  ${modesSummary}`);
