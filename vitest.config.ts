import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        projects: [
            {
                test: { name: 'contract', root: 'packages/contract', environment: 'node' },
            },
            {
                test: { name: 'preprocess', root: 'packages/preprocess', environment: 'node' },
            },
            {
                test: { name: 'ui', root: 'packages/ui', environment: 'node' },
            },
        ],
        coverage: {
            provider: 'v8',
            include: ['packages/*/src/**'],
            exclude: [
                'packages/demo/**',
                // cli.ts is ONLY the bin wiring: commander parsing + process.exit.
                // That wiring runs only as a real OS process, so it is exercised via
                // subprocess in cli.test.ts / pipeline.test.ts - invisible to v8
                // in-process coverage. All build logic lives in build.ts and is
                // covered by build.test.ts, so excluding this thin entry point hides
                // no real behaviour and needs no tautological process.exit test.
                //
                // (A per-glob threshold override cannot lower a file below the global
                // perFile floor - verified against vitest 4.1.9: the global thresholds
                // are checked against every file unconditionally and glob keys only add
                // an extra check. Excluding the file is the honest way to exempt it.)
                'packages/preprocess/src/cli.ts',
            ],
            thresholds: {
                // Per-file floor: EACH file must independently clear these on
                // branches (and the rest). This is what stops a 0%-covered file
                // hiding inside a green average - the gap that let the CLI --out
                // bug through. Because it is per-file, there is no separate overall
                // backstop to add: every file clearing its bar guards the whole
                // project by construction.
                perFile: true,
                branches: 80,
                functions: 80,
                lines: 80,
                statements: 80,
                // Per-glob overrides would go here, but note they can only RAISE a
                // file's bar (extra check), never lower it below the global floor;
                // a genuinely-untestable file is exempted via coverage `exclude`
                // above instead, with a documented reason.
            },
        },
    },
});
