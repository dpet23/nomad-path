/**
 * Rollup configuration for bundling production packages.
 */

import fs from 'fs';

import typescript from 'rollup-plugin-typescript2';
import scss from 'rollup-plugin-scss'

const OUTPUT_DIR = 'dist';
const OUTPUT_BASE_NAME = 'leaflet-map';

/**
 * Rollup plugin to remove external imports from the generated bundle.
 */
const removeExternalExports = () => ({
    name: 'Remove external imports',
    writeBundle(options, bundle) {
        for (const [fileName, chunkOrAsset] of Object.entries(bundle)) {
            if (!options.file.endsWith(fileName)) {
                continue;
            }
            const content = chunkOrAsset.code || chunkOrAsset.source;
            fs.writeFile(
                options.file,
                content.replace(/import.*/, ''),
                err => {
                    if (err) {
                        throw err
                    }
                }
            );
        }
    },
});

export default {
    input: 'src/main.ts',

    plugins: [
        // Call the TypeScript compiler.
        // Loads compilerOptions from tsconfig.json.
        typescript({
            abortOnError: true,
        }),

        // Call the Sass compiler.
        scss({
            fileName: `${OUTPUT_BASE_NAME}.css`, // in same dir as js output
            verbose: true,
            failOnError: true,
        }),
    ],

    // Don't package external dependencies.
    external: [
        'leaflet',
    ],

    output: {
        file: `${OUTPUT_DIR}/${OUTPUT_BASE_NAME}.esm.js`,
        format: 'esm',
        validate: true,

        plugins: [
            // Remove external imports from the generated bundle.
            removeExternalExports(),
        ],
    },
};
