/**
 * Single source of truth for the preprocessing config filename.
 *
 * Live code (path constructions, error messages, USAGE banners, tests)
 * imports from here so a future filename change is a one-line edit.
 * Docs and jsdoc that describe the file by name to the user can stay
 * as plain text — typos in those shout at the reader rather than
 * silently miss a file.
 */

import { join } from 'path';

export const CONFIG_FILE = 'nomadpath.yaml';

/**
 * Resolve the config file path for a given input directory.
 *
 * @param {string} inputDir   absolute or relative path to the input root
 * @returns {string}
 */
export function configPath(inputDir) {
    return join(inputDir, CONFIG_FILE);
}
