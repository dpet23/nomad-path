#!/usr/bin/env node
import chokidar from 'chokidar';
import { spawn } from 'child_process';
import { readFileSync, statSync, unlinkSync } from 'fs';
import { parseArgs } from 'util';
import { dirname, join } from 'path';

import { parse as parseYAML } from 'yaml';

import { CONFIG_FILE, OUTPUT_FILE, configPath } from './lib/config.js';
import { buildIgnoreMatcher } from './lib/ignore.js';
import { logFail } from './lib/log.js';
import { expandPath } from './lib/paths.js';

const USAGE = `
Usage: npm run watch -- -i <dir> [-o <file>] [-p <port>] [-n <name>]

Builds the trip-data geojson once, then rebuilds whenever files in <dir> change.
Starts a local dev server. Open the printed URL to view the map.

Options:
  -i, --input  <dir>   Directory to watch for GPS files [required]
  -o, --output <file>  Output path for the geojson (default: ./demo/${OUTPUT_FILE})
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

Reading the log remotely (e.g. from a phone over ssh):

  tail -50 watch.log                       # most recent activity
  grep '\\[FAIL\\]' watch.log              # every preprocessing failure
  grep '\\[FAIL\\]' watch.log | tail       # most recent failures
  grep -E '\\[OK\\]|\\[FAIL\\]' watch.log | tail -5
                                           # last 5 outcomes (success or failure).
                                           # An [OK] line means the build recovered;
                                           # any [FAIL] after the most recent [OK]
                                           # is an unresolved problem.
  grep -E ' (4|5)[0-9]{2} ' watch.log      # serve HTTP errors (4xx/5xx)
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

const INPUT     = expandPath(values.input);
const OUTPUT    = expandPath(values.output ?? join('demo', OUTPUT_FILE));
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
            logFail('Cleanup', `failed to remove stale output ${OUTPUT}: ${err.message}`);
        }
    }
}

// Coalesce file-event bursts. chokidar's awaitWriteFinish handles per-file
// debouncing (one event per file, only after that file stops changing).
// What it doesn't do is coalesce across files or across builds — a `git push`
// landing 50 files fires 50 events, and without queueing each one would start
// its own build.
//
//   - At most one build in flight.
//   - At most one rebuild queued. Events arriving during a build collapse
//     into a single follow-up build that picks up the full state.
//
// No wall-clock timer: the queued build fires when the current one exits, so
// a 50-file burst produces at most 2 builds total.
let buildInFlight = false;
let rebuildPending = false;

function build() {
    if (buildInFlight) {
        rebuildPending = true;
        return;
    }
    buildInFlight = true;
    rebuildPending = false;
    // spawn (not execFile) — execFile buffers stdio and ignores 'inherit'.
    // We want the child's [OK]/[FAIL] lines streamed through to the log.
    const child = spawn('node', buildArgs, { stdio: 'inherit' });
    child.on('exit', (code) => {
        // build-trip-data.js handles its own failures by unlinking OUTPUT
        // before exiting non-zero. But if the spawned process died abnormally
        // (signalled, OOM, etc.) it may not have run that cleanup. Belt-and-
        // braces: ensure stale output is gone on any non-zero exit. The child
        // has already printed its own [FAIL] line(s); no extra summary needed.
        if (code !== 0) removeOutputIfExists();
        buildInFlight = false;
        if (rebuildPending) build();
    });
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
        logFail('Server', `serve exited unexpectedly with code ${code}`);
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
    logFail('Crash', err?.stack ?? err?.message ?? String(err));
    process.exit(1);
}
process.on('uncaughtException', crashCleanup);
process.on('unhandledRejection', crashCleanup);

// ---------------------------------------------------------------------------
// Ignore patterns (shared with build-trip-data.js via buildIgnoreMatcher)
//
// Read once at startup. Editing nomadpath.yaml mid-watch is a documented
// "restart required" case — hot reload would surprise more than it'd help.
// Malformed config is loud: a silent typo that re-enables .git scanning
// would defeat the whole point of this feature.
// ---------------------------------------------------------------------------

const CONFIG_PATH = configPath(INPUT);

let rawIgnore;
try {
    const parsed = parseYAML(readFileSync(CONFIG_PATH, 'utf8'));
    rawIgnore = parsed?.ignore;
} catch (err) {
    if (err.code !== 'ENOENT') {
        logFail('Config', `${CONFIG_PATH}: ${err.message}`);
        process.exit(1);
    }
}

let isInputIgnored;
try {
    isInputIgnored = buildIgnoreMatcher(rawIgnore, INPUT);
} catch (err) {
    logFail('Config', `${CONFIG_PATH}: ${err.message}`);
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Initial build + watcher
// ---------------------------------------------------------------------------

build();

chokidar
    .watch(INPUT, {
        ignoreInitial: true,
        // Skip user-ignored paths, the config file itself (events on it
        // are restart-required, not rebuild-required), and our own output
        // (so writing the geojson doesn't re-trigger a build).
        ignored: (absPath) =>
            absPath === OUTPUT || absPath === CONFIG_PATH || isInputIgnored(absPath),
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    })
    .on('add',    () => build())
    .on('change', () => build())
    .on('unlink', () => build());
