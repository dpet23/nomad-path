import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

import contract from './rollup.contract.config.js';

const production = !process.env.ROLLUP_WATCH;

// Profiling code (src/profiling.ts) reads the NOMADPATH_PROFILING constant.
// Both library outputs run the SAME pipeline (resolve/commonjs/typescript/
// terser) and differ ONLY in the value replaced for NOMADPATH_PROFILING — so
// the profiling bundle is the prod bundle PLUS measurement, not a separate dev
// build. That parity is what keeps the demo/perf numbers realistic.
//   - prod (`false`):     terser dead-code-eliminates every profiling branch,
//                         so profiling is ABSENT, not just disabled.
//   - profiling (`true`): the timing wrappers stay live and emit marks.
// passes: 2 — the first compress pass folds the NOMADPATH_PROFILING ternary in
// src/profiling.ts down to an identity wrapper; the second pass then drops the
// now-dead phase-name string arguments at each call site, so the prod bundle is
// clean of profiling phase names too. (Harmless on the profiling bundle, where
// nothing is dead — kept identical for pipeline parity.)
const libraryPlugins = profilingEnabled =>
    [
        replace({
            preventAssignment: true,
            values: { NOMADPATH_PROFILING: String(profilingEnabled) },
        }),
        resolve({ browser: true }),
        commonjs(),
        typescript({ tsconfig: './tsconfig.rollup.json' }),
        production && terser({ compress: { passes: 2 } }),
    ].filter(Boolean);

// Prod bundle — what real consumers load and what test/integration + test/e2e
// verify. Profiling stripped.
const library = {
    input: 'src/index.ts',
    output: {
        file: 'dist/nomad-path.js',
        format: 'esm',
        sourcemap: true,
    },
    plugins: libraryPlugins(false),
};

// Profiling bundle — same pipeline, marks live. Loaded only by the demo and the
// characterization perf test. Library-owned output; NOT published (see the
// `files` whitelist in package.json, which omits it).
const libraryProfiling = {
    input: 'src/index.ts',
    output: {
        file: 'dist/nomad-path.profiling.js',
        format: 'esm',
        sourcemap: true,
    },
    plugins: libraryPlugins(true),
};

/** @type {import('rollup').RollupOptions[]} */
export default [library, libraryProfiling, contract];
