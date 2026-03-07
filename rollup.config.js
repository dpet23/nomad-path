import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

const production = !process.env.ROLLUP_WATCH;

/** @type {import('rollup').RollupOptions} */
export default {
    input: 'src/index.ts',
    output: {
        file: 'dist/nomad-path.js',
        format: 'esm',
        sourcemap: true,
    },
    plugins: [
        resolve({ browser: true }),
        commonjs(),
        typescript({ tsconfig: './tsconfig.rollup.json' }),
        production && terser(),
    ].filter(Boolean),
};
