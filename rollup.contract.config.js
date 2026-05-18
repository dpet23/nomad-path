import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';

// Separate artifact for preprocessing's validator. No MapLibre, no DOM.
// `require.main === module` → `false`: @mapbox/geojsonhint bundles
// jsonlint-lines-primitives, which has a CJS CLI bootstrap at the bottom
// (`if (require.main === module) ...`). That branch references `require`,
// which is undefined in our ESM output. Neutralising it at build time
// lets the bundle load under ESM.
/** @type {import('rollup').RollupOptions} */
export default {
    input: 'src/contract/index.ts',
    output: {
        file: 'dist/contract.js',
        format: 'esm',
        sourcemap: true,
    },
    plugins: [
        replace({
            preventAssignment: true,
            values: { 'require.main === module': 'false' },
        }),
        resolve({ preferBuiltins: true }),
        commonjs(),
        typescript({ tsconfig: './tsconfig.rollup.json' }),
    ],
};