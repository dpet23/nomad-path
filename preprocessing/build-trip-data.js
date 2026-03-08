#!/usr/bin/env node
import { readdirSync, statSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { parseArgs } from 'util';

import { parseFile } from './lib/parsers.js';
import { enrichTrack } from './lib/enrichment.js';
import { groupTracks } from './lib/grouping.js';
import { buildGeoJSON } from './lib/output.js';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const USAGE = `
Usage: node preprocessing/build-trip-data.js [options]

Options:
  -i, --input  <dir>   Directory to scan for GPS files (recursive)
  -o, --output <file>  Output path for trip-data.geojson
  -n, --name   <name>  Trip name embedded in GeoJSON metadata

Example:
  node preprocessing/build-trip-data.js -i ./gps -o ./public/trip-data.geojson -n "Japan 2024"
  npm run build:data -- -i ./gps -o ./public/trip-data.geojson -n "Japan 2024"
`.trim();

let values;
try {
    ({ values } = parseArgs({
        options: {
            input:  { type: 'string', short: 'i' },
            output: { type: 'string', short: 'o' },
            name:   { type: 'string', short: 'n' },
        },
    }));
} catch (err) {
    console.error(`Error: ${err.message}\n\n${USAGE}`);
    process.exit(1);
}

if (!values.input || !values.output || !values.name) {
    console.error(`Error: --input, --output, and --name are all required.\n\n${USAGE}`);
    process.exit(1);
}

const inputDir  = resolve(values.input);
const outputFile = resolve(values.output);
const tripName  = values.name;

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
        allTracks.push(...tracks.map(enrichTrack));
        allWaypoints.push(...waypoints);
        parsed++;
    } catch (err) {
        if (err.message?.startsWith('Unsupported file format')) {
            skipped++;
        } else {
            // Real parse failure — surface it with context and abort
            console.error(`Error parsing ${filePath}: ${err.message}`);
            process.exit(1);
        }
    }
}

if (allTracks.length === 0) {
    console.error(`No tracks found in ${inputDir}. Check that the directory contains GPX or KML files.`);
    process.exit(1);
}

const grouped = groupTracks(allTracks);
const geojson = buildGeoJSON({ tracks: grouped, waypoints: allWaypoints, tripName });

writeFileSync(outputFile, JSON.stringify(geojson));

const trackCount = grouped.length;
const poiCount = allWaypoints.length;
const days = new Set(grouped.map(t => t.day)).size;
console.log(`Done: ${parsed} file(s) parsed, ${skipped} skipped.`);
console.log(`Output: ${trackCount} track(s) across ${days} day(s), ${poiCount} POI(s) → ${outputFile}`);
