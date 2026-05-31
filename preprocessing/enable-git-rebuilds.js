#!/usr/bin/env node
/**
 * Configure a directory as a git push target that rebuilds the trip-data
 * geojson on every push.
 *
 * This script is a one-shot setup.
 * It does not run a dev server and it does not run an initial build.
 * Its only job is to install plumbing on a target repo.
 */
import { spawnSync } from 'child_process';
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join, resolve as pathResolve } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

import { OUTPUT_FILE } from './lib/config.js';
import { logFail } from './lib/log.js';
import { expandPath } from './lib/paths.js';

const USAGE = `
Usage: npm run git:enable -- -i <dir> [-o <file>] [-n <name>]

Configures <dir> (which must be a git repo) so that pushes to it trigger
a rebuild of the trip-data geojson via a post-receive hook. The build's
output streams back to the pushing client as 'remote: [OK] ...' lines.

Options:
  -i, --input  <dir>   Directory to configure (must contain a .git/ dir) [required]
  -o, --output <file>  Output path for the geojson the hook should build
                       (default: ./demo/${OUTPUT_FILE})
  -n, --name   <name>  Trip name passed to the build

What this does:
  1. Sets 'receive.denyCurrentBranch updateInstead' so pushes update the working tree.
  2. Writes <dir>/.git/hooks/post-receive that invokes build-trip-data.js
     with the resolved input/output/name baked in.

To undo (manual):
  rm <dir>/.git/hooks/post-receive
  git -C <dir> config --unset receive.denyCurrentBranch
`.trim();

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

