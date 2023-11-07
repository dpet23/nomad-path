/**
 * Rollup configuration for bundling production packages.
 */

import terser from '@rollup/plugin-terser';
import fs from 'fs';
import scss from 'rollup-plugin-scss';
import typescript from 'rollup-plugin-typescript2';

const OUTPUT_DIR = 'dist';
const OUTPUT_BASE_NAME = 'leaflet-map';

/**
 * Rollup plugin to remove external imports from the generated bundle.
 */
const removeExternalExports = () => ({
    name: 'Remove external imports',
    writeBundle: (options, bundle) => {
        for (const [fileName, chunkOrAsset] of Object.entries(bundle)) {
            if (!options.file.endsWith(fileName)) {
                continue;
            }
            const content = chunkOrAsset.code || chunkOrAsset.source;

            // Remove all JS import statements in the file content,
            // using the regex from: https://stackoverflow.com/a/73265022
            const contentWithoutImports = content.replace(
                // eslint-disable-next-line max-len
                /import(?:(?:(?:[ \n\t]+([^ *\n\t\{\},]+)[ \n\t]*(?:,|[ \n\t]+))?([ \n\t]*\{(?:[ \n\t]*[^ \n\t"'\{\}]+[ \n\t]*,?)+\})?[ \n\t]*)|[ \n\t]*\*[ \n\t]*as[ \n\t]+([^ \n\t\{\}]+)[ \n\t]+)from[ \n\t]*(?:['"])([^'"\n]+)(['"]);/, // NOSONAR
                '',
            );

            fs.writeFile(options.file, contentWithoutImports, err => {
                if (err) {
                    throw err;
                }
            });
        }
    },
});

export default commandLineArgs => {
    // Add an optional command-line argument to output minified code.
    let minify = false;
    if (commandLineArgs.minify) {
        minify = true;
        delete commandLineArgs.minify; // Rollup should ignore this custom command-line argument.
    }

    return {
        input: 'src/main.ts',

        plugins: [
            // Call the TypeScript compiler.
            // Loads compilerOptions from tsconfig.json.
            typescript({
                abortOnError: true,
            }),

            // Call the Sass compiler.
            scss({
                fileName: `${OUTPUT_BASE_NAME}${minify ? '.min' : ''}.css`, // in same dir as js output
                outputStyle: minify ? 'compressed' : 'expanded',
                verbose: true,
                failOnError: true,
            }),
        ],

        // Don't package external dependencies.
        external: ['leaflet'],

        output: {
            file: `${OUTPUT_DIR}/${OUTPUT_BASE_NAME}${minify ? '.min' : ''}.esm.js`,
            format: 'esm',
            validate: true,

            plugins: [
                /* eslint-disable prettier/prettier */
                ...(minify
                    ? [
                        // Compress the JavaScript module.
                        terser({
                            ecma: 6,
                            module: true,
                            mangle: {
                                reserved: ['L'],
                            },
                        }),
                    ] : []
                ),
                /* eslint-enable */

                // Remove external imports from the generated bundle.
                removeExternalExports(),
            ],
        },
    };
};
