import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

import contract from './rollup.contract.config.js';

const production = !process.env.ROLLUP_WATCH;

// Profiling code (src/profiling.ts) reads the NOMADPATH_PROFILING constant.
// Replacing it with `false` here lets terser dead-code-eliminate every
// profiling branch from the production bundle — profiling is ABSENT, not just
// disabled. The profiling bundle sets this to `true`.
const library = {
    input: 'src/index.ts',
    output: {
        file: 'dist/nomad-path.js',
        format: 'esm',
        sourcemap: true,
    },
    plugins: [
        replace({
            preventAssignment: true,
            values: { NOMADPATH_PROFILING: 'false' },
        }),
        resolve({ browser: true }),
        commonjs(),
        typescript({ tsconfig: './tsconfig.rollup.json' }),
        production && terser(),
    ].filter(Boolean),
};

/** @type {import('rollup').RollupOptions[]} */
export default [library, contract];