let values;
try {
    ({ values } = parseArgs({
        options: {
            input: { type: 'string', short: 'i' },
            output: { type: 'string', short: 'o' },
            name: { type: 'string', short: 'n' },
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

const INPUT = expandPath(values.input);
const OUTPUT = expandPath(values.output ?? join('demo', OUTPUT_FILE));
const NAME = values.name;

try {
    if (!statSync(INPUT).isDirectory()) throw new Error();
} catch {
    logFail('Input', `not a directory: ${INPUT}`);
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Verify git repo
// ---------------------------------------------------------------------------
//
// We require a regular .git directory.
// Worktrees (where .git is a file pointing elsewhere) have their hooks directory somewhere else.

const GIT_DIR = join(INPUT, '.git');
let gitStat;
try {
    gitStat = statSync(GIT_DIR);
} catch {
    logFail('Input', `${INPUT} is not a git repo. Run \`git init\` there first.`);
    process.exit(1);
}
if (!gitStat.isDirectory()) {
    logFail('Input', `${GIT_DIR} is not a directory (worktree repos are not supported).`);
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Write a config template to <input>
// ---------------------------------------------------------------------------

const createConfigResult = spawnSync('npm', ['run', 'build:data', '--', '--init', '-i', INPUT], { encoding: 'utf8' });
if (createConfigResult.status !== 0) {
    logFail(
        'NomadPath',
        `failed to crate config: ${createConfigResult.stderr?.trim() || `exit ${createConfigResult.status}`}`,
    );
    process.exit(1);
}
console.log('[git:enable] created nomadpath config');

// ---------------------------------------------------------------------------
// Allow pushing new files.
// Git setting: receive.denyCurrentBranch = updateInstead
// ---------------------------------------------------------------------------
//
// Without this, pushing to the currently checked-out branch is rejected.
// This accepts the push and updates the working tree.
// Idempotent: re-running this script leaves the config in the same state.

const gitConfigResult = spawnSync('git', ['-C', INPUT, 'config', 'receive.denyCurrentBranch', 'updateInstead'], {
    encoding: 'utf8',
});
if (gitConfigResult.status !== 0) {
    logFail(
        'Git',
        `failed to set receive.denyCurrentBranch: ${gitConfigResult.stderr?.trim() || `exit ${gitConfigResult.status}`}`,
    );
    process.exit(1);
}
console.log('[git:enable] set git receive.denyCurrentBranch');

// ---------------------------------------------------------------------------
// Automatically rebuild on new files via a git hook.
// ---------------------------------------------------------------------------
//
// The hook runs in a non-interactive, non-login SSH shell during `git push`,
// so its PATH is the bare sshd default.
// So we use the absolute path of THIS node (process.execPath)
// and the absolute path of build-trip-data.js (import.meta.url).
//
// nvm note: process.execPath under nvm resolves to
// ~/.nvm/versions/node/<version>/bin/node.
// This keeps working across node upgrades.
// The hook only breaks if the user explicitly runs `nvm uninstall <that version>`.
//
// Stream handling: git forwards stdout and stderr to the client as `remote: ...` lines.
// But stdout is block-buffered when piped, while stderr is unbuffered.
// So merging preserves emit order.

const HOOK_MARKER = '# generated by nomad-path enable-git-rebuilds';
const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const BUILD_SCRIPT = pathResolve(THIS_DIR, 'build-trip-data.js');
const NODE_BIN = process.execPath;

/** Quote only the values that could contain spaces in practice. */
function buildHookContent({ nodeBin, buildScript, input, output, name }) {
    for (const v of [nodeBin, buildScript, input, output, name]) {
        if (v != null && String(v).includes("'")) {
            throw new Error(`hook content contains a single quote, refusing to embed: ${v}`);
        }
    }
    let cmd = `'${nodeBin}' '${buildScript}' -i '${input}' -o '${output}'`;
    if (name) cmd += ` -n '${name}'`;
    return [
        '#!/bin/sh',
        HOOK_MARKER,
        '# do not edit by hand — re-run `npm run git:enable` to regenerate',
        `${cmd} 2>&1`,
        '',
    ].join('\n');
}

const GIT_HOOKS_PATH = join(GIT_DIR, 'hooks');
const HOOK_PATH = join(GIT_HOOKS_PATH, 'post-receive');
let HOOK_CONTENT;
try {
    HOOK_CONTENT = buildHookContent({
        nodeBin: NODE_BIN,
        buildScript: BUILD_SCRIPT,
        input: INPUT,
        output: OUTPUT,
        name: NAME,
    });
} catch (err) {
    logFail('Hook', err.message);
    process.exit(1);
}

// If a post-receive hook already exists and was NOT written by us, refuse
// to overwrite. The marker comment is the only signal we trust here — a
// user's hand-written hook (or one installed by another tool) gets left
// alone. If they want our hook, they can move/delete theirs and re-run.
if (existsSync(HOOK_PATH)) {
    const existing = readFileSync(HOOK_PATH, 'utf8');
    if (!existing.includes(HOOK_MARKER)) {
        logFail('Hook', `${HOOK_PATH} already exists and was not written by nomad-path. Move or delete it and re-run.`);
        process.exit(1);
    }
}

// Write hook.
try {
    writeFileSync(HOOK_PATH, HOOK_CONTENT);
    chmodSync(HOOK_PATH, 0o755);
} catch (err) {
    logFail('Hook', `failed to write ${HOOK_PATH}: ${err.message}`);
    process.exit(1);
}
console.log(`[git:enable] wrote ${HOOK_PATH}`);

// ---------------------------------------------------------------------------
// Use the local git hooks.
// Git setting: core.hooksPath = .git/hooks
// ---------------------------------------------------------------------------
//
// Use full paths for non-interactive, non-login SSH shells.

const gitConfigHooksPathResult = spawnSync('git', ['-C', INPUT, 'config', 'core.hooksPath', GIT_HOOKS_PATH], {
    encoding: 'utf8',
});
if (gitConfigHooksPathResult.status !== 0) {
    logFail(
        'Git',
        `failed to set core.hooksPath: ${gitConfigHooksPathResult.stderr?.trim() || `exit ${gitConfigHooksPathResult.status}`}`,
    );
    process.exit(1);
}
console.log('[git:enable] set git core.hooksPath');

// ---------------------------------------------------------------------------
// Finish
// ---------------------------------------------------------------------------

console.log('');
console.log('Setup complete.');
console.log('Run `git config -l --local` to verify settings.');
console.log('Run `npm run demo` to start the dev server;');
console.log('push to this repo to trigger a rebuild.');
