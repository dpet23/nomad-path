#!/usr/bin/env node
import { readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { resolve, join, relative, dirname, basename } from 'path';
import { parseArgs } from 'util';

import { parse as parseYAML } from 'yaml';

import { validate } from '../dist/contract.js';

import { parseFile } from './lib/parsers.js';
import { enrichTrack } from './lib/enrichment.js';
import { groupTracks } from './lib/grouping.js';
import { buildGeoJSON } from './lib/output.js';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const USAGE = `
Usage: node preprocessing/build-trip-data.js -i <dir> [-o <file>] [-n <name>] [--init]

Options:
  -i, --input  <dir>   Directory to scan for GPS files (recursive) [required]
  -o, --output <file>  Output path (default: <input>/trip-data.geojson)
  -n, --name   <name>  Trip name in GeoJSON metadata (default: parent dir name, title-cased)
      --init           Write a nomadpath.yaml template to <input>/ and exit

Example:
  npm run build:data -- -i ./trips/japan-2024/tracks
  npm run build:data -- -i ./trips/japan-2024/tracks --init
  npm run build:data -- -i ./trips/japan-2024/tracks -n "Japan 2024" -o ./public/trip-data.geojson
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

const inputDir   = resolve(values.input);
const outputFile = resolve(values.output ?? join(values.input, 'trip-data.geojson'));

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
// --init: generate nomadpath.yaml template
// ---------------------------------------------------------------------------

if (values.init) {
    const configPath = join(inputDir, 'nomadpath.yaml');

    // Discover immediate subdirectories to pre-populate the template.
    let subdirs = [];
    try {
        subdirs = readdirSync(inputDir)
            .filter(e => !e.startsWith('.') && statSync(join(inputDir, e)).isDirectory());
    } catch { /* ignore scan errors */ }

    const groupEntries = subdirs.length > 0
        ? subdirs.map(d => `  ${d}:\n    defaultVisible: true`).join('\n')
        : '  # my-flights:\n  #   defaultVisible: false';

    const template = `\
# nomadpath.yaml — Nomad Path preprocessing configuration
# See: preprocessing/README.md for full documentation.
#
# Groups correspond to immediate subdirectories of your input directory.
# Tracks at the root level (not in any subfolder) are always visible.
#
# Available group options:
#   defaultVisible:        true | false   — whether tracks are shown at map load (default: true)
#   excludeFromAutoBounds: true | false   — exclude from initial viewport fit even when visible (default: false)

groups:
${groupEntries}

# POI category visibility at map load. Category names come from waypoint <type> tags.
# poi_categories:
#   accommodation:
#     defaultVisible: false
`;

    writeFileSync(configPath, template);
    console.log(`Created: ${configPath}`);
    console.log(`Edit the file, then re-run without --init to build your trip data.`);
    process.exit(0);
}

// ---------------------------------------------------------------------------
// nomadpath.yaml config
// ---------------------------------------------------------------------------

/**
 * @typedef {{ defaultVisible?: boolean, excludeFromAutoBounds?: boolean }} GroupConfig
 * @typedef {{ defaultVisible?: boolean }} POICategoryConfig
 */

/** @type {Record<string, GroupConfig>} */
let groupConfig = {};

/** @type {Record<string, POICategoryConfig>} */
let poiCategoryConfig = {};

const configPath = join(inputDir, 'nomadpath.yaml');
try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = parseYAML(raw);
    groupConfig = parsed?.groups ?? {};
    poiCategoryConfig = parsed?.poi_categories ?? {};
} catch (err) {
    if (err.code !== 'ENOENT') {
        console.error(`Warning: failed to load nomadpath.yaml: ${err.message}`);
    }
}

// ---------------------------------------------------------------------------
// Track augmentation
// ---------------------------------------------------------------------------

/**
 * Augment an enriched track with `group` and `defaultVisible` fields derived
 * from the file's position relative to the input directory.
 *
 * The group is the first subfolder component under inputDir (e.g. "flights-2025"
 * for a file at "flights-2025/QFA468.kml"). Files at the root level have group = null.
 *
 * defaultVisible priority:
 *   1. Group config in nomadpath.yaml
 *   2. true (default — show everything unless told otherwise)
 *
 * @param {import('./lib/enrichment.js').EnrichedTrack} track
 * @param {string} filePath
 * @returns {import('./lib/enrichment.js').EnrichedTrack & { group: string|null, defaultVisible: boolean }}
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
    const defaultVisible = cfg.defaultVisible ?? true;
    const excludeFromAutoBounds = cfg.excludeFromAutoBounds ?? false;

    return { ...track, group: group ?? null, defaultVisible, excludeFromAutoBounds };
}

// ---------------------------------------------------------------------------
// File discovery (recursive)
// ---------------------------------------------------------------------------

/**
 * Recursively collect all file paths under a directory.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function collectFiles(dir) {
    const files = [];
    for (const entry of readdirSync(dir)) {
        if (entry.startsWith('.')) continue; // skip hidden files and dirs (e.g. .git)
        const full = join(dir, entry);
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

// Validate against the capability contract before writing. Failures route
// through failExit so the output file is never left in an invalid state.
const validation = validate(geojson);
if (!validation.ok) {
    failExit(`Validation failed:\n  ${validation.errors.join('\n  ')}`);
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
