#!/usr/bin/env node
import chokidar from 'chokidar';
import { execFileSync, spawn } from 'child_process';
import { parseArgs } from 'util';
import { resolve } from 'path';

const USAGE = `
Usage: npm run watch -- -i <dir> [-n <name>]

Builds demo/trip-data.geojson once, then rebuilds whenever files in <dir> change.
Starts a local dev server. Open http://localhost:3000/ to view the map.

Options:
  -i, --input  <dir>   Directory to watch for GPS files [required]
  -n, --name   <name>  Trip name in GeoJSON metadata
`.trim();

let values;
try {
    ({ values } = parseArgs({
        options: {
            input: { type: 'string', short: 'i' },
            name:  { type: 'string', short: 'n' },
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
const OUTPUT = resolve('demo/trip-data.geojson');

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

const serve = spawn('npx', ['serve', './demo'], { stdio: 'inherit', shell: false });
process.on('SIGINT',  () => { serve.kill(); process.exit(0); });
process.on('SIGTERM', () => { serve.kill(); process.exit(0); });

build();

chokidar
    .watch(INPUT, {
        ignoreInitial: true,
        ignored: OUTPUT,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    })
    .on('add',    () => build())
    .on('change', () => build())
    .on('unlink', () => build());
