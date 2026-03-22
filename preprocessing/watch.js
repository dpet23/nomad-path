#!/usr/bin/env node
import chokidar from 'chokidar';
import { execFileSync, spawn } from 'child_process';
import { parseArgs } from 'util';
import { resolve, join } from 'path';

const USAGE = `
Usage: npm run watch -- -i <dir> [-o <file>] [-n <name>]

Builds trip-data.geojson once, then rebuilds whenever files in <dir> change.
Starts a local dev server serving the project root.

Options:
  -i, --input  <dir>   Directory to watch for GPS files [required]
  -o, --output <file>  Output path (default: <input>/trip-data.geojson)
  -n, --name   <name>  Trip name in GeoJSON metadata
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
} catch {
    console.error(USAGE);
    process.exit(1);
}

if (!values.input) {
    console.error(USAGE);
    process.exit(1);
}

const INPUT  = resolve(values.input);
const OUTPUT = values.output ? resolve(values.output) : join(INPUT, 'trip-data.geojson');

// Build args to forward to build-trip-data.js (same semantics)
const buildArgs = ['preprocessing/build-trip-data.js', '-i', INPUT, '-o', OUTPUT];
if (values.name) buildArgs.push('-n', values.name);

function build() {
    console.log('[watch] Building…');
    try {
        execFileSync('node', buildArgs, { stdio: 'inherit' });
        console.log('[watch] Done.');
    } catch {
        console.error('[watch] Build failed — watching for more changes');
    }
}

// Start serve
const serve = spawn('npx', ['serve', '.'], { stdio: 'inherit', shell: false });
process.on('SIGINT',  () => { serve.kill(); process.exit(0); });
process.on('SIGTERM', () => { serve.kill(); process.exit(0); });

// Initial build
build();

// Watch
chokidar
    .watch(INPUT, {
        ignoreInitial: true,
        ignored: OUTPUT,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    })
    .on('add',    () => build())
    .on('change', () => build())
    .on('unlink', () => build());
