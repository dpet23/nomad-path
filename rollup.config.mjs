/**
 * Rollup configuration for bundling production packages.
 */

import fs from 'fs';

import typescript from 'rollup-plugin-typescript2';

const OUTPUT_DIR = 'dist';

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
    ],

    // Don't package external dependencies.
    external: [
        'leaflet',
    ],

    output: {
        file: `${OUTPUT_DIR}/leaflet-map.esm.js`,
        format: 'esm',
        validate: true,

        plugins: [
            // Remove external imports from the generated bundle.
            removeExternalExports(),
        ],
    },
};
