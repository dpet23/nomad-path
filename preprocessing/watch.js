#!/usr/bin/env node
import chokidar from 'chokidar';
import { execFileSync, spawn } from 'child_process';
import { statSync, unlinkSync } from 'fs';
import { parseArgs } from 'util';
import { dirname, resolve } from 'path';

const USAGE = `
Usage: npm run watch -- -i <dir> [-o <file>] [-p <port>] [-n <name>]

Builds the trip-data geojson once, then rebuilds whenever files in <dir> change.
Starts a local dev server. Open the printed URL to view the map.

Options:
  -i, --input  <dir>   Directory to watch for GPS files [required]
  -o, --output <file>  Output path for trip-data.geojson (default: ./demo/trip-data.geojson)
                       The dev server serves the directory containing this file.
  -p, --port   <n>     Port for the local dev server (default: serve's default, 3000)
  -n, --name   <name>  Trip name in GeoJSON metadata

To keep running after disconnecting from a remote session:

  nohup npm run watch -- -i <dir> > watch.log 2>&1 &
  echo $!   # note the PID to kill it later

Or with tmux:

  tmux new -s watch
  npm run watch -- -i <dir>
  # Ctrl+B then D to detach; reconnect with: tmux attach -t watch
`.trim();

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

let values;
try {
    ({ values } = parseArgs({
        options: {
            input:  { type: 'string', short: 'i' },
            name:   { type: 'string', short: 'n' },
            output: { type: 'string', short: 'o' },
            port:   { type: 'string', short: 'p' },
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

const INPUT     = resolve(values.input);
const OUTPUT    = resolve(values.output ?? 'demo/trip-data.geojson');
const SERVE_DIR = dirname(OUTPUT);
const PORT      = values.port;

try {
    if (!statSync(INPUT).isDirectory()) throw new Error();
} catch {
    console.error(`Error: input path is not a directory: ${INPUT}`);
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Build invocation
// ---------------------------------------------------------------------------

const buildArgs = ['preprocessing/build-trip-data.js', '-i', INPUT, '-o', OUTPUT];
if (values.name) buildArgs.push('-n', values.name);

function removeOutputIfExists() {
    try {
        unlinkSync(OUTPUT);
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error(`[watch] Failed to remove stale output: ${err.message}`);
        }
    }
}

function build() {
    console.log('[watch] Building…');
    try {
        execFileSync('node', buildArgs, { stdio: 'inherit' });
        console.log('[watch] Done.');
    } catch {
        // build-trip-data.js handles its own failures by unlinking OUTPUT
        // before exiting non-zero. But if the spawned process died abnormally
        // (signalled, OOM, etc.) it may not have run that cleanup. Belt-and-
        // braces: ensure stale output is gone before reporting failure.
        removeOutputIfExists();
        console.error('[watch] Build failed — watching for more changes');
    }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

let exiting = false;
const serveArgs = ['serve', SERVE_DIR];
if (PORT) serveArgs.push('-l', String(PORT));
const serve = spawn('npx', serveArgs, { stdio: 'inherit', shell: false });
serve.on('exit', (code) => {
    if (!exiting) {
        console.error(`[watch] Server exited unexpectedly (code ${code}) — shutting down`);
        process.exit(1);
    }
});
process.on('SIGINT',  () => { exiting = true; serve.kill(); process.exit(0); });
process.on('SIGTERM', () => { exiting = true; serve.kill(); process.exit(0); });

// Reap the serve child if watch.js itself crashes via an unhandled error.
// Without this, an uncaught exception or rejected promise leaves the dev
// server orphaned holding the port. SIGKILL of the watch process is NOT
// covered (it deliberately bypasses userspace cleanup) — that's expected
// behaviour for a force-kill.
function crashCleanup(err) {
    exiting = true;
    try { serve.kill(); } catch { /* ignore */ }
    console.error(err);
    process.exit(1);
}
process.on('uncaughtException', crashCleanup);
process.on('unhandledRejection', crashCleanup);

// ---------------------------------------------------------------------------
// Initial build + watcher
// ---------------------------------------------------------------------------

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
